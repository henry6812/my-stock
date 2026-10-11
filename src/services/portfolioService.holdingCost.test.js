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
  updateHoldingHolder,
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

describe('updateHoldingHolder', () => {
  // The target holder removed this stock before: that soft-deleted row
  // shares the new key and must not be revived in place of the moved one.
  it('moves a holding onto a holder who once removed the same stock', async () => {
    const movedId = await addHolding({ holder: 'Po', shares: 100, totalCost: 50000 })
    const removedId = await addHolding({
      holder: 'Wei',
      shares: 7,
      totalCost: 700,
      deletedAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-01T00:00:00.000Z',
    })
    await updateHoldingHolder({ id: movedId, holder: 'Wei' })
    const active = (await db.holdings.toArray()).filter((row) => !row.deletedAt)
    expect(active).toHaveLength(1)
    expect(active[0]).toMatchObject({ id: movedId, holder: 'Wei', shares: 100, totalCost: 50000 })
    expect(await db.holdings.get(removedId)).toBeUndefined()
  })
})
