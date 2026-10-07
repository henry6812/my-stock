# 支出摘要卡（參考圖風格 + 月份長條 + 累計疊塔）設計

日期：2026-10-07
狀態：設計已確認，待寫實作計畫
前一版：`2026-10-06-savings-visualization-design.md`（本文件取代其中「支出頁」部分，資產頁水位瓶不動）

## 目標

支出頁上半部目前塞了 8–9 項資訊（大數字、存下、圖例、待扣說明、兩行百分比、花費/收入、累計起始日、塔內標籤），同一個數字出現兩三次，手機上像一片灰字。改成一張**簡潔、置中、單一主色**的卡片：預設只看結論，細節靠點擊塔取得；月份切換改成可點的月份長條；累計模式改成「每月結餘往上疊」的成長塔。

視覺語彙取自使用者提供的參考圖（Kamino Lending Yield 卡）：虛線大圓角卡、置中直排、次要數字淡灰、淡底細框膠囊、淡色歷史長條 + 一根飽和的「當下」長條。

## 範圍

**包含**

- `App.jsx` 支出頁 hero 區塊（目前 `expense-summary-panel`）整塊換成新卡片，**手機與桌機同一套**（桌機置中、限制最大寬度）。
- 新元件：月份長條、累計成長塔、卡片外殼（見「元件」）。
- `SavingsTower`（月份模式的減法塔）改配色與磚形，**動畫行為不變**（落下堆疊 → 敲碎掉落）。
- `portfolioService` 的 expense view 新增每月收支清單 `monthlySummaries`。
- 修正：累計模式的收入分母目前用「今年 12 個月」的收入（含尚未發生的月份），導致存下比例被高估；成長塔改用逐月結餘後此問題消失。

**不包含**

- 下方「支出圖表」「預算」「支出清單」等區塊不動。
- 資產頁 `NetWorthJar` 不動。
- schema / Firestore mapper 不動（`monthlySummaries` 是 view 層計算值，不落地）。
- 不引入新套件。

**明確不做（YAGNI）**

- 跨月自動播放的「上月結算」儀式動畫（仍列為未來方向）。
- 長條上的任何文字（月份、金額、趨勢箭頭）。
- 點擊明細面板 / bottom sheet。

## 決策紀錄

| 問題 | 決定 |
|---|---|
| 版面方向 | 「塔是主角」：置中直排，資訊靠點塔取得 |
| 月份切換 | 卡片底部月份長條，點長條換月；上方不放任何控制項 |
| 累計切換 | 長條右側保留「累計」膠囊（唯一保留的文字，因為它是控制項） |
| 主色 | Teal 單色（沿用 App `--c-teal`），**全部純色、無漸層** |
| 「存下」顏色 | 由金色改為 teal（取代前一版「存下＝金色」的決定） |
| 月份模式的塔 | 沿用減法塔（收入＝整座塔，支出從塔頂敲掉），保留敲碎掉落 |
| 累計模式的塔 | 成長塔：每月結餘一層往上疊，超支月份從塔頂敲碎 |
| 長條下的文字 | 全部拿掉，只留長條 |
| 桌機 | 與手機同一套卡片 |
| 待扣固定支出 | 不顯示（2026-10-07 修訂）：塔只畫已發生的支出；原本的斜紋磚與「待扣」段已移除 |

## 卡片版面（兩種模式共用）

由上而下置中：

1. **小標**（14px，`--c-subtle` 灰）
2. **大數字**（約 38px / 700，tabular-nums），前綴 `$` 用淡灰
3. **膠囊**（淡 teal 底 + 細框，14px / 600）
4. **塔**（約 120 × 156）
5. **月份長條列**：長條 + 右側「累計」膠囊

外框：1.5px 虛線、圓角約 24px、透明底（落在頁面 `--c-paper` 上）。

### 月份模式

| 位置 | 內容 |
|---|---|
| 小標 | `2026 年 10 月` |
| 大數字 | 當月總支出（已扣款，不含待扣） |
| 膠囊 | `存下 73.7%`；超支時紅色 `超支 $X`；未設定收入時 `設定收入`（點擊 → `goToIncomeSettings`） |
| 塔 | `SavingsTower`（減法塔），新配色 |

### 累計模式

| 位置 | 內容 |
|---|---|
| 小標 | `累計存下・2026/01 起`（起始月 = 第一筆支出所在月） |
| 大數字 | 累計存下 = Σ 各月結餘（含本月進行中）；為負時顯示 `−$X` |
| 膠囊 | `期間支出 $X`（點擊不做事） |
| 塔 | `SavingsGrowthTower`（成長塔） |

## 互動

