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
vi.mock('./priceProviders/twseDailyProvider', () => ({
  getTwseDailyQuotes: vi.fn(async () => {
    throw new Error('down')
  }),
}))

import { db } from '../db/database'
import { assertCloudWriteReady } from './firebase/cloudSyncService'
import { getHoldingQuote } from './priceProviders/finnhubProvider'
import { addWatchlistItem, getWatchlistView, refreshWatchlistPrices, removeWatchlistItem } from './portfolioService'

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
