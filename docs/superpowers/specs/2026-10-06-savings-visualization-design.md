# 資產水位瓶 + 支出減法磚塔 設計

日期：2026-10-06
狀態：設計已確認，待寫實作計畫

## 目標

把資產頁與支出頁的兩條水平進度條換成「有意象、有動畫」的視覺化，讓使用者看到資產累積與每月存下的錢時更有成就感：

- **資產頁**：總資產是瓶子裡的水，水位隨淨值升降。
- **支出頁**：本月收入是一座金色磚塔，支出從塔頂敲掉磚塊，剩下的金色磚就是存下的錢。

## 範圍

**包含**

- 資產頁：`NetWorthJar` 取代 `App.jsx` 的 `networth-progress-wrap` 區塊。
- 支出頁：`SavingsTower` 取代 `expense-income-progress` 區塊（「花費 / 收入」條），**月份**與**累計**兩種模式都使用。
- 兩張摘要卡從置中單欄改為「左：文字與數字，右：視覺化（約 120×170）」。

**不包含**

- `portfolioService` / schema / Firestore mapper 不做任何修改。
- 新套件：不引入。

**明確不做（YAGNI，列為未來方向）**

- 累計模式改成「每月結餘逐塊疊上去」的成長塔（brainstorm demo B 的原始形式）。
- 跨月時自動播放的「上月結算」儀式動畫。

## 決策紀錄

| 問題 | 決定 |
|---|---|
| 成就感來源 | 「存下來的錢」與「逐步累積」 |
| 資產頁意象 | 水位瓶（demo A） |
| 支出頁意象 | 減法磚塔：收入 = 整座塔，支出扣磚，剩下 = 存下 |
| 存下的錢顏色 | 金色 |
| 負值 / 超支 | 誠實呈現（下跌紅斜紋、超支紅坑） |
| 累計模式 | 本次沿用減法塔，資料換成累計值；之後再換成逐月疊磚 |
| 動畫播放時機 | 比照現有進度條的觸發邏輯（見「動畫時機」） |

## 視覺與互動

Mockup 參考：`.superpowers/brainstorm/*/content/in-app-v4.html`（已 gitignore，本機保留）。

### 資產頁：水位瓶 `NetWorthJar`

```
┌──────────────────────────────────────┐
│ 總資產                     1,000 萬   │
│ NT$ 6,384,200            ╭──────╮    │
│ 當日 ▲ +83,200 (1.32%)   │      │ ─  │
│                     昨日 ┄┄┄┄┄┄┄┄ 638萬│
│ 報價更新於 …             │≈≈≈≈≈≈│ ─  │
│ 距離 1,000 萬還差 362 萬  │██████│    │
│                          ╰──────╯    │
│          [趨勢]  [分配]               │
└──────────────────────────────────────┘
```

- **瓶子容量** = 下一個千萬（`PROGRESS_UNIT_TWD = 10,000,000`），**瓶底** = 容量 − 1,000 萬；瓶身右側每 200 萬一條刻度；瓶口上方標容量（例如「1000 萬」），瓶底 > 0 時下方標「從 1000 萬起」。
- **水**：青綠漸層（`--c-teal-bright` → `--c-teal`），前後兩層正弦波紋持續緩慢流動；進場時波紋較大，靜止後收小。
- **昨日線**：瓶壁上一條虛線，左側標「昨日」，tooltip 顯示「昨日23:59：NT$ …」（沿用現有文案）。
- **今日漲跌帶**（昨日線與目前水位之間）：
  - 上漲：綠色斜紋（`--c-up` + 白斜線，和現有 `networth-delta-segment--up` 一致）。
  - 下跌：紅色淡斜紋（和現有 `--down` 一致）。
- **目前水位標籤**：瓶子右側顯示「638 萬」（沿用 `currentMarkerWanLabel` 的萬元取整）。
- **文字區**新增一行「距離 {容量} 還差 {N} 萬」，取代原本的刻度列。
- **跨千萬**（昨日 < 瓶底 ≤ 今日）：使用新的瓶子，昨日線隱藏（不在瓶內），漲跌帶從瓶底畫起；水面冒出白色氣泡、瓶身向外擴一圈淡出的光暈。

### 支出頁：減法磚塔 `SavingsTower`

