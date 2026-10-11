# 損益表估價推估器設計

日期：2026-10-11
狀態：設計已確認，待寫 implementation plan
前一版：`2026-10-05-stock-valuation-design.md`（EPS × 本益比估價）

## 目標

在個股細節頁的「估價假設」裡，用**營收 → 毛利率 → 營業費用率 → 業外 → 稅前淨利 → 稅後淨利 → EPS** 逐季推估，回答兩個問題：

1. **下一季 EPS 大概多少** — 財報公布前形成預期，公布後和實際比對，決定要不要調整持股策略。
2. **明年全年 EPS 大概多少** — 乘上本益比三檔，判斷現價位置。

另外把「股價 × EPS」放進同一張圖（本益比河流圖），看股價和獲利的相對走勢，並延伸到推估的未來。

## 範圍

**包含**

- 台股**上市**、非金融股（有營業毛利欄位的一般業版面）的逐季損益表推估模型。
- 月營收（MOPS）當作營收錨點。
- 全域假設 + 單季覆寫，跨裝置同步。
- 估價卡四種基準：近四季 TTM／下一季後 TTM／今年預估／明年預估。
- 預估 vs 實際的對照紀錄（快照）。
- 股價 × EPS 河流圖，取代台股上市的本益比歷史圖。
- EPS 趨勢圖加上推估季度的空心長條。
- 資料改為每家公司一檔（build 時從全市場大檔拆出）。

**不包含（第一版）**

- 美股、上櫃股：維持現有估價假設（本益比、成長率、自訂 EPS）與本益比歷史圖。
- 金融股（銀行、證券、金控、保險、異業）：沒有毛利這一層，不提供模型，只保留自訂 EPS。
- 多情境（樂觀／基準／保守）、多年（超過明年）推估。
- 股數覆寫（現金增資、減資）。

## 決策紀錄

| 問題 | 決定 |
|---|---|
| 推估時間範圍 | 逐季推估，從第一個未公布季推到明年 Q4；下一季看單季，今年／明年加總 |
| 假設粒度 | 一組全域假設 + 可單獨覆寫某一季 |
| 營收來源 | 月營收當錨點：已公布月份用實際，未公布月份用去年同月 × (1 + YoY) |
| 月營收來源 | MOPS `t21sc03`；openapi `t187ap05_L` 實測落後（10/11 仍停在 8 月） |
| 市場範圍 | 只做台股上市 |
| 與舊估價的關係 | 新模型取代舊「成長率」；保留「自訂預估 EPS」當逃生口 |
| 單季 EPS 怎麼估價 | 不直接乘本益比；改用「下一季後 TTM」（最近三季實際 + 下一季推估） |
| 業外的單位 | 每季金額（億元），不用佔營收 % |
| 營收 YoY 預設 | 近 3 個月累計 YoY |
| 資料檔配置 | 全市場大檔留在 repo（`data/twse/`），build 時拆成 `public/data/tw/{code}.json`（gitignore） |
| 股價 × EPS 圖 | 本益比河流圖（單一價格軸），不用雙 Y 軸；取代本益比歷史圖 |
| 預估 vs 實際 | 要做：每次儲存記下一季的推估快照 |
| EPS 趨勢圖 | 加推估季度的空心長條 |

## 資料管線

### 來源（欄位已實測確認）

| 資料 | 來源 | 欄位 |
|---|---|---|
| 季損益表（年度累計，千元） | 每日：openapi `t187ap06_L_{industry}`；回補：MOPS `ajax_t163sb04` | `營業收入`、`營業成本`、`營業毛利（毛損）淨額`、`營業費用`、`營業利益（損失）`、`營業外收入及支出`、`稅前淨利（淨損）`、`所得稅費用（利益）`、`本期淨利（淨損）`、`淨利（淨損）歸屬於母公司業主`、`基本每股盈餘（元）` |
| 月營收（千元） | MOPS `https://mopsov.twse.com.tw/nas/t21/sii/t21sc03_{民國年}_{月}_{0 或 1}.html`（Big5 HTML；`_0` 國內、`_1` KY） | 公司代號、當月營收 |
| 月底收盤價、本益比 | TWSE rwd `BWIBBU_d`（現有） | `收盤價`、`本益比` |

- `statement`：列上有營業毛利欄位為 `general`（啟用模型），否則為 `financial`。以欄位判斷而不是產業後綴，因為 MOPS 回補的列沒有產業後綴。
- 毛利欄位優先取 `營業毛利（毛損）淨額`，沒有時取 `營業毛利（毛損）`。
- MOPS `t163sb04` 的回應是否含上述全部欄位，實作第一步先驗證；缺欄位的季度在模型中視為資料不完整。

