# 觀察清單與「研究」tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增主 tab「研究」，裡面有可加入台股／美股的觀察清單；點開觀察項目顯示與持股細節頁相同的研究內容（估價、EPS、本益比、河流圖、估價假設），但沒有任何 holding 內容。

**Architecture:** 新的 `watchlist` 表走既有的雲端優先寫法（`mirrorToCloud` → Firestore → round-trip 回本地），現價直接存在觀察項目上。`refreshPrices` 裡的抓價邏輯抽成 `fetchQuotes`，資產頁「更新價格」與研究 tab 的自動／手動刷新共用。`StockDetailSheet` 拆出 `StockSheetShell`（Drawer 外殼）與 `StockResearchContent`（研究內容），持股 sheet 與新的 `WatchlistDetailSheet` 各自組合。研究頁的狀態集中在 `useWatchlist` hook，`App.jsx` 只做接線。

**Tech Stack:** React 19、Ant Design 6、iconoir-react、Vitest + @testing-library/react、手刻 localStorage in-memory DB（`src/db/database.js`）、Firebase Firestore。

**Spec:** `docs/superpowers/specs/2026-10-13-watchlist-research-tab-design.md`

## Global Constraints

- 所有 `npm` / `npx` 指令在 `my-stock/` 下執行（repo 的 App 根目錄）。
- 回覆與 UI 文案用繁體中文（zh-TW）；程式碼、識別字、commit message 用英文。
- 顏色、字級、圓角、間距只用 token：CSS 寫 `var(--c-*)`、`var(--fs-*)`、`var(--radius-*)`、`var(--space-*)`、`var(--icon-*)`；不寫死 hex 或 px（既有檔案中已存在的寫法除外）。
- 不用 lint disable 註解繞過規則。
- 不引入新套件。
- 不修改、不部署 Firestore rule。
- tab 圖示：iconoir `GraphUp`；mobile tab 文字「研究」，desktop `Segmented` label「投資研究」。
- tab 順序：`asset`、`expense`、`research`、`settings`。
- 自動刷新節流：10 分鐘（`10 * 60 * 1000` ms）。
- 錯誤文案：重複「已在觀察清單」；查無報價「查不到這個代號的報價」；空清單「還沒有觀察的股票」；自動刷新失敗時間戳「更新失敗」。
- 觀察項目的 `remoteKey` = `${market}_${symbol}`（例如 `TW_2330`）。
- 觀察項目現價**不**寫入 `price_snapshots`。
- 每個 task 結束前 `npm test` 與 `npm run lint` 必須全綠。
- Commit message 結尾加：
  ```
  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  ```

## Review Focus

1. **刷新途中項目被刪除（含另一台裝置）**：刷新寫回價格時不能把已軟刪除的觀察項目「復活」。→ Task 4 的 `refreshWatchlistPrices` 測試 "does not revive an item removed while quotes were in flight"。
2. **同一支股票同時被持股與觀察**：資產頁「更新價格」只抓一次報價，兩邊都更新。→ Task 4 測試 "fetches a symbol held and watched only once"。
3. **只有觀察項目、沒有任何持股**：資產頁「更新價格」不能早退，觀察清單要被刷新。→ Task 4 測試 "refreshes the watchlist when there are no holdings"。
4. **代號大小寫／`.TW` 後綴**：`2330.tw`、` nvda ` 要 normalize 後才判斷重複與組 `remoteKey`。→ Task 3 測試 "normalizes the symbol before checking duplicates"。
5. **刪除後重新加入**：同一個 `remoteKey` 的軟刪除 doc 要被復活，排在組尾，不產生第二筆本地資料。→ Task 3 測試 "revives a removed item at the end of its group"。

---

## File Structure

**Create**
- `src/utils/watchlist.js` — 純函式：`remoteKey`、報價欄位、漲跌、分組 view、自動刷新判斷、錯誤文案常數。
- `src/utils/watchlist.test.js`
- `src/services/quoteBatch.js` — `fetchQuotes(targets)`：台股 MI_INDEX 批次＋逐檔 chain、美股限流併發、依 `market:symbol` 去重。
- `src/services/quoteBatch.test.js`
- `src/services/portfolioService.refreshPrices.test.js` — `refreshPrices` 行為測試（抽出前先鎖住）＋觀察清單合併。
- `src/services/portfolioService.watchlist.test.js` — 觀察清單 service。
- `src/components/stockDetail/StockSheetShell.jsx` — mobile bottom / desktop right Drawer 外殼。
- `src/components/stockDetail/StockResearchContent.jsx` — 研究內容（自 `StockDetailSheet` 搬出）。
- `src/components/WatchlistDetailSheet.jsx` + `.test.jsx`
- `src/hooks/useWatchlist.js` + `.test.jsx` — 觀察清單 view、選取、刷新、自動刷新。
- `src/components/research/WatchlistSection.jsx` + `.test.jsx` — 研究頁的觀察清單 section。
- `src/components/research/WatchlistForm.jsx` + `.test.jsx` — 新增表單（市場＋代號）。

**Modify**
- `src/db/database.js` — `watchlist` 表。
- `src/services/portfolioConstants.js` — `CLOUD_COLLECTION.WATCHLIST`。
- `src/services/firebase/firestoreMappers.js` (+ test) — watchlist mapper 與 key。
- `src/services/firebase/cloudSyncService.js` (+ test) — collection 接線。
- `src/services/portfolioService.js` — 觀察清單 API、`refreshPrices` 改用 `fetchQuotes` 並合併觀察項目。
- `src/components/StockDetailSheet.jsx` — 改由 shell + research content 組成。
- `src/utils/viewTransition.js` (+ test) — `MAIN_TAB_ORDER`。
- `src/App.jsx` — tab、研究頁、FAB、新增表單、觀察 sheet、刪除確認、訊息文案。
- `src/App.css` — 觀察清單列、報價列樣式。
- `PRODUCT.md`、`DESIGN.md`、`CLAUDE.md` — 文件。

---

### Task 1: `watchlist` 資料表與雲端同步

**Files:**
- Create: `src/utils/watchlist.js`（本 task 只放 `buildWatchlistRemoteKey`）
- Modify: `src/db/database.js:4-16`（`TABLE_STORAGE_KEYS`）、`src/db/database.js:414-476`（`StockDatabase` constructor）
- Modify: `src/services/portfolioConstants.js:20-33`（`CLOUD_COLLECTION`）
- Modify: `src/services/firebase/firestoreMappers.js`
- Modify: `src/services/firebase/cloudSyncService.js`（`COLLECTIONS`、`clearLocalCloudBackedData`、`buildMutationPayload`、`applyRemote*`、`applyCollectionRecordLocally`、`removeCollectionDocLocally`、`applyRealtimeSnapshot`、`firstSnapshotTracker.pending`、`subscribeCollection` 清單）
- Test: `src/services/firebase/firestoreMappers.test.js`、`src/services/firebase/cloudSyncService.test.js`

**Interfaces:**
- Produces:
  - `db.watchlist`：`PersistedInMemoryTable`，primary key `id`（autoIncrement），localStorage key `my-stock:watchlist`。
  - `CLOUD_COLLECTION.WATCHLIST === 'watchlist'`（`portfolioConstants.js`）。
  - `buildWatchlistRemoteKey({ market, symbol }) => string`（`src/utils/watchlist.js`）。
  - `buildWatchlistKey(item) => string`、`watchlistItemToRemote(item) => object`、`remoteToWatchlistItem(data) => object`（`firestoreMappers.js`）。
  - 本地 row 形狀：`{ id, remoteKey, market, symbol, name, latestPrice: number|null, previousClose: number|null, currency: 'TWD'|'USD', priceUpdatedAt: string|null, createdAt, updatedAt, deletedAt: string|null, syncState }`。

- [ ] **Step 1: 寫 mapper 的失敗測試**

在 `src/services/firebase/firestoreMappers.test.js` 的 import 加入 `buildWatchlistKey, watchlistItemToRemote, remoteToWatchlistItem`，檔尾加：

```js
describe('watchlist mappers', () => {
  const item = {
    id: 3,
    remoteKey: 'TW_2330',
    market: 'TW',
    symbol: '2330',
    name: '台積電',
    latestPrice: 1000,
    previousClose: 990,
    currency: 'TWD',
    priceUpdatedAt: '2026-10-13T06:00:00.000Z',
    createdAt: '2026-10-13T05:00:00.000Z',
    updatedAt: '2026-10-13T06:00:00.000Z',
    deletedAt: null,
    syncState: 'pending',
  }

  it('keys the doc by market and symbol', () => {
    expect(buildWatchlistKey(item)).toBe('TW_2330')
    expect(buildWatchlistKey({ market: 'US', symbol: 'NVDA' })).toBe('US_NVDA')
  })

  it('round-trips the fields without local-only ones', () => {
    const remote = watchlistItemToRemote(item)
    expect(remote).not.toHaveProperty('id')
    expect(remote).not.toHaveProperty('syncState')
    expect(remote.clientUpdatedAt).toBe(item.updatedAt)
    const { id: _id, syncState: _syncState, ...fields } = item
    expect(remoteToWatchlistItem(remote)).toEqual(fields)
  })

  it('keeps a missing price as null', () => {
    const remote = watchlistItemToRemote({ ...item, latestPrice: null, previousClose: undefined, priceUpdatedAt: null })
    const local = remoteToWatchlistItem(remote)
    expect(local.latestPrice).toBeNull()
    expect(local.previousClose).toBeNull()
    expect(local.priceUpdatedAt).toBeNull()
  })

  it('defaults the currency from the market', () => {
    expect(remoteToWatchlistItem({ market: 'US', symbol: 'NVDA' }).currency).toBe('USD')
    expect(remoteToWatchlistItem({ market: 'TW', symbol: '2330' }).currency).toBe('TWD')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/services/firebase/firestoreMappers.test.js`
Expected: FAIL（`buildWatchlistKey is not a function` 或 import 錯誤）

- [ ] **Step 3: 實作 `buildWatchlistRemoteKey` 與 mapper**

建立 `src/utils/watchlist.js`：

```js
// One watched stock per market + symbol: the cloud doc id, so two devices
// adding the same stock land on the same doc.
export const buildWatchlistRemoteKey = ({ market, symbol }) => `${market}_${symbol}`
```

在 `src/services/firebase/firestoreMappers.js` 頂部 import 加：

```js
import { buildWatchlistRemoteKey } from '../../utils/watchlist'
```

在 `buildSavingsGoalKey` 之後加：

```js
export const buildWatchlistKey = (item) => item.remoteKey || buildWatchlistRemoteKey(item)
```

在 `savingsGoalToRemote` 之後加：

```js
const toPriceOrNull = (value) => {
  if (value === null || value === undefined) return null
  return toPositiveAmountOrNull(value)
}

export const watchlistItemToRemote = (item) => ({
  remoteKey: buildWatchlistKey(item),
  market: item.market,
  symbol: item.symbol,
  name: item.name ?? item.symbol,
  latestPrice: toPriceOrNull(item.latestPrice),
  previousClose: toPriceOrNull(item.previousClose),
  currency: item.currency ?? (item.market === 'US' ? 'USD' : 'TWD'),
  priceUpdatedAt: item.priceUpdatedAt ?? null,
  createdAt: item.createdAt ?? null,
  updatedAt: item.updatedAt,
  deletedAt: item.deletedAt ?? null,
  clientUpdatedAt: item.updatedAt,
})
```

在 `remoteToSavingsGoal` 之後加：

```js
export const remoteToWatchlistItem = (data) => ({
  remoteKey: data.remoteKey ?? (data.market && data.symbol ? buildWatchlistRemoteKey(data) : null),
  market: data.market,
  symbol: data.symbol,
  name: data.name ?? data.symbol,
  latestPrice: toPriceOrNull(data.latestPrice),
  previousClose: toPriceOrNull(data.previousClose),
  currency: data.currency ?? (data.market === 'US' ? 'USD' : 'TWD'),
  priceUpdatedAt: toIso(data.priceUpdatedAt),
  createdAt: toIso(data.createdAt) ?? data.createdAt ?? null,
  updatedAt: toIso(data.updatedAt) ?? data.clientUpdatedAt ?? null,
  deletedAt: toIso(data.deletedAt),
})
```

（`toPositiveAmountOrNull` 定義在 `firestoreMappers.js:161`，`toPriceOrNull` 必須放在它之後。）

- [ ] **Step 4: 跑 mapper 測試確認通過**

Run: `npx vitest run src/services/firebase/firestoreMappers.test.js`
Expected: PASS

- [ ] **Step 5: 寫 cloud sync 的失敗測試**

在 `src/services/firebase/cloudSyncService.test.js` 檔尾加（`db`、`applyCollectionRecordLocally`、`removeCollectionDocLocally`、`beforeEach` 已在該檔 import）：

```js
describe('applyCollectionRecordLocally (watchlist)', () => {
  const item = {
    remoteKey: 'TW_2330',
    market: 'TW',
    symbol: '2330',
    name: '台積電',
    latestPrice: 1000,
    previousClose: 990,
    currency: 'TWD',
    priceUpdatedAt: '2026-10-13T06:00:00.000Z',
    createdAt: '2026-10-13T05:00:00.000Z',
    updatedAt: '2026-10-13T06:00:00.000Z',
    deletedAt: null,
  }

  beforeEach(async () => {
    await db.watchlist.clear()
  })

  it('adds a watched stock', async () => {
    await applyCollectionRecordLocally({ collectionName: 'watchlist', record: item })
    const [row] = await db.watchlist.toArray()
    expect(row).toMatchObject({ ...item, syncState: 'synced' })
    expect(Number.isInteger(row.id)).toBe(true)
  })

  it('updates only when the remote copy is newer', async () => {
    await applyCollectionRecordLocally({ collectionName: 'watchlist', record: item })
    await applyCollectionRecordLocally({
      collectionName: 'watchlist',
      record: { ...item, latestPrice: 1, updatedAt: '2026-10-13T05:30:00.000Z' },
    })
    await applyCollectionRecordLocally({
      collectionName: 'watchlist',
      record: { ...item, latestPrice: 1010, updatedAt: '2026-10-13T07:00:00.000Z' },
    })
    const rows = await db.watchlist.toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0].latestPrice).toBe(1010)
  })

  it('removes the local row when the remote doc is deleted', async () => {
    await applyCollectionRecordLocally({ collectionName: 'watchlist', record: item })
    await removeCollectionDocLocally({ collectionName: 'watchlist', docId: 'TW_2330', snapshotData: item })
    expect(await db.watchlist.toArray()).toEqual([])
  })
})
```

