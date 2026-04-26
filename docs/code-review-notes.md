# Code Review 筆記：實際讀 code 後發現的不對勁之處

這份筆記列出在仔細讀過 `src/` 下實際程式碼之後，**和文件描述（CLAUDE.md、README、舊版技術導覽）不一致的地方**，以及一些可能是 bug 或 dead code 的觀察。建立這份文件的目的是：讓 PM 與工程師都知道哪些「文件說的」其實「code 不是這樣做」。

每一條都附上檔案位置與行號，方便交叉驗證。

---

## A. 文件講錯的事（Doc vs Code 不符）

### A1. ⚠️ 台股 fallback chain 的「第一順位是 Finnhub」是錯的

**文件這樣寫**（CLAUDE.md、README、舊版 `技術導覽.md`）：
> TW stocks: Finnhub → twseRwdProvider → twseProvider → tpexProvider

**實際 code**（`src/services/priceProviders/finnhubProvider.js:55-83`）：
```js
export const getHoldingQuote = async ({ symbol, market }) => {
  if (market === 'TW') {
    // 直接從 TWSE 開始，根本沒打 Finnhub
    try { return await getTwQuoteFromTwse(symbol) } ...
    try { return await getTwQuoteFromTwseAll(symbol) } ...
    try { return await getTwQuoteFromTpex(symbol) } ...
  }
  // 只有 US 才會走到下面打 Finnhub /quote
  ...
}
```

**正確的 chain：**
- **US**：Finnhub `/quote` + `/stock/profile2` (取公司名)
- **TW**：TWSE RWD → TWSE ALL snapshot → TPEX provider（**沒有 Finnhub**）

> 推測原因：Finnhub 免費方案對台股代碼支援差或 403，所以略過。但文件寫錯誤導讀者以為它是台股第一線。

### A2. ⚠️ 「Local-first，先寫本地再同步雲端」描述與實作相反

**CLAUDE.md 寫**：
> 1. Validate + normalize.
> 2. 透過 `db.<table>.put/update` 寫入本地。
> 3. `mirrorToCloud(...)` — 呼叫 writeCollectionRecord (Firestore setDoc)，再 applyCollectionRecordLocally 把 canonical form round-trip 回來。

**實際 code**（`src/services/portfolioService.js:111-118`）：
```js
const mirrorToCloud = async (collectionName, record) => {
  await writeCollectionRecord({ collectionName, record });   // (1) 雲端先寫
  await applyCollectionRecordLocally({ collectionName, record, ... });  // (2) 再寫本地
};
```

實際是**雲端先、本地後**。而且每個 mutation 開頭都呼叫 `ensureCloudWritable()` — 這會 throw 如果離線/未登入/Firestore 沒就緒。

→ **影響**：當 Firebase 已設定時，**離線就無法寫入**（會跳「目前離線，暫時只能檢視資料」），不是真正的 local-first。只有完全沒設定 Firebase（`firestoreDb` 為 null）時，App 才走純本地模式。

實證：`src/services/portfolioService.js` 中 `ensureCloudWritable()` 被呼叫 **24 次**（行 593, 751, 801, 892, 915, 959, 985, 1035, 1080, 1155, 1275, 1353, 1392, 1435, 1499, 2654, 2690, 2733, 2816, 2848, 3044, 3064…）。幾乎每個 mutation 都是寫前先檢查雲端可寫。

### A3. ⚠️ PWA manifest 仍然寫「IndexedDB」

**檔案**：`vite.config.js:17`
```js
description: 'Personal stock value manager with local IndexedDB storage',
```

CLAUDE.md 自己有提到「PWA manifest 仍寫著 IndexedDB / Dexie」是錯的，但**沒有人去修**。使用者安裝 PWA 後在「關於」頁面看到的描述就是這句，會誤導理解。

### A4. ⚠️ `outbox` table 是 dead code

**database.js:398** 宣告了：
```js
this.outbox = new InMemoryTable({ primaryKey: 'id', autoIncrement: true })
```

CLAUDE.md 寫：
> outbox table 故意不 persistent...因為 pending writes 會在 reload 時重新推導。

**但實際 code 裡，沒有任何地方寫入 outbox**。grep 全 repo：
```
src/db/database.js:398: 宣告
src/services/firebase/cloudSyncService.js:76,1045,1149: runtimeState.outboxPending = 0 （永遠是 0）
```

沒人 add，也沒人 flush。這個欄位是**遺留的舊架構殘留**。

→ **建議**：要嘛把它移除，要嘛真的實作 offline outbox（搭配 A2 修成真 local-first）。

### A5. ⚠️ `alphaVantageProvider.js` 是 dead code

