# My Stock Portfolio (React + PWA)

個人理財 PWA：股票持股（台股/美股）、現金帳戶、支出與預算追蹤，支援手動更新價格、總現值與走勢顯示。

## Features

- PWA，可安裝到桌面/手機
- 本地儲存：以 `window.localStorage` 持久化的手刻 in-memory store（query API 模仿 Dexie 介面，但底層為 JSON），約 5–10 MB 上限
- Google 登入 + Firebase Firestore 跨裝置同步（local-first；缺 Firebase env vars 時退化為純離線）
- 股票報價 fallback：
  1. **美股**：Finnhub
  2. **台股**：Finnhub → `twseRwdProvider` → `twseProvider` (full snapshot) → `tpexProvider`
- TPEX 內部又會依序嘗試：同源快照 (`public/data/tpex_off_market.json`) → TPEX 官方 API → `VITE_TPEX_PROXY_URL`
- 同源 TPEX 快照由 GitHub Actions (`.github/workflows/update-tpex-snapshot.yml`) 平日 cron 更新
- USD/TWD 匯率：open.er-api（無需 API key）
- 手動更新價格，顯示上次更新時間
- 24h / 1w / 1m 現值走勢（基於本地快照）
- 支出 / 預算 / 現金帳戶管理

## Tech Stack

- React 19 + Vite
- Ant Design 6
- Recharts 3
- `@dnd-kit`（可拖曳重排的 holdings）
- `animejs`（數字 tweening）
- `dayjs`（含 `utc` + `timezone` plugins）
- `vite-plugin-pwa`
- Firebase（Auth / Firestore / App Check）

## Setup

1. 安裝依賴

```bash
npm install
```

2. 建立環境變數

```bash
cp .env.example .env.local
```

填入 `VITE_FINNHUB_API_KEY`。若你的網路環境無法直接連 TPEX（CORS），可另外設定 `VITE_TPEX_PROXY_URL` 指向可用代理。
若要啟用跨裝置同步，另需填入 Firebase 設定：

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_RECAPTCHA_SITE_KEY`（App Check / reCAPTCHA v3）

台股 fallback 順序：

1. Finnhub
2. TWSE RWD
3. TWSE 全量 snapshot
4. 同源 TPEX 快照（`public/data/tpex_off_market.json`）
5. TPEX 官方 API
6. 代理 API（`VITE_TPEX_PROXY_URL`）

3. 啟動開發環境

```bash
npm run dev
```

> 注意：本專案沒有設定 test runner，唯一的自動化檢查是 `npm run lint`。

## Build

```bash
npm run build
```

## Deploy to GitHub Pages

- 已提供 workflow：`.github/workflows/deploy.yml`
- 請在 GitHub Repository Secret 設定：
  - `VITE_FINNHUB_API_KEY`
  - `VITE_FIREBASE_API_KEY`
  - `VITE_FIREBASE_AUTH_DOMAIN`
  - `VITE_FIREBASE_PROJECT_ID`
  - `VITE_FIREBASE_APP_ID`
  - `VITE_FIREBASE_RECAPTCHA_SITE_KEY`
- `vite.config.js` 會在 production 自動使用 `/<repo-name>/` 當作 base
- 缺少 `VITE_*` secrets 時 build 仍會成功，但部署後會悄悄降級（沒有 Firebase / 沒有 Finnhub）

## Firestore Rules（建議）

```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

本 repo 已提供 `firestore.rules` 與 `firebase.json` 的 rules 路徑設定，可用以下指令部署：

```bash
firebase deploy --only firestore:rules
```

## App Check（建議）

1. Firebase Console > App Check，為 Web App 啟用 reCAPTCHA v3。
2. 先用 monitor 模式觀察 24~48 小時，再切 enforce。
3. production 需配置 `VITE_FIREBASE_RECAPTCHA_SITE_KEY`，前端才會啟用 App Check token。

## Data Model

實作位於 `src/db/database.js`，所有 table 都是 `PersistedInMemoryTable`（即 in-memory + `window.localStorage` 持久化），除了 `outbox` 是純記憶體（pending writes 在 reload 時重新推導）。

Persistent tables：

- `holdings` — 持股
- `price_snapshots` — 價格快照（用於走勢圖）
- `fx_rates` — 匯率
- `sync_meta` — 同步狀態 metadata
- `expense_entries` — 支出記錄
- `expense_categories` — 支出分類
- `budgets` — 預算
- `cash_accounts` — 現金帳戶
- `cash_balance_snapshots` — 現金餘額快照
- `app_config` — App 設定

In-memory only：

- `outbox` — 待同步寫入

修改 schema 時，要同時更新 `database.js` 的 `TABLE_STORAGE_KEYS` 與 `src/services/firebase/firestoreMappers.js` 的對應 mapper。