- [ ] **Step 6: 跑測試確認失敗**

Run: `npx vitest run src/services/firebase/cloudSyncService.test.js -t watchlist`
Expected: FAIL（`db.watchlist` undefined）

- [ ] **Step 7: 實作本地表與同步接線**

`src/db/database.js`：`TABLE_STORAGE_KEYS` 加 `watchlist: 'my-stock:watchlist',`；constructor 在 `savings_goals` 之後加：

```js
    this.watchlist = new PersistedInMemoryTable({
      primaryKey: 'id',
      autoIncrement: true,
      storageKey: TABLE_STORAGE_KEYS.watchlist,
    })
```

`src/services/portfolioConstants.js` 的 `CLOUD_COLLECTION` 在 `SAVINGS_GOALS` 之後加 `WATCHLIST: "watchlist",`。

`src/services/firebase/cloudSyncService.js`：
1. mapper import 清單（`savingsGoalToRemote` 附近）加 `buildWatchlistKey`、`watchlistItemToRemote`、`remoteToWatchlistItem`。
2. `COLLECTIONS` 在 `SAVINGS_GOALS` 之後加 `WATCHLIST: 'watchlist',`。
3. `clearLocalCloudBackedData` 的 `db.transaction(...)` 參數清單加 `db.watchlist,`（`db.savings_goals,` 之後），callback 內加 `await db.watchlist.clear()`（`await db.savings_goals.clear()` 之後）。
4. `buildMutationPayload` 在 `SAVINGS_GOALS` 分支之後加：
   ```js
   if (collectionName === COLLECTIONS.WATCHLIST) {
     return { docId: buildWatchlistKey(record), payload: watchlistItemToRemote(record) }
   }
   ```
5. 在 `applyRemoteSavingsGoal` 之後加：
   ```js
   const applyRemoteWatchlistItem = async (remote) => {
     if (!remote.remoteKey || !remote.symbol) return
     const local = await db.watchlist.where('remoteKey').equals(remote.remoteKey).first()
     const nowIso = getNowIso()
     const { remoteKey, createdAt, updatedAt, ...fields } = remote
     if (!local) {
       await db.watchlist.add({
         remoteKey,
         ...fields,
         createdAt: createdAt || nowIso,
         updatedAt: updatedAt || nowIso,
         syncState: SYNC_SYNCED,
       })
       return
     }
     if (!isRemoteNewer(local.updatedAt, updatedAt)) return
     await db.watchlist.update(local.id, {
       ...fields,
       createdAt: createdAt || local.createdAt,
       updatedAt: updatedAt || local.updatedAt,
       syncState: SYNC_SYNCED,
     })
   }
   ```
6. `applyCollectionRecordLocally` 在 `SAVINGS_GOALS` 分支之後加：
   ```js
   } else if (collectionName === COLLECTIONS.WATCHLIST) {
     await applyRemoteWatchlistItem(remoteToWatchlistItem(payload))
   ```
7. `removeCollectionDocLocally` 在 `SAVINGS_GOALS` 分支之後加：
   ```js
   } else if (collectionName === COLLECTIONS.WATCHLIST) {
     const remoteKey = snapshotData ? remoteToWatchlistItem(snapshotData).remoteKey : docId
     if (!remoteKey) return
     const item = await db.watchlist.where('remoteKey').equals(remoteKey).first()
     if (item) {
       await db.watchlist.delete(item.id)
     }
   ```
8. `applyRealtimeSnapshot` 在 `SAVINGS_GOALS` 分支之後加：
   ```js
   if (collectionName === COLLECTIONS.WATCHLIST) {
     await applyRemoteWatchlistItem(remoteToWatchlistItem(data))
     continue
   }
   ```
9. `firstSnapshotTracker.pending` 的 Set 加 `COLLECTIONS.WATCHLIST,`；第二個 `Promise.allSettled([...])` 加 `subscribeCollection(COLLECTIONS.WATCHLIST),`。

- [ ] **Step 8: 跑全部測試與 lint**

Run: `npm test && npm run lint`
Expected: 全部 PASS，lint 無錯誤

- [ ] **Step 9: Commit**

```bash
git add src/utils/watchlist.js src/db/database.js src/services/portfolioConstants.js src/services/firebase/firestoreMappers.js src/services/firebase/firestoreMappers.test.js src/services/firebase/cloudSyncService.js src/services/firebase/cloudSyncService.test.js
git commit -m "Add a watchlist table synced to users/{uid}/watchlist

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 把抓價邏輯抽成 `fetchQuotes`

先替現有 `refreshPrices` 補行為測試鎖住，再抽出，同一組測試必須保持綠燈。

**Files:**
- Create: `src/services/portfolioService.refreshPrices.test.js`
- Create: `src/services/quoteBatch.js`、`src/services/quoteBatch.test.js`
- Modify: `src/services/portfolioService.js:11-16`（imports）、`:104-105`（`US_QUOTE_CONCURRENCY`）、`:1032-1036`（`settleQuote`）、`:1436-1612`（`refreshPrices`）

**Interfaces:**
- Produces（`src/services/quoteBatch.js`）：
  - `quoteTargetKey({ market, symbol }) => 'TW:2330'`
  - `fetchQuotes(targets: Array<{ market, symbol, companyName? }>) => Promise<Map<string, { quote } | { error }>>`；Map 以 `quoteTargetKey` 為 key，`targets` 依 key 去重（保留第一個）。`quote` 形狀同 `getHoldingQuote` 回傳：`{ price, name, currency, previousClose?: number }`。

- [ ] **Step 1: 為現有 `refreshPrices` 寫行為測試**

建立 `src/services/portfolioService.refreshPrices.test.js`：

```js
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('./firebase/cloudSyncService', async (importOriginal) => ({
  ...(await importOriginal()),
  assertCloudWriteReady: vi.fn(),
  writeCollectionRecord: vi.fn(),
  deleteCollectionDoc: vi.fn(),
  registerMigratedDocKey: vi.fn(),
}))
vi.mock('./priceProviders/twseDailyProvider', () => ({ getTwseDailyQuotes: vi.fn() }))
vi.mock('./priceProviders/finnhubProvider', () => ({
  getHoldingQuote: vi.fn(),
  sleepForRateLimit: vi.fn(() => Promise.resolve()),
}))
vi.mock('./priceProviders/fxProvider', () => ({
  getUsdTwdRate: vi.fn(async () => ({ rate: 32, fetchedAt: '2026-10-13T06:00:00.000Z' })),
}))

import { db } from '../db/database'
import { getTwseDailyQuotes } from './priceProviders/twseDailyProvider'
import { getHoldingQuote, sleepForRateLimit } from './priceProviders/finnhubProvider'
import { refreshPrices } from './portfolioService'

let clock = Date.parse('2026-10-13T06:00:00.000Z')
const tick = () => {
  clock += 1000
  vi.setSystemTime(clock)
}

const addHolding = (market, symbol, holder = 'Po') =>
  db.holdings.add({
    market,
    symbol,
    holder,
    shares: 10,
    totalCost: null,
    companyName: symbol,
    assetTag: 'STOCK',
    sortOrder: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
  })

const twQuote = (price) => ({ price, previousClose: price - 1, currency: 'TWD', name: `TW${price}` })
const usQuote = (price) => ({ price, previousClose: price - 1, currency: 'USD', name: `US${price}` })

