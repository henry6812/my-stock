# 儲蓄目標設計

日期：2026-10-10
狀態：設計已確認，待寫實作計畫

## 目標

讓家庭可以設定多個儲蓄目標（例如出國、買車、緊急預備金），進度由一或多個現金帳戶的**目前餘額**自動算出，在支出分析頁一眼看到每個目標的進度與狀態，點進去看細節並編輯。

視覺參考使用者提供的參考圖（Budget 頁的 Savings Target 卡）：左上圖示、標籤、大數字、「目標 $X」、右上狀態膠囊、右側容器狀進度圖。**只參考版型**，顏色、字級、圓角、間距一律用本專案 token（見 `DESIGN.md`）。

## 範圍

**包含**

- 新資料表 `savingsGoals`（本地 + Firestore 同步）。
- 支出分析頁新增「儲蓄目標」區塊：卡片列表、新增、已封存展開。
- 目標詳細頁（底部 sheet）、新增／編輯表單、封存／取消封存、刪除。
- 10 個目標專用圖示，與關鍵字自動對應。
- `CategoryIconPicker` 改為可接收圖示清單。
- `DESIGN.md` 新增元件規範。

**不包含（YAGNI）**

- 帳戶內按金額或比例分配給不同目標（同一帳戶整筆計入每個勾選它的目標，允許重複計算）。
- 依歷史餘額快照推估存錢速度。
- 拖曳排序（依 `sortOrder` 顯示，新目標排最後）。
- 存錢塔以外的動畫——目標卡的容器圖是靜態的。
- 美元帳戶／外幣目標（金額一律 TWD）。

## 目標類型

| `kind` | 說明 | 目標金額 | 期限 |
|---|---|---|---|
| `deadline` | 有期限 | 手動 `targetTwd` | `deadline` 必填 |
| `open` | 無期限 | 手動 `targetTwd` | 無 |
| `ongoing` | 常態維持（如緊急預備金），永遠不會「完成」 | 平均月支出 × `targetMonths` | 無 |

## 資料模型

新表 `savingsGoals`：`database.js` 的 `TABLE_STORAGE_KEYS` 加 `savingsGoals: 'my-stock:savings_goals'`（`PersistedInMemoryTable`，主鍵 `id`）；Firestore collection `users/{uid}/savings_goals`；`firestoreMappers.js` 加 `savingsGoalToRemote` / `remoteToSavingsGoal`，本地 row 與雲端 doc 共用相同 field shape。

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | string | 主鍵 |
| `name` | string | 名稱，必填，trim 後非空 |
| `icon` | string \| null | 目標圖示 key（見「圖示」）；null 時依名稱自動對應 |
| `kind` | `'deadline' \| 'open' \| 'ongoing'` | 類型 |
| `targetTwd` | number \| null | `deadline` / `open` 必填且 > 0；`ongoing` 為 null |
| `targetMonths` | number \| null | `ongoing` 必填，正整數（1–24）；其他為 null |
| `deadline` | `YYYY-MM-DD` \| null | `deadline` 必填且晚於 `startDate`；其他為 null |
| `startTwd` | number | 建立當下綁定帳戶的餘額加總 |
| `startDate` | `YYYY-MM-DD` | 建立日期 |
| `cashAccountIds` | string[] | 綁定的現金帳戶 id，可為空，可與其他目標重複 |
| `sortOrder` | number | 顯示順序，新目標 = 目前最大值 + 1 |
| `archivedAt` | ISO string \| null | 封存時間 |
| `createdAt` / `updatedAt` / `deletedAt` | ISO string | 同其他表；刪除為軟刪除 |

**`startTwd` / `startDate` 只在建立時寫入**。編輯時更改帳戶、金額或期限都不重設，避免進度「歸零」。若類型從其他類型改成 `deadline`，以改動當下的餘額加總與日期重設起點（原本沒有起點語意）。

## 計算規則

純函式，放在 `src/utils/savingsGoals.js`，`today` 由呼叫端傳入。

### 目前金額

`currentTwd` = `cashAccountIds` 中仍存在（未刪除）帳戶的 `balanceTwd` 加總。找不到或已刪除的帳戶略過，並回報 `missingAccountCount`。

### 平均月支出（`ongoing` 用）

- 來源：`expenseMonthlySummaries`（`buildMonthlySummaries` 的輸出）。
- 取**本月之前**最近 12 個完整月的 `expenseTwd` 平均；全部支出（定期＋單筆、家庭＋個人）。
- 完整月不足 12 個時，用現有的完整月；**0 個完整月** → 無法計算，`targetTwd = null`，狀態為 `insufficient-data`（「支出資料不足」），不顯示進度。
- 回傳 `averageMonthlyExpenseTwd` 與 `monthsUsed`，詳細頁顯示算式用。

