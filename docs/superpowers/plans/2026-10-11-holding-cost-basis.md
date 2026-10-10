# 持股成本與買進／賣出 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** holding 記錄總成本；股數只能經由個股細節頁的買進／賣出／校正變動，細節頁顯示均價與未實現損益；列表上的持股編輯入口全部移除。

**Architecture:** 成本規則寫成 `src/utils/holdingShares.js` 的純函式，服務層（`portfolioService.js`）與 UI 共用同一組函式。`totalCost` 走既有的 mapper → `mirrorToCloud` → `applyRemoteHolding` 管線。新的 `HoldingActionForm` 照 `CashAccountEditForm` 的模式：App 持有狀態，手機包在 `MobileFormSheetLayout`、桌面包在 `Modal`；表單開啟時暫時收起細節頁（同 `SavingsGoalDetailSheet` 與目標表單的做法）。

**Tech Stack:** React 19、Ant Design 6、Vitest + Testing Library（jsdom）。

**Spec:** `docs/superpowers/specs/2026-10-11-holding-cost-basis-design.md`

## Global Constraints

- 所有 `npm` / `npx` 指令在 `my-stock/` 下執行。
- 介面文案為繁體中文（台灣）；code、識別字、commit message 用英文。
- CSS 只用 token：`var(--c-*)`、`var(--fs-*)`、`var(--space-*)`、`var(--radius-*)`；不寫死 hex 或 px（1px 邊框除外，現有 CSS 也這樣寫）。
- 不用 lint disable 註解。
- `totalCost` 以該市場幣別計（台股 TWD、美股 USD），`null` = 未設定成本，存到小數 4 位。
- 股數：台股正整數、美股最多 4 位小數，> 0。價格／平均成本 ≥ 0。
- 數字欄位加 `inputMode`（整數 `numeric`、小數 `decimal`）。
- 每個 commit 訊息結尾加：`Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`

## Review Focus

1. **原本未設定成本的持股被買進或賣出** → 成本維持 `null`，不能變成「只算新買那批」的錯誤均價（Task 1 測試、Task 3 測試）。
2. **重新新增一檔已移除的持股** → 從輸入的股數與價格重新開始，不加回舊股數（Task 3 測試）。
3. **賣出股數剛好等於持有股數** → 走移除流程並先確認；超過時擋下並顯示「賣出股數不可超過持有股數」（Task 3、Task 4 測試）。
4. **其他裝置同步過來的 holding 帶著 `totalCost`** → 本地要保留這個欄位，不能在 `applyRemoteHolding` 被丟掉（Task 3 經 `mirrorToCloud` 的測試驗證本地 row）。
5. **美股小數股數的浮點誤差**（0.1 + 0.2）→ 股數與成本都四捨五入到 4 位（Task 1 測試）。

---

### Task 1: 成本計算純函式

**Files:**
- Modify: `src/utils/holdingShares.js`
- Test: `src/utils/holdingShares.test.js`

**Interfaces:**
- Produces（後續 task 都用這些，名稱與型別不得更改）：
  - `normalizeTotalCost(value: unknown): number | null`：有限且 ≥ 0 才回傳（四捨五入到 4 位），否則 `null`；`null` / `undefined` / `''` → `null`。
  - `applyBuy(holding: { shares, totalCost }, buy: { shares: number, price: number }): { shares: number, totalCost: number | null }`
  - `applySell(holding: { shares, totalCost }, soldShares: number): { shares: number, totalCost: number | null, soldAll: boolean }`
  - `applyCalibration({ shares: number, averageCost: number | null }): { shares: number, totalCost: number | null }`
  - `getAverageCost(holding: { shares, totalCost }): number | null`
  - `getUnrealized(holding: { shares, totalCost, latestPrice }): { amount: number, pct: number | null } | null`（`pct` 為比例，例如 0.04 = 4%）
  - `getHoldingCurrency(holding: { latestCurrency?, market }): 'TWD' | 'USD' | string`
- 這個 task **不刪除** `HOLDING_SHARES_MODE` / `resolveNextShares`（Task 5 才拿掉最後一個使用者後刪除）。

- [ ] **Step 1: Write the failing tests**

在 `src/utils/holdingShares.test.js` 的 import 加入新函式，並在檔尾加上：

```js
import {
  HOLDING_SHARES_MODE,
  applyBuy,
  applyCalibration,
  applySell,
  findExistingHolding,
  getAverageCost,
  getHoldingCurrency,
  getUnrealized,
  normalizeHoldingSymbol,
  normalizeTotalCost,
  resolveNextShares,
} from './holdingShares'
```

```js
describe('normalizeTotalCost', () => {
  it('keeps finite non-negative numbers, rounded to 4 places', () => {
    expect(normalizeTotalCost(50000)).toBe(50000)
    expect(normalizeTotalCost('123.456789')).toBe(123.4568)
    expect(normalizeTotalCost(0)).toBe(0)
  })

  it('treats missing or invalid values as unset', () => {
    expect(normalizeTotalCost(null)).toBeNull()
    expect(normalizeTotalCost(undefined)).toBeNull()
    expect(normalizeTotalCost('')).toBeNull()
    expect(normalizeTotalCost(-1)).toBeNull()
    expect(normalizeTotalCost('abc')).toBeNull()
    expect(normalizeTotalCost(Infinity)).toBeNull()
  })
})

describe('applyBuy', () => {
  it('adds shares and cost; the average is weighted', () => {
    const next = applyBuy({ shares: 100, totalCost: 50000 }, { shares: 50, price: 560 })
    expect(next).toEqual({ shares: 150, totalCost: 78000 })
    expect(getAverageCost(next)).toBe(520)
  })

  it('keeps an unset cost unset: the earlier shares cost is unknown', () => {
    expect(applyBuy({ shares: 100, totalCost: null }, { shares: 50, price: 560 })).toEqual({
      shares: 150,
      totalCost: null,
    })
  })

  it('avoids float drift on fractional shares', () => {
    expect(applyBuy({ shares: 0.1, totalCost: 1 }, { shares: 0.2, price: 3 })).toEqual({
      shares: 0.3,
      totalCost: 1.6,
    })
  })
})

describe('applySell', () => {
  it('scales the cost down so the average stays the same', () => {
    const next = applySell({ shares: 150, totalCost: 78000 }, 30)
    expect(next).toEqual({ shares: 120, totalCost: 62400, soldAll: false })
    expect(getAverageCost(next)).toBe(520)
  })

  it('flags selling everything', () => {
    expect(applySell({ shares: 100, totalCost: 50000 }, 100)).toEqual({
      shares: 0,
      totalCost: 0,
      soldAll: true,
    })
  })

  it('keeps an unset cost unset', () => {
    expect(applySell({ shares: 100, totalCost: null }, 40)).toEqual({
      shares: 60,
      totalCost: null,
      soldAll: false,
    })
  })

  it('avoids float drift on fractional shares', () => {
    expect(applySell({ shares: 0.3, totalCost: 3 }, 0.1).shares).toBe(0.2)
  })
})

describe('applyCalibration', () => {
  it('sets shares and cost from the average cost', () => {
    expect(applyCalibration({ shares: 1000, averageCost: 512.5 })).toEqual({
      shares: 1000,
      totalCost: 512500,
    })
  })

  it('allows a zero cost (e.g. stock dividends)', () => {
    expect(applyCalibration({ shares: 50, averageCost: 0 })).toEqual({ shares: 50, totalCost: 0 })
  })

  it('clears the cost when the average is left empty', () => {
    expect(applyCalibration({ shares: 1000, averageCost: null })).toEqual({
      shares: 1000,
      totalCost: null,
    })
  })
})

describe('getAverageCost', () => {
  it('is null without a cost or shares', () => {
    expect(getAverageCost({ shares: 100, totalCost: null })).toBeNull()
    expect(getAverageCost({ shares: 0, totalCost: 100 })).toBeNull()
  })
})

describe('getUnrealized', () => {
  it('compares market value with the cost', () => {
    expect(getUnrealized({ shares: 100, totalCost: 50000, latestPrice: 520 })).toEqual({
      amount: 2000,
      pct: 0.04,
    })
    expect(getUnrealized({ shares: 100, totalCost: 50000, latestPrice: 480 })).toEqual({
      amount: -2000,
      pct: -0.04,
    })
  })

  it('has no percentage when the cost is zero', () => {
    expect(getUnrealized({ shares: 50, totalCost: 0, latestPrice: 10 })).toEqual({
      amount: 500,
      pct: null,
    })
  })

  it('is null without a cost or a price', () => {
    expect(getUnrealized({ shares: 100, totalCost: null, latestPrice: 520 })).toBeNull()
    expect(getUnrealized({ shares: 100, totalCost: 50000, latestPrice: undefined })).toBeNull()
  })
})

describe('getHoldingCurrency', () => {
  it('prefers the quoted currency, else follows the market', () => {
    expect(getHoldingCurrency({ market: 'US', latestCurrency: 'USD' })).toBe('USD')
    expect(getHoldingCurrency({ market: 'US' })).toBe('USD')
    expect(getHoldingCurrency({ market: 'TW' })).toBe('TWD')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/utils/holdingShares.test.js`
