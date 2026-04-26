# CLAUDE.md

此檔案提供 Claude Code (claude.ai/code) 在此 repository 中工作時的指引。

## 回覆語言原則

一律使用**繁體中文 (zh-TW)** 回覆使用者。但下列項目保留英文原樣，不要翻譯：

- 工程術語、API 名稱、套件名稱（例如 IndexedDB、Dexie、Firestore、Vite、PWA、reducer、hook）。
- 程式碼、檔案路徑、變數名稱、函式名稱、commit message、shell 指令。
- 專有名詞與品牌名稱（例如 Finnhub、TPEX、TWSE、GitHub Pages）。

## Working directory

App 位於 `my-stock/`，不是 repo 根目錄。所有 `npm` 指令都要在 `my-stock/` 下執行。部分工具假設上層路徑 `VBC/stock` 存在；請把 `my-stock/` 視為專案根目錄。

## Commands

```bash
npm run dev       # Vite dev server (PWA enabled in dev via VitePWA devOptions)
npm run build     # production bundle into dist/
npm run preview   # serve the built bundle
npm run lint      # ESLint (flat config, eslint.config.js)
```

沒有設定 test runner — 不要憑空使用 `npm test`。Lint 是唯一的自動化檢查。

單檔 lint：`npx eslint src/path/to/file.jsx`。

Firestore rule 部署（只在使用者要求時執行）：`firebase deploy --only firestore:rules`。

## Architecture

這是一個中文 (zh-TW) 個人理財 PWA：股票持股 (TW + US)、現金帳戶、支出與預算，並可選擇透過 Firebase 進行跨裝置同步。

### Data layer — 重要注意事項

PWA manifest 仍寫著「IndexedDB / Dexie」— **這是錯的**（README 已更新為正確描述）。`src/db/database.js` 是手刻的 in-memory store (`InMemoryTable`、`InMemoryQuery`)，每張表分別 persist 到 `window.localStorage`。匯出的 flags 已明確說明：

```js
isInMemoryDb = false
hasPersistentLocalDb = true
isIndexedDbEnabled = false
```

Query API 模仿 Dexie (`db.holdings.where('...').equals(...).toArray()`、composite index 字串如 `'[market+symbol]'`)，讓 caller 保持可移植性，但底層全是 localStorage 中的 JSON。隱含意義：

- 儲存空間有上限（~5–10 MB），底層為同步 — 大量 bulk writes 會卡住 main thread。
- 沒有真正的 transactions；`db.transaction(...)` 只是直接呼叫 callback。
- `outbox` table 故意不 persistent (`InMemoryTable`，而非 `PersistedInMemoryTable`)，因為 pending writes 會在 reload 時重新推導。

修改 schema 時，要同時更新 `database.js` 中對應的 `TABLE_STORAGE_KEYS` entry 與 `src/services/firebase/firestoreMappers.js` 中對應的 mapper — 本地 rows 與雲端 docs 共用相同 field shape。

### Sync model (local-first)

`portfolioService.js` 是 UI 唯一呼叫的進入點。每個 mutating function 都遵循相同 pattern：

1. Validate + normalize。
2. 透過 `db.<table>.put/update` 寫入本地。
3. `mirrorToCloud(collectionName, record)` — 呼叫 `cloudSyncService.writeCollectionRecord` (Firestore `setDoc`)，再呼叫 `applyCollectionRecordLocally` 把 canonical form round-trip 回來。
4. 對於改動 doc key 的 rename（例如 holding 的 symbol/market），`migrateHoldingCloudKeyIfNeeded` / `migrateCashAccountCloudKeyIfNeeded` 會寫到新 key 並刪除舊 key，並把舊 key 註冊到 `migratedDocKeyTracker`，避免 realtime listener 把它復活。

`cloudSyncService.js` 負責：auth-gated subscriptions、用 `isRemoteNewer` 做 last-write-wins、online/offline handlers，以及 UI 讀取的 `runtimeState` 物件。Firestore namespace 為 `users/{uid}/...`。若 `firestoreDb` 為 null（Firebase env vars 未設定），App 仍可完全離線運作。

### Price providers — 明確的 fallback chain

`src/services/priceProviders/` — 順序很重要，且在 `finnhubProvider.getHoldingQuote` 中是寫死的：

1. **US stocks**：只用 Finnhub。
2. **TW stocks**：Finnhub → `twseRwdProvider` → `twseProvider` (full snapshot) → `tpexProvider`（自己內部又會嘗試 `public/data/tpex_off_market.json` same-origin snapshot、TPEX 官方 API，最後是 `VITE_TPEX_PROXY_URL`）。

Same-origin TPEX snapshot 由 `.github/workflows/update-tpex-snapshot.yml` 更新（cron，平日 10:10 UTC）。當 TPEX 新增或移除欄位時，該 workflow 的 curl 目標與 `tpexProvider` 的 parser 必須同步調整。

FX (`fxProvider.js`) 打 open.er-api 取得 USD/TWD；不需要 API key。

### UI

`src/App.jsx` 刻意維持為 monolithic（約 6.4k 行）— 包含 tabs (holdings、expenses、budgets、charts)、drawers、modals，以及大部分內嵌的 reducers。只有四個元件被抽出到 `src/components/` 之下：`HoldingForm`、`CashAccountForm`、`MobileFormSheetLayout`、`TrendChart`。新增 top-level state 之前，先在 `App.jsx` 中搜尋是否有可以延伸的既有 `useState`，而不是再開一個新 context。

Stack：React 19、Ant Design 6、Recharts 3、`@dnd-kit` (用於可拖曳重排的 holdings)、`animejs` (數字 tweening)、`dayjs`（含 `utc` + `timezone` plugins）。

### Build & deploy

`vite.config.js` 讀取 `process.env.GITHUB_REPOSITORY`，且只在 `NODE_ENV === 'production'` 時把 `base` 改寫為 `/<repo-name>/`。PWA precache 上限調高到 3 MB（目前 bundle 約 2.2 MB）— 留意 bundle size。

GitHub Actions (`.github/workflows/deploy.yml`) 在 push 到 `main` 時 build 並把 `dist/` 發佈到 GitHub Pages。所有 `VITE_*` secrets 都必須存在於 repo settings，否則 build 仍會成功，但部署後的 App 會悄悄降級（沒有 Firebase、沒有 Finnhub）。

## Environment variables

全部都會曝露給 client（必須是 `VITE_*`）：

- `VITE_FINNHUB_API_KEY` — 任何報價刷新都需要。
- `VITE_FIREBASE_*` (5 個 key) — cloud sync 需要；缺少時為純離線模式。
- `VITE_FIREBASE_RECAPTCHA_SITE_KEY` — App Check / reCAPTCHA v3，僅 production 使用。
- `VITE_TPEX_PROXY_URL` — TPEX 的可選 CORS proxy。

複製 `.env.example` → `.env.local`。編輯後要重新啟動 `npm run dev` — Vite 只在 server 啟動時讀取 env。