### 狀態

| 類型 | 條件（依序判斷） | 狀態 | 膠囊文案 | 顏色 |
|---|---|---|---|---|
| `deadline` | `current ≥ target` | `achieved` | 已達成 | `teal` |
| | `today > deadline` | `overdue` | 已逾期 | `down` |
| | `current ≥ expected` | `on-track` | 進度正常 | `teal` |
| | 其他 | `behind` | 落後 | `warn` |
| `open` | `current ≥ target` | `achieved` | 已達成 | `teal` |
| | 其他 | `in-progress` | 進行中 | `teal` |
| `ongoing` | 無法計算目標 | `insufficient-data` | 支出資料不足 | `muted` |
| | `current ≥ target` | `sufficient` | 足夠 | `teal` |
| | 其他 | `below` | 低於目標 | `warn` |

- `expected` = `startTwd + (targetTwd − startTwd) × 已過天數 / 總天數`，天數以日期計（`startDate` → `deadline`），已過天數夾在 `[0, 總天數]`。
- `monthlyNeededTwd`（僅 `deadline`，且未達成、未逾期）= `(target − current) / 剩餘月數`，剩餘月數 = `max(1, ceil(剩餘天數 / 30))`。
- `shortfallTwd` = `max(0, target − current)`。
- `progressRatio` = `current / target`，夾在 `[0, 1]`（容器圖填充用）；無目標時為 0。
- 已達成的 `deadline` / `open` 目標維持「已達成」，直到使用者封存或刪除；之後餘額下降則依規則重新判斷。

## 圖示

獨立的 `src/components/goalIconComponents.js`（`GOAL_ICON_COMPONENTS`），不混入支出分類的 18 個圖示：

| key | 用途 | iconoir | 自動對應關鍵字 |
|---|---|---|---|
| `savings` | 一般存錢（預設） | `PiggyBank` | （fallback） |
| `emergency` | 緊急預備金 | `Umbrella` | 預備金、緊急 |
| `car` | 買車 | `Car` | 車 |
| `travel` | 出國旅遊 | `Airplane` | 旅、出國、機票 |
| `phone` | 換手機 | `SmartphoneDevice` | 手機 |
| `home` | 買房／頭期款 | `Home` | 房、頭期 |
| `wedding` | 結婚 | `Rings` | 婚 |
| `education` | 教育基金 | `GraduationCap` | 教育、學 |
| `computer` | 電腦／3C | `Laptop` | 電腦、筆電、3C |
| `medical` | 醫療 | `Healthcare` | 醫療、醫 |

`resolveGoalIcon(goal)`：有 `icon` 用 `icon`，否則依名稱關鍵字（依表格順序，第一個命中者勝），都沒命中用 `savings`。

`CategoryIconPicker` 新增可選 prop（圖示清單 / 元件對照），不傳時行為與現在完全相同。

## UI

### 位置

支出分析頁，**預算區塊之後、定期支出之前**。區塊標題「儲蓄目標」，右側「新增目標」（未登入時停用，同其他寫入按鈕）。間距照支出頁標準：區塊之間 `--space-section`、標題到內容 `--space-section-head`。

### 卡片（`SavingsGoalCard`）

全寬卡片，垂直堆疊。手機與桌機同一套。

- 左側：圖示 tile → 名稱（label，`muted`）→ 目前金額（title 級，非 display——支出頁的 display 大數字是摘要卡的總支出）→ 「目標 $X」（`muted`；`ongoing` 加「（N 個月）」）→ 一行補充：
  - `deadline`：「YYYY/MM 前・每月需再存 $X」；達成／逾期時只顯示期限
  - `open`：「還差 $X」／不顯示（已達成）
  - `ongoing`：「還差 $X」（低於目標時）
  - 沒綁帳戶：「尚未選擇帳戶」
- 右上：狀態膠囊（淡底 + 對應色文字）。
- 右側：**靜態**容器圖（圓角底的杯形），填充高度 = `progressRatio`，填充色依狀態色的淡色；`insufficient-data` 時只畫空容器。
- 整張可點 → 開詳細頁。

### 列表（`SavingsGoalList`）

- 未封存目標依 `sortOrder` 排列。
- 已封存目標收在區塊底部「已封存（N）」，預設收合，展開後同樣是卡片（降低對比，狀態膠囊不顯示）。
- 沒有任何未封存目標時顯示 `EmptyState`（「還沒有儲蓄目標」＋「新增目標」按鈕）。

