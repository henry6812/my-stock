# 個股細節頁與 EPS 估價設計

日期：2026-10-05
狀態：設計已確認，待寫 implementation plan

## 目標

點擊持股打開個股細節頁，用 **EPS × 本益比** 估出便宜 / 合理 / 昂貴三個價位，並和現價比較，幫助判斷目前股價位置。同時呈現單季 EPS 趨勢與歷史本益比，讓估價假設可被檢視與覆寫。

## 範圍

**包含**

- 新元件 `StockDetailSheet`：手機 bottom sheet、桌機右側 `Drawer`。
- 兩種估價基準：**近四季 TTM** 與 **預估**（台股「今年全年預估」、美股「未來四季預估」）。
- 本益比三檔預設取歷史百分位，可逐檔覆寫；台股成長率與預估 EPS 也可覆寫。
- 台股（**僅上市**）EPS 與本益比歷史：GitHub Actions 每日累積 snapshot + 一次性回補。
- 美股：前端直接打 Finnhub（免費方案可用的 endpoint）。

**不包含（第一版）**

- 上櫃（TPEX）股票的 EPS / 本益比 — 細節頁顯示「目前僅支援上市股票」。
- 營收、營業利益、稅後淨利的 UI（資料會存，但不顯示）。
- 完整本益比河流圖（需要歷史股價）。
- 財報公布日 / 除權息行事曆的獨立功能（細節頁只顯示「下次財報日」一行）。

## 決策紀錄

| 問題 | 決定 |
|---|---|
| 估價方法 | TTM 與預估兩者都做，頁面頂部切換 |
| 本益比三檔來源 | 歷史區間為預設（25/50/75 百分位），可逐檔覆寫 |
| 台股預估 EPS | 成長率推估，可覆寫成長率或直接填 EPS |
| 美股預估 EPS | Finnhub `/calendar/earnings` 未來各季 consensus（`/stock/eps-estimate` 為付費，實測 `You don't have access`） |
| 台股資料抓取 | GitHub Actions 平日每日自動；不走手動 |
| 第一版市場範圍 | 美股 + 台股上市 |
| 覆寫值存放 | 新表 `valuationSettings`，以股票（`market_symbol`）為 key，不存在 holding 上（同一檔股票可能有多個 `holder`） |

## 畫面

### 容器與進入點

- **手機**：點持股列（`MobileSwipeRow` 的 main 區）開 bottom sheet，`Drawer placement="bottom"`、`90vh`，沿用 `BudgetDetailSheet` 模式與 `useBodyScrollLock`。左滑編輯 / 刪除不變。
- **桌機**：點持股表格列開右側 `Drawer`，寬 520px。列內既有按鈕（編輯等）需 `stopPropagation`，不觸發開啟。
- 元件放在 `src/components/StockDetailSheet.jsx`；`App.jsx` 只新增「目前開啟的 holding」state 與傳入 props。
- `assetTag` 非 `STOCK`（ETF 等）時，只顯示 ① 頁首與 ④ EPS 區塊（若有資料），不顯示估價。

### 版面（由上到下）

**① 頁首**：公司名稱 + 代號、現價與漲跌（使用 App 既有的報價）、小字「持有 N 股 · 市值 X」（同一檔有多個 holder 時加總）。

**② 估價結論卡**

- Segmented 切換：`近四季 TTM` / `今年預估`（美股顯示 `未來四季預估`），預設 TTM。
- 水平價位尺：三段色帶 便宜（綠）/ 合理（灰）/ 昂貴（紅），▼ 標出現價。
  尺的範圍 = `min(便宜價, 現價) × 0.9` 到 `max(昂貴價, 現價) × 1.1`。