Expected: FAIL（`applyBuy` 等為 undefined）

- [ ] **Step 3: Implement**

在 `src/utils/holdingShares.js` 檔尾加上（並把檔頭註解改為 `// Helpers for a holding's shares and cost. Shared by the forms (previews) and portfolioService (writes).`）：

```js
// Shares and costs are kept to the forms' 4-decimal precision so
// 0.1 + 0.2 stays 0.3.
const roundTo4 = (value) => Math.round(value * 10000) / 10000;

// totalCost is in the holding's market currency (TWD / USD); null = unset.
export const normalizeTotalCost = (value) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? roundTo4(parsed) : null;
};

export const applyBuy = (holding, { shares, price }) => {
  const cost = normalizeTotalCost(holding.totalCost);
  return {
    shares: roundTo4(Number(holding.shares) + shares),
    // Without the earlier shares' cost, any average would be wrong.
    totalCost: cost === null ? null : roundTo4(cost + shares * price),
  };
};

export const applySell = (holding, soldShares) => {
  const current = Number(holding.shares);
  const remaining = roundTo4(current - soldShares);
  const cost = normalizeTotalCost(holding.totalCost);
  if (remaining <= 0) {
    return { shares: 0, totalCost: cost === null ? null : 0, soldAll: true };
  }
  return {
    shares: remaining,
    // Selling keeps the average cost, so the total shrinks in proportion.
    totalCost: cost === null ? null : roundTo4((cost * remaining) / current),
    soldAll: false,
  };
};

export const applyCalibration = ({ shares, averageCost }) => ({
  shares,
  totalCost:
    averageCost === null || averageCost === undefined
      ? null
      : roundTo4(shares * averageCost),
});

export const getAverageCost = (holding) => {
  const cost = normalizeTotalCost(holding?.totalCost);
  const shares = Number(holding?.shares);
  if (cost === null || !Number.isFinite(shares) || shares <= 0) {
    return null;
  }
  return cost / shares;
};

export const getUnrealized = (holding) => {
  const cost = normalizeTotalCost(holding?.totalCost);
  const price = holding?.latestPrice;
  if (cost === null || typeof price !== "number" || !Number.isFinite(price)) {
    return null;
  }
  const amount = roundTo4(Number(holding.shares) * price - cost);
  return { amount, pct: cost > 0 ? roundTo4(amount / cost) : null };
};

export const getHoldingCurrency = (holding) =>
  holding?.latestCurrency || (holding?.market === "US" ? "USD" : "TWD");
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/utils/holdingShares.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/holdingShares.js src/utils/holdingShares.test.js
git commit -m "Add cost basis maths for buying, selling and calibrating holdings"
```

---

### Task 2: `totalCost` 欄位穿過 mapper、同步與 view

**Files:**
- Modify: `src/services/firebase/firestoreMappers.js`（`holdingToRemote`、`remoteToHolding`）
- Modify: `src/services/firebase/cloudSyncService.js`（`applyRemoteHolding` 的 add 與 update 兩段）
- Modify: `src/services/portfolioService.js`（`getPortfolioView` 裡建 `row` 的物件）
- Test: `src/services/firebase/firestoreMappers.test.js`

**Interfaces:**
- Consumes: Task 1 的 `normalizeTotalCost`。
- Produces: 本地 holding row、雲端 doc、`getPortfolioView().rows[]` 都帶 `totalCost: number | null`。後續 UI 從 `rows` 讀它。

- [ ] **Step 1: Write the failing tests**

在 `src/services/firebase/firestoreMappers.test.js` 的 import 加 `holdingToRemote, remoteToHolding`，檔尾加：

```js
describe('holding totalCost', () => {
  const holding = {
    symbol: '2330',
    market: 'TW',
    assetTag: 'STOCK',
    holder: 'Po',
    shares: 100,
    totalCost: 50000,
    companyName: '台積電',
    sortOrder: 1,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    deletedAt: null,
  }

  it('round-trips through the remote shape', () => {
    expect(remoteToHolding(holdingToRemote(holding)).totalCost).toBe(50000)
  })

  it('stores an unset cost as null', () => {
    expect(holdingToRemote({ ...holding, totalCost: undefined }).totalCost).toBeNull()
  })

  it('reads a missing or invalid remote cost as unset', () => {
    const remote = holdingToRemote(holding)
    expect(remoteToHolding({ ...remote, totalCost: undefined }).totalCost).toBeNull()
    expect(remoteToHolding({ ...remote, totalCost: -5 }).totalCost).toBeNull()
    expect(remoteToHolding({ ...remote, totalCost: '62400' }).totalCost).toBe(62400)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/services/firebase/firestoreMappers.test.js`
Expected: FAIL（`totalCost` 為 undefined）

- [ ] **Step 3: Implement**

`firestoreMappers.js`：檔頭加 `import { normalizeTotalCost } from '../../utils/holdingShares'`。`holdingToRemote` 在 `shares: holding.shares,` 下一行加：

```js
  totalCost: normalizeTotalCost(holding.totalCost),
```

`remoteToHolding` 在 `shares: parseNumericLike(...)` 那段之後加：

```js
  totalCost: normalizeTotalCost(data.totalCost),
```

`cloudSyncService.js` 的 `applyRemoteHolding`：`db.holdings.add({...})` 與 `db.holdings.update(local.id, {...})` 兩個物件，都在 `shares: parseNumericLike(...)` 之後加一行（`remote` 已經過 `remoteToHolding` 正規化）：

```js
      totalCost: remote.totalCost ?? null,
```

`portfolioService.js` 的 `getPortfolioView`，`const row = {` 物件在 `shares,` 下一行加：

```js
      totalCost: normalizeTotalCost(holding.totalCost),
```

並把 `normalizeTotalCost` 加進檔案上方既有的 `from "../utils/holdingShares"` import。

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/services/firebase/firestoreMappers.test.js && npm test`
Expected: PASS（全部測試仍綠）

- [ ] **Step 5: Commit**

```bash
git add src/services/firebase/firestoreMappers.js src/services/firebase/firestoreMappers.test.js src/services/firebase/cloudSyncService.js src/services/portfolioService.js
git commit -m "Carry a holding's total cost through Firestore, sync and the portfolio view"
```

---

### Task 3: 服務層：買進、賣出、校正、新增持股帶價格

**Files:**
- Modify: `src/services/portfolioService.js`（`upsertHolding`；新增 `buyHolding`、`sellHolding`、`calibrateHolding` 放在 `updateHoldingShares` 之後）
- Test: Create `src/services/portfolioService.holdingCost.test.js`

**Interfaces:**
- Consumes: Task 1 的 `applyBuy`、`applySell`、`applyCalibration`、`normalizeTotalCost`；既有 `removeHolding`。
- Produces:
  - `upsertHolding({ symbol, market, shares, price, assetTag, holder }) → Promise<{ id: number, created: boolean }>`（`sharesMode` 參數移除；`price` 必填）
  - `buyHolding({ id, shares, price }) → Promise<void>`
  - `sellHolding({ id, shares }) → Promise<{ removed: boolean }>`
  - `calibrateHolding({ id, shares, averageCost }) → Promise<void>`（`averageCost` 可為 `null`）
  - 錯誤訊息（UI 直接顯示）：`"股數必須大於 0"`、`"請輸入有效的價格"`、`"賣出股數不可超過持有股數"`。
- `updateHoldingShares` 這個 task 先保留（App 還在用），Task 7 刪除。

- [ ] **Step 1: Write the failing tests**

Create `src/services/portfolioService.holdingCost.test.js`：

```js
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('./firebase/cloudSyncService', async (importOriginal) => ({
  ...(await importOriginal()),
  assertCloudWriteReady: vi.fn(),
  writeCollectionRecord: vi.fn(),
  deleteCollectionDoc: vi.fn(),
  registerMigratedDocKey: vi.fn(),
}))

import { db } from '../db/database'
import {
  buyHolding,
  calibrateHolding,
  getPortfolioView,
  sellHolding,
  upsertHolding,
} from './portfolioService'

// Writes apply locally only when newer, so each call gets its own second.
let clock = Date.parse('2026-10-11T02:00:00.000Z')
const tick = () => {
  clock += 1000
  vi.setSystemTime(clock)
}

