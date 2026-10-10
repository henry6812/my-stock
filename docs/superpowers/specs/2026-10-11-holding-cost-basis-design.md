# 持股成本與買進／賣出設計

日期：2026-10-11
狀態：設計已確認，待使用者審閱 spec

## 目標

讓每筆持股記錄成本，在個股細節頁看到平均成本與未實現損益；股數只能透過「買進」「賣出」變動，加碼時自動以加權平均更新成本。所有持股操作集中到個股細節頁，列表只負責看。

這是之後股利殖利率、績效比較、AI 分析等投資功能的地基。

## 範圍

**包含**

- holding 新增 `totalCost` 欄位（本地 + Firestore）。
- 個股細節頁改為**以單一持股（單一持有人）為單位**，顯示股數、平均成本、總成本、未實現損益。
- 細節頁的操作：買進、賣出、校正股數與成本、編輯分類與持有人、移除持股。
- 「新增持股」表單加「買進價格」；同代號同持有人已存在時自動當作買進，移除「覆蓋」模式。
- 移除列表上所有持股的編輯入口：手機左滑的編輯／移除、桌面表格的操作欄、行內改股數／分類／持有人。
- 修正：重新新增已被移除（軟刪除）的同一檔持股時，不再把舊股數加進來。

**不包含（YAGNI）**

- 交易紀錄、已實現損益、賣出價格（沒有交易紀錄就用不到，不收）。
- 手續費與交易稅。
- 股利（現金股利不調整成本；配股請用「校正」處理）。
- 列表上顯示成本或損益（列表維持顯示市值）。
- 美股損益換算新台幣（含匯差的損益需要買進時匯率，這版不記）。

## 資料模型

holding 新增一個欄位：

| 欄位 | 型別 | 說明 |
|---|---|---|
| `totalCost` | number \| null | 目前持有股數的總成本，**以該市場幣別計**（台股 TWD、美股 USD）。`null` = 未設定成本。存到小數 4 位。 |

- 平均成本不存，用時計算：`averageCost = totalCost / shares`。存總成本，平均成本才不會因每次四捨五入而漂移。
- 既有持股沒有這個欄位 → 視為 `null`，細節頁顯示「未設定成本」。不做資料遷移。
- `firestoreMappers.js`：`holdingToRemote` 加 `totalCost: holding.totalCost ?? null`；`remoteToHolding` 解析為有限且 ≥ 0 的數字，否則 `null`。
- `database.js` 的 `TABLE_STORAGE_KEYS` 不需要改（同一張表多一個欄位）。

## 成本規則

純函式放在 `src/utils/holdingShares.js`（取代 `resolveNextShares` / `HOLDING_SHARES_MODE`），全部寫單元測試。

| 操作 | 股數 | 總成本 |
|---|---|---|
| 新增持股（第一次） | = 輸入股數 | = 股數 × 買進價格 |
| 買進 | + 買進股數 | 原本有成本：+ 股數 × 買進價格；原本 `null`：維持 `null` |
| 賣出（部分） | − 賣出股數 | × 剩餘股數 ÷ 原股數（平均成本不變）；`null` 維持 `null` |
| 賣出（全部） | — | 等同移除持股（見下） |
| 校正 | = 輸入股數 | = 股數 × 輸入的平均成本；平均成本留空 → `null` |

例：100 股、總成本 50,000（均價 500）→ 買進 50 股 @ 560 → 150 股、總成本 78,000（均價 520）→ 賣出 30 股 → 120 股、總成本 62,400（均價 520）。

衍生值：

- `averageCost = totalCost / shares`（`totalCost` 為 `null` 或 `shares` ≤ 0 時為 `null`）。
- 未實現損益 `unrealized = shares × latestPrice − totalCost`，報酬率 `unrealized / totalCost`。缺價格或成本時為 `null`，`totalCost` 為 0 時不算報酬率（配股取得等情況）。
- 以該市場幣別計算與顯示。

驗證：

