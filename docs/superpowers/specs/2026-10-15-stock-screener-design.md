# 低估個股篩選設計

日期：2026-10-15
狀態：設計已確認，待寫實作計畫
分支：`feat/stock-screener`（實驗）
相關：`2026-10-11-income-statement-valuation-design.md`（EPS 推估與估價）、`2026-10-13-watchlist-research-tab-design.md`（研究 tab 與觀察清單）

## 目標

用專案現有的 EPS × 本益比估價，把**全部上市台股**和現價比較，列出「現價低於合理價」的候選清單，作為兩種用途的起點：

1. 定期掃一遍找新標的，挑感興趣的加進觀察清單。
2. 看自己的持股／觀察股目前是否落在便宜區。

篩選結果是**候選清單，不是買進訊號**。估價只用歷史本益比區間，分不出「被錯殺」與「市場有理由重新評價」，文案要講清楚。

## 可行性試算（2026-10-15）

以 9 月底收盤價代替現價、TTM 基準、自動本益比區間，對 1,085 家上市公司跑現有的 `buildValuationModel`：843 家算得出估價，其中 290 家「低於便宜價」。排在最前面的幾乎都是一次性收益（處分資產、營建交屋、業外暴增）。依序疊加品質條件後剩 93 家：

| 條件 | 剩下 |
|---|---|
| 原始：TTM 低於便宜價 | 290 |
| 業外 ≤ 稅前淨利 30% | 190 |
| 近 8 季至少 7 季獲利 | 153 |
| TTM EPS ≤ 前一年 TTM 的 2 倍 | 121 |
| 本益比樣本 ≥ 36 個月 | 104 |
| 本業 EPS 估價也低於合理價 | 93 |

剩下的雜訊：營建股認列不平均（櫻花建）、股本變動但 EPS 未調整（緯穎，股數比值 3.01）、歷史本益比被低 EPS 期撐高（喬山）、市場重新評價（儒鴻）。前兩類由本設計的資料處理，後兩類列入已知限制。

## 範圍

**包含**

- 上市台股（`data/twse/eps_history.json` 涵蓋的公司），含金融股（只在算得出 EPS 的基準下出現）。
- 新增 TWSE 公司基本資料快照（產業別、已發行股數）。
- 建置期產生 `public/data/tw/screen.json`。
- 研究 tab 新 section「低估候選」、完整清單 sheet、門檻設定 sheet、產業篩選 sheet。
- 四種 EPS 基準切換、八個可調的品質標籤、產業多選篩選。
- 細節頁自訂的估價假設套用到篩選。
- `WatchlistDetailSheet` 支援「尚未加入觀察清單」的股票，並提供「加入觀察清單」。
- `twseDailyProvider` 多解析「成交金額」。
- `PRODUCT.md`、`DESIGN.md`、`CLAUDE.md` 對應更新。

**明確不做（YAGNI）**

- 上櫃股票（沒有 EPS／本益比資料）與美股（Finnhub 逐檔查、有速率限制）。
- 同產業本益比比較、依產業分組顯示。
- 調整 `peBandsFromHistory`（例如排除本益比 > 50 的月份）：維持現狀，細節頁不受影響。
- 依股本變動自動調整 EPS：只標示。
- 篩選結果的歷史紀錄、通知、匯出。
- 新套件、Firestore rule 變更。

## 已確認的產品決策

| 問題 | 決策 |
|---|---|
| 用途 | 全市場找新標的 ＋ 檢查自己的持股／觀察股 |
| EPS 基準 | TTM／TTM＋下季推估／今年推估／明年推估，四種可切換；預設 TTM；明年推估標「參考」 |
| 「低估」定義 | 現價 < 合理價，分「低於便宜價」「合理偏低」兩組，組內依距合理價 % 由低到高 |
| 品質過濾 | 八個標籤，各自可開關、可調門檻；有任一標籤的股票預設隱藏，可展開看 |
| 門檻儲存 | `app_config` 的 `stock_screen:settings`，跨裝置同步；修改需登入 |
| 自訂估價假設 | 套用，列上標「自訂」 |
| 持股／觀察股 | 有標籤也照樣顯示（標籤照列），但仍須低於合理價才會進清單 |
| 產業 | 每列顯示產業名稱；可多選產業篩選，選擇存在設定裡 |
| 本益比區間 | 不排除高本益比月份，維持細節頁現行算法 |
| 架構 | 建置時預先算好每家的原始指標，前端套現價、門檻與自訂假設 |

## 1. 資料管線

### 1.1 公司基本資料快照