**檔案**：`src/services/priceProviders/alphaVantageProvider.js`（82 行）

**grep 結果**：除了檔案本身的 `export const getUsQuote` 之外，**沒有任何地方 import 它**。`vite.config.js:50-61` 還有為它特別寫 `runtimeCaching` 規則，但因為沒呼叫端，這段 cache 永遠不會被命中。

→ **建議**：移除整個檔案 + vite.config.js 對應的 cache 規則，省 bundle 大小。

### A6. ⚠️ 登入方式不只 Google，還有 Email/Password

**檔案**：`src/services/firebase/authService.js:65-72`
```js
export const loginWithEmailPassword = async ({ email, password }) => {...}
```

而且 `src/App.jsx:134` import 了它，`App.jsx:3320` 有實際呼叫。CLAUDE.md / README / 舊版導覽都只提 Google 登入，**漏了 Email/Password**。

### A7. ⚠️ deploy.yml 沒有把 `VITE_FIREBASE_RECAPTCHA_SITE_KEY` / `VITE_TPEX_PROXY_URL` 注入 build

**`.github/workflows/deploy.yml:35-40`**：
```yaml
env:
  VITE_FINNHUB_API_KEY: ${{ secrets.VITE_FINNHUB_API_KEY }}
  VITE_FIREBASE_API_KEY: ${{ secrets.VITE_FIREBASE_API_KEY }}
  VITE_FIREBASE_AUTH_DOMAIN: ${{ secrets.VITE_FIREBASE_AUTH_DOMAIN }}
  VITE_FIREBASE_PROJECT_ID: ${{ secrets.VITE_FIREBASE_PROJECT_ID }}
  VITE_FIREBASE_APP_ID: ${{ secrets.VITE_FIREBASE_APP_ID }}
```

少了：
- `VITE_FIREBASE_RECAPTCHA_SITE_KEY` — README 與 CLAUDE.md 都說它是 production App Check 的必要設定，但 workflow 根本沒注入 → **App Check 在 production 從來沒被啟用**。
- `VITE_TPEX_PROXY_URL` — README 有提到可選 proxy，但 workflow 沒注入 → 即使設了 secret 也無效，TPEX 只會走 hardcoded default proxy（見 A8）。

→ **影響**：對於 reCAPTCHA Site Key，code 在 `firebaseApp.js:32-41` 只在 `import.meta.env.PROD && isAppCheckConfigured` 才啟用 App Check，但 workflow 缺這個 env，`isAppCheckConfigured` 永遠是 `false`。所以 production 反而是「**最不安全**」的環境。

---

## B. 隱藏行為（沒寫在文件裡的事）

### B1. TPEX provider 內建兩個第三方 CORS proxy（hardcoded）

