# 財務預估（Forecast）設計

日期：2026-10-17
狀態：設計已確認，待使用者審閱 spec

## 目標

依目前的資產、收入、支出與投資報酬假設，預估全家未來的總資產，回答三個問題：

1. **照現在這樣下去，N 年後全家會有多少錢？** — 一條資產趨勢曲線。
2. **最早哪一年可以財務自由？** — 資產第一次跨過「財務自由門檻」的時間。
3. **如果我改變行為會差多少？** — 調整幾個旋鈕，與基準線比較。

以全家合計、新台幣、**今日幣值（實質金額）** 呈現。

## 範圍

**包含**

- 逐月確定性模擬（預設 30 年，可切 10 / 20 / 30 / 40 年）。
- 股票與現金分開計算報酬；名目報酬 + 通膨率，由 App 換算成實質報酬。
- 財務自由門檻（年支出 ÷ 提領率）與達成時間。
- 「如果…」線：四個旋鈕（每月支出、每月收入、新存款投資比例、股票年報酬），不存檔。
- 所有假設都在 App 內編輯，存到 `app_config` 的 `forecast_settings`，全家同步。
- 資產頁入口卡 + 全螢幕 forecast sheet。

**不包含（YAGNI，留給下一版）**

- 生涯模擬（退休年齡、退休後收入歸零、提領期、預期壽命）。
- 時間軸事件（例如「某年起支出 +X」、買房、小孩出生）。
- 保守 / 樂觀帶。
- 具名情境存檔。
- Monte Carlo 隨機模擬。
- 依持有人拆分預估。
- 從持股推算歷史年化報酬（持股沒有買進日期，算不出來）。

## 計算模型

純函式，放在 `src/utils/forecast.js`。

### 實質報酬

```
實質年報酬 = (1 + 名目年報酬) / (1 + 通膨率) − 1
實質月報酬 = (1 + 實質年報酬)^(1/12) − 1
```

股票與現金各算一次。收入與支出視為隨通膨成長，在實質金額下為**固定值**。

### 起點（第 0 個月 = 今天）

- 股票 = 目前持股市值合計（美股以目前 USD/TWD 匯率換算）。
- 現金 = 目前現金帳戶餘額合計。

### 每個月

1. `股票 ×= (1 + 股票實質月報酬)`；`現金 ×= (1 + 現金實質月報酬)`。
2. `結餘 = 每月收入 − 每月支出`。
3. 結餘 > 0：`股票 += 結餘 × 投資比例`，`現金 += 結餘 × (1 − 投資比例)`。
4. 結餘 < 0：先從現金扣；現金不足的部分從股票扣。股票與現金都以 0 為下限，不會變負數。

輸出 `[{ monthIndex, month: 'YYYY-MM', stockTwd, cashTwd, totalTwd }]`，含第 0 個月。

### 財務自由

- **門檻** = `每月支出 × 12 ÷ 提領率`。
- **達成時間** = `totalTwd ≥ 門檻` 的第一個月。
  - 第 0 個月就達成 → 「已達財務自由門檻」。
  - 期間內達成 → 「YYYY 年可財務自由（約 N 年後）」。
  - 期間內未達 → 「N 年內未達財務自由」。
- 門檻以基準假設計算；「如果…」線改了每月支出時，門檻也用調整後的支出另算一條。

## 假設值

| 假設 | 自動值 / 預設 | 驗證範圍 |
|---|---|---|
| 每月收入 | 收入設定的每月預設值（`defaultMonthlyIncomeTwd`） | ≥ 0 |
| 每月支出 | 過去 12 個**完整**月份（不含本月）的實際支出平均；不足 12 個月就用現有完整月份，標示「依 N 個月」 | ≥ 0 |
| 股票年報酬（名目） | 6% | −20% ~ 30% |
| 現金年利率（名目） | 1% | −20% ~ 30% |
| 通膨率 | 2% | 0% ~ 15% |
| 提領率 | 4% | 1% ~ 10% |
| 新存款投資比例 | 目前 `股票 ÷ (股票 + 現金)`；總資產為 0 時用 50% | 0% ~ 100% |

- 6% / 1% / 2% / 4% 只是第一次打開時的預設值，**全部都可以在 App 內修改**，code 裡沒有不能改的假設。
- 有自動值的假設（收入、支出、投資比例），設定值存 `null` 代表「用自動值」；收入設定或實際支出變了，沒覆寫的假設會跟著變。覆寫後仍顯示自動值當參考。
- 股票年報酬旁顯示「目前持股總報酬 %」當參考（只計入有設定 `totalCost` 的持股；有未設定成本的持股時標示「N 檔未設定成本」）。這是累計報酬，不是年化，文案要寫清楚。

### 儲存

`app_config` 新增一筆，key `forecast_settings`：

```js
{
  key: 'forecast_settings',
  value: {
    monthlyIncomeTwd: null,      // null = 自動
    monthlyExpenseTwd: null,     // null = 自動
    investRatio: null,           // null = 自動，0–1
    stockReturn: 0.06,
    cashReturn: 0.01,
    inflation: 0.02,
    withdrawalRate: 0.04,
    horizonYears: 30,
  },
}
```

讀取時缺少的欄位補預設值。寫入沿用既有 `INCOME_SETTINGS_KEY` 的模式（雲端優先、需登入）。`firestoreMappers.js` 的 `appConfigToRemote` 已支援任意 value，不需修改。

## 「如果…」線

四個旋鈕，以基準假設為起點調整：

