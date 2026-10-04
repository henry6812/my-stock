# 手機快速記帳（Quick Expense Sheet）設計

日期：2026-10-04
狀態：已實作（2026-10-04）

## 目標

手機版「新增單筆支出」改為記帳 App 風格的專用輸入畫面（自訂數字鍵盤 + 分類格 + 常用支出），讓「剛付完錢單手記一筆」從打開到存檔都不需要叫出系統鍵盤。

## 範圍

**包含**

- 手機 viewport（`isMobileViewport`）按 FAB 新增**單筆**支出時，開啟新的 `QuickExpenseSheet`。

**不包含（維持現有 `expenseFormNode` 表單）**

- 編輯既有支出。
- 新增定期支出（`expenseFormMode === "recurring-create"`）。
- 桌面版。
- `portfolioService` / schema / Firestore mapper 不做任何修改。

**明確不做（YAGNI）**：`×` / `÷` 運算、震動回饋、存檔後「復原」、可自訂的常用清單、桌面版快速畫面。

## 決策紀錄

| 問題 | 決定 |
|---|---|
| 新畫面涵蓋哪些情境 | 只負責手機「新增單筆」 |
| 名稱必填？ | 選填；未填時以**分類名稱**作為 name 存檔（前端補值，service 驗證不變） |
| 點常用項目 | 帶入名稱、分類、支出人、家庭/個人、預算；**金額清空**等使用者輸入 |
| 存檔後 | 關閉畫面 + toast「已記錄 {名稱} {formatTwd(金額)}」 |

## 畫面與互動

Bottom sheet（antd `Drawer`，`placement="bottom"`，`90vh`），由上而下：

```
┌─────────────────────────────┐
│ 取消        新增支出   完整表單 │
│ 🍜 餐飲                      │  目前分類
│                    $ 205    │  金額大字
│               120 + 85      │  有運算子時才顯示算式
│ [ 名稱（預設：餐飲）       ]   │
│ 常用 早餐·餐飲  加油·交通  …→  │  橫向捲動
│ [餐飲][交通][日用][娛樂][更多] │  快速分類格
│ [醫療][服飾][家用][訂閱]       │
│ (今天) 昨天  前天  📅          │
├─────────────────────────────┤
│  7   │  8   │  9   │  ⌫    │
│  4   │  5   │  6   │  +    │
│  1   │  2   │  3   │  −    │
│  C   │  0   │  00  │  存   │
└─────────────────────────────┘
```

### 鍵盤

- 只輸入整數（與現有 `InputNumber precision={0}` 一致）。
- 支援 `+` / `−` 連續運算；連按運算子時以後者取代前者；開頭不可為運算子。
- 每個運算元最多 9 位數；前導 0 不重複（`0` 後再按數字則取代）。
- `⌫` 刪最後一個字元；`C` 清空。
- 金額顯示為算式的即時結果；結果 ≤ 0 時以淡色顯示（`aria-invalid`）。算式含運算子時，下方小字顯示算式本身（該行高度永遠保留，避免版面跳動）。

### 常用列

- 資料來源：現有 `expenseNameSuggestions`（`buildExpenseNameSuggestions`，依頻率 → 最近使用排序），取前 8 筆。
- 每個 chip 顯示「名稱·分類名」。
- 點擊：設定名稱、分類、支出人、家庭/個人、預算為該建議的值（建議沒有有效的支出人 / 家庭個人時沿用預設值，與完整表單一致；舊資料的「共同」視為「共同帳戶」），**清空金額**，該 chip 呈選中狀態（記為「名稱來自常用」）。
- 歷史為空時隱藏整列。

### 分類格

- 資料來源：現有 `quickExpenseCategories`（`pickQuickCategories`：`isQuickPick` 標記者，無標記時取最常用 6 個）。
- 最後一格「更多」開啟完整分類清單（sheet 內的列表選擇），選取後該分類即為目前分類。
- 改選分類時，若目前名稱「來自常用」且使用者未手動修改，清空名稱並取消常用選中狀態。

### 名稱

- 點擊輸入框才叫出系統文字鍵盤；聚焦期間隱藏自訂鍵盤，失焦 / 按完成後恢復。
- 輸入時於輸入框下方以 chips 顯示 `filterNameSuggestions` 結果（不使用 antd 下拉，避免被鍵盤遮住）；點 chip 等同點常用項目。
- placeholder 為「名稱（預設：{分類名}）」；未選分類時為「名稱」。

### 日期

- Chips：今天（預設）/ 昨天 / 前天；📅 chip 上疊一個透明的原生 `<input type="date">`（手機直接開系統日期滾輪；`font-size: 16px` 避免 iOS focus 時放大），選後 📅 chip 顯示該日期並呈選中。

### 存鍵