**`src/services/priceProviders/tpexProvider.js:3-6`**：
```js
const DEFAULT_PROXY_URLS = [
  `https://api.codetabs.com/v1/proxy/?quest=${TPEX_OFF_MARKET_URL}`,
  `https://corsproxy.io/?${encodeURIComponent(TPEX_OFF_MARKET_URL)}`,
]
```

實際嘗試順序（共最多 5 個 URL × 各 retry 2 次）：
1. 同源 `public/data/tpex_off_market.json` snapshot
2. TPEX 官方 API
3. `VITE_TPEX_PROXY_URL`（若有設）
4. codetabs 公用 proxy
5. corsproxy.io 公用 proxy

→ **隱含風險**：使用者的查價請求會在 (4)(5) 經過第三方未驗證的 proxy。對個人理財 App 沒洩漏隱私，但若擴張為多人 App 應該關掉。

### B2. 登入時會 wipe 本地所有雲端 backed data

**`cloudSyncService.js:1054`**（`startRealtimeSync` 中）：
```js
await clearLocalCloudBackedData()  // 清空 holdings/snapshots/fx/cash/expense/budget...
```

接著才 `subscribeCollection(...)` 把雲端資料拉回本地。

→ **使用者可見後果**：
- 在 device A 沒登入時手動建幾筆持股 → 登入 → **本地資料瞬間消失**，被雲端取代。
- 雲端是空的話，你看到的就是空白。

這個行為**沒寫在任何文件**。對於只有一台 device 而且把資料當「本地暫存」用的使用者來說會嚇到。

### B3. `migratedDocKeyTracker` 只追蹤 5 分鐘

**`cloudSyncService.js:48`**：
```js
const MIGRATED_DOC_KEY_TTL_MS = 5 * 60 * 1000
```

舊 doc key 只防止被 realtime listener「復活」5 分鐘。如果 Firestore listener 因為網路問題延遲超過 5 分鐘才送來舊 doc 的 `removed` event，本地會誤把它當新建。

→ **可能 bug**：罕見，但長時間離線後上線時可能重現。

### B4. TWSE RWD provider 用 regex 解析 HTML title

**`twseRwdProvider.js:23-25`**：
```js
const match = title.match(new RegExp(`${symbol}\\s+(.+)\\s+各日成交資訊`))
```

從 TWSE 回傳的 `data.title` 字串裡用「各日成交資訊」當錨點。**TWSE 改文案就會壞**，公司名會變成 symbol fallback。

### B5. 一個 holding 的 cloud key 包含 `holder`

**`firestoreMappers.js:12-14`**：
```js
export const buildHoldingKey = ({ market, symbol, holder }) => (
  `${market}_${symbol}_${String(holder || 'UNSET').trim()}`
)
```

→ 同一支股票如果切換 holder（例如從 "Po" 改成 "Wei"），cloud key 會變，需要走 `migrateHoldingCloudKeyIfNeeded` 的「寫新 + 刪舊」流程。這不是 bug，但需要在 holder rename 時特別小心，否則資料會在雲端有兩份（新舊各一）。

---

## C. 規模 / 重構機會

### C1. App.jsx 6,428 行

實際 line count（`wc -l src/App.jsx`）：6,428 行，CLAUDE.md 說的 6.4k 是準確的。

**`App.jsx` 內部至少有 8 個 Tabs 元件**（行 4861/4946/5026/5080/5120/5591/5612/5874/5929）— 多個分頁巢狀於不同 tab 之下，state 全部在同一 closure。

→ 重構代價：高。但若團隊規模擴大，這是最大瓶頸。

### C2. portfolioService.js 3,437 行

CLAUDE.md 描述它「是 UI 唯一呼叫的進入點」— 確認屬實，但 3.4k 行單檔已經很臃腫。常數定義（`MARKET`、`SYNC_PENDING`、`CLOUD_COLLECTION`、`EXPENSE_ENTRY_TYPE`...）和邏輯混在同一檔。

### C3. `cloudSyncService.js` 1,153 行裡有大量 boilerplate

每個 collection 都有自己的 `applyRemote*` 函式（holdings/snapshots/fx_rates/sync_meta/cash_accounts/cash_balance_snapshots/expense_entries/expense_categories/budgets/app_config）— 10 種，邏輯極相似但全部展開。

→ 可以抽 generic apply pattern（給每個 collection 一個 mapper + key builder），但目前的明確展開讓 debug 容易。trade-off。

---

## D. 一致性 / 文件需要更新的清單

| 位置 | 問題 |
|------|------|
| `vite.config.js:17` | manifest description 改成 localStorage |
| `CLAUDE.md` Architecture > Sync model | 改述為「cloud-first when Firebase configured；offline 只能 read」|
| `CLAUDE.md` Price providers | 修正 TW chain（去掉第一個 Finnhub）|
| `README.md` 台股 fallback 順序 | 同上 |
| `docs/技術導覽.md` 台股 fallback 順序、登入方式 | 同上 + 加上 Email login |
| `.github/workflows/deploy.yml` | 補上 `VITE_FIREBASE_RECAPTCHA_SITE_KEY` 與（若需要）`VITE_TPEX_PROXY_URL` |
| `database.js` outbox | 移除或實作 |
| `alphaVantageProvider.js` | 移除（連同 vite.config.js 的 cache 規則）|

---

## E. 給 PM 的「決策影響」摘要

| 發現 | 對使用者的影響 | 對工程的影響 |
|------|---------------|-------------|
| A1（Finnhub 沒在 TW 用）| 沒影響，但若有人想加 Finnhub TW 支援會誤以為已經有 | low |
| A2（不是真 local-first）| **離線無法寫入**；這違反「PWA 離線可用」的承諾 | **high** — 改成真 local-first 要重寫 mirror flow |
| A4（dead outbox）| 沒影響 | low — 移除或實作 |
| A5（dead Alpha Vantage）| 增加 bundle ~1KB | low — 移除 |
| A7（App Check 沒注入）| **production 暴露 Firebase API key 可被濫用**（reCAPTCHA 沒啟用）| **high** — 改 yaml 一行就修好 |
| B1（hardcoded proxy）| 查價請求繞 3rd party | medium — 看接受度 |
| B2（登入清空本地）| 易誤刪資料 | medium — 加 UX 警告或改 merge 邏輯 |

最值得馬上修的是 **A7**（App Check 沒啟用）— 一行 yaml。
最值得長期重構的是 **A2**（真 local-first）— 但動到 mirrorToCloud 就會牽一髮動全身。