const addHolding = (extra = {}) =>
  db.holdings.add({
    symbol: '2330',
    market: 'TW',
    holder: 'Po',
    assetTag: 'STOCK',
    shares: 100,
    totalCost: 50000,
    companyName: '台積電',
    sortOrder: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    ...extra,
  })

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  tick()
  await db.holdings.clear()
  await db.price_snapshots.clear()
  await db.app_config.clear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('buyHolding', () => {
  it('adds shares and cost at the weighted average', async () => {
    const id = await addHolding()
    await buyHolding({ id, shares: 50, price: 560 })
    expect(await db.holdings.get(id)).toMatchObject({ shares: 150, totalCost: 78000 })
  })

  it('keeps an unset cost unset', async () => {
    const id = await addHolding({ totalCost: null })
    await buyHolding({ id, shares: 50, price: 560 })
    expect(await db.holdings.get(id)).toMatchObject({ shares: 150, totalCost: null })
  })

  it('rejects non-positive shares and negative prices', async () => {
    const id = await addHolding()
    await expect(buyHolding({ id, shares: 0, price: 560 })).rejects.toThrow('股數必須大於 0')
    await expect(buyHolding({ id, shares: 10, price: -1 })).rejects.toThrow('請輸入有效的價格')
  })
})

describe('sellHolding', () => {
  it('keeps the average cost on a partial sale', async () => {
    const id = await addHolding()
    const result = await sellHolding({ id, shares: 20 })
    expect(result).toEqual({ removed: false })
    expect(await db.holdings.get(id)).toMatchObject({ shares: 80, totalCost: 40000 })
  })

  it('refuses to sell more than is held', async () => {
    const id = await addHolding()
    await expect(sellHolding({ id, shares: 101 })).rejects.toThrow('賣出股數不可超過持有股數')
  })

  it('removes the holding when everything is sold', async () => {
    const id = await addHolding()
    expect(await sellHolding({ id, shares: 100 })).toEqual({ removed: true })
    expect((await db.holdings.get(id)).deletedAt).not.toBeNull()
  })
})

describe('calibrateHolding', () => {
  it('overwrites shares and cost', async () => {
    const id = await addHolding()
    await calibrateHolding({ id, shares: 400, averageCost: 125 })
    expect(await db.holdings.get(id)).toMatchObject({ shares: 400, totalCost: 50000 })
  })

  it('clears the cost when the average is empty', async () => {
    const id = await addHolding()
    await calibrateHolding({ id, shares: 100, averageCost: null })
    expect((await db.holdings.get(id)).totalCost).toBeNull()
  })
})

describe('upsertHolding', () => {
  it('creates a holding with its cost', async () => {
    const { id, created } = await upsertHolding({ symbol: '2330', market: 'TW', shares: 100, price: 500, holder: 'Po' })
    expect(created).toBe(true)
    expect(await db.holdings.get(id)).toMatchObject({ shares: 100, totalCost: 50000 })
  })

  it('buys into an existing holding of the same holder', async () => {
    const existingId = await addHolding()
    const { id, created } = await upsertHolding({ symbol: '2330', market: 'TW', shares: 50, price: 560, holder: 'Po' })
    expect({ id, created }).toEqual({ id: existingId, created: false })
    expect(await db.holdings.get(id)).toMatchObject({ shares: 150, totalCost: 78000 })
  })

  it('starts over when the same holding was removed before', async () => {
    const existingId = await addHolding({ deletedAt: '2026-05-01T00:00:00.000Z', updatedAt: '2026-05-01T00:00:00.000Z' })
    const { id } = await upsertHolding({ symbol: '2330', market: 'TW', shares: 10, price: 900, holder: 'Po' })
    expect(id).toBe(existingId)
    expect(await db.holdings.get(id)).toMatchObject({ shares: 10, totalCost: 9000, deletedAt: null })
  })

  it('requires a price', async () => {
    await expect(
      upsertHolding({ symbol: '2330', market: 'TW', shares: 10, holder: 'Po' }),
    ).rejects.toThrow('請輸入有效的價格')
  })
})

describe('getPortfolioView', () => {
  it('exposes each row’s total cost', async () => {
    await addHolding()
    await addHolding({ symbol: '0050', totalCost: undefined })
    const { rows } = await getPortfolioView()
    const bySymbol = Object.fromEntries(rows.map((row) => [row.symbol, row.totalCost]))
    expect(bySymbol).toEqual({ 2330: 50000, '0050': null })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/services/portfolioService.holdingCost.test.js`
Expected: FAIL（`buyHolding` 等不存在；upsert 的價格與已刪除案例失敗）

- [ ] **Step 3: Implement**

在 `portfolioService.js` 的 holdingShares import 加入 `applyBuy, applyCalibration, applySell`（保留 `HOLDING_SHARES_MODE` / `resolveNextShares` 的 import，直到這個 task 結束時確認沒人用再拿掉，見 Step 3d）。

**3a. 共用的驗證 helper**，放在 `upsertHolding` 之前：

```js
const parsePositiveShares = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("股數必須大於 0");
  }
  return parsed;
};

const parsePrice = (value) => {
  const parsed = value === null || value === undefined || value === "" ? NaN : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("請輸入有效的價格");
  }
  return parsed;
};

const getActiveHoldingById = async (id) => {
  const parsedId = Number(id);
  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    throw new Error("Holding not found");
  }
  const existing = await db.holdings.get(parsedId);
  if (!existing || isDeleted(existing)) {
    throw new Error("Holding not found");
  }
  return existing;
};
```

**3b. `upsertHolding`**：
- 參數改為 `{ symbol, market, shares, price, assetTag, holder }`（拿掉 `sharesMode`）。
- 把原本的 `parsedShares` 與 `if (!Number.isFinite(parsedShares) || parsedShares <= 0) throw new Error("Shares must be a positive number")` 換成，並放在 holder 檢查之後：

```js
  const parsedShares = parsePositiveShares(shares);
  const parsedPrice = parsePrice(price);
