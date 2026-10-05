import { describe, it, expect, vi } from 'vitest'

vi.mock('./finnhubFundamentalsProvider', () => ({ getUsFundamentals: vi.fn() }))
vi.mock('./twFundamentalsProvider', () => ({ getTwFundamentals: vi.fn() }))

import { getUsFundamentals } from './finnhubFundamentalsProvider'
import { getTwFundamentals } from './twFundamentalsProvider'
import { loadStockFundamentals } from './index'

describe('loadStockFundamentals', () => {
  it('normalises TW data and uses the statutory deadline as next earnings', async () => {
    getTwFundamentals.mockResolvedValue({
      name: '台積電',
      cumulative: { '2026Q1': { eps: 16 }, '2026Q2': { eps: 35.17 } },
      peSeries: [{ label: '2026-09', pe: 28.1 }],
      epsUpdatedAt: '2026-10-05T12:03:11Z',
      peUpdatedAt: '2026-10-01T12:02:40Z',
    })
    const data = await loadStockFundamentals('TW', '2330', { todayIso: '2026-10-05' })
    expect(data.market).toBe('TW')
    expect(data.singles.map((s) => s.eps)).toEqual([16, 19.17])
    expect(data.nextEarnings).toEqual({ date: '2026-11-14', label: 'Q3 財報法定截止日' })
    expect(data.updatedAt).toBe('2026-10-05T12:03:11Z')
    expect(data.surprises).toEqual([])
  })

  it('returns null for a TW code missing from the snapshot', async () => {
    getTwFundamentals.mockResolvedValue(null)
    expect(await loadStockFundamentals('TW', '6488', { todayIso: '2026-10-05' })).toBeNull()
  })

  it('normalises US data with the next earnings date and session', async () => {
    getUsFundamentals.mockResolvedValue({
      fetchedAt: Date.parse('2026-10-05T12:00:00Z'),
      singles: [{ year: 2026, quarter: 2, period: '2026-06-27', eps: 2.02 }],
      peSeries: [],
      surprises: [],
      upcoming: [{ date: '2026-10-29', hour: 'amc', epsEstimate: 2.02 }],
    })
    const data = await loadStockFundamentals('US', 'AAPL', { todayIso: '2026-10-05' })
    expect(data.cumulative).toBeNull()
    expect(data.nextEarnings).toEqual({ date: '2026-10-29', label: '財報公布（盤後）' })
    expect(data.updatedAt).toBe('2026-10-05T12:00:00.000Z')
  })
})