- 下方三個數字：便宜價 / 合理價 / 昂貴價。
- 結論文字，依現價 `p` 判斷：
  - `p < 便宜價` → 「低於便宜價」
  - `便宜價 ≤ p < 合理價` → 「合理偏低」
  - `合理價 ≤ p < 昂貴價` → 「合理偏高」
  - `p ≥ 昂貴價` → 「高於昂貴價」
  - 並附「距合理價 ±X.X%」（`p / 合理價 − 1`）。

**③ 估價假設**（`Collapsible`，預設收合）

- 使用的 EPS 及算式文字，例如「今年已公布 Q1–Q2 累計 49.33 + 去年 Q3–Q4 × (1 + 20.1%) = 98.7」。
- 可編輯欄位：本益比 便宜 / 合理 / 昂貴；台股另有成長率、預估 EPS。
- 覆寫過的欄位標「已覆寫」，旁邊有「重設」回到自動值。
- 未登入時欄位唯讀並提示需登入（見 memory：寫入需登入）。
- 成長率絕對值 > 50% 時顯示提示「成長率異常，建議覆寫」。

**④ EPS 趨勢**

- Recharts 長條圖：最近 8 季單季 EPS，旁邊淡色長條為去年同季。
- 美股疊加 consensus 預估點；tooltip 顯示 surprise %（來自 `/stock/earnings`）。
- 圖下一行「下次財報：2026-10-29 盤後」（美股，Finnhub）或「Q3 財報法定截止日：11/14」（台股，一般業規則）。

**⑤ 本益比走勢**

- 折線：美股近 20 季 `peTTM`；台股近 60 個月月底本益比。
- 三條水平參考線：目前使用中的便宜 / 合理 / 昂貴本益比（含覆寫值）。

**⑥ 頁尾**：資料來源與最後更新時間（台股取 snapshot `updatedAt`，美股取快取時間）。

### 空狀態與錯誤

| 情況 | 呈現 |
|---|---|
| 使用中的 EPS ≤ 0 | ② 顯示「虧損中，無法用本益比估價」；④ 照常 |
| 單季資料不足 4 季 | TTM 分頁顯示「資料不足」；預估分頁若可算仍顯示 |
| 歷史本益比有效樣本 < 8 | 三檔本益比無預設值，② 提示「請在估價假設填入本益比」 |
| 台股查無此代號（上櫃 / 新上市） | 「目前僅支援上市股票」或「查無 EPS 資料」 |
| Finnhub 失敗 / 無 API key | 區塊內錯誤訊息 + 重試按鈕，其他區塊不受影響 |
| 無現價 | ② 只顯示三個價位，不顯示 ▼ 與結論 |

## 計算規則（`src/utils/valuation.js`，純函式）

季別記為 `{ year, quarter }`，`year` 為西元年（TWSE 民國年 + 1911）。

### 台股：累計轉單季

TWSE 的 EPS 是**年度累計值**。單季 EPS：

- Q1 = cum(Y, 1)
- Qn = cum(Y, n) − cum(Y, n−1)（n = 2..4；Q4 的 cum 即年報全年 EPS）
- 前一季累計值缺漏時，該季單季值為 `null`（不猜）。

### TTM

最近 4 個**連續**季度的單季 EPS 加總；任一為 `null` 或不足 4 季 → 無 TTM。

### 台股今年預估（最新已公布季為 Y 年 Qq）

- `g = cum(Y, q) / cum(Y−1, q) − 1`；若 `cum(Y−1, q) ≤ 0` 或缺漏 → `g = 0`，並在算式中註明「無法計算成長率」。
- q < 4：`預估 = cum(Y, q) + Σ_{k=q+1..4} single(Y−1, k) × (1 + g)`
- q = 4（年報已出、下一年 Q1 未出）：`預估 = cum(Y, 4) × (1 + g)`，標示為「Y+1 年預估」。
- 覆寫優先序：`forwardEps` 覆寫 > `growthRate` 覆寫（取代 g）> 自動。

### 美股未來四季預估

