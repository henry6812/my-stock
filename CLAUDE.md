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
npm run dev        # Vite dev server (PWA enabled in dev via VitePWA devOptions)
npm run build      # production bundle into dist/
npm run preview    # serve the built bundle
npm run lint       # ESLint (flat config, eslint.config.js)
npm test           # Vitest 一次性跑完 (vitest run)
npm run test:watch # Vitest watch mode
```

測試用 **Vitest**（設定在 `vitest.config.js`，jsdom + `@testing-library/react`，setup 檔 `src/test/setup.js`）。測試檔命名 `*.test.{js,jsx}`，與被測檔放同層。目前覆蓋範圍還小（純函式 + 一個元件 smoke test）— 是為了讓 `App.jsx` 等大檔重構有安全網而建立的，續攻重構前應先補對應測試。

單檔 lint：`npx eslint src/path/to/file.jsx`。
單檔 / 過濾測試：`npx vitest run src/utils/portfolioView.test.js` 或 `npx vitest run -t "formatChangePercent"`。

Firestore rule 部署（只在使用者要求時執行）：`firebase deploy --only firestore:rules`。

## Architecture

這是一個中文 (zh-TW) 個人理財 PWA：股票持股 (TW + US)、現金帳戶、支出與預算，並可選擇透過 Firebase 進行跨裝置同步。

> `docs/技術導覽.md`（給非工程師 PM 的整體導覽）與 `docs/code-review-notes.md`（實際讀 code 後整理的「文件 vs code 不符」與 dead code 清單）是理解此專案「文件與現況落差」的最佳起點 — 動手改東西前值得先掃一遍。

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

`src/services/priceProviders/` — 順序很重要，且在 `finnhubProvider.getHoldingQuote` 中是寫死的（`finnhubProvider.js:55-91`）：

1. **US stocks**：只用 Finnhub (`/quote`)。
2. **TW stocks**：**不打 Finnhub**。直接走 `twseRwdProvider` → `twseProvider` (full snapshot) → `tpexProvider`（自己內部又會嘗試 `public/data/tpex_daily_close_quotes.json` same-origin snapshot、TPEX 官方 API，最後是 `VITE_TPEX_PROXY_URL`）。三者全失敗才拋出彙整後的錯誤。

批次刷新（`portfolioService.refreshPrices`）時台股先打一次 `twseDailyProvider`（TWSE `rwd/.../MI_INDEX?type=ALLBUT0999`，當天收盤後即更新；**不要**換成 openapi 的 `STOCK_DAY_ALL`，它隔天清晨才更新），命中的直接用；沒命中的才逐檔走上面的 chain（不在 TWSE 名單的代碼帶 `tpexFirst` 先查 TPEX），逐檔打 TWSE 前仍需 `sleepForRateLimit(1_200)`。美股與台股兩條線並行，美股用 `mapWithConcurrency` 限制 4 個同時請求。

> 過去文件（含舊版 README / 技術導覽）宣稱台股「先打 Finnhub 再 fallback」，這是錯的 — code 從未對 TW market 呼叫 Finnhub。詳見 `docs/code-review-notes.md`。

`alphaVantageProvider.js` 目前是 **dead code** — 沒有任何檔案 import 它，不在上述 chain 內。要重新啟用需自己接進 `getHoldingQuote`。

Same-origin TPEX snapshot 由 `.github/workflows/update-tpex-snapshot.yml` 更新（cron，平日 12:30 + 15:00 UTC；TPEX 約 12:00 UTC 才發布當日資料），commit 後以 `gh workflow run deploy.yml` 觸發部署 — TPEX API 沒有 CORS header，瀏覽器實際上只吃得到這份 snapshot，沒部署就等於沒更新。來源是 `tpex_mainboard_daily_close_quotes`（workflow 用 jq 只留 `Date/SecuritiesCompanyCode/CompanyName/Close/Change`），`tpexProvider` 從 `Change` 推 `previousClose`（除息/除權日為 undefined）；**不要**換回 `tpex_off_market`（盤後定價，沒有盤後成交的股票 `Close` 是 `0.00`，也沒有 `Change`）。當 TPEX 新增或移除欄位時，該 workflow 的 curl 目標與 `tpexProvider` 的 parser 必須同步調整。

FX (`fxProvider.js`) 打 open.er-api 取得 USD/TWD；不需要 API key。

### TW fundamentals snapshot（個股細節頁估價用）

`.github/workflows/update-tw-fundamentals.yml`（平日 12:00 UTC）跑 `scripts/update-tw-fundamentals.mjs`：把 TWSE openapi `t187ap06_L_*` 的最新一季（**年度累計** EPS）合併進 `public/data/tw_eps_history.json`，每月補一次上月底本益比（TWSE rwd `BWIBBU_d`）到 `public/data/tw_pe_history.json`，有變更才 commit，並以 `gh workflow run deploy.yml` 觸發部署（`GITHUB_TOKEN` 的 push 不會觸發 `deploy.yml`）。`scripts/check-tw-fundamentals.mjs` 發現漏季會讓 job 失敗；修法是以 `backfill=true` 手動跑 workflow（`scripts/backfill-tw-fundamentals.mjs`，MOPS 用 `mopsov.twse.com.tw`）。純邏輯在 `src/utils/twFundamentalsMerge.js`。

`src/services/bankProviders/twBankDirectoryProvider.js` 與報價無關 — 它抓 data.gov.tw 的台灣銀行/分行清單（FISC + 分行 datasets），供現金帳戶表單選銀行用，帶 7 天 localStorage cache 與硬編的 `FALLBACK_BANKS`（離線 / API 失敗時 fallback）。只被 `App.jsx` 使用。

### UI

`src/App.jsx` 刻意維持為 monolithic（約 6.4k 行）— 包含 tabs (holdings、expenses、budgets、charts)、drawers、modals，以及大部分內嵌的 reducers。部分元件已抽出到 `src/components/`（表單、mobile sheet、圖表，以及支出頁摘要卡 `ExpenseSummaryCard` 與其 `SavingsTower` / `SavingsGrowthTower` / `ExpenseMonthBars`、資產頁 `NetWorthJar` 等）；塔與長條的純計算在 `src/utils/savingsTower.js`、`savingsGrowthTower.js`、`monthlySummaries.js`。新增 top-level state 之前，先在 `App.jsx` 中搜尋是否有可以延伸的既有 `useState`，而不是再開一個新 context。

Stack：React 19、Ant Design 6、`iconoir-react`（UI 圖示，規範見 `DESIGN.md` 的 Icons）、Recharts 3、`@dnd-kit` (用於可拖曳重排的 holdings)、`animejs` (數字 tweening)、`dayjs`（含 `utc` + `timezone` plugins）。

### Design system — 改 UI 前先讀 `DESIGN.md`

任何介面修改（新增或調整元件、樣式、版面、文案層級）動手前，先讀根目錄的 `DESIGN.md`（視覺規範：token、元件、Do's and Don'ts）與 `PRODUCT.md`（產品脈絡：使用者、情境、產品原則），並遵守其中的規則：

- 顏色、字級、圓角、間距只用 token：CSS 寫 `var(--c-*)`、`var(--fs-*)`、`var(--radius-*)`、`var(--space-*)`、`var(--icon-*)`，JS 從 `src/theme/tokens.js` 取。不寫死 hex 或 px；需要新值時先問使用者，再同時更新 `src/index.css`、`src/theme/tokens.js` 與 `DESIGN.md` 的 frontmatter。例外：頁面底色 `paper` 只在 `src/theme/tokens.js` 改，`vite.config.js` 會把它填進 `--c-paper`、`theme-color` meta 與 PWA manifest（`index.css` 裡是 `APP_PAPER` 佔位，不要寫死）。
- 間距以**支出頁為標準樣板**：區塊之間 `--space-section`、區塊標題到內容 `--space-section-head`、列表列 `--space-row-x` / `--space-row-y`。調整其他頁時照它對齊。
- 小字的灰只用 `muted`（`subtle` 只給大字、停用狀態與非文字元素）；每頁只有一個會動的「存錢主角」與一個 display 級大數字。
- 不用 lint disable 註解繞過規則。
- 改動確立了新的規範（新 token、新元件模式）時，同步更新 `DESIGN.md`。

`.impeccable/` 是 Impeccable 設計工具的資料（`design.json` 為 `DESIGN.md` 的附檔、`critique/` 為審查快照），由 `/impeccable` 指令維護，不要手動改。

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