| 旋鈕 | 調整方式 |
|---|---|
| 每月支出 | 以金額加減（例如 −5,000） |
| 每月收入 | 以金額加減 |
| 新存款投資比例 | 直接設定 0–100% |
| 股票年報酬 | 直接設定 % |

- 任一旋鈕偏離基準時，用同一個 `projectNetWorth` 再跑一次，畫第二條線。
- 顯示差異：「財務自由提早 / 延後 N 年 · N 年後多 / 少 NT$X」，以及「重設」。
- 旋鈕狀態只在 hook 內，不存檔；關掉 sheet 即重設。未登入也可以使用。

## 介面

改 UI 前依 `DESIGN.md` / `PRODUCT.md`：只用 token、小字灰用 `muted`、每頁一個 display 級大數字。

### 資產頁入口卡 `ForecastEntryCard`

- 位置：`AssetSummaryHero` 所在的 `asset-summary-panel` 下方、持股列表上方。
- 一列小卡，不放 display 數字（資產頁的 display 數字仍是淨資產）：
  - 標題「財務預估」
  - 結論句（見「財務自由」三種文案）
  - 副文字：「30 年後約 NT$X（今日幣值）」（年數跟著 `horizonYears`）
- 點整列打開 forecast sheet。
- 未登入、或股票與現金都為 0 且沒有收入 / 支出資料時不顯示。
- 每月收入或每月支出無法取得（沒設定收入 / 沒有完整月份的支出且未覆寫）時，結論句改為「設定每月收入與支出以開始預估」，點開直接進假設區塊。

### Forecast sheet `ForecastSheet`

沿用既有全螢幕 sheet 樣式（參考 `StockSheetShell`），手機與桌面都可用。由上到下：

1. **結論**：財務自由年份（sheet 內唯一的 display 數字）＋「N 年後總資產 NT$X」。報價過期時沿用 `priceDataStale`，顯示一行報價時間。
2. **曲線圖 `ForecastChart`**（Recharts）：
   - x 軸年份、y 軸總資產。
   - 基準線實線；「如果…」線虛線（有調旋鈕才出現）。
   - 財務自由門檻水平參考線，與曲線交會處標點（基準與「如果…」各一）。
   - 上方切換 10 / 20 / 30 / 40 年，切換會存回 `horizonYears`（未登入時只改畫面）。
   - 點選年份顯示當年股票 / 現金 / 總額。
3. **如果… `ForecastWhatIf`**：四個旋鈕 + 差異文字 + 重設。
4. **假設 `ForecastAssumptions`**：列表式（同設定頁手機列表），每列顯示目前值與來源，例如「每月支出　NT$62,000　過去 12 個月平均」。被覆寫的列標示「自訂」；點列打開編輯 sheet，有自動值的項目提供「改回自動」。未登入時唯讀。
5. 底部說明：「以今日幣值計算，假設收入與支出隨通膨成長；不構成投資建議。」

## 架構

| 檔案 | 職責 |
|---|---|
| `src/utils/forecast.js` | 純函式：`toRealMonthlyRate`、`resolveForecastAssumptions`（合併設定與自動值、標記來源 `auto` / `custom`）、`projectNetWorth`、`getFiThreshold`、`findFiMonth`、`applyWhatIf` |
| `src/services/portfolioService.js` | `getForecastSettings()`、`setForecastSettings(patch)`（含驗證）、`getForecastAutoValues()`（收入設定、`buildMonthlySummaries` 的過去完整月份支出、持股市值與現金合計、有成本持股的總報酬 %） |
| `src/hooks/useForecast.js` | 讀設定與自動值，算基準結果；持有旋鈕 state，算「如果…」結果與差異 |
| `src/components/forecast/` | `ForecastEntryCard`、`ForecastSheet`、`ForecastChart`、`ForecastWhatIf`、`ForecastAssumptions` |
| `src/App.jsx` | 只加入口卡與 sheet 的開關（一個 `useState`） |

資料流：開 App → 既有流程從 Firestore 載入 → `useForecast` 取自動值與設定 → `forecast.js` 計算。改假設 → `setForecastSettings` → 重算。旋鈕只改 hook state。

## 測試

Vitest，測試檔與被測檔同層。

- `src/utils/forecast.test.js`
  - 實質報酬換算（名目 = 通膨時實質為 0）。
  - 報酬皆為 0 時曲線為線性（每月 + 結餘）。
  - 結餘為負：先扣現金、現金用完再扣股票、兩者不小於 0。
  - 結餘依投資比例分配。
  - 財務自由：第 0 個月已達 / 期間內達成 / 未達。
  - `resolveForecastAssumptions`：`null` 用自動值、覆寫值優先、缺欄位補預設、來源標記正確。
  - `applyWhatIf`：金額加減不會讓收入 / 支出小於 0。
- `src/services/portfolioService.forecast.test.js`
  - 設定讀寫與驗證範圍。
  - 自動支出：不含本月、不足 12 個月時用現有月數並回傳月數、沒有完整月份時為 `null`。
  - 投資比例自動值（總資產為 0 時 50%）。
- 元件 smoke test
  - `ForecastEntryCard`：已達 / 期間內 / 未達 / 缺資料四種文案。
  - `ForecastWhatIf`：無調整時不顯示差異；調整後顯示提早 / 延後與金額差。

## 下一版候選

- 生涯模擬：退休年齡、退休後收入歸零並自資產提領、預期壽命（需先決定家庭共用帳號下「誰的年齡」）。
- 時間軸事件、保守 / 樂觀帶、具名情境。
