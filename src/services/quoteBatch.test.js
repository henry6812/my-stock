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