### 檔案

全市場大檔（repo 內、不部署）：

- `data/twse/eps_history.json`：由 `public/data/tw_eps_history.json` 搬來，每季多存新欄位。
- `data/twse/pe_history.json`：由 `public/data/tw_pe_history.json` 搬來，每列改為 `[month, pe, close]`。
- `data/twse/monthly_revenue.json`：新增，`{ updatedAt, companies: { [code]: { "2026-09": 511857399, … } } }`。

每家公司一檔（build 產物，`.gitignore`）：`public/data/tw/{code}.json`

```json
{
  "code": "2330", "name": "台積電", "statement": "ci", "updatedAt": "…",
  "quarters": {
    "2026Q2": { "revenue": 0, "grossProfit": 0, "operatingIncome": 0,
                "nonOperating": 0, "pretaxIncome": 0, "tax": 0, "netIncome": 0,
                "parentNetIncome": 0, "eps": 0 }
  },
  "monthlyRevenue": { "2026-09": 511857399 },
  "monthly": [["2026-09", 28.75, 1285.0]]
}
```

季資料維持年度累計（basis `cumulative`），由 client 換算單季。

### 腳本與 workflow

- `scripts/split-tw-fundamentals.mjs`：讀三個大檔，輸出每家一檔。掛在 `package.json` 的 `predev` 與 `prebuild`。
- `scripts/update-tw-fundamentals.mjs`（每日）：既有流程 + 新欄位 + 抓 MOPS 上月與上上月月營收頁並 merge（1～10 日間公司陸續公布）。
- `scripts/backfill-tw-fundamentals.mjs`：補齊既有季度的新欄位、60 個月收盤價、36 個月月營收。
- `.github/workflows/update-tw-fundamentals.yml`：`FILES` 改為 `data/twse/*.json`，其餘不變（有變更才 commit，`gh workflow run deploy.yml`）。
- `scripts/check-tw-fundamentals.mjs`：路徑改為 `data/twse/`。
- 純邏輯（parse、merge）放在 `src/utils/twFundamentalsMerge.js`，新增 MOPS 月營收 HTML parser。

### 前端讀取

- `twFundamentalsProvider` 改讀 `data/tw/{code}.json`；查無檔案時回 `unsupported`（維持現行文案）。
- `vite.config.js` 的 runtime cache 規則改為比對 `data/tw/*.json`（network-first，離線用最後一份）。

### 待查

- 台泥 1101 本益比自 2025-11 起全為 `null`：確認是虧損（`-`）還是資料缺漏。

## 推估模型（`src/utils/incomeModel.js`，純函式）

### 名詞

- **已公布季**：有季報的季度。**近四季**：最近四個已公布單季。
- **推估季**：第一個未公布季到明年 Q4（以今天日期的年份 +1）。**下一季**：第一個推估季。

### 每季推估鏈（金額單位千元）

```
營收 R        = 已公布月份實際 + Σ 未公布月份(去年同月 × (1 + revenueYoy))，再 × 校正係數
毛利          = R × grossMargin
營業利益      = 毛利 − R × opexRatio
稅前淨利      = 營業利益 + nonOperating
稅後淨利      = 稅前淨利 × (1 − taxRate)
母公司淨利    = 稅後淨利 × (1 − nciRatio)
EPS           = 母公司淨利 ÷ 股數
```

### 自動預設

| 假設 | 預設 |
|---|---|
| `revenueYoy` | 最近 3 個已公布月份營收合計 ÷ 去年同期 3 個月合計 − 1 |
| `grossMargin` | 近四季毛利合計 ÷ 近四季營收合計 |
| `opexRatio` | 近四季 (毛利 − 營業利益) 合計 ÷ 近四季營收合計（吸收「其他收益及費損」，使毛利率 − 費用率 = 營益率） |
| `nonOperating` | 近四季業外平均（每季金額） |
| `taxRate` | 近四季所得稅合計 ÷ 近四季稅前合計；稅前合計 ≤ 0 時 20% |
| `nciRatio` | 1 − 近四季母公司淨利合計 ÷ 近四季稅後淨利合計；稅後合計 ≤ 0 時 0 |
| 股數（唯讀） | 近四季中累計 EPS 絕對值最大那一季的累計母公司淨利 ÷ 累計 EPS（千元 ÷ 元 = 千股；累計 EPS 很小時多半是四捨五入，不用它） |
| 校正係數（唯讀） | 近四季 Σ 季報營收 ÷ Σ 對應三個月月營收；與 1 差距 ≤ 3% 時視為 1 |

