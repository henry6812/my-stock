import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('../priceProviders/finnhubProvider', () => ({ requestFinnhub: vi.fn() }))

import { requestFinnhub } from '../priceProviders/finnhubProvider'
import { getUsFundamentals, periodToQuarter, US_CACHE_TTL_MS } from './finnhubFundamentalsProvider'

const NOW = Date.parse('2026-10-05T12:00:00Z')

const responses = {
  '/stock/metric': {
    series: {
      quarterly: {
        eps: [
          { period: '2026-06-27', v: 2.0244 },
          { period: '2026-03-28', v: 2.0086 },
          { period: '2025-12-27', v: 2.8424 },
        ],
        peTTM: [
          { period: '2026-06-27', v: 32.1 },
          { period: '2026-03-28', v: 29.5 },
        ],
      },
    },
  },
  '/stock/earnings': [
    { period: '2026-06-30', actual: 1.91, estimate: 1.9271, surprisePercent: -0.8873, year: 2026, quarter: 3 },
  ],
  '/calendar/earnings': {
    earningsCalendar: [
      { date: '2027-01-27', hour: '', epsEstimate: 2.9512, epsActual: null },
      { date: '2026-10-29', hour: 'amc', epsEstimate: 2.0214, epsActual: null },
    ],
  },
}

beforeEach(() => {
  window.localStorage.clear()
  requestFinnhub.mockReset()
  requestFinnhub.mockImplementation(async (path) => responses[path])
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('periodToQuarter', () => {
  it('files fiscal period ends under the calendar quarter they mostly cover', () => {
    expect(periodToQuarter('2026-06-27')).toEqual({ year: 2026, quarter: 2 })
    expect(periodToQuarter('2025-12-27')).toEqual({ year: 2025, quarter: 4 })
    expect(periodToQuarter('2026-01-02')).toEqual({ year: 2025, quarter: 4 })
  })
})

describe('getUsFundamentals', () => {
  it('normalises Finnhub data oldest → newest', async () => {
    const data = await getUsFundamentals('AAPL', { now: NOW })
    expect(data.singles.map((s) => [s.year, s.quarter, s.eps])).toEqual([
      [2025, 4, 2.8424],
      [2026, 1, 2.0086],
      [2026, 2, 2.0244],
    ])
    expect(data.peSeries).toEqual([
      { label: '2026-03-28', pe: 29.5 },
      { label: '2026-06-27', pe: 32.1 },
    ])
    expect(data.upcoming.map((u) => u.date)).toEqual(['2026-10-29', '2027-01-27'])
    expect(data.surprises[0]).toMatchObject({ year: 2026, quarter: 2, actual: 1.91, surprisePercent: -0.8873 })
    expect(requestFinnhub).toHaveBeenCalledWith('/calendar/earnings', { symbol: 'AAPL', from: '2026-10-05', to: '2028-01-05' })
  })

  it('serves from cache within the TTL and refetches after it', async () => {
    await getUsFundamentals('AAPL', { now: NOW })
    await getUsFundamentals('AAPL', { now: NOW + US_CACHE_TTL_MS - 1 })
    expect(requestFinnhub).toHaveBeenCalledTimes(3)
    await getUsFundamentals('AAPL', { now: NOW + US_CACHE_TTL_MS + 1 })
    expect(requestFinnhub).toHaveBeenCalledTimes(6)
  })

  it('still works when localStorage throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    const data = await getUsFundamentals('AAPL', { now: NOW })
    expect(data.singles).toHaveLength(3)
  })

  it('treats a corrupted cache entry as a miss', async () => {
    window.localStorage.setItem('my-stock:fundamentals:US:AAPL', '{not json')
    const data = await getUsFundamentals('AAPL', { now: NOW })
    expect(data.singles).toHaveLength(3)
  })

  it('propagates Finnhub errors', async () => {
    requestFinnhub.mockRejectedValue(new Error('Finnhub API error: 401 (invalid API key).'))
    await expect(getUsFundamentals('AAPL', { now: NOW })).rejects.toThrow('401')
  })
})