### 詳細頁（`SavingsGoalDetailSheet`）

底部 sheet，沿用 `BudgetDetailSheet` 的模式。

1. 頂部：圖示、名稱、狀態膠囊、目前金額、「目標 $X」、較大的容器圖。右上「編輯」。
2. 說明列（依類型）：
   - `deadline`：到期日、剩餘天數、應有進度 $X、每月需再存 $X
   - `open`：還差 $X
   - `ongoing`：「平均月支出 $X × N 個月 = $Y」與「依近 M 個完整月計算」
3. 帳戶明細：每個綁定帳戶一列（銀行名、別名、holder、餘額）。若該帳戶也被其他**未封存**目標使用，列下 `muted` 小字「也計入：買車、出國」。已刪除的帳戶以一行「N 個帳戶已刪除」提示。
4. 底部操作：「封存」（已封存時為「取消封存」）、「刪除」（需確認）。

### 表單（`SavingsGoalForm`）

新增與編輯共用，沿用 `MobileFormSheetLayout`。

- 名稱（必填）
- 圖示（`CategoryIconPicker` + 目標圖示清單；未選時預覽自動對應的圖示）
- 類型：segmented「有期限／無期限／常態」
- 依類型：
  - 有期限：目標金額、到期日（須晚於今天）
  - 無期限：目標金額
  - 常態：N 個月（預設 6），下方即時顯示「≈ $Y（平均月支出 $X）」
- 帳戶：未刪除現金帳戶的勾選清單（銀行、別名、holder、餘額）

## 程式結構

| 檔案 | 變更 |
|---|---|
| `src/utils/savingsGoals.js` | 新增：`computeGoalProgress`、`averageMonthlyExpense`、`resolveGoalIcon`、`normalizeSavingsGoalInput` |
| `src/components/goalIconComponents.js` | 新增 |
| `src/components/SavingsGoalCard.jsx` | 新增 |
| `src/components/SavingsGoalList.jsx` | 新增 |
| `src/components/SavingsGoalDetailSheet.jsx` | 新增 |
| `src/components/SavingsGoalForm.jsx` | 新增 |
| `src/components/CategoryIconPicker.jsx` | 可接收圖示清單 |
| `src/db/database.js` | 新表 |
| `src/services/firebase/firestoreMappers.js` | 新 mapper |
| `src/services/portfolioConstants.js` | 新 collection 名稱 |
| `src/services/cloudSyncService.js` | 訂閱與套用新 collection |
| `src/services/portfolioService.js` | `createSavingsGoal`、`updateSavingsGoal`、`archiveSavingsGoal`、`unarchiveSavingsGoal`、`deleteSavingsGoal`；讀取時一併回傳目標 |
| `src/App.jsx` | 只加：目標資料、開啟中的詳細頁／表單 state，把現金帳戶與 `expenseMonthlySummaries` 傳給列表 |
| `DESIGN.md` | 新增「儲蓄目標卡」與目標圖示規範 |

寫入遵循現有 pattern：需登入，先寫 Firestore 再寫本地（`PRODUCT.md`：不做離線寫入）。

## 邊界情況

- 綁定帳戶被刪除：略過並提示，不自動修改目標的 `cashAccountIds`。
- 沒綁帳戶：目前金額 $0，卡片提示「尚未選擇帳戶」，狀態仍照規則計算。
- 帳戶重複計入多個目標：允許，詳細頁標示「也計入」。
- `ongoing` 沒有完整月支出資料：「支出資料不足」，不顯示進度。
- 到期日當天：仍算未逾期（`today > deadline` 才逾期）。
- 未登入：新增、編輯、封存、刪除停用。

## 測試

Vitest，測試檔與被測檔同層。

- `savingsGoals.test.js`：三種類型的每個狀態；`expected` 線性計算與夾值；`monthlyNeededTwd` 剩餘月數；平均月支出（12 個月、不足 12 個月、0 個月、排除本月）；帳戶重複與已刪除；`resolveGoalIcon` 關鍵字與 fallback；輸入 normalize 與驗證。
- `firestoreMappers` 的新 mapper round-trip。
- 元件 smoke test：`SavingsGoalCard`（各狀態文案與膠囊）、`SavingsGoalList`（排序、已封存展開、空狀態）、`SavingsGoalDetailSheet`（各類型說明列、「也計入」）、`SavingsGoalForm`（依類型切換欄位、驗證）、`CategoryIconPicker`（不傳清單時行為不變）。