- 股數：台股正整數、美股最多 4 位小數，> 0。
- 價格／平均成本：≥ 0（允許 0，例如配股取得），最多 4 位小數。
- 賣出股數不可超過目前股數；等於目前股數即為「全部賣出」。

### 買進時原本未設定成本

原本 `totalCost` 為 `null` 時，買進只加股數、成本仍為 `null`（不知道原本那些股票的成本，混算出來的平均成本是錯的）。買進表單在這種情況顯示提示：「這檔還沒設定成本，買進後仍需校正成本才能看到損益」，並附「先校正成本」連結。

## 服務層（`portfolioService.js`）

沿用既有 pattern：`ensureCloudWritable()` → 驗證 → `mirrorToCloud(CLOUD_COLLECTION.HOLDINGS, …)`。

| 函式 | 說明 |
|---|---|
| `upsertHolding({ symbol, market, shares, price, assetTag, holder })` | 移除 `sharesMode`，新增必填 `price`。找到**未刪除**的同代號同持有人 → 執行買進規則（分類照輸入更新，同現況）；找到**已刪除**的 → 視為全新持股（股數、成本、`deletedAt` 重設）；都沒有 → 新建。 |
| `buyHolding({ id, shares, price })` | 新增。 |
| `sellHolding({ id, shares })` | 新增。賣出全部時呼叫 `removeHolding` 的邏輯並回傳 `{ removed: true }`。 |
| `calibrateHolding({ id, shares, averageCost })` | 新增。`averageCost` 為 `null` 時清除成本。 |
| `updateHoldingShares` | **移除**（唯一呼叫點是將被刪掉的行內編輯）。 |
| `updateHoldingTag` / `updateHoldingHolder` / `removeHolding` | 保留，改由細節頁呼叫。 |

## 介面

改 UI 前依 `DESIGN.md`：金額、字級、間距、顏色只用 token；手機表單一律在 bottom sheet、桌面為 modal；觸控目標 ≥ 44px；數字欄位加 `inputMode`。

### 列表（資產頁）

- 手機：持股列不再用左滑動作。沿用 `MobileSwipeRow`、傳空的 `actions`（`SwipeActions` 在沒有動作時不會滑動），點一下開細節頁（維持現有 `onTap` 與 aria label）。
- 桌面：拿掉「操作」欄；股數、分類、持有人欄位只顯示不可編輯；點列開細節頁（現有 `isInteractiveTarget` 行為不變）。
- `App.jsx` 移除 `editingHoldingId` / `editingShares` / `editingHoldingTag` / `editingHoldingHolder`、`handleEditClick` / `handleCancelEdit` / `handleSaveShares`，以及手機的 `holding-mobile-editor` 區塊與對應 CSS。

### 個股細節頁（`StockDetailSheet`）

**以單一持股為單位**：從哪一列點進來，就只顯示那位持有人的部位，操作也只作用在這筆持股。`buildStockDetailHolding` 不再加總同代號其他持有人的股數與市值。sheet 的 `key` 改為持股 `id`（估價設定仍以市場＋代號為單位，不受影響）。

由上而下：

1. **標題**：公司名稱 + 代號（現況）。
2. **價格列**：現價 + 今日漲跌（現況）。
3. **持股摘要**（新）：
   - 「{持有人} 持有 {股數} 股 · 市值 {市值 TWD}」
   - 有成本：「均價 {平均成本} · 成本 {總成本}」，下一行未實現損益「{±金額}（{±%}）」，顏色沿用 `stock-detail-change--up` / `--down`。
   - 沒成本：一行 `muted`「未設定成本」+ 連結「設定成本」（開校正表單）。
4. **主要操作**：「買進」「賣出」兩個並排按鈕（手機各 ≥ 44px 高）。登入前停用（`disabled`，同現況）。
5. 估價卡 / EPS / 本益比（現況）。
6. **管理**（sheet 最底，比照 `SavingsGoalDetailSheet` 的整列按鈕）：「編輯分類與持有人」「校正股數與成本」「移除持股」（`danger`，按下後 `confirmDestructive` 確認，文案沿用「會一併刪除該持股的所有快照資料。」）。