**優先順序**：該季單季覆寫 > 全域覆寫 > 自動預設。

### 輸出

- `quarters[]`：每個推估季的完整推估鏈、每個假設的來源（`quarter`／`global`／`auto`）、已公布月數。
- `nextQuarter`：下一季 EPS，附 YoY（對去年同季實際）、QoQ（對上一季實際）。
- `ttmAfterNext`：最近三個已公布單季 + 下一季推估。
- `thisYear`：今年已公布季實際 + 推估季。
- `nextYear`：明年四季推估合計。
- `rollingTtm[]`：每個推估季結束時的滾動 TTM（河流圖未來段）。

### 不適用

以下任一情況回傳 `{ status: 'unavailable', reason }`，估價卡的「下季後／今年／明年」退回「自訂 EPS」或顯示原因：

- `statement !== 'general'`（金融股）。
- 近四季任一季缺必要欄位。
- 股數無法計算（近四季累計 EPS 全為 0 或缺值）。
- 推估需要的去年同月營收缺漏。

### 與既有 `valuation.js` 的整合

- `buildValuationModel` 的 `basis` 擴充為 `ttm`／`ttmAfterNext`／`thisYear`／`nextYear`。
- 台股上市改用 `incomeModel` 輸出；`estimateTwForwardEps`、`growthRate` 相關邏輯移除（美股的 `estimateUsForwardEps` 不動）。
- `forwardEps` 有值時，`thisYear`／`nextYear` 直接用它，說明行寫「自訂預估 EPS」。

## 假設的資料結構與同步

沿用 `app_config` 文件 `valuation:TW_{code}` 的 `valuation` 物件與 `mirrorToCloud`；Firestore rules、mapper、`database.js` 不需改動。

```js
valuation: {
  peCheap, peFair, peExpensive,   // 不變
  forwardEps,                     // 逃生口
  // growthRate：移除；讀取時忽略，下次儲存時刪除
  model: {
    global: { revenueYoy, grossMargin, opexRatio, nonOperating, taxRate, nciRatio }, // null = 自動
    quarters: { "2026Q4": { grossMargin: 0.55 } },  // 只存有覆寫的季與欄位
  },
  snapshots: {
    "2026Q3": { eps, revenue, grossMargin, opexRatio, savedAt },
  },
}
```

- **驗證**（`saveValuationSettings`）：`revenueYoy > -1`；`grossMargin`、`nciRatio` 介於 -1～1（子公司虧損時非控制權益比可為負）；`opexRatio`、`taxRate` 介於 0～1；`nonOperating` 任意有限數。不合法時丟中文錯誤訊息。
- **過期覆寫**：已公布季的單季覆寫在計算時忽略，儲存時刪除。
- **快照**：每次儲存把當下 `nextQuarter` 的 `eps`、`revenue`、`grossMargin`、`opexRatio` 寫入 `snapshots[下一季]`（覆蓋同季），只留最近 8 季。
- **記下這次預估**：草稿沒有變更、但下一季還沒有快照時，儲存按鈕文字為「記下這次預估」且可按。
- **同步**：整份文件 last-write-wins，與現有本益比設定相同。
- **寫入需登入**：未登入唯讀，顯示「登入後可調整估價假設」。

## UI

設計規範遵守 `DESIGN.md`：只用 token，圖表用 `CHART_STOCK`，不用 teal。

### 估價卡（`ValuationCard`）

- Segmented：台股上市為「近四季｜下季後｜今年｜明年」；美股、上櫃維持現有兩個選項。
- Segmented 下方一行 `muted` 說明 EPS 組成與合計，例如「2025Q4–2026Q2 實際 + 2026Q3 推估 合計 56.20」。
- 價格尺與狀態訊息不變；模型不適用時顯示原因。
- 「估價假設」入口列摘要：「2026Q3 預估 EPS 15.20 · 本益比 18／22／26」。

### 估價假設 sheet（`ValuationAssumptions`）

台股上市的版面由上而下：