- `scripts/update-tw-fundamentals.mjs` 每次執行多抓一次 TWSE openapi `t187ap03_L`（上市公司基本資料）。
- 寫入 `data/twse/company_profile.json`（不部署，與其他大檔同目錄）：

  ```json
  {
    "updatedAt": "2026-10-15T12:00:00.000Z",
    "companies": {
      "2330": { "industry": "24", "sharesIssued": 25932070992 }
    }
  }
  ```

  - `industry`：欄位「產業別」，兩位數字串。
  - `sharesIssued`：欄位「已發行普通股數或TDR原股發行股數」，轉成數字。
- 這份是當下快照：每次整份覆寫，不累積歷史。抓取失敗時保留舊檔並在 log 警告，**不讓 job 失敗**（篩選只是降級：沒有產業與股本標籤）。
- 有變更才 commit，沿用現有 workflow 的 commit 與 `gh workflow run deploy.yml` 流程。`scripts/lib/twse.mjs` 新增 `PROFILE_PATH`。

### 1.2 產業名稱對照

`src/utils/twIndustries.js` 匯出 `TW_INDUSTRIES`（代碼 → 中文簡稱）與 `industryName(code)`（不認得的代碼回傳「其他」）。2026-10-15 實際出現的 33 個代碼：

| 代碼 | 名稱 | 代碼 | 名稱 | 代碼 | 名稱 |
|---|---|---|---|---|---|
| 01 | 水泥 | 14 | 建材營造 | 27 | 通信網路 |
| 02 | 食品 | 15 | 航運 | 28 | 電子零組件 |
| 03 | 塑膠 | 16 | 觀光餐旅 | 29 | 電子通路 |
| 04 | 紡織纖維 | 17 | 金融保險 | 30 | 資訊服務 |
| 05 | 電機機械 | 18 | 貿易百貨 | 31 | 其他電子 |
| 06 | 電器電纜 | 20 | 其他 | 35 | 綠能環保 |
| 08 | 玻璃陶瓷 | 21 | 化學 | 36 | 數位雲端 |
| 09 | 造紙 | 22 | 生技醫療 | 37 | 運動休閒 |
| 10 | 鋼鐵 | 23 | 油電燃氣 | 38 | 居家生活 |
| 11 | 橡膠 | 24 | 半導體 | 91 | 存託憑證 |
| 12 | 汽車 | 25 | 電腦及週邊 | | |
| | | 26 | 光電 | | |

實作時對照 TWSE 產業分類說明再核對一次名稱。

### 1.3 `screen.json`

`scripts/split-tw-fundamentals.mjs` 在拆檔後，多讀 `company_profile.json`，呼叫 `buildScreenRows`（`src/utils/stockScreen.js`）並寫出 `public/data/tw/screen.json`（gitignore，與 `{code}.json` 同目錄；`vite.config.js` 現有的 `/data/tw/*.json` runtime cache 規則已涵蓋）。

```json
{
  "generatedAt": "2026-10-15T12:05:00.000Z",
  "todayIso": "2026-10-15",
  "rows": [
    {
      "code": "2330",
      "name": "台積電",
      "industry": "24",
      "statement": "general",
      "eps": { "ttm": 52.1, "ttmAfterNext": 55.3, "thisYear": 56.0, "nextYear": 64.2 },
      "bands": { "cheap": 14.2, "fair": 17.8, "expensive": 21.5, "sampleSize": 60 },
      "nonOpRatio": 0.04,
      "profitQuarters": 8,
      "epsGrowth": 1.35,
      "coreEps": 50.2,
      "shareRatio": 1.0,
      "fallbackClose": 1450,
      "fallbackMonth": "2026-09"
    }
  ]
}
```

欄位定義（全部以 `buildValuationModel` 與 `incomeModel.js` 現有函式計算，不另寫估價邏輯；「近四季」皆為單季化後的最近四個連續季度）：