```
┌──────────────────────────────────────┐
│ [月份|累計]               收入 8.5 萬 │
│ 2026/10 總支出            ┆  ┆  ┆     │ ← 已扣掉的位置留虛線框
│ NT$ 53,500                ┆  ┆  ┆     │
│ 存下 NT$ 31,500（37.1%）  存下 3.2 萬  │
│ ■定期 ■單筆 ■存下          ▓▓▓▓▓▓     │ ← 金色磚
│ 花費 … / 收入 …            ▓▓▓▓▓▓     │
│                         ───────────  │
└──────────────────────────────────────┘
```

- **塔** = 收入，固定 10 層，每層 = 收入 ÷ 10；磚牆交錯排列（奇數層 2 塊、偶數層 3 塊，半塊錯位）。
- **存下的錢 = 金色磚**（漸層約 `#f2cf6b` → `#d9a93a`，實作時再微調，與青綠系搭配）。
- **扣磚順序**：由塔頂往下，先扣**定期支出**（`--c-teal`），再扣**單筆支出**（`#86c4b9`，與現有 segment 配色一致）；不滿一層時從該層頂部削去對應比例。
- 被扣掉的位置留淡灰虛線磚框，讓原本的收入高度保持可見。
- 塔頂標「收入 x.x 萬」；剩餘磚頂端標「存下 x.x 萬」；文字區顯示「存下 NT$ …（xx.x%）」。
- 圖例：定期、單筆、存下。底部保留「花費 … / 收入 …」一行（沿用 `expenseIncomeProgressMetaRightText`）。
- **超支**：塔全部扣光後，地面線下方長出紅色虛線坑（深度依超支額，有上限），標「−x.x 萬」；文字區顯示紅字「超支 NT$ …」。

### 邊界情況

| 情況 | 呈現 |
|---|---|
| 尚未設定收入（`hasIncome === false`） | 空的虛線塔框 +「設定收入」連結（呼叫現有 `goToIncomeSettings`）；文字區仍顯示總支出 |
| 收入 > 0、支出 = 0 | 整座金色塔，「存下 100%」 |
| 支出 = 收入 | 塔恰好扣光、無坑，「存下 NT$ 0（0.0%）」 |
| 超支 | 見上 |
| 總資產 = 0 或載入中 | 空瓶，不播動畫 |
| 跨千萬 | 見上 |

### 動畫時機

| 觸發 | 行為 |
|---|---|
| 首次載入資料 / 切換到該 tab（現有 `didRun…InitialAnimationRef`、`expenseShouldAnimateRef` 判斷為需要播放時） | 完整進場：水位約 2 秒（先漲到昨日線，再走今日漲跌）；磚塔約 3 秒（先疊出整座金塔，再逐層扣磚，越扣越快） |
| 新增 / 刪除 / 修改支出 | 只播增量：用 `diffTowerChunks` 只讓新增的區塊掉落（或刪除時補回金磚），不重建整座塔 |
| 價格刷新導致總資產變動 | 水位平滑移動到新位置，不重播進場 |
| `prefers-reduced-motion: reduce` | 不播任何動畫（含波紋），直接渲染最終狀態 |
| 分頁隱藏（`document.hidden`） | 暫停波紋的 rAF loop |

左側主數字的 count-up 維持現狀，不由新元件負責。

## 架構

### 新檔案

| 檔案 | 職責 |
|---|---|
| `src/utils/netWorthJar.js` | 純函式 `getJarGeometry({ totalTwd, baselineTwd })` → `{ capTwd, floorTwd, levelRatio, baselineRatio \| null, crossedMilestone, direction: 'up' \| 'down' \| 'flat', ticks: number[], gapToCapTwd, currentWan }`。邏輯延續現有 `getProgressDisplayTargets`（萬元取整、千萬單位）。 |
| `src/utils/savingsTower.js` | 純函式 `getTowerLayout({ incomeTwd, recurringTwd, oneTimeTwd, rows = 10 })` → `{ hasIncome, rows, chunks: [{ rowIndex, take, kind: 'recurring' \| 'oneTime' }], savedTwd, savedRatio, overspendTwd, overspendDepthRatio }`；`diffTowerChunks(prevLayout, nextLayout)` → `{ added: chunk[], restored: chunk[] }`。 |
| `src/utils/motion.js` | 從 `App.jsx:245` 抽出 `prefersReducedMotion()`，App 與兩個新元件共用。 |
| `src/components/NetWorthJar.jsx` | SVG 水位瓶。Props：`totalTwd`、`baselineTwd`、`playKey`。 |
| `src/components/SavingsTower.jsx` | SVG 磚塔。Props：`incomeTwd`、`recurringTwd`、`oneTimeTwd`、`hasIncome`、`playKey`、`onSetupIncome`。 |