| 動作 | 月份模式 | 累計模式 |
|---|---|---|
| 點塔的一段 / 一層 | 數字 + 膠囊換成該段（定期 / 單筆 / 待扣 / 存下）的金額與佔收入 %；其他段淡出 | 數字 + 膠囊換成該月結餘與「存下該月收入 X%」（超支為紅色）；對應長條同步高亮 |
| 再點同一段 / 點塔外空白 | 回到總覽 | 回到總覽 |
| 點長條 | 換到該月 | **切回月份模式並換到該月** |
| 點「累計」膠囊 | 進入累計模式 | 回到月份模式（停在原本選的月份） |

- 換月 / 切模式時，數字與膠囊以 150ms 淡出淡入更新；塔照現有 `playKey` 機制重播入場動畫。
- 膠囊在「設定收入」狀態下才可點；其他狀態純顯示。
- 塔的選取狀態在換月 / 切模式時重置。

## 月份長條（`ExpenseMonthBars`）

- 資料：`monthlySummaries` 的**全部月份**，由舊到新左 → 右；之後再接 `monthOptions` 中晚於本月的月份（排定的未來支出），畫成虛線空長條、可點。超過 12 根時長條改固定寬度、軌道可橫向捲動，並自動捲到選中（或本月）的長條——確保每個月份都點得到（原本的 ‹ › 箭頭已移除）。
- 高度：依該月支出線性映射到 12–64px（最小值保證可點）。
- 顏色：月份模式選中 = `--c-teal` 實色，其餘 = 淡 teal（約 `#e1efec`）；累計模式全部中淡 teal（約 `#c4e0da`），被點選的那一層對應長條 = 實色。
- 圓角 5px、間距 5px、無任何文字。每根是 `button`，`aria-label="2026 年 10 月，支出 $47,363"`，選中者 `aria-pressed="true"`。
- 「累計」膠囊：`button`，`aria-pressed` 反映模式；選中為 teal 實底白字，未選為灰框灰字。

## 減法塔（`SavingsTower`，月份模式）配色

行為（落下堆疊 → 停頓 → 從頂敲碎掉落、資料變更時只動差額、reduced-motion 直接顯示終態）**全部不變**，只改外觀：

| 部位 | 舊 | 新 |
|---|---|---|
| 存下（剩下的磚） | 金色漸層 | `--c-teal` 實色 |
| 定期支出殘影 | teal 淡 | 中淡 teal（約 `#9fcfc6`）實色、低不透明 |
| 單筆支出殘影 | 淺 teal | 淡 teal（約 `#cfe6e1`） |
| 碎片 | 依種類著色 | 同上新色 |
| 超支紅坑 | 紅色漸層 / 斜紋 | `--c-down` 系實色（無漸層） |
| 磚形 | 直角 | 圓角約 3px |
| 塔內標籤 | 「存下 13.3 萬」等 | 移除；只保留塔頂淡灰「收入 18.0 萬」 |

`SavingsTower` 新增 props：`selectedKind` / `onSelectKind`（點段選取）。

## 成長塔（`SavingsGrowthTower`，累計模式）

- 每個月一層（一排磚，偶數月兩塊半磚、奇數月 ¼ / ½ / ¼ 錯縫），層厚 ∝ 該月結餘。
- 縮放：取「依序累加過程中曾到過的最高點」為塔高上限，確保被敲掉後再疊回的過程不會超出。
- **正結餘月**：該層從上方落下（約 500ms，輕微回彈），各月間隔約 260ms，由最早月份開始。
- **負結餘月**：從目前塔頂敲掉同等厚度，被敲的磚碎成碎片旋轉掉落並淡出；原位置留下淡色虛線殘影（之後的月份若疊回，殘影會被覆蓋）。若塔已見底，敲到地面為止，不挖坑。
- **本月（進行中）**：淡 teal + 虛線框，表示未結算。
- 相鄰兩層用 `--c-teal` 與略淺的 teal 交替，方便分辨月份。
- 點任一層 → 選取該月（見互動表）；其他層淡出至約 30%。
- 動畫總長隨月份數增加；超過 12 個月時每月間隔縮短，使總長不超過約 3 秒。
- reduced-motion：直接畫終態。
- 沒有任何月份有收入設定時：塔區顯示與月份模式相同的「設定收入」引導。
- 收入未設定的單一月份：該月結餘以收入 0 計（即整月支出為負值，會敲磚）——誠實呈現。

## 資料：`monthlySummaries`

在 `portfolioService` 組 expense view 的同一處（已有 `allHistoryOccurrences`、`resolveIncomeForMonth`、`incomeSettings`）新增：