| 欄位 | 定義 | 算不出時 |
|---|---|---|
| `eps.*` | `buildValuationModel(..., settings: null, basis)` 的 `chosen.eps`，四種基準各算一次（`todayIso` 為建置當天） | `null` |
| `bands` | `peBandsFromHistory`（自動區間）＋ `sampleSize` | `null`（樣本 < 8） |
| `nonOpRatio` | 近四季業外合計 ÷ 近四季稅前淨利合計 | 稅前 ≤ 0 或資料不完整：`null` |
| `profitQuarters` | 最近 8 個單季 EPS 中 > 0 的季數；不足 8 季時照實際季數計 | — |
| `epsGrowth` | TTM ÷ 再往前四季的 TTM | 前一年 TTM ≤ 0 或資料不足：`null` |
| `coreEps` | 近四季營業利益 ×（1 − 有效稅率）× 母公司占比 ÷ 隱含股數。有效稅率 = 近四季所得稅 ÷ 稅前，夾在 0–0.4，稅前 ≤ 0 時用 0.2；母公司占比 = 母公司淨利 ÷ 稅後淨利（稅後 ≤ 0 時用 1）；隱含股數 = 近四季母公司淨利 ÷ TTM EPS | 金融業或算不出：`null` |
| `shareRatio` | `sharesIssued` ÷（最新一季累計母公司淨利 × 1000 ÷ 最新一季累計 EPS） | 沒有 profile、EPS ≤ 0.05：`null` |
| `fallbackClose` / `fallbackMonth` | `pe_history` 最近一個有收盤價的月份 | `null` |

`eps` 四個都是 `null` 且 `bands` 為 `null` 的公司不寫入，以縮小檔案。預估約 1,000 列、200–300 KB。

## 2. 篩選邏輯

全部是 `src/utils/stockScreen.js` 的純函式。

### 2.1 價格

- 打開研究 tab 時，`useStockScreen` 呼叫 `getTwseDailyQuotes`（`MI_INDEX?type=ALLBUT0999`），取得全市場收盤價與成交金額，沿用觀察清單的 10 分鐘節流。
- `twseDailyProvider` 的 `parseDailyTable` 多解析欄位「成交金額」，存成 quote 的 `tradeValue`（元）；缺欄位時為 `undefined`，不影響既有呼叫端。
- 某檔沒有當日價格，或整批抓價失敗：改用該列的 `fallbackClose`，列上標「月底價」，且「成交量低」標籤對它不適用（沒有資料就不標）。

### 2.2 進入清單

`screenStocks({ rows, quotes, settings, basis, overrides, ownership })`：

1. 依 `settings.industries` 過濾（空陣列 = 全部產業）。
2. 對每列取 `eps[basis]` 與 `bands`（有 override 時用 override，見 2.4），呼叫現有的 `computeValuation({ eps, bands, price })`。
3. `status !== 'ok'`（虧損、沒有 EPS、本益比不足）的列不進清單。
4. `zone === 'below'` 進「低於便宜價」組，`zone === 'fair-low'` 進「合理偏低」組，其餘不進清單。
5. 計算標籤（2.3）。沒有標籤、或屬於持股／觀察清單的列放在主清單；其餘放在「被標記」清單。
6. 每組依 `distanceToFair` 由低到高排序。

回傳 `{ below: Row[], fairLow: Row[], flagged: Row[], counts }`；每個 Row 帶 `price`、`priceSource`（`'daily' | 'month-end'`）、`distanceToFair`、`zone`、`flags: FlagKey[]`、`custom: boolean`、`owned: boolean`、`watched: boolean`、`industryName`。

### 2.3 品質標籤

| key | 標籤 | 觸發條件（預設門檻） | 只適用一般業 | 值為 `null` 時 |
|---|---|---|---|---|
| `nonOperating` | 業外占比高 | `nonOpRatio > 0.3` | ✓ | 觸發 |
| `unstableProfit` | 獲利不穩 | `profitQuarters < 7` | | — |
| `epsSpike` | EPS 暴增 | `epsGrowth > 2` | | 觸發（轉虧為盈或資料不足） |
| `coreNotCheap` | 本業不便宜 | `price ≥ coreEps × bands.fair` | ✓ | `coreEps ≤ 0` 觸發，`null` 不觸發 |
| `fewPeSamples` | 本益比樣本少 | `bands.sampleSize < 36` | | — |
| `shareChange` | 股本變動 | `|shareRatio − 1| > 0.3` | | 不觸發 |
| `construction` | 營建業 | `industry === '14'` | | 不觸發 |
| `lowTurnover` | 成交量低 | `tradeValue < 10,000,000` | | 不觸發 |

「只適用一般業」的標籤對 `statement !== 'general'` 的列一律不觸發。關閉的標籤不計算。

### 2.4 自訂估價假設

- `useStockScreen` 讀取 `app_config` 中所有 `valuation:TW_<code>` 鍵（只看台股，且 `screen.json` 有該代碼者），對每一檔用 `getTwFundamentals` 載入 `{code}.json`、以 `buildValuationModel({ fundamentals, settings, price, basis, todayIso })` 重算，得到該基準的 `chosen.eps` 與 `bands`，組成 `overrides[code][basis]`。
- 僅在設定確實改變結果時標 `custom: true`（有自訂本益比區間、自訂 forward EPS 或損益表假設）。
- 重算失敗（檔案載入錯誤等）時該檔退回 `screen.json` 的自動值，不標「自訂」。
- 基準切換時只重算 override 的股票（通常個位數），不重新載入 `screen.json`。