- 取 `/calendar/earnings`（from = 今天，to = 今天 + 15 個月）中 `epsActual == null` 的季度，依日期取前最多 4 筆 `epsEstimate`。
- 不足 4 筆時，用最近已公布季的實際 EPS 補足到 4 季。
- 註明「分析師 consensus（調整後 EPS）」— 與 TTM 使用的 GAAP EPS 基礎不同，在算式中標示。

### 本益比百分位

- 樣本：美股近 20 季 `peTTM`；台股近 60 個月月底本益比。剔除 `null`、`≤ 0`、非數字。
- 有效樣本 ≥ 8 才產生預設值；百分位用線性內插。
- 便宜 / 合理 / 昂貴 = P25 / P50 / P75。
- 價位 = 使用中的 EPS × 對應本益比。

## 資料來源

### 美股（前端，runtime）

新增 `src/services/fundamentalsProviders/finnhubFundamentalsProvider.js`，沿用 `finnhubProvider` 的 `requestFinnhub`（需 export 或抽到共用模組）：

| Endpoint | 用途 |
|---|---|
| `/stock/metric?metric=all` | `series.quarterly.eps`（單季 EPS，GAAP）、`series.quarterly.peTTM` |
| `/stock/earnings` | 最近 4 季實際 vs 預估、surprise % |
| `/calendar/earnings?symbol=` | 未來各季預估 EPS、下次財報日與 `hour`（bmo / amc） |

每檔結果快取在 localStorage（key `my-stock:fundamentals:US:<symbol>`），TTL 24 小時；讀寫包 try/catch。

### 台股（GitHub Actions snapshot，前端讀 same-origin JSON）

新增 `src/services/fundamentalsProviders/twFundamentalsProvider.js`，開啟細節頁時 lazy fetch 下列兩檔（整個 session 記憶體快取一次）：

**`public/data/tw_eps_history.json`**

```json
{
  "basis": "cumulative",
  "updatedAt": "2026-10-05T12:03:11Z",
  "companies": {
    "2330": {
      "name": "台積電",
      "quarters": {
        "2026Q2": { "eps": 49.33, "revenue": 2404483690, "operatingIncome": 1425568793, "netIncome": 1279582227 }
      }
    }
  }
}
```

金額單位沿用 TWSE 原始值（千元），不換算。

**`public/data/tw_pe_history.json`**

```json
{
  "updatedAt": "2026-10-01T12:02:40Z",
  "companies": { "2330": [["2026-09", 28.1], ["2026-08", 27.4]] }
}
```

每檔依月份新到舊排序，值為該月最後交易日本益比；TWSE 顯示 `-` 或 0 時存 `null`。

**PWA**：這兩檔不進 precache（預設 `globPatterns` 不含 json，維持即可）；新增 runtime caching，用 `NetworkFirst` 處理 `/data/tw_*.json`，以便離線時讀到上次的版本。

## 台股 snapshot 管線

### 每日 workflow：`.github/workflows/update-tw-fundamentals.yml`

- 觸發：`cron: '0 12 * * 1-5'`（台灣 20:00）+ `workflow_dispatch`。
- 執行 `node scripts/update-tw-fundamentals.mjs`：
  1. 抓 `openapi.twse.com.tw/v1/opendata/t187ap06_L_{ci,basi,bd,fh,ins,mim}`，以 `(公司代號, 年度, 季別)` 合併進 `tw_eps_history.json`，新值覆蓋舊值（處理重編）。不存 `出表日期`。
  2. 若 `tw_pe_history.json` 缺**上個月**資料：從上月最後一天往回試 TWSE 全市場個股本益比（rwd `BWIBBU_d`，帶 `date`、`selectType=ALL`；確切參數在 plan 中驗證）直到拿到資料，寫入所有公司上月的本益比。效果是每月固定產生一次 commit，同時當作 keepalive，避免 GitHub 60 天停用 scheduled workflow。
  3. **斷層檢查**：任一公司在其最早一季之後，若某季存在但**前一季**缺漏（Q1 的前一季為去年 Q4）→ 以非 0 exit code 結束，讓 GitHub 寄送失敗通知。
