# 觀察清單與「研究」tab 設計

日期：2026-10-13
狀態：設計已確認，待寫實作計畫

## 目標

把台股、美股加入一個**觀察清單**，點開後看到跟持股細節頁一樣的研究內容（EPS 預估、本益比、河流圖、估價假設），但沒有任何 holding 相關內容（部位、買賣、編輯／校正／移除持股）。

觀察清單放在新的主 tab「研究」。這個 tab 的長期定位是「投資研究」：未來可能放 FRED 總經指標做整體市場判斷、重大日程提示等，以 section 往下疊；這次只做觀察清單一個 section。

## 範圍

**包含**

- 新主 tab「研究」與研究頁版面（只有觀察清單 section）。
- 新資料表 `watchlist`（本地 + Firestore 同步）與 service API。
- 觀察清單的報價：研究 tab 自動刷新（有節流）＋ 併入資產頁「更新價格」。
- `StockDetailSheet` 拆出共用的 `StockResearchContent` 與 `StockSheetShell`，新增 `WatchlistDetailSheet`。
- `PRODUCT.md`、`DESIGN.md` 對應更新。

**明確不做（YAGNI）**

- 觀察 sheet 內的「買進 → 加入持股」動作（要買就去資產頁新增持股）。
- 拖曳排序、手動目標價、清單上顯示「距離估價 %」（之後可在不改資料模型的前提下加）。
- 持股與觀察清單互相連動（自動標示持有中、賣光轉入觀察等）。
- FRED、重大日程等其他研究 section。
- Firestore rule 變更（現有 `users/{userId}/{document=**}` 已涵蓋）。
- 新套件。

## 已確認的產品決策

| 問題 | 決策 |
|---|---|
| 清單角色 | 研究入口：每列只顯示名稱、代號、現價、漲跌；內容都在點開的 sheet |
| 現價更新 | 打開研究 tab 時自動刷新（10 分鐘節流）＋ 手動刷新按鈕 ＋ 併入資產頁「更新價格」 |
| 與持股重疊 | 完全獨立：已持有的也能加入；從觀察清單點開一律是無 holding 版本 |
| 新增流程 | 選市場 + 輸入代號，送出時打一次報價驗證並取得名稱 |
| 刪除 | mobile 左滑刪除；desktop 列尾刪除按鈕；sheet 內「從觀察清單移除」 |
| 排序 | 依市場分組（台股、美股），組內依加入時間，不做拖曳 |
| sheet 實作 | 方案 2：抽出共用內容，持股與觀察各自一個 sheet |
| tab 圖示 | iconoir `GraphUp` |

## 1. Tab 與頁面

**主 tab**

- `src/utils/viewTransition.js` 的 `MAIN_TAB_ORDER` 改為 `["asset", "expense", "research", "settings"]`，推頁方向自動正確。
- mobile tab bar（`App.jsx` 的 `mobile-main-tabbar`）加一項：圖示 `GraphUp`、文字「研究」，排在「支出」與「設定」之間。
- desktop header `Segmented` 加一項：label「投資研究」、圖示 `GraphUp`。
- tab bar 由 3 項變 4 項，需在手機寬度實測膠囊不與右下 FAB 重疊。

**研究頁版面**

- 無 hero、無 display 級數字：研究頁不表現存錢，依 The One Living Thing Rule 照「帳本」做，直接從 section 開始。
- 「觀察清單」section：`SectionTitle` + 右側刷新按鈕與「更新於 …」時間戳（muted）。下方依市場分組的列表，間距照支出頁樣板（`--space-section`、`--space-section-head`、`--space-row-x` / `--space-row-y`）。
- 每列：左側名稱 + 代號（muted 小字）；右側現價 + 漲跌％（漲跌色）。點列打開 `WatchlistDetailSheet`。
  - mobile：`MobileSwipeRow` 左滑出「刪除」（`down` 色）。
  - desktop：列尾刪除按鈕。
- 沒有價格的項目（剛加入但刷新失敗等）現價顯示「—」。
- 空狀態：`EmptyState`「還沒有觀察的股票」。
- 所有顏色、字級、間距只用 token。

**新增**

- 研究 tab 的 FAB 為「新增觀察」（`aria-label="新增觀察"`），沿用資產／支出頁 FAB 的顯示條件（已登入）。
- 表單欄位：市場（台股 / 美股）、代號。mobile 用 `MobileFormSheetLayout`，desktop 用 `Modal`。
- 送出 → `addWatchlistItem`；錯誤顯示在代號欄位：
  - 已存在且未刪除：「已在觀察清單」。
  - 報價抓不到：「查不到這個代號的報價」。

## 2. 資料與同步

照 `savings_goals` 的雲端優先寫法：`ensureCloudWritable()` → `mirrorToCloud` 寫 Firestore 並 round-trip 回本地；軟刪除。

**本地表**