### 2.5 設定

`app_config` 鍵 `stock_screen:settings`，`portfolioService` 新增 `getScreenSettings()`／`saveScreenSettings(settings)`，沿用 `mirrorToCloud` 同步。

```js
export const DEFAULT_SCREEN_SETTINGS = {
  version: 1,
  industries: [],
  flags: {
    nonOperating: { enabled: true, max: 0.3 },
    unstableProfit: { enabled: true, minProfitQuarters: 7 },
    epsSpike: { enabled: true, maxGrowth: 2 },
    coreNotCheap: { enabled: true },
    fewPeSamples: { enabled: true, minSamples: 36 },
    shareChange: { enabled: true, maxDeviation: 0.3 },
    construction: { enabled: true },
    lowTurnover: { enabled: true, minTradeValue: 10_000_000 },
  },
}
```

- 讀取時與預設值逐欄合併（`normalizeScreenSettings`），舊版或缺欄位不會壞；數值不合法（非有限數、負數）時用預設值。
- 修改需登入（與其他設定一致）：未登入時門檻 sheet 唯讀；產業選擇在未登入時只在本次 session 有效、不寫入。
- EPS 基準是頁面狀態，不存。

## 3. 介面

照 `DESIGN.md`：研究頁沒有 hero 與 display 數字；間距照支出頁樣板；只用 token；小字灰用 `muted`；低估不代表漲跌，距合理價用 `ink`／`muted`，不用 `up`/`down` 色。

### 3.1 「低估候選」section

放在研究頁觀察清單 section 下方。

- **標題列**：`SectionTitle`「低估候選」；右側「更新於 …」（`muted`）與齒輪按鈕（iconoir，開門檻設定 sheet；沿用 44px 點擊區規則）。
- **控制列**：EPS 基準 chips「近四季／加下一季／今年推估／明年推估（參考）」；最右一個「產業」chip，未選時「全部產業」，選了顯示「半導體 等 2 類」，點開產業篩選 sheet。chips 寬度不夠時可橫向捲動。
- **說明**：控制列下一行 `muted` 小字「依歷史本益比估價，便宜可能有原因」。
- **列表**：「低於便宜價」「合理偏低」兩組，各自有組標題與檔數，頁面上每組最多 5 列。
- **列**：
  - 左：名稱；下一行 `muted` 小字「代號 · 產業」，再接「持有」「觀察」「自訂」「月底價」與標籤名稱（以 · 分隔）。
  - 右：現價；下一行「距合理價 −32%」（`muted`）。
  - 點列：開啟研究 sheet（3.4）。
- **狀態列**（列表最後一行置中，仿 `PriceRefreshFooter`）：「查看全部 N 檔 · 另有 M 檔被標記」，點開完整清單 sheet。
- **空狀態**：沒有符合的股票時「目前沒有低於合理價的股票」；選了產業時加「（已篩選產業）」。
- **載入／錯誤**：`screen.json` 不存在或載入失敗時，section 顯示「篩選資料尚未產生」，不影響觀察清單。

### 3.2 完整清單 sheet

bottom sheet（`90dvh`）：標題「低估候選」，內容同 section 但不限列數；最下方「被標記 M 檔」摺疊區，展開後依距合理價排序，每列標籤照列。

### 3.3 門檻設定與產業篩選 sheet

- **門檻設定**：每個標籤一列：標籤名稱 + 一行說明（`muted`）、右側開關；有數字門檻的標籤在下方放輸入框（`inputMode="decimal"`，比例以 % 顯示與輸入，成交金額以「萬」為單位）。底部動作列「恢復預設」（次要）與「儲存」（primary）。未登入時欄位停用並提示「登入後可修改」。
- **產業篩選**：33 類 chips 多選（選中樣式同 chip-selected），上方「全部」「清除」；選擇即時套用，登入時存入設定。

### 3.4 研究 sheet

- 沿用 `WatchlistDetailSheet`（`StockSheetShell` + `StockResearchContent`），改為可接受不在觀察清單中的股票：
  - 在清單中：維持現有行為（底部「從觀察清單移除」）。
  - 不在清單中：底部改為「加入觀察清單」（primary），成功後切換成在清單中的狀態。未登入時停用。
- 開啟時的 EPS 基準帶入篩選目前選的基準。
- 已持有的股票也開這個 sheet（研究視角），與觀察清單規格「從觀察清單點開一律是無 holding 版本」一致。