- 可按條件：金額結果 > 0，且（已選分類 或 已填名稱）。
- 不可按時點擊：讓缺少的區塊（金額 / 分類格）短暫閃爍提示，不跳錯誤訊息。
- 存檔中：鍵盤與存鍵鎖定，防止重複送出。

### 其他

- 左上 Drawer 關閉鈕（X）、點遮罩或下滑：直接關閉，不保留草稿。
- 「完整表單」：關閉快速畫面，以目前草稿開啟現有表單（`openExpenseForm` + `setFieldsValue`），已填值不遺失。
- 支出人 / 家庭個人預設值：未選常用時，沿用現有 `readLastExpenseDefaults()` 的值。

## 元件與資料流

### 1. `src/utils/amountExpression.js`（純函式）

- `pressKey(expr, key)`：`key` ∈ `'0'-'9' | '00' | '+' | '-' | 'backspace' | 'clear'`，回傳新算式字串，套用上述鍵盤規則。
- `evaluateExpression(expr)`：解析 `+` / `-`，回傳整數；空字串回傳 `null`；結尾為運算子時忽略該運算子。不使用 `eval`。

### 2. `src/components/QuickExpenseSheet.jsx`

內部 state：`expr`、`categoryId`、`name`、`nameFromSuggestion`、`occurredAt`（dayjs）、`extras`（payer / expenseKind / budgetId）、`isNameFocused`。

Props：

| prop | 說明 |
|---|---|
| `open`, `onClose` | 開關 |
| `suggestions` | `expenseNameSuggestions` |
| `quickCategories`, `allCategories` | 分類格與「更多」清單 |
| `defaults` | `{ payer, expenseKind }`，來自 `readLastExpenseDefaults()` |
| `onSubmit(payload)` | 回傳 Promise；reject 時畫面保持開啟 |
| `onOpenFullForm(draft)` | 切換到完整表單 |
| `loading`, `disabled` | 存檔中 / 不可寫入 |

`onSubmit` payload：

```js
{
  name: name.trim() || categoryName,
  amountTwd: evaluateExpression(expr),
  occurredAt: occurredAt.format("YYYY-MM-DD"),
  entryType: "ONE_TIME",
  categoryId, payer, expenseKind, budgetId,
}
```

`open` 由 false → true 時重置所有 state（今天、無分類、空算式）。

樣式：寫在 `src/App.css` 獨立區段（沿用專案慣例與 teal-ink design tokens），注意 `env(safe-area-inset-bottom)`。

### 3. `App.jsx` 接線

- 新增 `isQuickExpenseOpen` state。
- FAB（`activeMainTab` 為支出時）：`isMobileViewport` → 開 `QuickExpenseSheet`；否則照舊 `openExpenseForm()`。其他呼叫 `openExpenseForm` 的入口（編輯、定期、空狀態按鈕）不變。
- 從 `handleSubmitExpense` 抽出共用 `saveNewExpense(payload)`：呼叫 `upsertExpenseEntry` → `writeLastExpenseDefaults` → 背景 `loadExpenseData().then(performCloudSync)`。`handleSubmitExpense`（非編輯時）與快速畫面共用。
- 快速畫面成功後：關閉、`message.success(\`已記錄 ${name} $${amount}\`)`；失敗：`message.error(toUserMessage(error, "儲存支出失敗"))`，畫面保持開啟。
- `onOpenFullForm(draft)`：關閉快速畫面 → `openExpenseForm()` → `expenseForm.setFieldsValue(draft)`（`occurredAt` 轉 dayjs，`amountTwd` 為算式結果）。

## 錯誤處理

- 未登入（`isWriteDisabled`）：FAB 本來即 disabled；`QuickExpenseSheet` 另以 `disabled` 鎖定存鍵作為保險。
- 存檔失敗：保留所有輸入，顯示錯誤訊息。
- 算式結果 ≤ 0：存鍵不可按。

## 測試

- `src/utils/amountExpression.test.js`（TDD 先寫）：按鍵序列、連續運算子取代、前導 0、`00`、位數上限、`backspace` / `clear`、結尾運算子、負數結果、空字串。
- `src/components/QuickExpenseSheet.test.jsx`：
  - 點常用 → 名稱與分類帶入、金額為空
  - 改選分類 → 來自常用的名稱被清空
  - 名稱留空存檔 → payload `name` 為分類名稱
  - 金額為 0 或未選分類且無名稱 → 存鍵 disabled
  - 輸入 `120+85` 存檔 → `amountTwd: 205`
  - `onSubmit` reject → 畫面仍開啟、輸入保留
- 手動驗證：瀏覽器手機尺寸（iPhone 寬度）實際操作，確認 safe-area、`90vh` 下鍵盤不被裁切、名稱輸入時系統鍵盤與自訂鍵盤切換正常。