### 操作表單（新元件 `HoldingActionSheet`）

一個元件、四種模式，從細節頁開啟，疊在細節頁之上：手機 bottom sheet（`MobileFormSheetLayout`，比照其他表單）、桌面 modal。送出成功後關閉表單、重新載入資料、`message.success`；細節頁停留並顯示更新後的數字。

| 模式 | 欄位 | 預覽與說明 |
|---|---|---|
| 買進 | 股數、每股價格（幣別標在欄位後） | 預覽「買進後 {新股數} 股 · 均價 {新均價}」 |
| 賣出 | 股數（下方 `muted` 註明「目前 {股數} 股」，附「全部」快捷） | 預覽「賣出後 {剩餘} 股」；全部賣出時按鈕改為「賣出全部並移除」並再次確認，完成後關閉細節頁 |
| 校正 | 股數、平均成本（可留空 = 未設定） | 表單頂端說明：「用於修正錯誤、股票分割或配股，不算買賣。」 |
| 編輯 | 分類、持有人 | 持有人重複時沿用現有錯誤「同持有人的該股票已存在」 |

預覽在欄位都有效時即時顯示，計算用同一組 `holdingShares.js` 純函式。

改持有人會變更持股的 cloud key。實作時要確認本地 `id` 是否保留：保留則細節頁直接顯示新持有人；不保留則以 market + symbol + 新持有人重新定位該持股並更新 `stockDetailId`。

### 新增持股表單（`HoldingForm`）

- 股數下方新增「買進價格」（每股，必填，幣別依市場顯示 TWD / USD）。
- 偵測到同代號同持有人已存在時：拿掉「股數處理方式」單選，改為 info 提示「{持有人} 已持有 {N} 股，將以買進方式加碼」，描述行預覽「儲存後 {M} 股 · 均價 {X}」（原本未設定成本時只顯示股數，並註明成本仍需校正）。

## 錯誤處理

- 所有寫入失敗沿用 `toUserMessage(error, …)` + `message.error`，表單保持開啟、保留輸入。
- 服務層驗證錯誤用中文訊息（例如「賣出股數不可超過持有股數」「價格不可為負數」）。
- 細節頁開著時持股被其他裝置刪除（realtime listener）：找不到該持股即關閉細節頁（現況 `stockDetail` 為 null 時就是關閉）。

## 測試

續攻 `App.jsx` 前先補測試（`CLAUDE.md` 規定）。

- `holdingShares.test.js`：買進／賣出／校正／平均成本／未實現損益，含 `null` 成本、全部賣出、0 成本、浮點捨入（0.1 + 0.2）、美股小數股數。
- `firestoreMappers`：`totalCost` round-trip，缺欄位與非法值為 `null`。
- `portfolioService` 測試（比照現有 `portfolioService.*.test.js`）：`buyHolding`、`sellHolding`（部分、全部 → 移除）、`calibrateHolding`、`upsertHolding` 遇到既有／已刪除持股。
- `StockDetailSheet.test.jsx`：有成本、無成本兩種摘要；單一持有人不加總；按鈕在 `disabled` 時停用。
- `HoldingActionSheet.test.jsx`：四種模式的欄位、預覽、驗證、全部賣出確認。
- `HoldingForm.test.jsx`：價格欄位必填、既有持股提示改為買進文案、不再有覆蓋選項。
- `stockDetail.test.js`：`buildStockDetailHolding` 不再加總。
- 完成後在瀏覽器實際走過：新增、買進、賣出部分、全部賣出、校正、改持有人，手機與桌面寬度各一次。

## 文件

- `DESIGN.md`：持股列不再左滑；細節頁新增持股摘要、買進／賣出、管理區塊；`HoldingActionSheet` 規範。
- `CLAUDE.md` 不需要改（架構描述不受影響）。