- 只在檔案有實際差異時 commit。
- commit 後以 `gh workflow run deploy.yml` 觸發部署（`permissions: actions: write`）。用 `GITHUB_TOKEN` push 的 commit **不會**觸發 `deploy.yml` 的 `push` 事件，不手動觸發的話資料永遠到不了 GitHub Pages。

合併、斷層檢查、月份計算等純邏輯放 `src/utils/twFundamentalsMerge.js`（讓 Vitest 的 `src/**` include 涵蓋得到），script 從該檔 import。

### 一次性回補：`scripts/backfill-tw-fundamentals.mjs`

- EPS：近 12 季（3 年），來源 MOPS 彙總報表（綜合損益表）。
- 本益比：近 60 個月，每月最後交易日的全市場個股本益比（同上 endpoint）。
- 可本機執行，也可用 `workflow_dispatch` 參數觸發；寫入與每日 workflow 相同格式，可重複執行。
- 每次請求間隔 ≥ 1.2 秒（沿用 TWSE rate limit 慣例）。

**風險**：MOPS 是否能穩定以程式取得歷史彙總報表**尚未驗證**，是 implementation plan 的第一個任務。若無法取得：第一版仍上線，台股 TTM / 預估顯示「資料累積中」，等每日 workflow 累積到足夠季數為止；本益比回補不受影響。

## 覆寫值同步（存於 `app_config`）

覆寫值存在既有的 `app_config` 表（primary key 為字串），doc key 為 `valuation:<market>_<symbol>`，欄位：

| 欄位 | 型別 | 說明 |
|---|---|---|
| `valuation.peCheap` / `peFair` / `peExpensive` | number \| null | null = 用自動值；必須 > 0 |
| `valuation.growthRate` | number \| null | 小數（0.2 = 20%），> −1，僅台股 |
| `valuation.forwardEps` | number \| null | 直接指定預估 EPS |

- 實作時改用 `app_config` 而非新表：sync、realtime listener、清除與匯出已完整支援，效果相同（以股票為 key、跨裝置同步、寫入需登入）。
- `firestoreMappers.js` 的 `appConfigToRemote` / `remoteToAppConfig` 多帶 `valuation` 欄位。
- `portfolioService.js`：`getValuationSettings({ market, symbol })`、`saveValuationSettings({ market, symbol, patch })`（patch 值為 null 即重設）。
- `firestore.rules` 的 `users/{userId}/{document=**}` 已涵蓋，不需修改。

## 測試

- `src/utils/valuation.test.js`：累計轉單季（含缺漏）、TTM（含不連續）、台股預估（q = 1..4、g 無法計算、覆寫優先序）、美股未來四季（不足 4 筆補實際值）、百分位（樣本不足、剔除無效值）、價位區間判斷與邊界。
- `src/utils/twFundamentalsMerge.test.js`：合併覆蓋、民國年轉換、斷層偵測、上個月判斷。
- `src/components/StockDetailSheet.test.jsx`：smoke test — TTM / 預估切換、虧損狀態、資料不足狀態、未登入時唯讀。
- Provider 以 mock `fetch` 測快取 TTL 與錯誤處理。
- 實作完成後在瀏覽器 preview 驗證細節頁（見 memory：build 成功不等於 runtime 正常）。

## 相關發現（不在本次範圍）

- 既有的 `update-tpex-snapshot.yml` 也是用 `GITHUB_TOKEN` push，因此同樣**不會**觸發部署；TPEX snapshot 要等到下一次人工 push 才會上到 GitHub Pages。可以順手套用相同的 `gh workflow run deploy.yml` 修法，另案處理。
- `openapi.twse.com.tw` 的 `STOCK_DAY_ALL` 回應沒有 CORS header，`twseProvider` 在 production 瀏覽器中可能一直失敗，只能靠其他 fallback。
