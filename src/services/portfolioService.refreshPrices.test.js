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