```js
monthlySummaries: [
  { month: "2026-01", expenseTwd, incomeTwd /* null 表示未設定 */, isCurrent: false },
  ...
  { month: "2026-10", expenseTwd, incomeTwd, isCurrent: true },
]
```

- 月份範圍：第一筆支出所在月 → 本月（含無支出的空月）。
- `expenseTwd`：該月已發生的支出（與月份模式「總支出」同口徑：不含本月尚未扣款的定期支出）。
- `incomeTwd`：`resolveIncomeForMonth`（月覆寫優先，否則預設月收入），未設定為 `null`。
- 純計算放 `src/utils/monthlySummaries.js`（可單測），service 只負責餵資料。
- 成長塔的版面計算放 `src/utils/savingsGrowthTower.js`（層位置、敲除、峰值縮放），比照現有 `savingsTower.js` 的分工。

## 元件與檔案

| 檔案 | 動作 |
|---|---|
| `src/components/ExpenseSummaryCard.jsx` | 新增：卡片外殼、模式 / 選月 / 選段狀態、文字切換 |
| `src/components/ExpenseMonthBars.jsx` | 新增：月份長條 + 累計膠囊 |
| `src/components/SavingsGrowthTower.jsx` | 新增：累計成長塔 |
| `src/utils/savingsGrowthTower.js` | 新增：成長塔版面計算 |
| `src/utils/monthlySummaries.js` | 新增：每月收支彙整 |
| `src/components/SavingsTower.jsx` | 改配色、磚形、待扣斜紋、點段選取；移除塔內標籤 |
| `src/utils/savingsTower.js` | 加入待扣段的版面計算 |
| `src/services/portfolioService.js` | expense view 加 `monthlySummaries` |
| `src/App.jsx` | hero 區塊換成 `<ExpenseSummaryCard>`；移除不再使用的 memo（`expenseIncomeProgressMeta*Text`、`expenseSavedText` 等）與累計走勢按鈕 |
| `src/App.css` | 新卡片樣式；移除 `expense-tower-legend`、`expense-income-progress-*`、`expense-upcoming-note` 等不再使用的規則 |

`ExpenseSummaryCard` 由 `App.jsx` 傳入：`mode`、`activeMonth`、`monthlySummaries`、當月 / 累計的收支與 breakdown、`upcomingTwd`、`playKey`、`onChangeMonth`、`onChangeMode`、`onSetupIncome`。`App.jsx` 既有的 `expenseTotalMode` / `activeExpenseMonth` / `expensePlayKey` state 沿用，不新增 context。

## 錯誤與邊界情況

| 情況 | 呈現 |
|---|---|
| 尚無任何支出 | 大數字 `$0`；長條只有本月一根；累計模式塔為空、膠囊 `期間支出 $0` |
| 未設定收入（月份模式） | 塔顯示「設定收入」引導；膠囊 `設定收入`（可點） |
| 超支（月份模式） | 膠囊紅色 `超支 $X`；塔照現有紅坑邏輯 |
| 累計存下為負 | 大數字 `−$X`；成長塔敲到地面為止 |
| 月份 > 12 | 長條可橫向捲動，所有月份都點得到；成長塔包含全部月份 |
| 資料延遲載入 | 沿用 `SavingsTower` 現有「收入晚到時重播入場」行為；成長塔比照 |

## 測試

- `monthlySummaries.test.js`：月份範圍含空月、本月不計待扣、收入覆寫 / 預設 / 未設定。
- `savingsGrowthTower.test.js`：正結餘疊層、負結餘敲除（跨層、敲到見底）、峰值縮放、本月標記。
- `savingsTower.test.js`：待扣段的位置與高度。
- `ExpenseMonthBars.test.jsx`：12 個月截斷、選中 `aria-pressed`、點長條 / 累計膠囊的 callback。
- `ExpenseSummaryCard.test.jsx`：月份 / 累計兩種文字；點塔選段後文字切換與還原；累計模式點長條會切回月份模式並選月；未設定收入時膠囊可點。
- `SavingsTower.test.jsx`、`SavingsGrowthTower.test.jsx`：smoke + reduced-motion 終態 + 點段 callback。
- 手動：`npm run build` 後在瀏覽器以手機寬度與桌機寬度檢查兩種模式、動畫、超支與無收入狀態（依 memory「build 成功 ≠ runtime 正常」）。

## 後續

- 更新 memory `savings-growth-tower-next`：成長塔已納入本設計；「存下＝金色」改為 teal 單色。
- 實作完成後更新 `CLAUDE.md` 中 UI 元件清單（`src/components/` 已不只四個元件）。
