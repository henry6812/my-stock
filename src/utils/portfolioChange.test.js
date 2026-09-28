import { describe, it, expect } from 'vitest'
import {
  computeHoldingDailyChange,
  computePortfolioDailyChange,
  getMarketDateKey,
  isPriceDataStale,
} from './portfolioChange'

describe('computeHoldingDailyChange', () => {
  it('computes TW daily change from previous close (fx ignored)', () => {
    const r = computeHoldingDailyChange({
      market: 'TW',
      price: 105,
      previousClose: 100,
      shares: 10,
    })
    expect(r.changeTwd).toBe(50)
    expect(r.prevValueTwd).toBe(1000)
    expect(r.changePct).toBeCloseTo(5)
  })

  it('applies fx for US holdings', () => {
    const r = computeHoldingDailyChange({
      market: 'US',
      price: 110,
      previousClose: 100,
      shares: 2,
      fxRateToTwd: 30,
    })
    expect(r.changeTwd).toBe(600)
    expect(r.prevValueTwd).toBe(6000)
    expect(r.changePct).toBeCloseTo(10)
  })

  it('returns null when previous close is missing (pre-Plan-A snapshot)', () => {
    expect(
      computeHoldingDailyChange({ market: 'TW', price: 105, shares: 10 }),
    ).toBeNull()
  })

  it('returns null when current price is missing', () => {
    expect(
      computeHoldingDailyChange({ market: 'TW', previousClose: 100, shares: 10 }),
    ).toBeNull()
  })

  it('handles a zero previous close without dividing by zero', () => {
    const r = computeHoldingDailyChange({
      market: 'TW',
      price: 5,
      previousClose: 0,
      shares: 10,
    })
    expect(r.changeTwd).toBe(50)
    expect(r.changePct).toBeNull()
  })
})

describe('computePortfolioDailyChange', () => {
  it('sums only holdings that have a previous close, excluding cash', () => {
    const out = computePortfolioDailyChange([
      { market: 'TW', price: 105, previousClose: 100, shares: 10 }, // +50
      { market: 'US', price: 110, previousClose: 100, shares: 2, fxRateToTwd: 30 }, // +600
      { market: 'TW', price: 50, shares: 5 }, // no prevClose -> excluded
    ])
    expect(out.changeTwd).toBe(650)
    expect(out.prevValueTwd).toBe(7000) // 1000 + 6000
    expect(out.changePct).toBeCloseTo((650 / 7000) * 100)
    expect(out.coveredCount).toBe(2)
    expect(out.missingCount).toBe(1)
  })

  it('reports no coverage (null pct) when nothing has a previous close', () => {
    const out = computePortfolioDailyChange([
      { market: 'TW', price: 50, shares: 5 },
    ])
    expect(out.coveredCount).toBe(0)
    expect(out.missingCount).toBe(1)
    expect(out.changePct).toBeNull()
    expect(out.changeTwd).toBe(0)
  })

  it('tolerates an empty list', () => {
    const out = computePortfolioDailyChange([])
    expect(out.changeTwd).toBe(0)
    expect(out.changePct).toBeNull()
    expect(out.coveredCount).toBe(0)
  })
})

describe('getMarketDateKey', () => {
  it('formats an ISO instant as the Taipei calendar date', () => {
    // 2026-09-27T20:00Z == 2026-09-28 04:00 Taipei (UTC+8)
    expect(getMarketDateKey('2026-09-27T20:00:00Z')).toBe('2026-09-28')
    // 2026-09-27T15:00Z == 2026-09-27 23:00 Taipei
    expect(getMarketDateKey('2026-09-27T15:00:00Z')).toBe('2026-09-27')
  })
})

describe('isPriceDataStale', () => {
  const now = '2026-09-28T02:00:00Z' // 2026-09-28 10:00 Taipei

  it('is fresh when captured on the same Taipei day', () => {
    expect(isPriceDataStale({ capturedAt: '2026-09-28T01:00:00Z', now })).toBe(
      false,
    )
  })

  it('is fresh across the UTC-day boundary but same Taipei day', () => {
    // captured 2026-09-27T20:00Z == 2026-09-28 04:00 Taipei -> same day as now
    expect(isPriceDataStale({ capturedAt: '2026-09-27T20:00:00Z', now })).toBe(
      false,
    )
  })

  it('is stale when captured on an earlier Taipei day', () => {
    expect(isPriceDataStale({ capturedAt: '2026-09-27T02:00:00Z', now })).toBe(
      true,
    )
  })

  it('is stale when there is no captured timestamp', () => {
    expect(isPriceDataStale({ capturedAt: null, now })).toBe(true)
    expect(isPriceDataStale({ now })).toBe(true)
  })
})