```

- 把 `if (existing) {` 改為 `if (existing && !isDeleted(existing)) {`，裡面的 `shares: resolveNextShares({...}),` 換成展開買進結果：

```js
    const nextHolding = {
      ...existing,
      ...applyBuy(existing, { shares: parsedShares, price: parsedPrice }),
      assetTag: nextAssetTag,
      holder: normalizedHolder,
      updatedAt: nowIso,
      deletedAt: null,
      syncState: SYNC_PENDING,
    };
```

- 新建分支的 `nextHolding` 物件：
  - 在 `shares: parsedShares,` 下加 `totalCost: applyCalibration({ shares: parsedShares, averageCost: parsedPrice }).totalCost,`
  - 若 `existing` 存在（代表是已刪除的同一筆），要沿用它的 local id 才不會在 `[symbol+market+holder]` 上產生兩筆：在 `const nextHolding = {` 物件最前面加 `...(existing ? { id: existing.id } : {}),`。`mirrorToCloud` 會以 `preferLocalId` 寫回同一列；`applyRemoteHolding` 用 `findLocalHoldingByRemote` 找到它並更新 `shares`、`totalCost`、`deletedAt`（`updatedAt` 比較新）。

**3c. 新函式**，放在 `updateHoldingShares` 之後：

```js
export const buyHolding = async ({ id, shares, price }) => {
  ensureCloudWritable();
  const parsedShares = parsePositiveShares(shares);
  const parsedPrice = parsePrice(price);
  const existing = await getActiveHoldingById(id);
  await mirrorToCloud(CLOUD_COLLECTION.HOLDINGS, {
    ...existing,
    ...applyBuy(existing, { shares: parsedShares, price: parsedPrice }),
    updatedAt: getNowIso(),
    syncState: SYNC_PENDING,
  });
};

// Selling everything removes the holding (and its snapshots), as 移除 does.
export const sellHolding = async ({ id, shares }) => {
  ensureCloudWritable();
  const parsedShares = parsePositiveShares(shares);
  const existing = await getActiveHoldingById(id);
  if (parsedShares > Number(existing.shares)) {
    throw new Error("賣出股數不可超過持有股數");
  }
  const { soldAll, ...next } = applySell(existing, parsedShares);
  if (soldAll) {
    await removeHolding({ id: existing.id });
    return { removed: true };
  }
  await mirrorToCloud(CLOUD_COLLECTION.HOLDINGS, {
    ...existing,
    ...next,
    updatedAt: getNowIso(),
    syncState: SYNC_PENDING,
  });
  return { removed: false };
};

// Fixes typos, splits and stock dividends: overwrites shares and cost
// without counting as a trade. averageCost null = cost unset.
export const calibrateHolding = async ({ id, shares, averageCost }) => {
  ensureCloudWritable();
  const parsedShares = parsePositiveShares(shares);
  const parsedAverage =
    averageCost === null || averageCost === undefined || averageCost === ""
      ? null
      : parsePrice(averageCost);
  const existing = await getActiveHoldingById(id);
  await mirrorToCloud(CLOUD_COLLECTION.HOLDINGS, {
    ...existing,
    ...applyCalibration({ shares: parsedShares, averageCost: parsedAverage }),
    updatedAt: getNowIso(),
    syncState: SYNC_PENDING,
  });
};
```

`removeHolding` 定義在這些函式之後也沒關係（呼叫時才解析）。

**3d.** 執行 `grep -n "resolveNextShares\|HOLDING_SHARES_MODE" src/services/portfolioService.js`：若只剩 import，從 import 移除這兩個名稱。

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/services/portfolioService.holdingCost.test.js && npm test`
Expected: PASS。若 `getPortfolioView` 在測試環境因缺 FX 或快照拋錯，看錯誤訊息補上最少的 seed（例如 `db.fx_rates`），不要改 production code 去遷就測試。

- [ ] **Step 5: Commit**

```bash
git add src/services/portfolioService.js src/services/portfolioService.holdingCost.test.js
git commit -m "Buy, sell and calibrate holdings with cost, and restart removed ones fresh"
```

---

### Task 4: `HoldingActionForm`（買進／賣出／校正／編輯表單）

**Files:**
- Create: `src/components/HoldingActionForm.jsx`
- Test: Create `src/components/HoldingActionForm.test.jsx`

**Interfaces:**
- Consumes: Task 1 的 `applyBuy`、`applySell`、`getAverageCost`、`getHoldingCurrency`；`formatPrice`。
- Produces（Task 7 使用）：
  - default export `HoldingActionForm({ formId, mode, holding, holderOptions, holdingTagOptions, popupContainer, disabled, onSubmit, onCalibrateInstead })`
    - `mode`: `'buy' | 'sell' | 'calibrate' | 'edit'`
    - `holding`: `getPortfolioView` 的 row（用到 `shares`、`totalCost`、`market`、`latestCurrency`、`holder`、`assetTag`）
    - `onSubmit(values)`：buy `{ shares, price }`、sell `{ shares }`、calibrate `{ shares, averageCost }`（`averageCost` 可為 `null`）、edit `{ assetTag, holder }`
  - named export `HOLDING_ACTION_TITLES = { buy: '買進', sell: '賣出', calibrate: '校正股數與成本', edit: '編輯分類與持有人' }`
  - named export `HOLDING_ACTION_SUBMIT_TEXT = { buy: '買進', sell: '賣出', calibrate: '儲存', edit: '儲存' }`
- 這個表單**不含**送出按鈕：送出鍵在外層的 `MobileFormSheetLayout` / `Modal`（用 `form={formId}`）。

- [ ] **Step 1: Write the failing tests**

```jsx
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import HoldingActionForm from './HoldingActionForm'

const holding = {
  id: 1,
  market: 'TW',
  symbol: '2330',
  holder: 'Po',
  assetTag: 'STOCK',
  shares: 100,
  totalCost: 50000,
  latestCurrency: 'TWD',
}

const renderForm = (props = {}) => {
  const onSubmit = vi.fn()
  const onCalibrateInstead = vi.fn()
  render(
    <>
      <HoldingActionForm
        formId="holding-action"
        mode="buy"
        holding={holding}
        holderOptions={[{ value: 'Po', label: 'Po' }, { value: 'Wei', label: 'Wei' }]}
        holdingTagOptions={[{ value: 'STOCK', label: '個股' }, { value: 'ETF', label: 'ETF' }]}
        onSubmit={onSubmit}
        onCalibrateInstead={onCalibrateInstead}
        {...props}
      />
      <button type="submit" form="holding-action">送出</button>
    </>,
  )
  return { onSubmit, onCalibrateInstead }
}

const sharesInput = () => screen.getByRole('spinbutton', { name: '股數' })
const submit = () => fireEvent.click(screen.getByRole('button', { name: '送出' }))

describe('<HoldingActionForm /> buy', () => {
  it('previews the new average and submits shares and price', async () => {
    const { onSubmit } = renderForm()
    fireEvent.change(sharesInput(), { target: { value: '50' } })
    fireEvent.change(screen.getByRole('spinbutton', { name: /每股價格/ }), { target: { value: '560' } })
    expect(await screen.findByText(/買進後 150 股 · 均價 \$520/)).toBeInTheDocument()
    submit()
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ shares: 50, price: 560 }))
  })

  it('points to calibration when the holding has no cost', () => {
    const { onCalibrateInstead } = renderForm({ holding: { ...holding, totalCost: null } })
    expect(screen.getByText(/這檔還沒設定成本/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '先校正成本' }))
    expect(onCalibrateInstead).toHaveBeenCalled()
  })
})

describe('<HoldingActionForm /> sell', () => {
  it('refuses more shares than are held', async () => {
    const { onSubmit } = renderForm({ mode: 'sell' })
    fireEvent.change(sharesInput(), { target: { value: '101' } })
    submit()
    expect(await screen.findByText('賣出股數不可超過持有股數')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('fills everything with 全部 and warns that the holding goes away', async () => {
    renderForm({ mode: 'sell' })
    fireEvent.click(screen.getByRole('button', { name: '全部' }))
    expect(sharesInput()).toHaveValue('100')
    expect(await screen.findByText('賣出全部會移除這筆持股')).toBeInTheDocument()
  })

  it('previews the remaining shares and submits', async () => {
    const { onSubmit } = renderForm({ mode: 'sell' })
    fireEvent.change(sharesInput(), { target: { value: '30' } })
    expect(await screen.findByText('賣出後 70 股')).toBeInTheDocument()
    submit()
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ shares: 30 }))
  })
})

describe('<HoldingActionForm /> calibrate', () => {
  it('starts from the current shares and average, and can clear the cost', async () => {
    const { onSubmit } = renderForm({ mode: 'calibrate' })
    expect(screen.getByText('用於修正錯誤、股票分割或配股，不算買賣。')).toBeInTheDocument()
    expect(sharesInput()).toHaveValue('100')
    const average = screen.getByRole('spinbutton', { name: /平均成本/ })
    expect(average).toHaveValue('500')
    fireEvent.change(average, { target: { value: '' } })
    submit()
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ shares: 100, averageCost: null }))
  })
})

describe('<HoldingActionForm /> edit', () => {
  it('submits the current tag and holder', async () => {
    const { onSubmit } = renderForm({ mode: 'edit' })
    submit()
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ assetTag: 'STOCK', holder: 'Po' }))
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/HoldingActionForm.test.jsx`
Expected: FAIL（找不到模組）

- [ ] **Step 3: Implement**

Create `src/components/HoldingActionForm.jsx`：

```jsx
import { Alert, Button, Form, InputNumber, Select, Typography } from "antd";
import { formatPrice } from "../utils/formatters";
import {
  applyBuy,
  applySell,
  getAverageCost,
  getHoldingCurrency,
} from "../utils/holdingShares";

const { Text } = Typography;

export const HOLDING_ACTION_TITLES = {
  buy: "買進",
  sell: "賣出",
  calibrate: "校正股數與成本",
  edit: "編輯分類與持有人",
};

export const HOLDING_ACTION_SUBMIT_TEXT = {
  buy: "買進",
  sell: "賣出",
  calibrate: "儲存",
  edit: "儲存",
};

const formatShares = (value) =>
  Number(value).toLocaleString("zh-TW", { maximumFractionDigits: 4 });

const isPositive = (value) => typeof value === "number" && Number.isFinite(value) && value > 0;
const isNonNegative = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;

// Buy / sell / calibrate / edit one holding, opened from the stock detail
// sheet. The submit button lives in the surrounding sheet or modal
// (form={formId}); previews use the same maths as portfolioService.
function HoldingActionForm({
  formId,
  mode,
  holding,
  holderOptions = [],
  holdingTagOptions = [],
  popupContainer,
  disabled = false,
  onSubmit,
  onCalibrateInstead,
}) {
  const [form] = Form.useForm();
  const watchedShares = Form.useWatch("shares", form);
  const watchedPrice = Form.useWatch("price", form);
  const currency = getHoldingCurrency(holding);
  const isUs = holding.market === "US";
  const averageCost = getAverageCost(holding);

  const sharesInput = (
    <InputNumber
      min={isUs ? 0.0001 : 1}
      step={1}
      precision={isUs ? 4 : 0}
      inputMode={isUs ? "decimal" : "numeric"}
      style={{ width: "100%" }}
    />
  );

  const handleFinish = (values) => {
    if (mode === "buy") {
      onSubmit?.({ shares: values.shares, price: values.price });
    } else if (mode === "sell") {
      onSubmit?.({ shares: values.shares });
    } else if (mode === "calibrate") {
      onSubmit?.({ shares: values.shares, averageCost: values.averageCost ?? null });
    } else {
      onSubmit?.({ assetTag: values.assetTag, holder: values.holder });
    }
  };

  let preview = null;
  if (mode === "buy" && isPositive(watchedShares) && isNonNegative(watchedPrice)) {
    const next = applyBuy(holding, { shares: watchedShares, price: watchedPrice });
    const nextAverage = getAverageCost(next);
    preview = `買進後 ${formatShares(next.shares)} 股${
      nextAverage === null ? "" : ` · 均價 ${formatPrice(nextAverage, currency)}`
    }`;
  } else if (
    mode === "sell" &&
    isPositive(watchedShares) &&
    watchedShares < Number(holding.shares)
  ) {
    preview = `賣出後 ${formatShares(applySell(holding, watchedShares).shares)} 股`;
  }
  const sellsAll = mode === "sell" && watchedShares === Number(holding.shares);

  return (
    <Form
      id={formId}
      form={form}
      layout="vertical"
      disabled={disabled}
      autoComplete="off"
      initialValues={
        mode === "calibrate"
          ? {
              shares: holding.shares,
              averageCost:
                averageCost === null ? null : Math.round(averageCost * 10000) / 10000,
            }
          : mode === "edit"
            ? { assetTag: holding.assetTag || "STOCK", holder: holding.holder ?? undefined }
            : {}
      }
      onFinish={handleFinish}
    >
      {mode === "calibrate" && (
        <Text type="secondary" className="holding-action-note">
          用於修正錯誤、股票分割或配股，不算買賣。
        </Text>
      )}

      {mode === "buy" && averageCost === null && (
        <Alert
          type="info"
          showIcon
          className="holding-action-note"
          title="這檔還沒設定成本，買進後仍需校正成本才能看到損益"
          action={
            <Button type="link" size="small" onClick={onCalibrateInstead}>
              先校正成本
            </Button>
          }
        />
      )}

      {mode === "edit" ? (
        <>
          <Form.Item label="持股分類" name="assetTag" rules={[{ required: true, message: "請選擇分類" }]}>
            <Select options={holdingTagOptions} getPopupContainer={popupContainer} />
          </Form.Item>
          <Form.Item label="持有人" name="holder" rules={[{ required: true, message: "請選擇持有人" }]}>
            <Select options={holderOptions} getPopupContainer={popupContainer} placeholder="請選擇持有人" />
          </Form.Item>
        </>
      ) : (
        <Form.Item
          label="股數"
          name="shares"
          extra={
            mode === "sell" ? (
              <span className="holding-action-extra">
                {`目前 ${formatShares(holding.shares)} 股`}
                <Button
                  type="link"
                  size="small"
                  onClick={() => form.setFieldsValue({ shares: Number(holding.shares) })}
                >
                  全部
                </Button>
              </span>
            ) : undefined
          }
          rules={[
            { required: true, message: "請輸入股數" },
            ...(mode === "sell"
              ? [
                  {
                    validator: (_, value) =>
                      typeof value === "number" && value > Number(holding.shares)
                        ? Promise.reject(new Error("賣出股數不可超過持有股數"))
                        : Promise.resolve(),
                  },
                ]
              : []),
          ]}
        >
          {sharesInput}
        </Form.Item>
      )}

      {mode === "buy" && (
        <Form.Item
          label={`每股價格（${currency}）`}
          name="price"
          rules={[{ required: true, message: "請輸入價格" }]}
        >
          <InputNumber min={0} step={0.01} inputMode="decimal" style={{ width: "100%" }} />
        </Form.Item>
      )}

      {mode === "calibrate" && (
        <Form.Item label={`平均成本（${currency}）`} name="averageCost" extra="留空表示未設定成本">
          <InputNumber min={0} step={0.01} inputMode="decimal" style={{ width: "100%" }} />
        </Form.Item>
      )}

      {sellsAll && (
        <Alert type="warning" showIcon className="holding-action-note" title="賣出全部會移除這筆持股" />
      )}
      {preview && <Text type="secondary">{preview}</Text>}
    </Form>
  );
}

export default HoldingActionForm;
```

CSS 加到 `src/App.css` 的 `.stock-detail-source` 規則之後：

```css
/* HoldingActionForm (buy / sell / calibrate / edit a holding). */
.holding-action-note {
  display: block;
  margin-bottom: var(--space-4);
}

.holding-action-extra {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/HoldingActionForm.test.jsx`
Expected: PASS。若 antd 6 的 `Alert` 不吃 `title`（舊版是 `message`），以 `StockDetailSheet.jsx` 的用法為準（目前用 `title`）。

- [ ] **Step 5: Commit**

```bash
git add src/components/HoldingActionForm.jsx src/components/HoldingActionForm.test.jsx src/App.css
git commit -m "Add the buy / sell / calibrate / edit form for a holding"
```

---

### Task 5: 新增持股表單帶買進價格，重複時視為買進

**Files:**
- Modify: `src/components/HoldingForm.jsx`
- Modify: `src/components/HoldingForm.test.jsx`
- Modify: `src/utils/holdingShares.js`、`src/utils/holdingShares.test.js`（刪除 `HOLDING_SHARES_MODE`、`resolveNextShares`）

**Interfaces:**
- Consumes: Task 1 的 `applyBuy`、`getAverageCost`、`getHoldingCurrency`；Task 3 的 `upsertHolding` 接受 `price`。
- Produces: `HoldingForm` 的 `onSubmit(values)` 送出 `{ market, assetTag, holder, symbol, shares, price }`（不再有 `sharesMode`）。`App.jsx` 的 `handleAddHolding` 直接把 values 傳給 `upsertHolding`，不需改。

- [ ] **Step 1: Update the tests first**

`HoldingForm.test.jsx`：
- `fillAndSubmit` 在填股數後加：
  ```js
  fireEvent.change(screen.getByRole('spinbutton', { name: /買進價格/ }), { target: { value: '500' } })
  ```
- `'does not offer to add to the holding it has just created'`：把 `expect(screen.queryByText('加總到現有股數')).not.toBeInTheDocument()` 改為 `expect(screen.queryByText(/將以買進方式加碼/)).not.toBeInTheDocument()`。
- `'keeps showing the pre-submit shares...'`：把 `'Po 已持有 100 股'` 改為 `'Po 已持有 100 股，將以買進方式加碼'`。
- `'renders the expected fields'` 加 `expect(screen.getByLabelText(/買進價格/)).toBeInTheDocument()`。
- 新增：

```jsx
  it('previews a buy into an existing holding at the new average', async () => {
    render(
      <HoldingForm
        onSubmit={vi.fn()}
        holderOptions={[{ value: 'Po', label: 'Po' }]}
        existingHoldings={[{ market: 'TW', symbol: '2330', holder: 'Po', shares: 100, totalCost: 50000 }]}
      />,
    )
    fireEvent.mouseDown(screen.getByRole('combobox', { name: '持有人' }))
    fireEvent.click(await screen.findByTitle('Po'))
    fireEvent.change(screen.getByPlaceholderText('例如 2330 或 AAPL'), { target: { value: '2330' } })
    fireEvent.change(screen.getByRole('spinbutton', { name: '股數' }), { target: { value: '50' } })
    fireEvent.change(screen.getByRole('spinbutton', { name: /買進價格/ }), { target: { value: '560' } })
    expect(await screen.findByText(/儲存後 150 股 · 均價 \$520/)).toBeInTheDocument()
    expect(screen.queryByText('覆蓋為輸入的股數')).not.toBeInTheDocument()
  })

  it('notes that an existing holding without cost still needs calibrating', async () => {
    render(
      <HoldingForm
        onSubmit={vi.fn()}
        holderOptions={[{ value: 'Po', label: 'Po' }]}
        existingHoldings={[{ market: 'TW', symbol: '2330', holder: 'Po', shares: 100, totalCost: null }]}
      />,
    )
    fireEvent.mouseDown(screen.getByRole('combobox', { name: '持有人' }))
    fireEvent.click(await screen.findByTitle('Po'))
    fireEvent.change(screen.getByPlaceholderText('例如 2330 或 AAPL'), { target: { value: '2330' } })
    fireEvent.change(screen.getByRole('spinbutton', { name: '股數' }), { target: { value: '50' } })
    fireEvent.change(screen.getByRole('spinbutton', { name: /買進價格/ }), { target: { value: '560' } })
    expect(await screen.findByText('儲存後 150 股（成本仍需校正）')).toBeInTheDocument()
  })
```

`holdingShares.test.js`：刪除 `describe('resolveNextShares', ...)` 整段，import 移除 `HOLDING_SHARES_MODE`、`resolveNextShares`。

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/HoldingForm.test.jsx`
Expected: FAIL（沒有買進價格欄位）

- [ ] **Step 3: Implement**

`HoldingForm.jsx`：
- import 改為：
  ```js
  import { Alert, Form, Input, InputNumber, Select } from "antd";
  import {
    applyBuy,
    findExistingHolding,
    getAverageCost,
    getHoldingCurrency,
  } from "../utils/holdingShares";
  import { formatPrice } from "../utils/formatters";
  ```
- 移除 `watchedSharesMode`，新增 `const watchedPrice = Form.useWatch("price", form);`
- 把 `previewShares` 計算換成：
  ```js
  const inputShares = Number(watchedShares);
  const inputPrice = Number(watchedPrice);
  const priceCurrency = watchedMarket === "US" ? "USD" : "TWD";
  let previewText;
  if (existingHolding && Number.isFinite(inputShares) && inputShares > 0) {
    const hasPrice = watchedPrice !== null && watchedPrice !== undefined && Number.isFinite(inputPrice) && inputPrice >= 0;
    const next = applyBuy(existingHolding, { shares: inputShares, price: hasPrice ? inputPrice : 0 });
    const sharesText = `儲存後 ${next.shares.toLocaleString("zh-TW")} 股`;
    if (existingHolding.totalCost === null || existingHolding.totalCost === undefined) {
      previewText = `${sharesText}（成本仍需校正）`;
    } else if (hasPrice) {
      previewText = `${sharesText} · 均價 ${formatPrice(getAverageCost(next), getHoldingCurrency(existingHolding))}`;
    } else {
      previewText = sharesText;
    }
  }
  ```
- `initialValues` 移除 `sharesMode`。
- `form.resetFields(["symbol", "shares"])` 改為 `form.resetFields(["symbol", "shares", "price"])`。
- 在「股數」`Form.Item` 之後加：
  ```jsx
  <Form.Item
    label={`買進價格（${priceCurrency}）`}
    name="price"
    rules={[{ required: true, message: "請輸入買進價格" }]}
  >
    <InputNumber
      disabled={disabled}
      min={0}
      step={0.01}
      inputMode="decimal"
      style={isVerticalLayout ? { width: "100%" } : { width: 140 }}
    />
  </Form.Item>
  ```
- 既有持股區塊整段換成（不再有 Radio）：
  ```jsx
  {existingHolding ? (
    <Alert
      type="info"
      showIcon
      style={{ marginBottom: 12 }}
      message={`${watchedHolder} 已持有 ${Number(existingHolding.shares).toLocaleString("zh-TW")} 股，將以買進方式加碼`}
      description={previewText}
    />
  ) : null}
  ```
  （`style={{ marginBottom: 12 }}` 與 `message` prop 是這個檔案既有寫法，保持原樣，不在這個 task 改。）

`holdingShares.js`：刪除 `HOLDING_SHARES_MODE` 與 `resolveNextShares`。確認 `grep -rn "HOLDING_SHARES_MODE\|resolveNextShares" src` 沒有結果。

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/HoldingForm.test.jsx src/utils/holdingShares.test.js && npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/HoldingForm.jsx src/components/HoldingForm.test.jsx src/utils/holdingShares.js src/utils/holdingShares.test.js
git commit -m "Ask for the buy price when adding a holding; adding to one is a buy"
```

---

### Task 6: 個股細節頁以單一持股為單位，顯示成本與操作

**Files:**
- Create: `src/components/stockDetail/HoldingPosition.jsx`
- Modify: `src/components/StockDetailSheet.jsx`
- Modify: `src/utils/stockDetail.js`（`buildStockDetailHolding`）
- Modify: `src/App.css`（`.stock-detail-holding` → 新 class）
- Test: `src/components/StockDetailSheet.test.jsx`、`src/utils/stockDetail.test.js`

**Interfaces:**
- Consumes: Task 1 的 `getAverageCost`、`getUnrealized`、`getHoldingCurrency`；row 的 `holderName`、`shares`、`latestValueTwd`、`totalCost`、`latestPrice`。
- Produces: `StockDetailSheet` 新 prop `onAction(action)`，`action` 為 `'buy' | 'sell' | 'calibrate' | 'edit' | 'remove'`。`buildStockDetailHolding(rows, id)` 回傳該 row 本身（不再有 `totalShares` / `totalValueTwd`），找不到回傳 `null`。

- [ ] **Step 1: Write the failing tests**

`stockDetail.test.js` 的 `describe('buildStockDetailHolding', ...)` 換成：

```js
describe('buildStockDetailHolding', () => {
  const rows = [
    { id: 1, market: 'TW', symbol: '2330', holder: 'Po', shares: 1000, latestValueTwd: 1085000 },
    { id: 2, market: 'TW', symbol: '2330', holder: 'Mia', shares: 500, latestValueTwd: 542500 },
  ]

  it('returns only the tapped holder’s holding', () => {
    expect(buildStockDetailHolding(rows, 2)).toBe(rows[1])
  })

  it('returns null for an unknown id', () => {
    expect(buildStockDetailHolding(rows, 99)).toBeNull()
  })
})
```

`StockDetailSheet.test.jsx`：
- `holding` fixture：拿掉 `totalShares`、`totalValueTwd`，加上 `holder: 'Po', holderName: 'Po', shares: 2000, latestValueTwd: 2170000, totalCost: null`。
- `renderSheet` 預設 props 加 `onAction: vi.fn()`。
- 第一個測試的 `/持有 2,000 股/` 改為 `/Po 持有 2,000 股/`。
- 新增：

```jsx
  it('shows the average cost and unrealized gain when the cost is set', () => {
    useStockFundamentals.mockReturnValue({ status: 'ready', data: fundamentals, reload })
    renderSheet({ holding: { ...holding, totalCost: 1000000 } })
    expect(screen.getByText('均價 $500.00 · 成本 $1,000,000')).toBeInTheDocument()
    expect(screen.getByText('未實現 +$1,170,000（+117.0%）')).toBeInTheDocument()
  })

  it('offers to set the cost when it is missing', () => {
    useStockFundamentals.mockReturnValue({ status: 'ready', data: fundamentals, reload })
    const onAction = vi.fn()
    renderSheet({ onAction })
    expect(screen.getByText('未設定成本')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '設定成本' }))
    expect(onAction).toHaveBeenCalledWith('calibrate')
  })

  it('routes every holding action through onAction', () => {
    useStockFundamentals.mockReturnValue({ status: 'loading', reload })
    const onAction = vi.fn()
    renderSheet({ onAction })
    for (const [name, action] of [
      ['買進', 'buy'],
      ['賣出', 'sell'],
      ['編輯分類與持有人', 'edit'],
      ['校正股數與成本', 'calibrate'],
      ['移除持股', 'remove'],
    ]) {
      fireEvent.click(screen.getByRole('button', { name }))
      expect(onAction).toHaveBeenLastCalledWith(action)
    }
  })

  it('disables the actions while writing is not allowed', () => {
    useStockFundamentals.mockReturnValue({ status: 'loading', reload })
    renderSheet({ disabled: true })
    expect(screen.getByRole('button', { name: '買進' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '移除持股' })).toBeDisabled()
  })
```

（antd 會在兩個中文字的按鈕字間插空白，例如「買 進」。若 `getByRole('button', { name: '買進' })` 找不到，比照既有測試的寫法改用 `{ name: /買\s*進/ }`、`/賣\s*出/`。）

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/StockDetailSheet.test.jsx src/utils/stockDetail.test.js`
Expected: FAIL

- [ ] **Step 3: Implement**

`stockDetail.js`：`buildStockDetailHolding` 與上方註解換成：

```js
// The sheet shows the holding that was tapped: one stock of one holder.
// The same stock under another holder is a separate holding with its own
// shares and cost.
export const buildStockDetailHolding = (rows, id) =>
  rows.find((item) => item.id === id) ?? null
```

Create `src/components/stockDetail/HoldingPosition.jsx`：

```jsx
import { Button, Typography } from "antd";
import { formatPrice, formatTwd } from "../../utils/formatters";
import {
  getAverageCost,
  getHoldingCurrency,
  getUnrealized,
} from "../../utils/holdingShares";
import { formatSignedPercent } from "../../utils/stockDetail";

const { Text } = Typography;

const formatShares = (value) =>
  Number(value).toLocaleString("zh-TW", { maximumFractionDigits: 4 });

// Totals read better without cents in TWD; per-share prices keep them.
const formatAmount = (value, currency) =>
  currency === "TWD" ? formatTwd(value) : formatPrice(value, currency);

const formatSignedAmount = (value, currency) =>
  `${value >= 0 ? "+" : "−"}${formatAmount(Math.abs(value), currency)}`;

// The tapped holder's position in the stock detail sheet, with 買進 / 賣出.
function HoldingPosition({ holding, disabled, onAction }) {
  const currency = getHoldingCurrency(holding);
  const averageCost = getAverageCost(holding);
  const unrealized = getUnrealized(holding);

  return (
    <section className="stock-detail-position" aria-label="持股">
      <Text type="secondary">
        {`${holding.holderName || "未設定"} 持有 ${formatShares(holding.shares)} 股 · 市值 ${formatTwd(holding.latestValueTwd)}`}
      </Text>
      {averageCost === null ? (
        <div className="stock-detail-position-line">
          <Text type="secondary">未設定成本</Text>
          <Button type="link" size="small" disabled={disabled} onClick={() => onAction?.("calibrate")}>
            設定成本
          </Button>
        </div>
      ) : (
        <>
          <div className="stock-detail-position-line">
            {`均價 ${formatPrice(averageCost, currency)} · 成本 ${formatAmount(holding.totalCost, currency)}`}
          </div>
          {unrealized && (
            <div
              className={`stock-detail-position-line ${
                unrealized.amount >= 0 ? "stock-detail-change--up" : "stock-detail-change--down"
              }`}
            >
              {`未實現 ${formatSignedAmount(unrealized.amount, currency)}${
                unrealized.pct === null ? "" : `（${formatSignedPercent(unrealized.pct)}）`
              }`}
            </div>
          )}
        </>
      )}
      <div className="stock-detail-trade">
        <Button block disabled={disabled} onClick={() => onAction?.("buy")}>
          買進
        </Button>
        <Button block disabled={disabled} onClick={() => onAction?.("sell")}>
          賣出
        </Button>
      </div>
    </section>
  );
}

export default HoldingPosition;
```

`StockDetailSheet.jsx`：
- 簽名改為 `function StockDetailSheet({ open, holding, isMobile, disabled, onClose, onAction })`，import `HoldingPosition`。
- 檔頭註解改為：`// One holding (one stock, one holder): price, position and cost, buy / sell, EPS × P/E valuation, EPS trend and P/E history, then managing the holding. Mobile shows a bottom sheet, desktop a right-hand drawer. The parent keys this by holding so basis / fold state reset when another opens.`
- `header` 裡刪除 `stock-detail-holding` 那個 `<Text>`。
- `content` 改為：

```jsx
  const content = (
    <>
      <header className="stock-detail-header">
        {/* price + change, unchanged */}
      </header>
      <HoldingPosition holding={holding} disabled={disabled} onAction={onAction} />
      {body}
      <div className="stock-detail-manage">
        <Button block disabled={disabled} onClick={() => onAction?.("edit")}>
          編輯分類與持有人
        </Button>
        <Button block disabled={disabled} onClick={() => onAction?.("calibrate")}>
          校正股數與成本
        </Button>
        <Button block danger disabled={disabled} onClick={() => onAction?.("remove")}>
          移除持股
        </Button>
      </div>
    </>
  );
```

`App.css`：刪除 `.stock-detail-holding` 規則，在 `.stock-detail-source` 之前加：

```css
.stock-detail-position {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-3) 0;
  border-bottom: 1px solid var(--c-line);
  font-variant-numeric: tabular-nums;
}

.stock-detail-position-line {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.stock-detail-trade {
  display: flex;
  gap: var(--space-3);
  margin-top: var(--space-2);
}

.stock-detail-manage {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4) 0 var(--space-2);
  border-top: 1px solid var(--c-line);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/StockDetailSheet.test.jsx src/utils/stockDetail.test.js && npm test`
Expected: PASS（App 尚未傳 `onAction`，`?.` 讓它安全）

- [ ] **Step 5: Commit**

```bash
git add src/components/stockDetail/HoldingPosition.jsx src/components/StockDetailSheet.jsx src/components/StockDetailSheet.test.jsx src/utils/stockDetail.js src/utils/stockDetail.test.js src/App.css
git commit -m "Show one holder's position, cost and actions in the stock detail sheet"
```

---

### Task 7: App 接線、移除列表上的持股編輯

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/App.css`（刪 `.holding-mobile-editor*`、`.holding-mobile-actions`）
- Modify: `src/services/portfolioService.js`（刪 `updateHoldingShares`）
- Test: `src/App.smoke.test.jsx`（只需仍通過）

**Interfaces:**
- Consumes: Task 3 的 `buyHolding`、`sellHolding`、`calibrateHolding`；既有 `updateHoldingHolder`、`updateHoldingTag`、`removeHolding`；Task 4 的 `HoldingActionForm`、`HOLDING_ACTION_TITLES`、`HOLDING_ACTION_SUBMIT_TEXT`；Task 6 的 `onAction`。
- Produces: 無（最上層）。

- [ ] **Step 1: Imports 與 state**

- service import：移除 `updateHoldingShares`，加入 `buyHolding`、`calibrateHolding`、`sellHolding`。
- 加 `import HoldingActionForm, { HOLDING_ACTION_SUBMIT_TEXT, HOLDING_ACTION_TITLES } from "./components/HoldingActionForm";`
- 刪除 state：`editingHoldingId`、`editingShares`、`editingHoldingTag`、`editingHoldingHolder`、`loadingActionById`。
- 在 `const [stockDetailId, setStockDetailId] = useState(null);` 下面加：
  ```js
  // Which form is open over the stock detail sheet: buy / sell / calibrate / edit.
  const [holdingAction, setHoldingAction] = useState(null);
  const [loadingHoldingAction, setLoadingHoldingAction] = useState(false);
  ```
- 在其他 form id 常數旁（`grep -n "CASH_EDIT_FORM_ID =" src/App.jsx`）加 `const HOLDING_ACTION_FORM_ID = "holding-action-form";`

- [ ] **Step 2: Handlers**

- 刪除 `setRowLoading`、`handleEditClick`、`handleCancelEdit`、`handleSaveShares`。
- `handleRemoveHolding` 換成：
  ```js
  const handleRemoveHolding = useCallback(
    async (record) => {
      try {
        await removeHolding({ id: record.id });
        setStockDetailId(null);
        await loadAllData();
        await performCloudSync();
        message.success("持股已移除");
      } catch (error) {
        message.error(toUserMessage(error, "移除持股失敗"));
      }
    },
    [loadAllData, message, performCloudSync],
  );
  ```
- 在 `const stockDetail = useMemo(...)` 之後加：
  ```js
  const handleStockDetailAction = useCallback(
    (action) => {
      if (!stockDetail) return;
      if (action === "remove") {
        confirmDestructive({
          title: "移除此持股？",
          content: "會一併刪除該持股的所有快照資料。",
          okText: "移除",
          onOk: () => handleRemoveHolding(stockDetail),
        });
        return;
      }
      setHoldingAction(action);
    },
    [confirmDestructive, handleRemoveHolding, stockDetail],
  );

  const handleSubmitHoldingAction = useCallback(
    async (values) => {
      if (!holdingAction || !stockDetail) return;
      const id = stockDetail.id;
      const run = async () => {
        setLoadingHoldingAction(true);
        try {
          let removed = false;
          if (holdingAction === "buy") {
            await buyHolding({ id, shares: values.shares, price: values.price });
          } else if (holdingAction === "sell") {
            ({ removed } = await sellHolding({ id, shares: values.shares }));
          } else if (holdingAction === "calibrate") {
            await calibrateHolding({ id, shares: values.shares, averageCost: values.averageCost });
          } else {
            if ((values.holder ?? null) !== (stockDetail.holder ?? null)) {
              await updateHoldingHolder({ id, holder: values.holder ?? null });
            }
            if (values.assetTag && values.assetTag !== stockDetail.assetTag) {
              await updateHoldingTag({ id, assetTag: values.assetTag });
            }
          }
          await loadAllData();
          await performCloudSync();
          setHoldingAction(null);
          if (removed) setStockDetailId(null);
          message.success(removed ? "已賣出全部並移除持股" : "持股已更新");
        } catch (error) {
          message.error(toUserMessage(error, "更新持股失敗"));
        } finally {
          setLoadingHoldingAction(false);
        }
      };
      if (holdingAction === "sell" && values.shares >= Number(stockDetail.shares)) {
        confirmDestructive({
          title: "賣出全部？",
          content: "賣出全部會移除這筆持股，並一併刪除它的快照資料。",
          okText: "賣出並移除",
          onOk: run,
        });
        return;
      }
      await run();
    },
    [confirmDestructive, holdingAction, loadAllData, message, performCloudSync, stockDetail],
  );
  ```
  （改持有人時本地 `id` 不變：`mirrorToCloud` 帶 `preferLocalId`，`applyRemoteHolding` 找不到新 key 時用它更新同一列，所以細節頁會直接顯示新持有人，不用重新定位。）

- [ ] **Step 3: Table columns**

在 `tableColumns` 的 `useMemo` 內：
- 「股數」欄 `render` 改為只回傳格式化數字（刪掉 `editingHoldingId` 判斷與 `InputNumber`）。
- 「分類」「持有人」欄 `render` 刪掉 `editingHoldingId === record.id` 分支。
- 刪除整個 `title: "操作"` 欄。
- 手機分支：刪除 `if (editingHoldingId === record.id) { ... }` 那段 editor；刪掉 `rowBusy`；`MobileSwipeRow` 改為：
  ```jsx
  <MobileSwipeRow
    onTap={() => setStockDetailId(record.id)}
    label={`${name}，市值 ${formatTwd(record.latestValueTwd)}${todayText}，查看個股`}
    actions={[]}
    main={...}
    side={...}
  />
  ```
  並把上方註解「One column: the row slides to reveal 編輯 / 移除 ... The editor replaces the row while editing.」改為 `// One column; tapping a row opens the stock detail sheet, where every holding action lives.`
- `byKey` 若已無人使用就刪除。
- 更新 `useMemo` 依賴陣列：移除已刪除的名稱（`confirmDestructive`、`editing*`、`handleCancelEdit`、`handleEditClick`、`handleRemoveHolding`、`handleSaveShares`、`loadingActionById`，以及因此不再使用的 `holderSelectOptions` 等）。以 `npm run lint` 的 `react-hooks/exhaustive-deps` 結果為準。
- 桌面表格 `onRow` 的 `if (editingHoldingId === record.id || isInteractiveTarget(...))` 改為 `if (isInteractiveTarget(event.target, event.currentTarget)) return;`

- [ ] **Step 4: Render**

在 `cashAccountEditFormNode` 定義旁加：

```jsx
  const holdingActionFormNode =
    holdingAction && stockDetail ? (
      <HoldingActionForm
        key={`${stockDetail.id}_${holdingAction}`}
        formId={HOLDING_ACTION_FORM_ID}
        mode={holdingAction}
        holding={stockDetail}
        holderOptions={holderSelectOptions}
        holdingTagOptions={holdingTagOptions}
        popupContainer={getSheetPopupContainer}
        disabled={isWriteDisabled}
        onSubmit={handleSubmitHoldingAction}
        onCalibrateInstead={() => setHoldingAction("calibrate")}
      />
    ) : null;
  const holdingActionOpen = Boolean(holdingAction && stockDetail);
  const closeHoldingAction = () => {
    if (!loadingHoldingAction) setHoldingAction(null);
  };
```

`StockDetailSheet` 改為：

```jsx
          <StockDetailSheet
            key={stockDetail ? stockDetail.id : "none"}
            open={Boolean(stockDetail) && !holdingActionOpen}
            holding={stockDetail}
            isMobile={isMobileViewport}
            disabled={isWriteDisabled}
            onClose={() => setStockDetailId(null)}
            onAction={handleStockDetailAction}
          />

          <MobileFormSheetLayout
            title={holdingAction ? HOLDING_ACTION_TITLES[holdingAction] : ""}
            open={isMobileViewport && holdingActionOpen}
            onClose={closeHoldingAction}
            loading={loadingHoldingAction}
            submitDisabled={isWriteDisabled}
            submitText={holdingAction ? HOLDING_ACTION_SUBMIT_TEXT[holdingAction] : "儲存"}
            submitFormId={HOLDING_ACTION_FORM_ID}
            className="holding-sheet"
          >
            {isMobileViewport && holdingActionFormNode}
          </MobileFormSheetLayout>

          <Modal
            title={holdingAction ? HOLDING_ACTION_TITLES[holdingAction] : ""}
            open={!isMobileViewport && holdingActionOpen}
            onCancel={closeHoldingAction}
            confirmLoading={loadingHoldingAction}
            okText={holdingAction ? HOLDING_ACTION_SUBMIT_TEXT[holdingAction] : "儲存"}
            cancelText="取消"
            okButtonProps={{ disabled: isWriteDisabled, htmlType: "submit", form: HOLDING_ACTION_FORM_ID }}
            destroyOnHidden
          >
            {!isMobileViewport && holdingActionFormNode}
          </Modal>
```

（`Modal` 其他 props 比照「編輯銀行帳戶」那個 `Modal` 的寫法；若它有 `okText` / `cancelText` 以外的共同設定，照抄。）

- [ ] **Step 5: 清掉死碼**

- `portfolioService.js`：刪除 `updateHoldingShares`。
- `App.css`：刪除 `.holding-mobile-editor`、`.holding-mobile-editor label`、`.holding-mobile-editor .ant-input-number, .holding-mobile-editor .ant-select`、`.holding-mobile-editor-actions`、`.holding-mobile-actions .ant-space`（先 `grep -rn "holding-mobile-actions\|holding-mobile-editor\|mobile-swipe-row--editing" src` 確認沒人用；`mobile-swipe-row--editing` 若只剩 CSS 也一起刪）。
- `stockDetail.js` 的 `isInteractiveTarget` 註解「(edit, delete, drag handle, inline editors)」改為「(drag handle and other controls)」。
- `grep -rn "updateHoldingShares\|editingHolding\|handleSaveShares\|loadingActionById" src` 應無結果。

- [ ] **Step 6: Verify**

Run: `npm run lint && npm test && npm run build`
Expected: 全部通過，沒有 unused-vars / exhaustive-deps 警告。

- [ ] **Step 7: Commit**

```bash
git add src/App.jsx src/App.css src/services/portfolioService.js src/utils/stockDetail.js
git commit -m "Move every holding action into the stock detail sheet"
```

---

### Task 8: DESIGN.md 與瀏覽器實測

**Files:**
- Modify: `DESIGN.md`

- [ ] **Step 1: Update DESIGN.md**

- Lists 段落「手機上列可左滑出動作」那條最後加一句：`資產頁的持股列例外：不左滑，點一下開個股細節頁，所有持股操作都在那裡。`
- 在 `### Savings Goal Card（儲蓄目標）` 段落之後、`## Do's and Don'ts` 之前新增：

```markdown
### Stock Detail Sheet（個股細節）
- 以**單一持股**為單位（一檔股票 × 一位持有人）；同一檔股票的其他持有人是另一筆持股，不加總。手機 bottom sheet、桌面右側 drawer。
- 由上而下：價格與今日漲跌 → 持股摘要（「{持有人} 持有 N 股 · 市值」為 `muted`；「均價 · 成本」為 `ink`；未實現損益用 `up` / `down`；未設定成本時一行 `muted`「未設定成本」+ 連結「設定成本」）→「買進」「賣出」兩個並排的 default 按鈕 → 估價卡、EPS、本益比 → 最底的管理區：「編輯分類與持有人」「校正股數與成本」「移除持股」（`danger`）整列按鈕，以 1px `line` 與上方分隔。
- 每股價格（均價）帶小數；台幣的總額（成本、損益）不帶小數，美元照常帶。
- 操作表單（`HoldingActionForm`）：手機 bottom sheet、桌面 modal；開啟時細節頁暫時收起，存好後回到細節頁。買進／賣出即時預覽結果（「買進後 N 股 · 均價 $X」「賣出後 N 股」），賣出全部會再確認並移除持股。校正表單頂端註明「用於修正錯誤、股票分割或配股，不算買賣。」
- 規格來源：`docs/superpowers/specs/2026-10-11-holding-cost-basis-design.md`。
```

- [ ] **Step 2: Browser verification**

Run: `npm run dev`，用瀏覽器在 390px（手機）與 1280px（桌面）各走一次，登入狀態下：
1. 新增持股（填買進價格）→ 細節頁顯示均價、成本、未實現。
2. 用「新增持股」再加同一檔同持有人 → 提示「將以買進方式加碼」，存後股數與均價正確。
3. 細節頁「買進」→ 預覽與結果一致。
4. 「賣出」部分 → 均價不變；「全部」→ 確認對話框 → 持股消失、細節頁關閉。
5. 舊持股（沒有成本）→「設定成本」→ 校正後顯示損益。
6. 「編輯分類與持有人」改持有人 → 細節頁顯示新持有人，列表移到新持有人分組。
7. 「移除持股」→ 確認 → 移除。
8. 手機列表左滑沒有反應、點一下開細節頁；桌面表格沒有操作欄，點列開細節頁。
9. 未登入時所有操作按鈕停用。

記錄任何偏差並修正後再進行下一步。

- [ ] **Step 3: Commit**

```bash
git add DESIGN.md
git commit -m "Document the stock detail sheet's position and holding actions"
```