1. **推估結果**：下一季季別與 EPS（title 級，非 display）、YoY／QoQ（▲▼ + `up`／`down`）、今年與明年 EPS。隨草稿即時更新。
2. **預估與實際**：有已公布的快照季才出現。每列「2026Q2 預估 13.90 → 實際 14.20 ▲2.2%」，點開顯示營收、毛利率、費用率的預估與實際。
3. **全部季度的假設**：營收 YoY %、毛利率 %、營業費用率 %、業外（億/季）、稅率 %。placeholder 顯示自動值；有覆寫時顯示「改回預設」。可收合的「進階」：非控制權益比 %（可覆寫）、股數與營收校正係數（唯讀）。
4. **逐季推估**：分組列表，依年份分組，分組標題右側為年度 EPS 小計（今年／明年）。每列：季別、已公布月數（例如「10 月已公布」「營收已全部公布」）、「已覆寫」tag（有單季覆寫時）、EPS、chevron。點列展開該季的迷你損益表與單季覆寫欄位，一次只展開一季：
   ```
   營收        6,012 億  （7–9 月實際）
   毛利率  [ 60.0 ] %   → 毛利 3,607 億
   費用率  [      ] %   → 營業利益 2,994 億
   業外    [      ] 億  → 稅前 3,115 億
   稅率    [      ] %   → 稅後 2,570 億
   母公司淨利 2,569 億 ÷ 股數 259.3 億 = EPS 15.20
   ```
   營收 YoY 欄位只在該季還有未公布月份時出現。
5. **本益比**：不變。
6. **直接指定 EPS**：原「預估 EPS」欄位，說明「模型不適用時使用」。有值時，第 1 區上方提示「已使用自訂 EPS，模型結果僅供參考」。

- 金額一律以億元顯示（千元 ÷ 100,000）。百分比欄位以 % 輸入、存為小數。
- 可能為負的欄位（營收 YoY、毛利率、業外）不加 `inputMode`；其餘用 `decimal`。
- 底部固定按鈕：「儲存」或「記下這次預估」。
- 模型不適用時（金融股等）：第 1～4 區換成一行原因說明，保留本益比與直接指定 EPS。

### 股價與 EPS 河流圖（新元件 `PeRiverChart`）

- 位置：估價假設入口下方，取代台股上市的 `PeHistoryChart`（美股、上櫃保留）。
- **股價**：月底收盤價，`CHART_STOCK.primary` 實線 2px；最後一點為 App 中的現價。
- **帶狀區**：歷史 TTM EPS × 目前生效的便宜／合理／昂貴本益比。便宜到昂貴之間填 `CHART_STOCK.previous`，合理線為虛線。
- **歷史 TTM 不偷看未來**：某月使用的 TTM 只含該月底前已過法定申報期限的季度（Q1 5/15、Q2 8/14、Q3 11/14、Q4 隔年 3/31）。
- **未來段**：今天以 `line` 色直線分隔；之後用 `rollingTtm` 延伸到明年 Q4，帶狀區降低透明度、邊線改虛線。
- **Tooltip**：月份、收盤價、TTM EPS、隱含本益比、三條帶的價位。
- 歷史 TTM 不足 4 季的月份不畫帶狀區。

### EPS 趨勢圖（`EpsTrendChart`）

台股上市在實際單季長條之後，加上推估季的空心長條（`CHART_STOCK.primary` 外框、無填色），tooltip 名稱為「推估」。

## 測試

- `incomeModel.test.js`：
  - 累計轉單季（含新欄位）。
  - 各項自動預設。
  - 月營收錨點：全部已公布、部分已公布、全部未公布。
  - 校正係數門檻。
  - 覆寫優先順序。
  - 過期覆寫被忽略。
  - 稅前虧損時的稅率 fallback。
  - 不適用的各種原因。
  - `ttmAfterNext`／`thisYear`／`nextYear`／`rollingTtm`。
- `twFundamentalsMerge.test.js`：新欄位 normalize、MOPS 月營收 HTML parse（Big5 解碼後的 fixture）、`BWIBBU_d` 收盤價、split 輸出。
- `valuation.test.js`：新 basis、`forwardEps` 逃生口。
- `portfolioService`：新欄位驗證、快照寫入與 8 季上限、`growthRate` 清除、過期單季覆寫清除。
- 元件：
  - `ValuationAssumptions`：逐季展開與覆寫、「記下這次預估」、預估 vs 實際。
  - `ValuationCard`：四個選項。
  - `PeRiverChart`：smoke test，含資料不足。
  - `EpsTrendChart`：推估長條。
- 完成後在瀏覽器實際打開細節頁驗證（build 成功不等於 runtime 正常）。

## 文件同步

- `CLAUDE.md`、`docs/技術導覽.md`：TW fundamentals 大檔路徑改為 `data/twse/`、每家一檔、月營收來源。
- `DESIGN.md`：河流圖與推估空心長條的圖表規範。