const latestPriceOf = async (holdingId) => {
  const rows = await db.price_snapshots.toArray()
  return rows.filter((row) => row.holdingId === holdingId).at(-1)
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  tick()
  vi.mocked(getTwseDailyQuotes).mockReset()
  vi.mocked(getHoldingQuote).mockReset()
  vi.mocked(sleepForRateLimit).mockClear()
  await db.holdings.clear()
  await db.price_snapshots.clear()
  await db.sync_meta.clear()
  await db.fx_rates.clear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('refreshPrices', () => {
  it('uses the MI_INDEX batch for listed TW symbols', async () => {
    const id = await addHolding('TW', '2330')
    vi.mocked(getTwseDailyQuotes).mockResolvedValue({
      date: '20261013',
      quotes: { 2330: twQuote(1000) },
      listedSymbols: new Set(['2330']),
    })
    const result = await refreshPrices({ market: 'ALL' })
    expect(getHoldingQuote).not.toHaveBeenCalled()
    expect((await latestPriceOf(id)).price).toBe(1000)
    expect(result).toMatchObject({ updatedCount: 1, targetCount: 1, failed: [] })
  })

  it('asks TPEX first, unpaced, for symbols TWSE does not list', async () => {
    const id = await addHolding('TW', '6488')
    vi.mocked(getTwseDailyQuotes).mockResolvedValue({ date: '20261013', quotes: {}, listedSymbols: new Set(['2330']) })
    vi.mocked(getHoldingQuote).mockResolvedValue(twQuote(500))
    await refreshPrices({ market: 'TW' })
    expect(getHoldingQuote).toHaveBeenCalledWith(expect.objectContaining({ symbol: '6488' }), { tpexFirst: true })
    expect(sleepForRateLimit).not.toHaveBeenCalled()
    expect((await latestPriceOf(id)).price).toBe(500)
  })

  it('paces per-symbol TWSE requests when a listed symbol misses the batch', async () => {
    await addHolding('TW', '2330')
    vi.mocked(getTwseDailyQuotes).mockResolvedValue({ date: '20261013', quotes: {}, listedSymbols: new Set(['2330']) })
    vi.mocked(getHoldingQuote).mockResolvedValue(twQuote(1000))
    await refreshPrices({ market: 'TW' })
    expect(sleepForRateLimit).toHaveBeenCalledWith(1_200)
    expect(getHoldingQuote).toHaveBeenCalledWith(expect.objectContaining({ symbol: '2330' }), { tpexFirst: false })
  })

  it('falls back per symbol when the MI_INDEX batch fails', async () => {
    await addHolding('TW', '2330')
    vi.mocked(getTwseDailyQuotes).mockRejectedValue(new Error('down'))
    vi.mocked(getHoldingQuote).mockResolvedValue(twQuote(1000))
    const result = await refreshPrices({ market: 'TW' })
    expect(getHoldingQuote).toHaveBeenCalledWith(expect.objectContaining({ symbol: '2330' }), { tpexFirst: false })
    expect(result.updatedCount).toBe(1)
  })

  it('values US holdings in TWD at the fetched rate', async () => {
    const id = await addHolding('US', 'NVDA')
    vi.mocked(getHoldingQuote).mockResolvedValue(usQuote(100))
    await refreshPrices({ market: 'US' })
    expect(getHoldingQuote).toHaveBeenCalledWith(expect.objectContaining({ symbol: 'NVDA' }))
    expect(getTwseDailyQuotes).not.toHaveBeenCalled()
    const snapshot = await latestPriceOf(id)
    expect(snapshot).toMatchObject({ price: 100, fxRateToTwd: 32, valueTwd: 100 * 10 * 32 })
  })

  it('saves what it got and reports the misses', async () => {
    await addHolding('US', 'NVDA')
    await addHolding('US', 'NOPE')
    vi.mocked(getHoldingQuote).mockImplementation(async ({ symbol }) => {
      if (symbol === 'NOPE') throw new Error('No quote found')
      return usQuote(100)
    })
    const result = await refreshPrices({ market: 'US' })
    expect(result.updatedCount).toBe(1)
    expect(result.targetCount).toBe(2)
    expect(result.failed).toEqual([{ symbol: 'NOPE', market: 'US', reason: 'No quote found' }])
  })

  it('throws when every quote fails', async () => {
    await addHolding('US', 'NOPE')
    vi.mocked(getHoldingQuote).mockRejectedValue(new Error('No quote found'))
    await expect(refreshPrices({ market: 'US' })).rejects.toThrow('全部 1 檔報價都抓取失敗：No quote found')
  })

  it('returns early with nothing to refresh', async () => {
    const result = await refreshPrices({ market: 'ALL' })
    expect(result).toMatchObject({ updatedCount: 0, targetCount: 0 })
    expect(getHoldingQuote).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 跑測試確認在「現有程式碼」上通過**

Run: `npx vitest run src/services/portfolioService.refreshPrices.test.js`
Expected: PASS（這組測試描述的是現有行為；若有失敗，修正測試使其符合現有行為，不改產品程式碼）

- [ ] **Step 3: 寫 `fetchQuotes` 的失敗測試**

建立 `src/services/quoteBatch.test.js`：

```js
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('./priceProviders/twseDailyProvider', () => ({ getTwseDailyQuotes: vi.fn() }))
vi.mock('./priceProviders/finnhubProvider', () => ({
  getHoldingQuote: vi.fn(),
  sleepForRateLimit: vi.fn(() => Promise.resolve()),
}))

import { getTwseDailyQuotes } from './priceProviders/twseDailyProvider'
import { getHoldingQuote } from './priceProviders/finnhubProvider'
import { fetchQuotes, quoteTargetKey } from './quoteBatch'

beforeEach(() => {
  vi.mocked(getTwseDailyQuotes).mockReset()
  vi.mocked(getHoldingQuote).mockReset()
})

describe('quoteTargetKey', () => {
  it('joins market and symbol', () => {
    expect(quoteTargetKey({ market: 'TW', symbol: '2330' })).toBe('TW:2330')
  })
})

describe('fetchQuotes', () => {
  it('fetches each market:symbol once', async () => {
    vi.mocked(getHoldingQuote).mockResolvedValue({ price: 100, currency: 'USD', name: 'NVIDIA' })
    const result = await fetchQuotes([
      { market: 'US', symbol: 'NVDA', companyName: 'NVIDIA' },
      { market: 'US', symbol: 'NVDA', companyName: 'NVDA' },
    ])
    expect(getHoldingQuote).toHaveBeenCalledTimes(1)
    expect(getHoldingQuote).toHaveBeenCalledWith({ market: 'US', symbol: 'NVDA', companyName: 'NVIDIA' })
    expect(result.get('US:NVDA')).toEqual({ quote: { price: 100, currency: 'USD', name: 'NVIDIA' } })
  })

  it('returns an error entry instead of rejecting', async () => {
    const error = new Error('No quote found')
    vi.mocked(getHoldingQuote).mockRejectedValue(error)
    const result = await fetchQuotes([{ market: 'US', symbol: 'NOPE' }])
    expect(result.get('US:NOPE')).toEqual({ error })
  })

  it('skips the MI_INDEX batch when there are no TW targets', async () => {
    vi.mocked(getHoldingQuote).mockResolvedValue({ price: 1, currency: 'USD', name: 'X' })
    await fetchQuotes([{ market: 'US', symbol: 'X' }])
    expect(getTwseDailyQuotes).not.toHaveBeenCalled()
  })

  it('returns an empty map for no targets', async () => {
    expect((await fetchQuotes([])).size).toBe(0)
  })
})
```

- [ ] **Step 4: 跑測試確認失敗**

Run: `npx vitest run src/services/quoteBatch.test.js`
Expected: FAIL（找不到 `./quoteBatch`）

- [ ] **Step 5: 實作 `quoteBatch.js`**

建立 `src/services/quoteBatch.js`：

```js
import { getTwseDailyQuotes } from './priceProviders/twseDailyProvider'
import { getHoldingQuote, sleepForRateLimit } from './priceProviders/finnhubProvider'
import { mapWithConcurrency } from '../utils/concurrency'

// Finnhub free tier: 60 calls/min, 30/sec — a few in flight is safe.
const US_QUOTE_CONCURRENCY = 4

export const quoteTargetKey = ({ market, symbol }) => `${market}:${symbol}`

const settleQuote = (promise) =>
  promise.then(
    (quote) => ({ quote }),
    (error) => ({ error }),
  )

// Quotes for holdings and watched stocks alike, one request per
// market:symbol (the first target's companyName is the one passed on).
// TW and US quotes hit different hosts, so both lanes run at once.
// TW: one MI_INDEX request covers every TWSE-listed symbol; only misses
// (TPEX symbols, no trade today, or MI_INDEX down) go per-symbol, paced
// because TWSE rate-limits per IP. US: Finnhub allows short bursts →
// small parallel batches. A failed symbol becomes { error }, never a
// rejection, so one bad symbol doesn't discard the others.
export const fetchQuotes = async (targets) => {
  const unique = new Map()
  for (const target of targets) {
    const key = quoteTargetKey(target)
    if (!unique.has(key)) unique.set(key, target)
  }
  const list = [...unique.values()]
  const twTargets = list.filter((target) => target.market !== 'US')
  const usTargets = list.filter((target) => target.market === 'US')

  const fetchTwQuotes = async () => {
    let daily = null
    if (twTargets.length > 0) {
      try {
        daily = await getTwseDailyQuotes()
      } catch (error) {
        console.warn('[fetchQuotes] MI_INDEX batch failed, falling back per symbol', error)
      }
    }

    const quotes = []
    for (const target of twTargets) {
      const hit = daily?.quotes[target.symbol]
      if (hit) {
        quotes.push({ quote: hit })
        continue
      }
      // Not TWSE-listed at all → it's a TPEX symbol; the same-origin TPEX
      // snapshot needs no pacing. Anything else hits TWSE again.
      const tpexFirst = Boolean(daily) && !daily.listedSymbols.has(target.symbol)
      if (!tpexFirst) {
        await sleepForRateLimit(1_200)
      }
      quotes.push(await settleQuote(getHoldingQuote(target, { tpexFirst })))
    }
    return quotes
  }

  const [twQuotes, usQuotes] = await Promise.all([
    fetchTwQuotes(),
    mapWithConcurrency(usTargets, US_QUOTE_CONCURRENCY, (target) =>
      settleQuote(getHoldingQuote(target)),
    ),
  ])

  return new Map([
    ...twTargets.map((target, i) => [quoteTargetKey(target), twQuotes[i]]),
    ...usTargets.map((target, i) => [quoteTargetKey(target), usQuotes[i]]),
  ])
}
```

- [ ] **Step 6: `refreshPrices` 改用 `fetchQuotes`**

`src/services/portfolioService.js`：
1. 移除 `import { getTwseDailyQuotes } from "./priceProviders/twseDailyProvider";`；`finnhubProvider` 的 import 只留 `getHoldingQuote`（`refreshHoldingPrice` 仍在用），移除 `sleepForRateLimit`。若 `mapWithConcurrency` 在檔內已無其他使用者，一併移除其 import（以 `grep -n mapWithConcurrency src/services/portfolioService.js` 確認）。
2. 加 `import { fetchQuotes, quoteTargetKey } from "./quoteBatch";`。
3. 刪除 `US_QUOTE_CONCURRENCY` 常數與其註解（`:104-105`）；若 `settleQuote`（`:1032-1036`）已無其他使用者也刪除（以 grep 確認）。
4. 在 `refreshPrices` 中，把從 `// TW and US quotes hit different hosts` 註解開始、到 `const quoteByHoldingId = new Map([...]);` 為止的整段換成：

```js
    const quotes = await fetchQuotes(
      targetHoldings.map((holding) => ({
        market: holding.market,
        symbol: holding.symbol,
        companyName: holding.companyName,
      })),
    );
```

5. 迴圈內 `const { quote, error } = quoteByHoldingId.get(holding.id);` 改為 `const { quote, error } = quotes.get(quoteTargetKey(holding));`。
6. 原本宣告在被刪段落內、迴圈後仍需要的 `twHoldings` 若已無使用者就不要保留；`usHoldings`（決定是否抓匯率）保留。

- [ ] **Step 7: 跑兩組測試確認通過**

Run: `npx vitest run src/services/quoteBatch.test.js src/services/portfolioService.refreshPrices.test.js`
Expected: PASS（refreshPrices 測試一行都不改即通過）

- [ ] **Step 8: 全部測試與 lint**

Run: `npm test && npm run lint`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/services/quoteBatch.js src/services/quoteBatch.test.js src/services/portfolioService.js src/services/portfolioService.refreshPrices.test.js
git commit -m "Pull quote fetching out of refreshPrices into fetchQuotes

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 觀察清單的純函式與新增／移除／view API

**Files:**
- Modify: `src/utils/watchlist.js`
- Create: `src/utils/watchlist.test.js`
- Modify: `src/services/portfolioService.js`（新增 exports，放在 `removeSavingsGoal` 之後）
- Create: `src/services/portfolioService.watchlist.test.js`

**Interfaces:**
- Consumes: `db.watchlist`、`CLOUD_COLLECTION.WATCHLIST`、`buildWatchlistRemoteKey`（Task 1）。
- Produces（`src/utils/watchlist.js`）：
  - `WATCHLIST_REFRESH_INTERVAL_MS = 600000`
  - `WATCHLIST_DUPLICATE_MESSAGE = "已在觀察清單"`、`WATCHLIST_NOT_FOUND_MESSAGE = "查不到這個代號的報價"`
  - `watchlistQuoteFields(quote, nowIso) => { latestPrice, previousClose, currency, priceUpdatedAt }`
  - `buildWatchlistView(items) => { rows: WatchlistRow[], groups: Array<{ market: 'TW'|'US', rows: WatchlistRow[] }>, lastUpdatedAt: string|null }`
    - `WatchlistRow = { id, remoteKey, market, symbol, name, latestPrice, previousClose, currency, priceUpdatedAt, createdAt, change: number|null, changePct: number|null }`（`changePct` 為比例，例如 `0.0101`，搭配 `formatSignedPercent`）
  - `shouldAutoRefreshWatchlist(rows, nowMs) => boolean`
- Produces（`portfolioService.js`）：
  - `addWatchlistItem({ market, symbol }) => Promise<{ id: number }>`
  - `removeWatchlistItem({ id }) => Promise<void>`
  - `getWatchlistView() => Promise<ReturnType<buildWatchlistView>>`

- [ ] **Step 1: 寫純函式的失敗測試**

建立 `src/utils/watchlist.test.js`：

```js
import { describe, it, expect } from 'vitest'
import {
  WATCHLIST_REFRESH_INTERVAL_MS,
  buildWatchlistRemoteKey,
  buildWatchlistView,
  shouldAutoRefreshWatchlist,
  watchlistQuoteFields,
} from './watchlist'

const item = (overrides) => ({
  id: 1,
  remoteKey: 'TW_2330',
  market: 'TW',
  symbol: '2330',
  name: '台積電',
  latestPrice: 1010,
  previousClose: 1000,
  currency: 'TWD',
  priceUpdatedAt: '2026-10-13T06:00:00.000Z',
  createdAt: '2026-10-13T05:00:00.000Z',
  updatedAt: '2026-10-13T06:00:00.000Z',
  deletedAt: null,
  ...overrides,
})

describe('buildWatchlistRemoteKey', () => {
  it('joins market and symbol', () => {
    expect(buildWatchlistRemoteKey({ market: 'US', symbol: 'NVDA' })).toBe('US_NVDA')
  })
})

describe('watchlistQuoteFields', () => {
  it('copies the price fields and stamps the time', () => {
    expect(watchlistQuoteFields({ price: 10, previousClose: 9, currency: 'USD', name: 'X' }, 'T')).toEqual({
      latestPrice: 10,
      previousClose: 9,
      currency: 'USD',
      priceUpdatedAt: 'T',
    })
  })

  it('stores a missing previous close as null', () => {
    expect(watchlistQuoteFields({ price: 10, currency: 'TWD' }, 'T').previousClose).toBeNull()
  })
})

describe('buildWatchlistView', () => {
  it('drops removed items, groups TW before US, and orders by when they were added', () => {
    const view = buildWatchlistView([
      item({ id: 1, market: 'US', symbol: 'NVDA', remoteKey: 'US_NVDA', createdAt: '2026-10-13T01:00:00.000Z' }),
      item({ id: 2, symbol: '2454', remoteKey: 'TW_2454', createdAt: '2026-10-13T03:00:00.000Z' }),
      item({ id: 3, symbol: '2330', createdAt: '2026-10-13T02:00:00.000Z' }),
      item({ id: 4, symbol: '0050', remoteKey: 'TW_0050', deletedAt: '2026-10-13T04:00:00.000Z' }),
    ])
    expect(view.groups.map((group) => [group.market, group.rows.map((row) => row.symbol)])).toEqual([
      ['TW', ['2330', '2454']],
      ['US', ['NVDA']],
    ])
    expect(view.rows).toHaveLength(3)
  })

  it('omits an empty market group', () => {
    expect(buildWatchlistView([item({})]).groups.map((group) => group.market)).toEqual(['TW'])
    expect(buildWatchlistView([]).groups).toEqual([])
  })

  it('computes the change against the previous close', () => {
    const [row] = buildWatchlistView([item({})]).rows
    expect(row.change).toBe(10)
    expect(row.changePct).toBeCloseTo(0.01)
  })

  it('leaves the change empty without both prices', () => {
    const [row] = buildWatchlistView([item({ previousClose: null })]).rows
    expect(row.change).toBeNull()
    expect(row.changePct).toBeNull()
  })

  it('reports the latest successful update', () => {
    const view = buildWatchlistView([
      item({ id: 1, priceUpdatedAt: '2026-10-13T06:00:00.000Z' }),
      item({ id: 2, symbol: '2454', remoteKey: 'TW_2454', priceUpdatedAt: '2026-10-13T07:00:00.000Z' }),
      item({ id: 3, symbol: '2317', remoteKey: 'TW_2317', priceUpdatedAt: null }),
    ])
    expect(view.lastUpdatedAt).toBe('2026-10-13T07:00:00.000Z')
    expect(buildWatchlistView([item({ priceUpdatedAt: null })]).lastUpdatedAt).toBeNull()
  })
})

describe('shouldAutoRefreshWatchlist', () => {
  const now = Date.parse('2026-10-13T06:00:00.000Z')
  const at = (ms) => new Date(now - ms).toISOString()

  it('skips an empty list', () => {
    expect(shouldAutoRefreshWatchlist([], now)).toBe(false)
  })

  it('refreshes when any item has no price yet', () => {
    expect(shouldAutoRefreshWatchlist([{ priceUpdatedAt: at(1000) }, { priceUpdatedAt: null }], now)).toBe(true)
  })

  it('waits until the oldest price is older than the interval', () => {
    expect(shouldAutoRefreshWatchlist([{ priceUpdatedAt: at(WATCHLIST_REFRESH_INTERVAL_MS - 1000) }], now)).toBe(false)
    expect(
      shouldAutoRefreshWatchlist(
        [{ priceUpdatedAt: at(1000) }, { priceUpdatedAt: at(WATCHLIST_REFRESH_INTERVAL_MS + 1000) }],
        now,
      ),
    ).toBe(true)
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/utils/watchlist.test.js`
Expected: FAIL（`buildWatchlistView` 等未定義）

- [ ] **Step 3: 實作純函式**

`src/utils/watchlist.js` 改為：

```js
// Watched stocks: no holder, no shares — a stock to research, with the
// last quote stored on it (not in price_snapshots, which feed the asset
// trend).

export const WATCHLIST_REFRESH_INTERVAL_MS = 10 * 60 * 1000
export const WATCHLIST_DUPLICATE_MESSAGE = "已在觀察清單"
export const WATCHLIST_NOT_FOUND_MESSAGE = "查不到這個代號的報價"

const MARKET_ORDER = ["TW", "US"]

// One watched stock per market + symbol: the cloud doc id, so two devices
// adding the same stock land on the same doc.
export const buildWatchlistRemoteKey = ({ market, symbol }) => `${market}_${symbol}`

export const watchlistQuoteFields = (quote, nowIso) => ({
  latestPrice: quote.price,
  previousClose: Number.isFinite(quote.previousClose) ? quote.previousClose : null,
  currency: quote.currency,
  priceUpdatedAt: nowIso,
})

const toRow = (item) => {
  const hasChange =
    Number.isFinite(item.latestPrice) && Number.isFinite(item.previousClose) && item.previousClose > 0
  const change = hasChange ? item.latestPrice - item.previousClose : null
  return {
    id: item.id,
    remoteKey: item.remoteKey,
    market: item.market,
    symbol: item.symbol,
    name: item.name || item.symbol,
    latestPrice: Number.isFinite(item.latestPrice) ? item.latestPrice : null,
    previousClose: Number.isFinite(item.previousClose) ? item.previousClose : null,
    currency: item.currency || (item.market === "US" ? "USD" : "TWD"),
    priceUpdatedAt: item.priceUpdatedAt ?? null,
    createdAt: item.createdAt ?? null,
    change,
    changePct: hasChange ? change / item.previousClose : null,
  }
}

const byAdded = (a, b) =>
  String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")) || a.id - b.id

export const buildWatchlistView = (items) => {
  const rows = items.filter((item) => !item.deletedAt).map(toRow).sort(byAdded)
  const groups = MARKET_ORDER.map((market) => ({
    market,
    rows: rows.filter((row) => row.market === market),
  })).filter((group) => group.rows.length > 0)
  const stamps = rows.map((row) => row.priceUpdatedAt).filter(Boolean).sort()
  return { rows, groups, lastUpdatedAt: stamps.at(-1) ?? null }
}

// Entering 研究 refreshes when a price is missing or the oldest one is past
// the interval; the stamps come from the cloud, so another device's recent
// refresh counts too.
export const shouldAutoRefreshWatchlist = (rows, nowMs) => {
  if (rows.length === 0) return false
  if (rows.some((row) => !row.priceUpdatedAt)) return true
  const oldest = Math.min(...rows.map((row) => Date.parse(row.priceUpdatedAt)))
  return nowMs - oldest > WATCHLIST_REFRESH_INTERVAL_MS
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/utils/watchlist.test.js src/services/firebase/firestoreMappers.test.js`
Expected: PASS

- [ ] **Step 5: 寫 service 的失敗測試**

建立 `src/services/portfolioService.watchlist.test.js`：

```js
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('./firebase/cloudSyncService', async (importOriginal) => ({
  ...(await importOriginal()),
  assertCloudWriteReady: vi.fn(),
  writeCollectionRecord: vi.fn(),
  deleteCollectionDoc: vi.fn(),
  registerMigratedDocKey: vi.fn(),
}))
vi.mock('./priceProviders/finnhubProvider', () => ({
  getHoldingQuote: vi.fn(),
  sleepForRateLimit: vi.fn(() => Promise.resolve()),
}))

import { db } from '../db/database'
import { assertCloudWriteReady } from './firebase/cloudSyncService'
import { getHoldingQuote } from './priceProviders/finnhubProvider'
import { addWatchlistItem, getWatchlistView, removeWatchlistItem } from './portfolioService'

let clock = Date.parse('2026-10-13T06:00:00.000Z')
const tick = () => {
  clock += 1000
  vi.setSystemTime(clock)
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  tick()
  vi.mocked(getHoldingQuote).mockReset()
  vi.mocked(getHoldingQuote).mockImplementation(async ({ symbol, market }) => ({
    price: 100,
    previousClose: 99,
    currency: market === 'US' ? 'USD' : 'TWD',
    name: `name-${symbol}`,
  }))
  vi.mocked(assertCloudWriteReady).mockReset()
  await db.watchlist.clear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('addWatchlistItem', () => {
  it('stores the stock with its first quote', async () => {
    const { id } = await addWatchlistItem({ market: 'TW', symbol: '2330' })
    expect(await db.watchlist.get(id)).toMatchObject({
      remoteKey: 'TW_2330',
      market: 'TW',
      symbol: '2330',
      name: 'name-2330',
      latestPrice: 100,
      previousClose: 99,
      currency: 'TWD',
      priceUpdatedAt: new Date(clock).toISOString(),
      deletedAt: null,
    })
  })

  it('normalizes the symbol before checking duplicates', async () => {
    await addWatchlistItem({ market: 'TW', symbol: '2330.tw' })
    await expect(addWatchlistItem({ market: 'TW', symbol: ' 2330 ' })).rejects.toThrow('已在觀察清單')
    await addWatchlistItem({ market: 'US', symbol: ' nvda ' })
    expect((await db.watchlist.toArray()).map((row) => row.remoteKey).sort()).toEqual(['TW_2330', 'US_NVDA'])
  })

  it('rejects a symbol without a quote and stores nothing', async () => {
    vi.mocked(getHoldingQuote).mockRejectedValue(new Error('No quote found for symbol: NOPE'))
    await expect(addWatchlistItem({ market: 'US', symbol: 'NOPE' })).rejects.toThrow('查不到這個代號的報價')
    expect(await db.watchlist.toArray()).toEqual([])
  })

  it('rejects an empty symbol', async () => {
    await expect(addWatchlistItem({ market: 'TW', symbol: '  ' })).rejects.toThrow('請輸入代號')
    expect(getHoldingQuote).not.toHaveBeenCalled()
  })

  it('refuses to write when signed out', async () => {
    vi.mocked(assertCloudWriteReady).mockImplementation(() => {
      throw new Error('請先登入')
    })
    await expect(addWatchlistItem({ market: 'TW', symbol: '2330' })).rejects.toThrow('請先登入')
  })

  it('revives a removed item at the end of its group', async () => {
    const first = await addWatchlistItem({ market: 'TW', symbol: '2330' })
    tick()
    await addWatchlistItem({ market: 'TW', symbol: '2454' })
    tick()
    await removeWatchlistItem({ id: first.id })
    tick()
    const again = await addWatchlistItem({ market: 'TW', symbol: '2330' })
    expect(again.id).toBe(first.id)
    expect(await db.watchlist.toArray()).toHaveLength(2)
    const view = await getWatchlistView()
    expect(view.rows.map((row) => row.symbol)).toEqual(['2454', '2330'])
  })
})

describe('removeWatchlistItem', () => {
  it('soft-deletes so the view no longer lists it', async () => {
    const { id } = await addWatchlistItem({ market: 'TW', symbol: '2330' })
    tick()
    await removeWatchlistItem({ id })
    expect((await db.watchlist.get(id)).deletedAt).toBe(new Date(clock).toISOString())
    expect((await getWatchlistView()).rows).toEqual([])
  })

  it('rejects an unknown id', async () => {
    await expect(removeWatchlistItem({ id: 999 })).rejects.toThrow('找不到這支觀察股票')
  })
})
```

- [ ] **Step 6: 跑測試確認失敗**

Run: `npx vitest run src/services/portfolioService.watchlist.test.js`
Expected: FAIL（`addWatchlistItem` 未 export）

- [ ] **Step 7: 實作 service**

`src/services/portfolioService.js`：
1. import 區加：
   ```js
   import {
     WATCHLIST_DUPLICATE_MESSAGE,
     WATCHLIST_NOT_FOUND_MESSAGE,
     buildWatchlistRemoteKey,
     buildWatchlistView,
     watchlistQuoteFields,
   } from "../utils/watchlist";
   ```
2. 在 `getActiveHoldings`（`:566`）之後加：
   ```js
   const getActiveWatchlist = async () => {
     const items = await db.watchlist.toArray();
     return items.filter((item) => !isDeleted(item));
   };
   ```
3. 在 `removeSavingsGoal` 之後加：
   ```js
   // A stock to research without holding it. Adding fetches one quote, which
   // checks the symbol exists and gives its name; a removed one comes back
   // on the same cloud doc (its key is market + symbol).
   export const addWatchlistItem = async ({ market, symbol }) => {
     ensureCloudWritable();
     const normalizedMarket = market === MARKET.US ? MARKET.US : MARKET.TW;
     const normalizedSymbol = normalizeSymbol(symbol, normalizedMarket);
     if (!normalizedSymbol) {
       throw new Error("請輸入代號");
     }
     const remoteKey = buildWatchlistRemoteKey({
       market: normalizedMarket,
       symbol: normalizedSymbol,
     });
     const existing = await db.watchlist.where("remoteKey").equals(remoteKey).first();
     if (existing && !isDeleted(existing)) {
       throw new Error(WATCHLIST_DUPLICATE_MESSAGE);
     }

     let quote;
     try {
       quote = await getHoldingQuote({ market: normalizedMarket, symbol: normalizedSymbol });
     } catch (error) {
       console.warn(`[addWatchlistItem] ${remoteKey} quote failed`, error);
       throw new Error(WATCHLIST_NOT_FOUND_MESSAGE);
     }

     const nowIso = getNowIso();
     await mirrorToCloud(CLOUD_COLLECTION.WATCHLIST, {
       ...(existing ?? {}),
       remoteKey,
       market: normalizedMarket,
       symbol: normalizedSymbol,
       name: quote.name || normalizedSymbol,
       ...watchlistQuoteFields(quote, nowIso),
       createdAt: nowIso,
       updatedAt: nowIso,
       deletedAt: null,
       syncState: SYNC_PENDING,
     });
     const saved = await db.watchlist.where("remoteKey").equals(remoteKey).first();
     return { id: requireLocalId(saved, "觀察股票") };
   };

   export const removeWatchlistItem = async ({ id }) => {
     ensureCloudWritable();
     const existing = await db.watchlist.get(id);
     if (!existing || isDeleted(existing)) {
       throw new Error("找不到這支觀察股票");
     }
     const nowIso = getNowIso();
     await mirrorToCloud(CLOUD_COLLECTION.WATCHLIST, {
       ...existing,
       deletedAt: nowIso,
       updatedAt: nowIso,
       syncState: SYNC_PENDING,
     });
   };

   export const getWatchlistView = async () =>
     buildWatchlistView(await db.watchlist.toArray());
   ```
   （`MARKET`、`normalizeSymbol`、`requireLocalId`、`SYNC_PENDING`、`CLOUD_COLLECTION`、`getHoldingQuote` 都已在檔內可用；以 `grep -n "requireLocalId = \|const requireLocalId" src/services/portfolioService.js` 確認 `requireLocalId` 的簽章為 `(row, label)`。）

- [ ] **Step 8: 跑測試確認通過**

Run: `npx vitest run src/services/portfolioService.watchlist.test.js`
Expected: PASS

- [ ] **Step 9: 全部測試與 lint**

Run: `npm test && npm run lint`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add src/utils/watchlist.js src/utils/watchlist.test.js src/services/portfolioService.js src/services/portfolioService.watchlist.test.js
git commit -m "Add, remove and list watched stocks

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 觀察清單的報價刷新（獨立刷新＋併入「更新價格」）

**Files:**
- Modify: `src/services/portfolioService.js`（`refreshPrices`、新增 `refreshWatchlistPrices`）
- Modify: `src/services/portfolioService.refreshPrices.test.js`
- Modify: `src/services/portfolioService.watchlist.test.js`

**Interfaces:**
- Consumes: `fetchQuotes`、`quoteTargetKey`（Task 2）；`getActiveWatchlist`、`watchlistQuoteFields`（Task 3）。
- Produces:
  - `refreshWatchlistPrices() => Promise<{ updatedCount: number, targetCount: number, failed: Array<{ symbol, market, reason }>, lastUpdatedAt: string|null }>`；全部失敗時 reject `全部 N 檔報價都抓取失敗：<reason>`。
  - `refreshPrices({ market })` 回傳形狀不變，但 `targetCount` / `updatedCount` / `failed` 改以「持股＋觀察項目依 `market:symbol` 去重後的標的」計算。

- [ ] **Step 1: 寫 `refreshWatchlistPrices` 的失敗測試**

`src/services/portfolioService.watchlist.test.js`：import 加 `refreshWatchlistPrices`，並在既有 `vi.mock` 之後加 `vi.mock('./priceProviders/twseDailyProvider', () => ({ getTwseDailyQuotes: vi.fn(async () => { throw new Error('down') }) }))`（讓台股都走逐檔 `getHoldingQuote`）。檔尾加：

```js
describe('refreshWatchlistPrices', () => {
  it('updates each watched stock with its new quote', async () => {
    const { id } = await addWatchlistItem({ market: 'US', symbol: 'NVDA' })
    tick()
    vi.mocked(getHoldingQuote).mockResolvedValue({ price: 120, previousClose: 118, currency: 'USD', name: 'NVIDIA' })
    const result = await refreshWatchlistPrices()
    expect(result).toMatchObject({ updatedCount: 1, targetCount: 1, failed: [] })
    expect(await db.watchlist.get(id)).toMatchObject({
      latestPrice: 120,
      previousClose: 118,
      name: 'NVIDIA',
      priceUpdatedAt: new Date(clock).toISOString(),
    })
  })

  it('keeps the old price for a stock whose quote failed', async () => {
    const a = await addWatchlistItem({ market: 'US', symbol: 'NVDA' })
    const b = await addWatchlistItem({ market: 'US', symbol: 'AAPL' })
    const before = await db.watchlist.get(b.id)
    tick()
    vi.mocked(getHoldingQuote).mockImplementation(async ({ symbol }) => {
      if (symbol === 'AAPL') throw new Error('timeout')
      return { price: 120, currency: 'USD', name: 'NVIDIA' }
    })
    const result = await refreshWatchlistPrices()
    expect(result.failed).toEqual([{ symbol: 'AAPL', market: 'US', reason: 'timeout' }])
    expect((await db.watchlist.get(a.id)).latestPrice).toBe(120)
    expect(await db.watchlist.get(b.id)).toMatchObject({
      latestPrice: before.latestPrice,
      priceUpdatedAt: before.priceUpdatedAt,
    })
  })

  it('throws when every quote fails', async () => {
    await addWatchlistItem({ market: 'US', symbol: 'NVDA' })
    vi.mocked(getHoldingQuote).mockRejectedValue(new Error('timeout'))
    await expect(refreshWatchlistPrices()).rejects.toThrow('全部 1 檔報價都抓取失敗：timeout')
  })

  it('does nothing for an empty list', async () => {
    await expect(refreshWatchlistPrices()).resolves.toMatchObject({ updatedCount: 0, targetCount: 0 })
    expect(getHoldingQuote).not.toHaveBeenCalled()
  })

  it('does not revive an item removed while quotes were in flight', async () => {
    const { id } = await addWatchlistItem({ market: 'US', symbol: 'NVDA' })
    tick()
    vi.mocked(getHoldingQuote).mockImplementation(async () => {
      await removeWatchlistItem({ id })
      return { price: 120, currency: 'USD', name: 'NVIDIA' }
    })
    await refreshWatchlistPrices()
    expect((await db.watchlist.get(id)).deletedAt).not.toBeNull()
  })
})
```

- [ ] **Step 2: 寫 `refreshPrices` 合併的失敗測試**

`src/services/portfolioService.refreshPrices.test.js`：`beforeEach` 加 `await db.watchlist.clear()`；檔尾加：

```js
const addWatched = (market, symbol) =>
  db.watchlist.add({
    remoteKey: `${market}_${symbol}`,
    market,
    symbol,
    name: symbol,
    latestPrice: null,
    previousClose: null,
    currency: market === 'US' ? 'USD' : 'TWD',
    priceUpdatedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
  })

describe('refreshPrices with the watchlist', () => {
  it('fetches a symbol held and watched only once', async () => {
    const holdingId = await addHolding('US', 'NVDA')
    const watchId = await addWatched('US', 'NVDA')
    vi.mocked(getHoldingQuote).mockResolvedValue(usQuote(100))
    const result = await refreshPrices({ market: 'ALL' })
    expect(getHoldingQuote).toHaveBeenCalledTimes(1)
    expect((await latestPriceOf(holdingId)).price).toBe(100)
    expect((await db.watchlist.get(watchId)).latestPrice).toBe(100)
    expect(result).toMatchObject({ updatedCount: 1, targetCount: 1 })
  })

  it('refreshes the watchlist when there are no holdings', async () => {
    const watchId = await addWatched('US', 'NVDA')
    vi.mocked(getHoldingQuote).mockResolvedValue(usQuote(100))
    const result = await refreshPrices({ market: 'ALL' })
    expect(result).toMatchObject({ updatedCount: 1, targetCount: 1 })
    expect((await db.watchlist.get(watchId)).latestPrice).toBe(100)
    expect(await db.price_snapshots.toArray()).toEqual([])
  })

  it('only refreshes watched stocks of the chosen market', async () => {
    const twId = await addWatched('TW', '2330')
    await addWatched('US', 'NVDA')
    vi.mocked(getTwseDailyQuotes).mockResolvedValue({
      date: '20261013',
      quotes: { 2330: twQuote(1000) },
      listedSymbols: new Set(['2330']),
    })
    await refreshPrices({ market: 'TW' })
    expect(getHoldingQuote).not.toHaveBeenCalled()
    expect((await db.watchlist.get(twId)).latestPrice).toBe(1000)
  })

  it('lists a failed watched stock once in failed', async () => {
    await addHolding('US', 'NVDA')
    await addWatched('US', 'NOPE')
    vi.mocked(getHoldingQuote).mockImplementation(async ({ symbol }) => {
      if (symbol === 'NOPE') throw new Error('No quote found')
      return usQuote(100)
    })
    const result = await refreshPrices({ market: 'US' })
    expect(result.failed).toEqual([{ symbol: 'NOPE', market: 'US', reason: 'No quote found' }])
    expect(result).toMatchObject({ updatedCount: 1, targetCount: 2 })
  })

  it('does not fetch the FX rate for watched US stocks alone', async () => {
    const { getUsdTwdRate } = await import('./priceProviders/fxProvider')
    vi.mocked(getUsdTwdRate).mockClear()
    await addWatched('US', 'NVDA')
    vi.mocked(getHoldingQuote).mockResolvedValue(usQuote(100))
    await refreshPrices({ market: 'US' })
    expect(getUsdTwdRate).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: 跑測試確認失敗**

Run: `npx vitest run src/services/portfolioService.watchlist.test.js src/services/portfolioService.refreshPrices.test.js`
Expected: FAIL（`refreshWatchlistPrices` 未 export；合併測試失敗）

- [ ] **Step 4: 實作**

`src/services/portfolioService.js`：

1. 在 `getActiveWatchlist` 之後加：
   ```js
   const toQuoteTarget = (market, symbol, companyName) => ({ market, symbol, companyName });

   // Collects the per-symbol outcome of a fetchQuotes map once, however many
   // holdings / watched stocks share the symbol.
   const summarizeQuotes = (quotes) => {
     const failed = [];
     let updatedCount = 0;
     for (const [key, { quote, error }] of quotes) {
       if (quote) {
         updatedCount += 1;
         continue;
       }
       const [market, symbol] = key.split(":");
       console.warn(`[quotes] ${key} failed`, error);
       failed.push({
         symbol,
         market,
         reason: error instanceof Error ? error.message : String(error),
       });
     }
     return { updatedCount, failed, targetCount: quotes.size };
   };

   // Writes each watched stock's new quote. Re-reads the row first: one
   // removed while the quotes were in flight (here or on another device)
   // stays removed.
   const applyWatchlistQuotes = async (items, quotes, nowIso) => {
     for (const item of items) {
       const result = quotes.get(quoteTargetKey(item));
       if (!result?.quote) continue;
       const current = await db.watchlist.get(item.id);
       if (!current || isDeleted(current)) continue;
       await mirrorToCloud(CLOUD_COLLECTION.WATCHLIST, {
         ...current,
         name: result.quote.name || current.name,
         ...watchlistQuoteFields(result.quote, nowIso),
         updatedAt: nowIso,
         syncState: SYNC_PENDING,
       });
     }
   };

   const allQuotesFailedError = (failed) =>
     new Error(`全部 ${failed.length} 檔報價都抓取失敗：${failed[0]?.reason ?? "未知錯誤"}`);
   ```

2. 在 `refreshPrices` 之前加：
   ```js
   // 研究 tab: only the watched stocks — no price_snapshots, no sync_meta.
   export const refreshWatchlistPrices = async () => {
     ensureCloudWritable();
     const items = await getActiveWatchlist();
     if (items.length === 0) {
       return { updatedCount: 0, targetCount: 0, failed: [], lastUpdatedAt: null };
     }
     const quotes = await fetchQuotes(
       items.map((item) => toQuoteTarget(item.market, item.symbol, item.name)),
     );
     const summary = summarizeQuotes(quotes);
     if (summary.updatedCount === 0) {
       throw allQuotesFailedError(summary.failed);
     }
     const nowIso = getNowIso();
     await applyWatchlistQuotes(items, quotes, nowIso);
     return { ...summary, lastUpdatedAt: nowIso };
   };
   ```

3. 改寫 `refreshPrices`：
   - `const targetHoldings = ...` 之後加：
     ```js
     const watchlist = await getActiveWatchlist();
     const targetWatchlist =
       market === "ALL" ? watchlist : watchlist.filter((item) => item.market === market);
     ```
   - 早退條件 `if (targetHoldings.length === 0)` 改為 `if (targetHoldings.length === 0 && targetWatchlist.length === 0)`。
   - `fetchQuotes` 呼叫改為：
     ```js
     const quotes = await fetchQuotes([
       ...targetHoldings.map((holding) =>
         toQuoteTarget(holding.market, holding.symbol, holding.companyName),
       ),
       ...targetWatchlist.map((item) => toQuoteTarget(item.market, item.symbol, item.name)),
     ]);
     const summary = summarizeQuotes(quotes);
     if (summary.updatedCount === 0) {
       throw allQuotesFailedError(summary.failed);
     }
     ```
   - 持股迴圈：移除迴圈內 `failed` 陣列的宣告與 `failed.push(...)` 及 `console.warn`，改為 `if (!quote) continue;`（`const { quote } = quotes.get(quoteTargetKey(holding));`）。
   - 刪除原本的 `if (snapshots.length === 0) { throw ... }` 區塊（已由上面的 `summary` 檢查取代）；保留其後寫入 snapshots 的迴圈。
   - 在寫入 snapshots 迴圈之後、寫 `SYNC_META` 之前加：
     ```js
     await applyWatchlistQuotes(targetWatchlist, quotes, nowIso);
     ```
   - 回傳改為：
     ```js
     return {
       updatedCount: summary.updatedCount,
       targetCount: summary.targetCount,
       failed: summary.failed,
       market,
       lastUpdatedAt: nowIso,
     };
     ```
   - 抓匯率的條件 `if (usHoldings.length > 0)` 不變（只看持股）。

- [ ] **Step 5: 跑測試確認通過**

Run: `npx vitest run src/services/portfolioService.watchlist.test.js src/services/portfolioService.refreshPrices.test.js src/services/quoteBatch.test.js`
Expected: PASS（Task 2 的 refreshPrices 測試也必須全數維持綠燈）

- [ ] **Step 6: 全部測試與 lint**

Run: `npm test && npm run lint`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/services/portfolioService.js src/services/portfolioService.refreshPrices.test.js src/services/portfolioService.watchlist.test.js
git commit -m "Refresh watched stocks with 更新價格 and on their own

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: 拆出 `StockSheetShell` 與 `StockResearchContent`

純重構：持股 sheet 畫面與行為不變，既有 `StockDetailSheet.test.jsx` 一行不改必須通過。

**Files:**
- Create: `src/components/stockDetail/StockSheetShell.jsx`
- Create: `src/components/stockDetail/StockResearchContent.jsx`
- Modify: `src/components/StockDetailSheet.jsx`（整檔改寫）
- Test: `src/components/StockDetailSheet.test.jsx`（不修改）

**Interfaces:**
- Produces:
  - `StockSheetShell({ open, isMobile, name, symbol, onClose, children })`
  - `StockResearchContent({ market, symbol, name, latestPrice, currency, isStock, isMobile, disabled, basis, onBasisChange })` — `basis` 由父層持有（Drawer `destroyOnHidden` 會在買賣表單蓋上時卸載內容，父層保留才不會重置）。

- [ ] **Step 1: 確認既有測試是綠的**

Run: `npx vitest run src/components/StockDetailSheet.test.jsx`
Expected: PASS

- [ ] **Step 2: 建立 `StockSheetShell.jsx`**

```jsx
import { Drawer, Typography } from "antd";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";

const { Text } = Typography;

// The stock detail frame shared by holdings and watched stocks: a bottom
// sheet on mobile, a right-hand drawer on desktop, titled name + symbol.
function StockSheetShell({ open, isMobile, name, symbol, onClose, children }) {
  useBodyScrollLock(Boolean(open) && isMobile);

  const title = (
    <div className="stock-detail-title">
      <span>{name || symbol}</span>
      <Text type="secondary">{symbol}</Text>
    </div>
  );

  return isMobile ? (
    <Drawer
      placement="bottom"
      title={title}
      open={open}
      onClose={onClose}
      size="90vh"
      destroyOnHidden
      className="form-bottom-sheet stock-detail-sheet"
    >
      {children}
    </Drawer>
  ) : (
    <Drawer
      placement="right"
      title={title}
      open={open}
      onClose={onClose}
      size={520}
      destroyOnHidden
      className="stock-detail-sheet"
    >
      {children}
    </Drawer>
  );
}

export default StockSheetShell;
```

- [ ] **Step 3: 建立 `StockResearchContent.jsx`**

把 `StockDetailSheet.jsx` 的 `SOURCE_LABELS`、`describeYoy`、`MonthlyRevenueRow` 以及 body 的組裝原封搬過來：

```jsx
import { useState } from "react";
import dayjs from "dayjs";
import { Alert, Button, Skeleton, Typography } from "antd";
import { NavArrowRight } from "iconoir-react";
import useStockFundamentals from "../../hooks/useStockFundamentals";
import useValuationSettings from "../../hooks/useValuationSettings";
import { formatDateTime } from "../../utils/formatters";
import { formatYi } from "../../utils/incomeAssumptionForm";
import { latestMonthRevenue, parseQuarterKey } from "../../utils/incomeModel";
import { buildRiverData } from "../../utils/peRiver";
import { buildValuationModel, formatQuarter } from "../../utils/valuation";
import EpsTrendChart from "./EpsTrendChart";
import PeHistoryChart from "./PeHistoryChart";
import PeRiverChart from "./PeRiverChart";
import ValuationAssumptions from "./ValuationAssumptions";
import ValuationCard from "./ValuationCard";

const { Text } = Typography;

const SOURCE_LABELS = { TW: "TWSE / 公開資訊觀測站", US: "Finnhub" };

// (describeYoy 與 MonthlyRevenueRow：從 StockDetailSheet.jsx 原封複製，含註解)

// One stock's research: EPS × P/E valuation, latest monthly revenue, the
// P/E river (or history), EPS trend and the data source. Knows nothing of
// holdings — the holding sheet and the watchlist sheet both use it.
function StockResearchContent({
  market,
  symbol,
  name,
  latestPrice,
  currency,
  isStock,
  isMobile,
  disabled,
  basis,
  onBasisChange,
}) {
  const fundamentals = useStockFundamentals(market, symbol);
  const { settings, save } = useValuationSettings(market, symbol);
  // null when closed; otherwise the 估價假設 section to open at.
  const [assumptionsFocus, setAssumptionsFocus] = useState(null);

  const todayIso = dayjs().format("YYYY-MM-DD");
  const data = fundamentals.status === "ready" ? fundamentals.data : null;
  const buildModel = (nextSettings) =>
    buildValuationModel({ fundamentals: data, settings: nextSettings, price: latestPrice, basis, todayIso });
  const model = data ? buildModel(settings) : null;
  const latestRevenue = data?.company ? latestMonthRevenue(data.company.monthlyRevenue) : null;

  // (以下的 if / else if / else 分支從 StockDetailSheet.jsx 的 `let body; ...`
  //  原封搬過來並改成 return，只做這些替換：
  //    holding.market       → market
  //    holding.latestPrice  → latestPrice
  //    holding.companyName || holding.symbol → name || symbol
  //    setBasis             → onBasisChange
  //  `currency`、`isStock`、`isMobile`、`disabled` 直接用 props。)
}

export default StockResearchContent;
```

實作時把 `StockDetailSheet.jsx:79-163` 的四個分支逐字搬入，把 `body = (...)` 改成 `return (...)`，並依上面註解的對照表替換變數。不得留下任何 `holding.` 字樣（以 `grep -n "holding\." src/components/stockDetail/StockResearchContent.jsx` 確認無輸出）。

- [ ] **Step 4: 改寫 `StockDetailSheet.jsx`**

整檔改為：

```jsx
import { useState } from "react";
import { NavArrowRight } from "iconoir-react";
import HoldingPosition from "./stockDetail/HoldingPosition";
import StockResearchContent from "./stockDetail/StockResearchContent";
import StockSheetShell from "./stockDetail/StockSheetShell";

// One holding (one stock, one holder): its market value, position and
// cost, buy / sell, then the stock's research, then managing the holding.
// The parent keys this by holding so basis / fold state reset when another
// opens; basis lives here so it survives the buy / sell form hiding the sheet.
function StockDetailSheet({ open, holding, isMobile, disabled, onClose, onAction }) {
  const [basis, setBasis] = useState("ttm");

  if (!holding) return null;

  const currency = holding.latestCurrency || (holding.market === "US" ? "USD" : "TWD");

  return (
    <StockSheetShell
      open={open}
      isMobile={isMobile}
      name={holding.companyName}
      symbol={holding.symbol}
      onClose={onClose}
    >
      <HoldingPosition holding={holding} disabled={disabled} onAction={onAction} />
      <StockResearchContent
        market={holding.market}
        symbol={holding.symbol}
        name={holding.companyName}
        latestPrice={holding.latestPrice}
        currency={currency}
        isStock={(holding.assetTag || "STOCK") === "STOCK"}
        isMobile={isMobile}
        disabled={disabled}
        basis={basis}
        onBasisChange={setBasis}
      />
      {/* Rarely used, so a quiet list rather than buttons. */}
      <section className="stock-detail-section" aria-label="管理這筆持股">
        <h3 className="stock-detail-heading">管理這筆持股</h3>
        <div className="stock-detail-manage">
          <button
            type="button"
            className="stock-detail-manage-row"
            disabled={disabled}
            onClick={() => onAction?.("edit")}
          >
            <span>編輯分類與持有人</span>
            <NavArrowRight aria-hidden />
          </button>
          <button
            type="button"
            className="stock-detail-manage-row"
            disabled={disabled}
            onClick={() => onAction?.("calibrate")}
          >
            <span>校正股數與成本</span>
            <NavArrowRight aria-hidden />
          </button>
          <button
            type="button"
            className="stock-detail-manage-row stock-detail-manage-row--danger"
            disabled={disabled}
            onClick={() => onAction?.("remove")}
          >
            <span>移除持股</span>
          </button>
        </div>
      </section>
    </StockSheetShell>
  );
}

export default StockDetailSheet;
```

- [ ] **Step 5: 跑既有測試確認不變**

Run: `npx vitest run src/components/StockDetailSheet.test.jsx src/components/stockDetail`
Expected: PASS（測試檔不得修改；`vi.mock('../hooks/useStockFundamentals')` 以模組路徑 mock，搬到子資料夾後仍生效）

- [ ] **Step 6: 全部測試與 lint**

Run: `npm test && npm run lint`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/components/StockDetailSheet.jsx src/components/stockDetail/StockSheetShell.jsx src/components/stockDetail/StockResearchContent.jsx
git commit -m "Split the stock sheet into a shell and research content

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: `WatchlistDetailSheet`

**Files:**
- Create: `src/components/WatchlistDetailSheet.jsx`
- Create: `src/components/WatchlistDetailSheet.test.jsx`
- Modify: `src/App.css`（在 `.stock-detail-change--down` 規則之後加報價列樣式）

**Interfaces:**
- Consumes: `StockSheetShell`、`StockResearchContent`（Task 5）；`WatchlistRow`（Task 3）。
- Produces: `WatchlistDetailSheet({ open, item: WatchlistRow|null, isMobile, disabled, onClose, onRemove: () => void })`

- [ ] **Step 1: 寫失敗測試**

建立 `src/components/WatchlistDetailSheet.test.jsx`：

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

vi.mock('../hooks/useStockFundamentals', () => ({ default: vi.fn() }))
vi.mock('../hooks/useValuationSettings', () => ({ default: vi.fn() }))

import useStockFundamentals from '../hooks/useStockFundamentals'
import useValuationSettings from '../hooks/useValuationSettings'
import WatchlistDetailSheet from './WatchlistDetailSheet'
import { EMPTY_VALUATION_SETTINGS } from '../utils/valuation'
import { TW_FUNDAMENTALS } from '../utils/incomeModel.fixture'

const item = {
  id: 7,
  remoteKey: 'TW_2330',
  market: 'TW',
  symbol: '2330',
  name: '台積電',
  latestPrice: 1010,
  previousClose: 1000,
  currency: 'TWD',
  priceUpdatedAt: '2026-10-13T06:00:00.000Z',
  createdAt: '2026-10-13T05:00:00.000Z',
  change: 10,
  changePct: 0.01,
}

beforeEach(() => {
  useValuationSettings.mockReturnValue({ settings: EMPTY_VALUATION_SETTINGS, save: vi.fn() })
  useStockFundamentals.mockReturnValue({ status: 'ready', data: TW_FUNDAMENTALS, reload: vi.fn() })
})

const renderSheet = (props = {}) =>
  render(
    <WatchlistDetailSheet open item={item} isMobile disabled={false} onClose={() => {}} onRemove={vi.fn()} {...props} />,
  )

describe('WatchlistDetailSheet', () => {
  it('shows the quote and the research, without any holding content', () => {
    renderSheet()
    expect(screen.getByText('台積電')).toBeInTheDocument()
    expect(screen.getByText('$1,010.00')).toBeInTheDocument()
    expect(screen.getByText('+$10.00（+1.0%）')).toBeInTheDocument()
    expect(screen.getByText(/資料來源：TWSE/)).toBeInTheDocument()
    expect(screen.queryByText(/的持股/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '買進' })).not.toBeInTheDocument()
    expect(screen.queryByText('管理這筆持股')).not.toBeInTheDocument()
  })

  it('says when there is no quote yet', () => {
    renderSheet({ item: { ...item, latestPrice: null, change: null, changePct: null, priceUpdatedAt: null } })
    expect(screen.getByText('尚未取得報價')).toBeInTheDocument()
  })

  it('asks to remove from the watchlist', () => {
    const onRemove = vi.fn()
    renderSheet({ onRemove })
    fireEvent.click(screen.getByRole('button', { name: '從觀察清單移除' }))
    expect(onRemove).toHaveBeenCalledTimes(1)
  })

  it('disables removing when writes are disabled', () => {
    renderSheet({ disabled: true })
    expect(screen.getByRole('button', { name: '從觀察清單移除' })).toBeDisabled()
  })

  it('renders nothing without an item', () => {
    const { container } = renderSheet({ item: null })
    expect(container).toBeEmptyDOMElement()
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/components/WatchlistDetailSheet.test.jsx`
Expected: FAIL（找不到模組）

- [ ] **Step 3: 實作**

建立 `src/components/WatchlistDetailSheet.jsx`：

```jsx
import { useState } from "react";
import { formatDateTime, formatPrice } from "../utils/formatters";
import { formatSignedPercent } from "../utils/stockDetail";
import StockResearchContent from "./stockDetail/StockResearchContent";
import StockSheetShell from "./stockDetail/StockSheetShell";

const changeClass = (value) =>
  value >= 0 ? "stock-detail-change--up" : "stock-detail-change--down";

const formatSignedPrice = (value, currency) =>
  `${value >= 0 ? "+" : "−"}${formatPrice(Math.abs(value), currency)}`;

// A watched stock: its last quote, then the same research as a holding —
// no position, no buy / sell. The parent keys this by item id.
function WatchlistDetailSheet({ open, item, isMobile, disabled, onClose, onRemove }) {
  const [basis, setBasis] = useState("ttm");

  if (!item) return null;

  return (
    <StockSheetShell open={open} isMobile={isMobile} name={item.name} symbol={item.symbol} onClose={onClose}>
      <section className="stock-detail-position watchlist-quote" aria-label="報價">
        <span className="stock-detail-position-label">現價</span>
        <span className="watchlist-quote-price">{formatPrice(item.latestPrice ?? NaN, item.currency)}</span>
        {Number.isFinite(item.change) && (
          <span className={changeClass(item.change)}>
            {`${formatSignedPrice(item.change, item.currency)}（${formatSignedPercent(item.changePct)}）`}
          </span>
        )}
        <span className="watchlist-quote-time">
          {item.priceUpdatedAt ? `更新於 ${formatDateTime(item.priceUpdatedAt)}` : "尚未取得報價"}
        </span>
      </section>
      <StockResearchContent
        market={item.market}
        symbol={item.symbol}
        name={item.name}
        latestPrice={item.latestPrice}
        currency={item.currency}
        isStock
        isMobile={isMobile}
        disabled={disabled}
        basis={basis}
        onBasisChange={setBasis}
      />
      <section className="stock-detail-section" aria-label="管理觀察">
        <h3 className="stock-detail-heading">管理</h3>
        <div className="stock-detail-manage">
          <button
            type="button"
            className="stock-detail-manage-row stock-detail-manage-row--danger"
            disabled={disabled}
            onClick={onRemove}
          >
            <span>從觀察清單移除</span>
          </button>
        </div>
      </section>
    </StockSheetShell>
  );
}

export default WatchlistDetailSheet;
```

`src/App.css` 在 `.stock-detail-change--down { ... }` 之後加：

```css
/* 觀察 sheet: the last quote in place of a holding's position. */
.watchlist-quote-price {
  font-size: var(--fs-title);
  font-weight: 700;
  color: var(--c-ink);
  font-variant-numeric: tabular-nums;
}

.watchlist-quote-time {
  font-size: var(--fs-caption);
  color: var(--c-muted);
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/components/WatchlistDetailSheet.test.jsx`
Expected: PASS。若 `'+$10.00（+1.0%）'` 的格式與 `formatPrice` 實際輸出不同（例如 `$10.00` 小數位），以實際輸出修正**測試字串**，不改 `formatPrice`。

- [ ] **Step 5: 全部測試與 lint**

Run: `npm test && npm run lint`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/WatchlistDetailSheet.jsx src/components/WatchlistDetailSheet.test.jsx src/App.css
git commit -m "Add the watched-stock sheet with the quote and research only

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: `useWatchlist` hook

**Files:**
- Create: `src/hooks/useWatchlist.js`
- Create: `src/hooks/useWatchlist.test.jsx`

**Interfaces:**
- Consumes: `getWatchlistView`、`refreshWatchlistPrices`（Task 3、4）；`shouldAutoRefreshWatchlist`（Task 3）；`CLOUD_SYNC_UPDATED_EVENT`（`cloudSyncService`）。
- Produces: `useWatchlist({ enabled: boolean, autoRefresh: boolean })` 回傳：
  ```
  {
    view: { rows, groups, lastUpdatedAt },
    loaded: boolean,
    reload: () => Promise<void>,
    refreshing: boolean,
    refreshFailed: boolean,
    refresh: () => Promise<result>,      // 失敗時設 refreshFailed 並 rethrow
    selectedItem: WatchlistRow|null,
    openItem: (id) => void,
    closeItem: () => void,
  }
  ```
  - `enabled`：已登入且資料已載入；false 時不讀資料。
  - `autoRefresh`：研究 tab 為作用中、可寫入、且資產頁沒有在刷新。每次由 false 變 true 至多自動刷新一次（`loaded` 之後、`shouldAutoRefreshWatchlist` 為真時）。
  - `selectedItem` 在該項目從 view 消失（被刪除，含其他裝置）時自動變回 `null`。

- [ ] **Step 1: 寫失敗測試**

建立 `src/hooks/useWatchlist.test.jsx`：

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'

vi.mock('../services/portfolioService', () => ({
  getWatchlistView: vi.fn(),
  refreshWatchlistPrices: vi.fn(),
}))

import { getWatchlistView, refreshWatchlistPrices } from '../services/portfolioService'
import { CLOUD_SYNC_UPDATED_EVENT } from '../services/firebase/cloudSyncService'
import { buildWatchlistView } from '../utils/watchlist'
import useWatchlist from './useWatchlist'

const fresh = new Date().toISOString()
const row = (id, priceUpdatedAt = fresh) => ({
  id,
  remoteKey: `TW_${id}`,
  market: 'TW',
  symbol: String(id),
  name: `S${id}`,
  latestPrice: 10,
  previousClose: 9,
  currency: 'TWD',
  priceUpdatedAt,
  createdAt: `2026-10-13T0${id}:00:00.000Z`,
  updatedAt: fresh,
  deletedAt: null,
})

beforeEach(() => {
  vi.mocked(getWatchlistView).mockReset()
  vi.mocked(refreshWatchlistPrices).mockReset()
  vi.mocked(refreshWatchlistPrices).mockResolvedValue({ updatedCount: 1, targetCount: 1, failed: [] })
})

describe('useWatchlist', () => {
  it('loads the view when enabled and reloads on cloud updates', async () => {
    vi.mocked(getWatchlistView).mockResolvedValue(buildWatchlistView([row(1)]))
    const { result } = renderHook(() => useWatchlist({ enabled: true, autoRefresh: false }))
    await waitFor(() => expect(result.current.loaded).toBe(true))
    expect(result.current.view.rows).toHaveLength(1)

    vi.mocked(getWatchlistView).mockResolvedValue(buildWatchlistView([row(1), row(2)]))
    act(() => {
      window.dispatchEvent(new Event(CLOUD_SYNC_UPDATED_EVENT))
    })
    await waitFor(() => expect(result.current.view.rows).toHaveLength(2))
  })

  it('does not load while disabled', () => {
    renderHook(() => useWatchlist({ enabled: false, autoRefresh: false }))
    expect(getWatchlistView).not.toHaveBeenCalled()
  })

  it('auto-refreshes once per entry when prices are stale', async () => {
    vi.mocked(getWatchlistView).mockResolvedValue(buildWatchlistView([row(1, null)]))
    const { result, rerender } = renderHook((props) => useWatchlist(props), {
      initialProps: { enabled: true, autoRefresh: true },
    })
    await waitFor(() => expect(refreshWatchlistPrices).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(result.current.refreshing).toBe(false))

    rerender({ enabled: true, autoRefresh: true })
    expect(refreshWatchlistPrices).toHaveBeenCalledTimes(1)

    rerender({ enabled: true, autoRefresh: false })
    rerender({ enabled: true, autoRefresh: true })
    await waitFor(() => expect(refreshWatchlistPrices).toHaveBeenCalledTimes(2))
  })

  it('does not auto-refresh fresh prices', async () => {
    vi.mocked(getWatchlistView).mockResolvedValue(buildWatchlistView([row(1)]))
    const { result } = renderHook(() => useWatchlist({ enabled: true, autoRefresh: true }))
    await waitFor(() => expect(result.current.loaded).toBe(true))
    expect(refreshWatchlistPrices).not.toHaveBeenCalled()
  })

  it('marks a failed refresh and rethrows', async () => {
    vi.mocked(getWatchlistView).mockResolvedValue(buildWatchlistView([row(1)]))
    vi.mocked(refreshWatchlistPrices).mockRejectedValue(new Error('全部 1 檔報價都抓取失敗：x'))
    const { result } = renderHook(() => useWatchlist({ enabled: true, autoRefresh: false }))
    await waitFor(() => expect(result.current.loaded).toBe(true))
    await act(async () => {
      await expect(result.current.refresh()).rejects.toThrow('全部 1 檔')
    })
    expect(result.current.refreshFailed).toBe(true)
    expect(result.current.refreshing).toBe(false)
  })

  it('closes the selected item once it leaves the list', async () => {
    vi.mocked(getWatchlistView).mockResolvedValue(buildWatchlistView([row(1)]))
    const { result } = renderHook(() => useWatchlist({ enabled: true, autoRefresh: false }))
    await waitFor(() => expect(result.current.loaded).toBe(true))
    act(() => result.current.openItem(1))
    expect(result.current.selectedItem?.id).toBe(1)

    vi.mocked(getWatchlistView).mockResolvedValue(buildWatchlistView([]))
    await act(async () => {
      await result.current.reload()
    })
    expect(result.current.selectedItem).toBeNull()
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/hooks/useWatchlist.test.jsx`
Expected: FAIL（找不到模組）

- [ ] **Step 3: 實作**

建立 `src/hooks/useWatchlist.js`：

```js
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CLOUD_SYNC_UPDATED_EVENT } from '../services/firebase/cloudSyncService'
import { getWatchlistView, refreshWatchlistPrices } from '../services/portfolioService'
import { shouldAutoRefreshWatchlist } from '../utils/watchlist'

const EMPTY_VIEW = { rows: [], groups: [], lastUpdatedAt: null }

// The 研究 tab's watchlist: the view (reloaded on cloud sync, so another
// device's changes show up), refreshing its quotes, and the stock open in
// the sheet. Entering the tab refreshes once when a price is stale.
export default function useWatchlist({ enabled, autoRefresh }) {
  const [state, setState] = useState({ view: EMPTY_VIEW, loaded: false })
  const [refreshing, setRefreshing] = useState(false)
  const [refreshFailed, setRefreshFailed] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const autoAttemptedRef = useRef(false)

  const reload = useCallback(async () => {
    const view = await getWatchlistView()
    setState({ view, loaded: true })
  }, [])

  useEffect(() => {
    if (!enabled) return undefined
    let cancelled = false
    const load = () => {
      getWatchlistView().then((view) => {
        if (!cancelled) setState({ view, loaded: true })
      })
    }
    load()
    window.addEventListener(CLOUD_SYNC_UPDATED_EVENT, load)
    return () => {
      cancelled = true
      window.removeEventListener(CLOUD_SYNC_UPDATED_EVENT, load)
    }
  }, [enabled])

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const result = await refreshWatchlistPrices()
      setRefreshFailed(false)
      await reload()
      return result
    } catch (error) {
      setRefreshFailed(true)
      throw error
    } finally {
      setRefreshing(false)
    }
  }, [reload])

  useEffect(() => {
    if (!autoRefresh) {
      autoAttemptedRef.current = false
      return
    }
    if (!state.loaded || autoAttemptedRef.current) return
    autoAttemptedRef.current = true
    if (!shouldAutoRefreshWatchlist(state.view.rows, Date.now())) return
    // Failures only mark the timestamp (refreshFailed); no toast.
    refresh().catch((error) => console.warn('[watchlist] auto refresh failed', error))
  }, [autoRefresh, state, refresh])

  const selectedItem = useMemo(
    () => (selectedId === null ? null : state.view.rows.find((row) => row.id === selectedId) ?? null),
    [selectedId, state.view.rows],
  )
  if (selectedId !== null && state.loaded && selectedItem === null) {
    setSelectedId(null)
  }

  const openItem = useCallback((id) => setSelectedId(id), [])
  const closeItem = useCallback(() => setSelectedId(null), [])

  return {
    view: state.view,
    loaded: state.loaded,
    reload,
    refreshing,
    refreshFailed,
    refresh,
    selectedItem,
    openItem,
    closeItem,
  }
}
```

- [ ] **Step 4: 跑測試與 lint**

Run: `npx vitest run src/hooks/useWatchlist.test.jsx && npx eslint src/hooks/useWatchlist.js`
Expected: PASS、無 lint 錯誤。
若 `react-hooks/set-state-in-effect` 標記 auto refresh effect：把 `refresh()` 包進 `queueMicrotask(() => { refresh().catch(...) })`，使 `setRefreshing` 不在 effect 本體同步執行；不得用 disable 註解。

- [ ] **Step 5: 全部測試與 lint**

Run: `npm test && npm run lint`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useWatchlist.js src/hooks/useWatchlist.test.jsx
git commit -m "Add useWatchlist for the 研究 tab's list, refresh and selection

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: 研究頁元件 — `WatchlistSection` 與 `WatchlistForm`

**Files:**
- Create: `src/components/research/WatchlistSection.jsx` + `.test.jsx`
- Create: `src/components/research/WatchlistForm.jsx` + `.test.jsx`
- Modify: `src/App.css`（觀察清單列樣式，加在 `.cash-groups .mobile-swipe-row-side` 規則之後）

**Interfaces:**
- Consumes: `WatchlistRow`、`buildWatchlistView` 輸出（Task 3）；既有 `CollapsibleGroups`、`MobileSwipeRow`、`swipeDeleteAction`、`EmptyState`。
- Produces:
  - `WatchlistSection({ view, isMobile, disabled, refreshing, refreshFailed, onRefresh, onOpen: (id) => void, onRemove: (row) => void })`
  - `WatchlistForm({ formId, disabled, onSubmit: ({ market, symbol }) => Promise<void> })` — `onSubmit` reject 時，把 `error.message` 顯示在代號欄位。
  - `WATCHLIST_FORM_ID = "watchlist-form"`（從 `WatchlistForm.jsx` export）

- [ ] **Step 1: 寫 `WatchlistSection` 失敗測試**

建立 `src/components/research/WatchlistSection.test.jsx`：

```jsx
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import WatchlistSection from './WatchlistSection'
import { buildWatchlistView } from '../../utils/watchlist'

const item = (overrides) => ({
  id: 1,
  remoteKey: 'TW_2330',
  market: 'TW',
  symbol: '2330',
  name: '台積電',
  latestPrice: 1010,
  previousClose: 1000,
  currency: 'TWD',
  priceUpdatedAt: '2026-10-13T06:00:00.000Z',
  createdAt: '2026-10-13T05:00:00.000Z',
  deletedAt: null,
  ...overrides,
})

const view = buildWatchlistView([
  item({}),
  item({ id: 2, market: 'US', symbol: 'NVDA', remoteKey: 'US_NVDA', name: 'NVIDIA', currency: 'USD', latestPrice: 120, previousClose: 125 }),
])

const renderSection = (props = {}) =>
  render(
    <WatchlistSection
      view={view}
      isMobile
      disabled={false}
      refreshing={false}
      refreshFailed={false}
      onRefresh={vi.fn()}
      onOpen={vi.fn()}
      onRemove={vi.fn()}
      {...props}
    />,
  )

describe('WatchlistSection', () => {
  it('lists watched stocks grouped by market', () => {
    renderSection()
    expect(screen.getByText('觀察清單')).toBeInTheDocument()
    expect(screen.getByText('台股')).toBeInTheDocument()
    expect(screen.getByText('美股')).toBeInTheDocument()
    expect(screen.getByText('台積電')).toBeInTheDocument()
    expect(screen.getByText('+1.0%')).toBeInTheDocument()
    expect(screen.getByText('−4.0%')).toBeInTheDocument()
  })

  it('opens a stock when its row is tapped', () => {
    const onOpen = vi.fn()
    renderSection({ onOpen })
    fireEvent.click(screen.getByRole('button', { name: '台積電 2330，查看個股' }))
    expect(onOpen).toHaveBeenCalledWith(1)
  })

  it('shows the empty state', () => {
    renderSection({ view: buildWatchlistView([]) })
    expect(screen.getByText('還沒有觀察的股票')).toBeInTheDocument()
  })

  it('shows 更新失敗 after a failed refresh', () => {
    renderSection({ refreshFailed: true })
    expect(screen.getByText('更新失敗')).toBeInTheDocument()
  })

  it('refreshes from the header button', () => {
    const onRefresh = vi.fn()
    renderSection({ onRefresh })
    fireEvent.click(screen.getByRole('button', { name: '更新觀察清單報價' }))
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('removes from the row on desktop without opening it', () => {
    const onOpen = vi.fn()
    const onRemove = vi.fn()
    renderSection({ isMobile: false, onOpen, onRemove })
    fireEvent.click(screen.getByRole('button', { name: '刪除 台積電' }))
    expect(onRemove).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }))
    expect(onOpen).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 寫 `WatchlistForm` 失敗測試**

建立 `src/components/research/WatchlistForm.test.jsx`：

```jsx
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import WatchlistForm, { WATCHLIST_FORM_ID } from './WatchlistForm'

const renderForm = (onSubmit) =>
  render(
    <>
      <WatchlistForm formId={WATCHLIST_FORM_ID} disabled={false} onSubmit={onSubmit} />
      <button type="submit" form={WATCHLIST_FORM_ID}>加入</button>
    </>,
  )

describe('WatchlistForm', () => {
  it('submits the market and symbol', async () => {
    const onSubmit = vi.fn(async () => {})
    renderForm(onSubmit)
    fireEvent.change(screen.getByLabelText('股票代號'), { target: { value: '2330' } })
    fireEvent.click(screen.getByRole('button', { name: '加入' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ market: 'TW', symbol: '2330' }))
  })

  it('shows the service error under the symbol', async () => {
    const onSubmit = vi.fn(async () => {
      throw new Error('已在觀察清單')
    })
    renderForm(onSubmit)
    fireEvent.change(screen.getByLabelText('股票代號'), { target: { value: '2330' } })
    fireEvent.click(screen.getByRole('button', { name: '加入' }))
    expect(await screen.findByText('已在觀察清單')).toBeInTheDocument()
  })

  it('requires a symbol', async () => {
    const onSubmit = vi.fn()
    renderForm(onSubmit)
    fireEvent.click(screen.getByRole('button', { name: '加入' }))
    expect(await screen.findByText('請輸入代號')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: 跑測試確認失敗**

Run: `npx vitest run src/components/research`
Expected: FAIL（找不到模組）

- [ ] **Step 4: 實作 `WatchlistForm.jsx`**

```jsx
import { Form, Input, Select } from "antd";

export const WATCHLIST_FORM_ID = "watchlist-form";

const marketOptions = [
  { value: "TW", label: "台股 (TW)" },
  { value: "US", label: "美股 (US)" },
];

// 新增觀察: market + symbol only. The service checks the symbol by fetching
// a quote; its error (duplicate, no quote) shows under the symbol.
function WatchlistForm({ formId, disabled, onSubmit }) {
  const [form] = Form.useForm();

  const handleFinish = async (values) => {
    try {
      await onSubmit({ market: values.market, symbol: values.symbol });
      form.resetFields(["symbol"]);
    } catch (error) {
      form.setFields([
        { name: "symbol", errors: [error instanceof Error ? error.message : String(error)] },
      ]);
    }
  };

  return (
    <Form
      id={formId}
      name="watchlist_form"
      form={form}
      layout="vertical"
      initialValues={{ market: "TW" }}
      onFinish={handleFinish}
      autoComplete="off"
    >
      <Form.Item label="市場" name="market" rules={[{ required: true, message: "請選擇市場" }]}>
        <Select disabled={disabled} options={marketOptions} />
      </Form.Item>
      <Form.Item label="股票代號" name="symbol" rules={[{ required: true, whitespace: true, message: "請輸入代號" }]}>
        <Input
          disabled={disabled}
          placeholder="例如 2330 或 AAPL"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
        />
      </Form.Item>
    </Form>
  );
}

export default WatchlistForm;
```

- [ ] **Step 5: 實作 `WatchlistSection.jsx`**

```jsx
import { Button, Typography } from "antd";
import dayjs from "dayjs";
import { GraphUp, Refresh, Trash } from "iconoir-react";
import CollapsibleGroups from "../CollapsibleGroups";
import EmptyState from "../EmptyState";
import MobileSwipeRow from "../MobileSwipeRow";
import { swipeDeleteAction } from "../swipeActionItems";
import { formatPrice } from "../../utils/formatters";
import { formatSignedPercent } from "../../utils/stockDetail";

const { Text } = Typography;

const MARKET_TITLES = { TW: "台股", US: "美股" };

const changeClass = (value) =>
  value >= 0 ? "stock-detail-change--up" : "stock-detail-change--down";

// 研究 tab's first section: watched stocks by market, newest added last.
// A row opens the stock's sheet; mobile swipes to delete, desktop has a
// trailing delete button.
function WatchlistSection({
  view,
  isMobile,
  disabled,
  refreshing,
  refreshFailed,
  onRefresh,
  onOpen,
  onRemove,
}) {
  const groups = view.groups.map((group) => ({
    key: group.market,
    title: MARKET_TITLES[group.market],
    total: `${group.rows.length} 檔`,
    rows: group.rows,
  }));

  const updatedText = refreshFailed
    ? "更新失敗"
    : view.lastUpdatedAt
      ? `更新於 ${dayjs(view.lastUpdatedAt).format("MM/DD HH:mm")}`
      : null;

  const renderRow = (row) => (
    <MobileSwipeRow
      key={row.id}
      disabled={disabled}
      onTap={() => onOpen(row.id)}
      label={`${row.name} ${row.symbol}，查看個股`}
      actions={isMobile ? [swipeDeleteAction(row.name, () => onRemove(row))] : []}
      main={
        <div className="watchlist-row-main">
          <span className="watchlist-row-name">{row.name}</span>
          <span className="watchlist-row-symbol">{row.symbol}</span>
        </div>
      }
      side={
        <div className="watchlist-row-side">
          <div className="watchlist-row-price">
            <div className="watchlist-row-price-main">
              {row.latestPrice === null ? "—" : formatPrice(row.latestPrice, row.currency)}
            </div>
            {Number.isFinite(row.changePct) && (
              <div className={`watchlist-row-change ${changeClass(row.changePct)}`}>
                {formatSignedPercent(row.changePct)}
              </div>
            )}
          </div>
          {!isMobile && (
            <Button
              type="text"
              size="small"
              icon={<Trash />}
              aria-label={`刪除 ${row.name}`}
              disabled={disabled}
              onClick={(event) => {
                event.stopPropagation();
                onRemove(row);
              }}
            />
          )}
        </div>
      }
    />
  );

  return (
    <section className="mobile-list-section watchlist-section" aria-label="觀察清單">
      <div className="mobile-list-header">
        <span className="mobile-list-title">觀察清單</span>
        <span className="watchlist-header-end">
          {updatedText && <Text className="watchlist-updated">{updatedText}</Text>}
          <Button
            type="text"
            size="small"
            icon={<Refresh />}
            aria-label="更新觀察清單報價"
            loading={refreshing}
            disabled={disabled || refreshing || view.rows.length === 0}
            onClick={onRefresh}
          />
        </span>
      </div>
      <div className="mobile-list-body">
        <CollapsibleGroups
          className="watchlist-groups"
          groups={groups}
          defaultExpanded
          storageKey="my-stock:watchlist-groups-open"
          renderRow={renderRow}
          empty={<EmptyState icon={GraphUp} description="還沒有觀察的股票" />}
        />
      </div>
    </section>
  );
}

export default WatchlistSection;
```

`src/App.css` 在 `.cash-groups .mobile-swipe-row-side, .mobile-list-section--income .mobile-swipe-row-side { ... }` 之後加：

```css
/* 研究 › 觀察清單: name over symbol, price over today's change. */
.watchlist-groups .mobile-swipe-row {
  min-height: 72px;
  padding-block: var(--space-row-y);
}

.watchlist-row-main {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
}

.watchlist-row-name {
  font-size: var(--fs-body);
  font-weight: 600;
  color: var(--c-ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.watchlist-row-symbol,
.watchlist-updated.ant-typography {
  font-size: var(--fs-caption);
  color: var(--c-muted);
}

.watchlist-row-side {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.watchlist-row-price {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.watchlist-row-price-main {
  font-weight: 600;
  color: var(--c-ink);
}

.watchlist-row-change {
  font-size: var(--fs-caption);
}

.watchlist-header-end {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}
```

- [ ] **Step 6: 跑測試確認通過**

Run: `npx vitest run src/components/research`
Expected: PASS。`swipeDeleteAction` 的 label 是 `刪除 ${name}`；mobile 列在 jsdom 中也會渲染隱藏的滑動按鈕，因此 desktop 測試使用 `isMobile: false`，此時只有列尾按鈕帶這個 label。

- [ ] **Step 7: 全部測試與 lint**

Run: `npm test && npm run lint`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/components/research src/App.css
git commit -m "Add the watchlist section and its add form

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: 接進 `App.jsx` — 研究 tab、FAB、表單、sheet

**Files:**
- Modify: `src/utils/viewTransition.js:3`、`src/utils/viewTransition.test.js`
- Modify: `src/App.jsx`（imports、state、tab bar ×2、研究頁分支、FAB、表單 Modal / sheet、`WatchlistDetailSheet`、`handleRefreshPrices` 文案）

**Interfaces:**
- Consumes: `useWatchlist`（Task 7）、`WatchlistSection` / `WatchlistForm` / `WATCHLIST_FORM_ID`（Task 8）、`WatchlistDetailSheet`（Task 6）、`addWatchlistItem` / `removeWatchlistItem`（Task 3）。

- [ ] **Step 1: tab 順序的失敗測試**

`src/utils/viewTransition.test.js` 的第一個 `it` 加：

```js
    expect(getMainTabDirection("expense", "research")).toBe("forward");
    expect(getMainTabDirection("research", "settings")).toBe("forward");
    expect(getMainTabDirection("settings", "research")).toBe("back");
    expect(getMainTabDirection("research", "asset")).toBe("back");
```

Run: `npx vitest run src/utils/viewTransition.test.js`
Expected: FAIL

- [ ] **Step 2: 更新 `MAIN_TAB_ORDER`**

`src/utils/viewTransition.js:3` 改為 `export const MAIN_TAB_ORDER = ["asset", "expense", "research", "settings"];`

Run: `npx vitest run src/utils/viewTransition.test.js`
Expected: PASS

- [ ] **Step 3: imports 與 state**

`src/App.jsx`：
1. iconoir import 加 `GraphUp`。
2. 加 imports：
   ```js
   import WatchlistDetailSheet from "./components/WatchlistDetailSheet";
   import WatchlistSection from "./components/research/WatchlistSection";
   import WatchlistForm, { WATCHLIST_FORM_ID } from "./components/research/WatchlistForm";
   import useWatchlist from "./hooks/useWatchlist";
   ```
   並在既有 `./services/portfolioService` 的具名 import 清單加 `addWatchlistItem`、`removeWatchlistItem`。
3. 在 `isWriteDisabled`（`:499`）與 `loadingRefresh` state 皆已宣告之後（以 `grep -n "const \[loadingRefresh" src/App.jsx` 找位置，放在兩者之後），加：
   ```js
   const [isWatchlistFormOpen, setIsWatchlistFormOpen] = useState(false);
   const [loadingAddWatch, setLoadingAddWatch] = useState(false);
   const watchlist = useWatchlist({
     enabled: Boolean(authUser) && bootPhase === "ready",
     autoRefresh: activeMainTab === "research" && !isWriteDisabled && !loadingRefresh,
   });
   ```
   （先以 `grep -n "getBootPhase" -A12 src/utils/*.js` 確認 `bootPhase` 載入完成的值；若不是 `"ready"`，改用實際值。）

- [ ] **Step 4: handlers**

在 `handleRefreshPrices` 之後加：

```js
  const handleRefreshWatchlist = async () => {
    try {
      const result = await watchlist.refresh();
      const failedSymbols = (result.failed ?? []).map((item) => item.symbol);
      if (failedSymbols.length > 0) {
        message.warning(`以下抓價失敗：${failedSymbols.join("、")}。可稍後再試。`, 6);
      }
    } catch (error) {
      message.error(toUserMessage(error, "更新觀察清單報價失敗"));
    }
  };

  const handleAddWatch = async (values) => {
    setLoadingAddWatch(true);
    try {
      await addWatchlistItem(values);
      await watchlist.reload();
      setIsWatchlistFormOpen(false);
      message.success("已加入觀察清單");
    } finally {
      setLoadingAddWatch(false);
    }
  };

  const handleRemoveWatch = (row) => {
    confirmDestructive({
      title: `從觀察清單移除 ${row.name}？`,
      content: "估價假設會保留，之後重新加入還看得到。",
      okText: "移除",
      onOk: async () => {
        try {
          await removeWatchlistItem({ id: row.id });
          await watchlist.reload();
        } catch (error) {
          message.error(toUserMessage(error, "移除失敗"));
        }
      },
    });
  };
```

（`handleAddWatch` 不 catch：錯誤交給 `WatchlistForm` 顯示在代號欄位。）

`handleRefreshPrices` 的三個 `targetCount === 0` 文案改為：`"目前沒有可更新的台股"`、`"目前沒有可更新的美股"`、`"目前沒有可更新的持股或觀察股票"`。

- [ ] **Step 5: tab bar**

1. desktop header `Segmented` 的 `options`：在「支出分析」與「設定」之間加：
   ```js
                  {
                    label: "投資研究",
                    value: "research",
                    icon: <GraphUp aria-hidden />,
                  },
   ```
2. mobile `mobile-main-tabbar` 的陣列：在「支出」與「設定」之間加：
   ```js
                  { icon: <GraphUp aria-hidden />, text: "研究", value: "research" },
   ```

- [ ] **Step 6: 研究頁分支**

在 `) : activeMainTab === "asset" ? (` 的整個 asset 分支結束、緊接其後的 `) : (`（expense / settings 的 `<Row>`）之前插入：

```jsx
          ) : activeMainTab === "research" ? (
            <div className="research-page">
              <WatchlistSection
                view={watchlist.view}
                isMobile={isMobileViewport}
                disabled={isWriteDisabled}
                refreshing={watchlist.refreshing}
                refreshFailed={watchlist.refreshFailed}
                onRefresh={handleRefreshWatchlist}
                onOpen={watchlist.openItem}
                onRemove={handleRemoveWatch}
              />
            </div>
```

（也就是把 `) : (` 變成 `) : activeMainTab === "research" ? ( ... ) : (`。）

- [ ] **Step 7: FAB**

FAB 的顯示條件改為：

```jsx
          {authUser &&
          (activeMainTab === "expense" ||
            activeMainTab === "asset" ||
            activeMainTab === "research") ? (
```

`aria-label` 改為：

```jsx
              aria-label={
                activeMainTab === "asset"
                  ? "新增持股"
                  : activeMainTab === "research"
                    ? "新增觀察"
                    : "新增支出"
              }
```

`onClick` 開頭（`if (activeMainTab === "asset")` 之前）加：

```jsx
                if (activeMainTab === "research") {
                  setIsWatchlistFormOpen(true);
                  return;
                }
```

- [ ] **Step 8: 表單與 sheet**

在 `<StockDetailSheet ... />` 之後加：

```jsx
          <Modal
            title="新增觀察"
            open={!isMobileViewport && isWatchlistFormOpen}
            onCancel={() => {
              if (!loadingAddWatch) setIsWatchlistFormOpen(false);
            }}
            confirmLoading={loadingAddWatch}
            okButtonProps={{
              disabled: isWriteDisabled,
              htmlType: "submit",
              form: WATCHLIST_FORM_ID,
            }}
            okText="加入"
            destroyOnHidden
          >
            {!isMobileViewport && (
              <WatchlistForm formId={WATCHLIST_FORM_ID} disabled={isWriteDisabled} onSubmit={handleAddWatch} />
            )}
          </Modal>

          <MobileFormSheetLayout
            title="新增觀察"
            open={isMobileViewport && isWatchlistFormOpen}
            onClose={() => setIsWatchlistFormOpen(false)}
            loading={loadingAddWatch}
            submitDisabled={isWriteDisabled}
            submitText="加入"
            submitFormId={WATCHLIST_FORM_ID}
          >
            {isMobileViewport && (
              <WatchlistForm formId={WATCHLIST_FORM_ID} disabled={isWriteDisabled} onSubmit={handleAddWatch} />
            )}
          </MobileFormSheetLayout>

          <WatchlistDetailSheet
            key={watchlist.selectedItem ? watchlist.selectedItem.id : "none"}
            open={Boolean(watchlist.selectedItem)}
            item={watchlist.selectedItem}
            isMobile={isMobileViewport}
            disabled={isWriteDisabled}
            onClose={watchlist.closeItem}
            onRemove={() => handleRemoveWatch(watchlist.selectedItem)}
          />
```

- [ ] **Step 9: 版面間距**

`src/App.css` 加（放在 `.mobile-list-section` 規則附近）：

```css
/* 研究: sections stack a token-sized gap apart, as on 支出. */
.research-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-section);
}
```

- [ ] **Step 10: 全部測試、lint、build**

Run: `npm test && npm run lint && npm run build`
Expected: 全部 PASS，build 成功

- [ ] **Step 11: 瀏覽器實測**

Run: `npm run dev`，登入後用 Chrome 依序確認（手機寬度 390px 與桌面寬度各一次）：
1. tab bar 有 4 項，膠囊不與右下 FAB 重疊；資產 → 支出 → 研究 → 設定 推頁方向正確。
2. 研究頁空狀態顯示「還沒有觀察的股票」；FAB aria-label 為「新增觀察」。
3. 新增 `2330`（台股）、`NVDA`（美股）成功；再加 `2330` 顯示「已在觀察清單」；加 `ZZZZZZ`（美股）顯示「查不到這個代號的報價」。
4. 列表依台股／美股分組，點列打開 sheet：有現價列、估價、河流圖、EPS 圖，沒有持股／買賣／管理這筆持股。
5. sheet 內調整一次估價假設，到資產頁打開同一支持股（若有）看到同一份假設。
6. mobile 左滑刪除、desktop 列尾刪除都會跳確認；確認後列消失、開著的 sheet 關閉。
7. 離開研究 tab 再回來：10 分鐘內不會重打報價（DevTools Network 無 TWSE / Finnhub 請求）。
8. 資產頁按「更新價格」後回研究頁，時間戳更新。
若 4 項 tab bar 與 FAB 重疊，只調整 `.mobile-main-tabbar .ant-segmented-item` 的 `padding-inline` 改用 `var(--space-1)`，再重測。

- [ ] **Step 12: Commit**

```bash
git add src/App.jsx src/App.css src/utils/viewTransition.js src/utils/viewTransition.test.js
git commit -m "Add the 研究 tab with the watchlist, its add form and sheet

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: 文件更新

**Files:**
- Modify: `PRODUCT.md`、`DESIGN.md`、`CLAUDE.md`

- [ ] **Step 1: `PRODUCT.md`**

- Operating Context 的「報價為**手動刷新**」那一條之後加一句：「例外：研究 tab 的觀察清單在進入時自動刷新（距上次超過 10 分鐘才打）。」
- 「主要分頁：資產總覽、支出分析、設定。」改為「主要分頁：資產總覽、支出分析、投資研究（觀察清單；之後放總經指標、重大日程）、設定。」

- [ ] **Step 2: `DESIGN.md`**

- Navigation › Mobile tab bar：註明 tab bar 為 4 項（資產、支出、研究、設定），研究用 iconoir `GraphUp`。
- Lists：在「資產頁的持股列例外：不左滑…」之後加：「研究頁的觀察清單列可左滑刪除，點一下開觀察 sheet（與持股共用研究內容，但沒有部位與買賣）。」
- Layout 主頁結構段落加：「研究頁沒有 hero 與 display 數字，直接以 section 開始。」

- [ ] **Step 3: `CLAUDE.md`**

- Data layer 段落：修改 schema 的說明之後加一句：「`watchlist`（觀察清單）以 `${market}_${symbol}` 為雲端 doc key，現價存在項目本身，不寫 `price_snapshots`。」
- Price providers 段落：批次刷新那一段加：「抓價邏輯在 `src/services/quoteBatch.js` 的 `fetchQuotes`（依 `market:symbol` 去重）；`refreshPrices` 會一併刷新同市場的觀察清單，`refreshWatchlistPrices` 只刷觀察清單。」
- UI 段落：提到 `src/components/research/` 與 `useWatchlist`；`StockDetailSheet` 由 `stockDetail/StockSheetShell` + `stockDetail/StockResearchContent` 組成，`WatchlistDetailSheet` 共用兩者。

- [ ] **Step 4: Commit**

```bash
git add PRODUCT.md DESIGN.md CLAUDE.md
git commit -m "Document the 研究 tab and watchlist

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