## 4. 元件與檔案

| 檔案 | 變更 |
|---|---|
| `src/utils/stockScreen.js` | 新增：`buildScreenRows`、`screenStocks`、`computeFlags`、`DEFAULT_SCREEN_SETTINGS`、`normalizeScreenSettings`、`FLAG_DEFINITIONS`（標籤名稱、說明、門檻欄位） |
| `src/utils/twIndustries.js` | 新增：產業對照 |
| `src/hooks/useStockScreen.js` | 新增：載入 `screen.json`、抓價節流、讀寫設定、override 重算、組合持股／觀察清單身分 |
| `src/components/research/ScreenSection.jsx` | 新增 |
| `src/components/research/ScreenList.jsx` | 新增：組標題 + 列（section 與 sheet 共用） |
| `src/components/research/ScreenListSheet.jsx` | 新增 |
| `src/components/research/ScreenSettingsSheet.jsx` | 新增 |
| `src/components/research/ScreenIndustrySheet.jsx` | 新增 |
| `src/components/WatchlistDetailSheet.jsx` | 支援未加入的股票與「加入觀察清單」、初始基準 |
| `src/services/priceProviders/twseDailyProvider.js` | 解析「成交金額」→ `tradeValue` |
| `src/services/portfolioService.js` | `getScreenSettings`／`saveScreenSettings`；列出 `valuation:TW_*` 鍵的 helper |
| `scripts/update-tw-fundamentals.mjs`、`scripts/lib/twse.mjs` | 抓 `t187ap03_L`，寫 `company_profile.json` |
| `scripts/split-tw-fundamentals.mjs` | 產生 `screen.json` |
| `.github/workflows/update-tw-fundamentals.yml` | commit 範圍加入 `company_profile.json` |
| `src/App.jsx` | 只掛上 `ScreenSection` 與 sheet，傳入持股／觀察清單 |
| `src/index.css` | section 與列樣式（只用 token） |
| `PRODUCT.md`、`DESIGN.md`、`CLAUDE.md` | 研究頁新 section、新資料檔與 workflow 說明 |

## 5. 錯誤處理

| 狀況 | 行為 |
|---|---|
| `screen.json` 不存在／載入失敗 | section 顯示「篩選資料尚未產生」 |
| 全市場抓價失敗 | 全部用月底價，列上標「月底價」，「更新於」顯示失敗提示 |
| `company_profile.json` 抓取失敗（workflow） | 保留舊檔、log 警告，job 不失敗 |
| 沒有 profile 資料 | 產業顯示「其他」，股本、營建標籤不觸發 |
| override 重算失敗 | 退回自動值，不標「自訂」 |
| 設定儲存失敗 | 沿用現有的錯誤提示，sheet 不關閉 |

## 6. 測試

- `src/utils/stockScreen.test.js`：
  - `buildScreenRows`：用 `incomeModel.fixture.js` 風格的小 fixture 驗證每個欄位，含金融業、資料不足、轉虧為盈。
  - `screenStocks`：分組與排序、四種基準、產業過濾、每個標籤的邊界值（等於門檻時不觸發／觸發）、關閉標籤、持股／觀察強制顯示、override 覆寫與 `custom`、月底價 fallback 與 `lowTurnover` 不適用。
  - `normalizeScreenSettings`：缺欄位、舊版、非法值。
- `src/utils/twIndustries.test.js`：未知代碼。
- `twseDailyProvider` 測試補「成交金額」解析。
- `ScreenSection.test.jsx`：smoke test（有資料、空狀態、資料未產生）。
- `WatchlistDetailSheet.test.jsx`：未加入時顯示「加入觀察清單」。
- 完成後 `npm run build && npm run preview`，在瀏覽器（含手機寬度）實際操作篩選、切換基準、產業、門檻、開 sheet、加入觀察清單。

## 已知限制

- **歷史本益比區間被撐高**：曾在 EPS 很低時本益比偏高的股票（如喬山 2024–25 本益比 43）便宜價會偏高，可能留在清單。決定維持細節頁現行算法。
- **市場重新評價**：成長前景變差而本益比下修的股票（如儒鴻）會被列為低估，篩選無法分辨。
- **股本變動只標示**：比值偏離來自加權平均股數時會誤判（試算時 15 檔中有少數如此），EPS 不自動調整。
- **推估 EPS 以建置日計算**：部署間隔內「今年／明年推估」不會隨日期前進；fundamentals workflow 平日都會觸發部署，影響小。
- **只有上市股**：上櫃與美股不在範圍內。
