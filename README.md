# My Stock Portfolio (React + PWA + IndexedDB)

個人股票現值管理工具，支援台股/美股持股管理、手動更新價格、總現值與走勢顯示。

## Features

- PWA，可安裝到桌面/手機
- IndexedDB 本地儲存（持股、快照、匯率）
- Google 登入 + Firebase Firestore 跨裝置同步（local-first）
- 股票價格：美股用 Finnhub，台股優先 Finnhub、受限時自動回退 TWSE，再回退 TPEX
- 內建 `public/data/tpex_off_market.json` 同源快照 fallback（降低 TPEX CORS/代理不穩定）
- USD/TWD 匯率：open.er-api
- 手動更新價格，顯示上次更新時間
- 24h / 1w / 1m 現值走勢（基於本地快照）

## Tech Stack

- React + Vite
- Ant Design
- Recharts
- Dexie (IndexedDB)
- vite-plugin-pwa

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

台股 fallback 順序：
1. Finnhub
2. TWSE
3. 同源 TPEX 快照（`public/data/tpex_off_market.json`）
4. TPEX 官方 API
5. 代理 API（含 `VITE_TPEX_PROXY_URL` / 預設代理）

3. 啟動開發環境

```bash
npm run dev
```

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
- `vite.config.js` 會在 production 自動使用 `/<repo-name>/` 當作 base

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

## Data Model (IndexedDB)

- `holdings`
- `price_snapshots`
- `fx_rates`
- `sync_meta`
- `expense_entries` (預留未來擴充)