- `src/db/database.js`：`TABLE_STORAGE_KEYS.watchlist = 'my-stock:watchlist'`，`this.watchlist = new PersistedInMemoryTable(...)`，primary key `id`（autoIncrement），index 含 `remoteKey`、`[market+symbol]`。

**雲端**

- 路徑 `users/{uid}/watchlist/{remoteKey}`。
- `remoteKey = ${market}_${symbol}`（例如 `TW_2330`、`US_NVDA`）。兩台裝置加同一支股票會落在同一個 doc，天然不重複。

**欄位**

| 欄位 | 說明 |
|---|---|
| `remoteKey` | `${market}_${symbol}` |
| `market` | `TW` / `US` |
| `symbol` | normalize 後代號（沿用 `normalizeSymbol`） |
| `name` | 報價回傳的名稱 |
| `latestPrice` | 最近一次報價，無則 `null` |
| `previousClose` | 前一交易日收盤，無則 `null` |
| `currency` | `TWD` / `USD` |
| `priceUpdatedAt` | 最近一次成功報價時間（ISO），無則 `null` |
| `createdAt` / `updatedAt` / `deletedAt` | ISO；`deletedAt` 為軟刪除 |
| `syncState` | 同既有表 |

**同步接線**

- `cloudSyncService.js`：`COLLECTIONS.WATCHLIST = 'watchlist'`；加入 subscribe 清單、`applyCollectionRecordLocally`、`removeCollectionDocLocally`、登出 clear、表清單。
- `firestoreMappers.js`：watchlist 的 to-cloud / from-cloud mapper。
- 開 App 時與其他表一樣從 Firestore 載入（cloud-first on load）。

**Service API**（`portfolioService.js`，皆先 `ensureCloudWritable()`）

- `addWatchlistItem({ market, symbol })`
  1. normalize market / symbol；空代號拋錯。
  2. 以 `[market+symbol]` 查本地；存在且未刪除 → 拋「已在觀察清單」。
  3. `getHoldingQuote({ market, symbol })` 取得名稱、現價、前收、幣別；失敗 → 拋「查不到這個代號的報價」。
  4. 寫入。若存在已軟刪除的同一支 → 復活：清 `deletedAt`，`createdAt` 更新為現在（重新加入排在組尾）。
- `removeWatchlistItem({ id })`：寫 `deletedAt`、`updatedAt`。
- `refreshWatchlistPrices()`：見第 3 節。
- `getWatchlistView()`：回傳未刪除項目，依市場分組（台股在前）、組內依 `createdAt` 升冪；每項附 `change`、`changePct`（`latestPrice` 與 `previousClose` 皆有限時才算）。

**取捨**：現價存在雲端 doc 上，每次刷新寫 N 筆 Firestore（清單在幾十支以內可接受），換得換裝置打開也能看到最近一次價格與時間。現價**不**寫入 `price_snapshots`（該表以持有人為 key 並餵資產趨勢圖）。

## 3. 報價刷新

**共用抓價：`fetchQuotes(targets)`**

- 由 `refreshPrices` 現有邏輯抽出：輸入 `{ market, symbol, companyName }[]`，回傳以 `market:symbol` 為 key 的 `Map`，值為 `{ quote }` 或 `{ error }`。
- 台股：一次 `getTwseDailyQuotes()`（MI_INDEX）；未命中者逐檔 `getHoldingQuote(..., { tpexFirst })`，非 `tpexFirst` 前 `sleepForRateLimit(1_200)`。
- 美股：`mapWithConcurrency(..., US_QUOTE_CONCURRENCY, ...)`。
- 台美兩線 `Promise.all` 並行。
- 抽出前先為 `refreshPrices` 補行為測試，抽出後同一組測試必須通過。

**併入資產頁「更新價格」**

- `refreshPrices({ market })` 取該市場的持股 + 未刪除觀察項目，依 `market:symbol` 去重後呼叫一次 `fetchQuotes`。
- 持股：照舊寫 `price_snapshots`、`pruneEarlierSnapshotsSameDay`、更新名稱、`sync_meta`。
- 觀察項目：成功者更新 `latestPrice`、`previousClose`、`currency`、`priceUpdatedAt`、`name`（有變才更新）；失敗者保留舊值。
- 早退條件改為「持股與觀察項目皆為空」。
- `usdTwdRate` 只在有美股**持股**時才需要抓（觀察項目不算市值）。
- 失敗語意：觀察項目的失敗也列入 `failed`；所有標的皆失敗才拋錯。回傳的 `updatedCount` / `targetCount` 以去重後的標的數計。

**研究 tab 自動刷新**