每個元件只負責「把 geometry 畫出來並做動畫」，所有數學都在 util 中、可單獨測試。

### 元件內部

- `playKey` 改變 → 播完整進場；其他 props 改變 → 播增量或平滑移動（不重播）。
- 補間（水位高度、金額）用 `animejs`（專案已有，`App.jsx:85`）；連續物理效果（波紋、碎片掉落拋物線、氣泡）用 `requestAnimationFrame`。
- unmount 或 `playKey` 再次改變時，取消進行中的動畫與 rAF。
- SVG 用固定 `viewBox="0 0 120 170"`，容器寬度依 CSS 縮放。

### 資料來源（不改 service）

| 元件 prop | 來源（`App.jsx` 既有 state） |
|---|---|
| `totalTwd` / `baselineTwd` | `totalTwd` / `baselineTotalTwd` |
| `incomeTwd` | `activeIncomeProgress.denominator` |
| `recurringTwd` | `activeIncomeProgress.recurringNumerator` |
| `oneTimeTwd` | `activeIncomeProgress.oneTimeNumerator` |
| `hasIncome` | `activeIncomeProgress.hasIncome` |

`activeIncomeProgress` 已依 `expenseTotalMode`（月份 / 累計）切換，元件不需要知道目前模式。

### `App.jsx` 的改動

1. 兩段舊進度條 JSX 換成新元件；摘要卡改為左右排版（`App.css`，手機斷點同步調整，主數字縮小到不換行）。
2. 「何時播放」的判斷保留在 App，沿用現有 refs，改為遞增 `assetPlayKey` / `expensePlayKey`。
3. 刪除只為舊進度條存在的程式碼：`progressDisplayRatio`、`baselineDisplayRatio`、`deltaDisplayLeftRatio`、`deltaDisplayWidthRatio`、`animateProgress` / `stopProgressAnimation`、marker 相關、支出 segment 百分比與其動畫 effect、對應 CSS（`.networth-progress-*`、`.networth-marker*`、`.expense-income-segment*`、`.expense-rate-marker*`）。**每一項刪除前先 grep 確認沒有其他使用者。**
4. `portfolioView.js` 的 `getProgressDisplayTargets` / `buildProgressStops` 若已無人使用則移除（含測試）。

## 測試

- **TDD**：`src/utils/netWorthJar.test.js`
  - 一般上漲 / 下跌 / 持平。
  - 跨千萬（`crossedMilestone`、`baselineRatio === null`）。
  - 總資產 0、剛好等於千萬整數。
  - 刻度每 200 萬一條、`gapToCapTwd` 正確。
- **TDD**：`src/utils/savingsTower.test.js`
  - 沒有收入、沒有支出、支出 = 收入。
  - 跨層的部分扣除（`take < 1`）、定期與單筆在同一層交界。
  - 超支（`overspendTwd`、深度上限）。
  - `diffTowerChunks`：新增一筆、刪除一筆、無變化。
- **元件 smoke test**（`NetWorthJar.test.jsx`、`SavingsTower.test.jsx`，mock reduced-motion 直接渲染最終狀態）：
  - 塔：「存下 x.x 萬」標籤、超支「−x.x 萬」、無收入時的「設定收入」連結會呼叫 `onSetupIncome`。
  - 瓶：「昨日」線存在 / 跨千萬時不存在、目前水位萬元標籤。
- 既有測試：更新 `portfolioView.test.js`、`portfolioService.dashboard.test.js` 若受影響。
- **瀏覽器驗證**：`npm run dev`，用手機寬度實際操作兩頁（新增支出觀察增量、切換月份 / 累計、重新整理觀察進場）；`npm run build`、`npm run lint`、`npm test` 全部通過。