- `refreshWatchlistPrices()`：只處理觀察項目，走 `fetchQuotes`，不碰 `price_snapshots` / `sync_meta`。全部失敗才拋錯，否則回傳 `{ updatedCount, targetCount, failed }`。
- 純函式 `shouldAutoRefreshWatchlist(items, now)`：清單非空，且任一項 `priceUpdatedAt` 為 `null` 或最舊的 `priceUpdatedAt` 距 `now` 超過 10 分鐘 → `true`。
- 切到研究 tab 時：已登入、未在跑資產頁「更新價格」、`shouldAutoRefreshWatchlist` 為真 → 背景執行。
- 自動刷新失敗不跳 toast，只把時間戳改為「更新失敗」；手動刷新失敗用 `message` 提示（同資產頁）。
- 刷新進行中，刷新按鈕顯示 loading 並停用，避免重複觸發。

## 4. Sheet 拆分

**`src/components/stockDetail/StockSheetShell.jsx`（新）**

- mobile：`Drawer placement="bottom" size="90vh"`、`className="form-bottom-sheet stock-detail-sheet"`；desktop：`Drawer placement="right" size={520}`、`className="stock-detail-sheet"`；皆 `destroyOnHidden`。
- 標題：名稱 + 代號（`Text type="secondary"`）。
- `useBodyScrollLock(open && isMobile)`。
- props：`{ open, isMobile, name, symbol, onClose, children }`。

**`src/components/stockDetail/StockResearchContent.jsx`（新）**

- 自 `StockDetailSheet` 原封搬出：`useStockFundamentals`、`useValuationSettings`、`basis` / `assumptionsFocus` state、loading / error / unsupported 狀態、`ValuationCard`、`MonthlyRevenueRow`、`ValuationAssumptions`、`PeRiverChart` / `PeHistoryChart`、`EpsTrendChart`、資料來源列。
- props：`{ market, symbol, name, latestPrice, currency, isStock, isMobile, disabled }`，不含任何 holding 欄位。

**`StockDetailSheet`（持股，改寫）**

- = `StockSheetShell` + `HoldingPosition` + `StockResearchContent` + 「管理這筆持股」。
- 對外 props 不變，`App.jsx` 呼叫端不動；畫面應與改動前一致。

**`src/components/WatchlistDetailSheet.jsx`（新）**

- = `StockSheetShell` +
  1. 報價列：現價（比 body 大一級，非 display）、漲跌與漲跌％（漲跌色）、「更新於 …」（muted）。視覺對齊 `HoldingPosition` 頂部價格列，但無股數、成本、損益、買賣。
  2. `StockResearchContent`（`isStock` 固定 `true`；查無基本面時顯示既有 unsupported 文案）。
  3. 「管理」區只有一列「從觀察清單移除」（danger），確認流程沿用 `App.jsx` 移除持股的 `confirmDestructive` 模式。
- props：`{ open, item, isMobile, disabled, onClose, onRemove }`。
- `App.jsx` 以觀察項目 `id` 為 `key`；打開期間該項目被刪除（含其他裝置）→ 自動關閉。

估價假設存在 `app_config` 的 `valuation:<market>_<symbol>`，持股與觀察看到的是同一份。

## 5. 錯誤處理

- 研究 tab 與其他 tab 一樣登入後才顯示；寫入動作依 `isWriteDisabled` 停用。
- 新增：重複、查無報價 → 欄位錯誤，不寫入。
- 刷新部分失敗：失敗列保留舊價格與舊時間戳。
- sheet 開啟中項目被刪除 → 關閉 sheet。

## 6. 測試

- `fetchQuotes` / `refreshPrices`：抽出前補測試（MI_INDEX 命中、未命中走 chain、`tpexFirst`、美股併發、部分失敗、全部失敗）；新增：持股與觀察重疊只抓一次、只有觀察項目時不早退、觀察失敗列入 `failed`、觀察項目欄位更新。
- `addWatchlistItem` / `removeWatchlistItem`：正常新增、重複、查無報價、刪除後復活。
- `getWatchlistView`：分組、排序、漲跌計算、缺價格。
- `shouldAutoRefreshWatchlist`：空清單、有 `null`、未滿 / 超過 10 分鐘。
- `firestoreMappers` 與 `applyCollectionRecordLocally (watchlist)`：照 `savings_goals` 的測試格式。
- 元件：既有 `StockDetailSheet.test.jsx` 照常通過；新增 `WatchlistDetailSheet.test.jsx`（無 holding 區塊、有報價列、移除動作）、觀察清單列表 smoke test。
- `viewTransition.test.js`：新順序的方向。
- 瀏覽器實測：mobile 4 項 tab bar 與 FAB 不重疊、推頁方向、新增／刪除／sheet 開關、自動刷新節流。

## 7. 文件更新

- `PRODUCT.md`：主要分頁加「投資研究」；Operating Context 註明「報價為手動刷新」的例外——研究 tab 的觀察清單會自動刷新（10 分鐘節流）。
- `DESIGN.md`：Navigation 的 tab bar 改為 4 項；Lists 註明觀察清單列可左滑刪除（持股列例外的說明不變）。
- `CLAUDE.md`：Data layer / Sync 段落提及 `watchlist` 表；Price providers 段落提及 `fetchQuotes` 與觀察清單併入批次刷新。
