import { describe, it, expect } from 'vitest'
import {
  computeTtm,
  computeValuation,
  cumulativeToSingles,
  EMPTY_VALUATION_SETTINGS,
  peBandsFromHistory,
  positionOnScale,
  resolvePeBands,
} from './valuation'

// Year-to-date EPS as TWSE publishes it.
export const TSMC_CUMULATIVE = {
  '2025Q1': { eps: 13.94 },
  '2025Q2': { eps: 29.31 },
  '2025Q3': { eps: 46.36 },
  '2025Q4': { eps: 66.25 },
  '2026Q1': { eps: 16.0 },
  '2026Q2': { eps: 35.17 },
}

describe('cumulativeToSingles', () => {
  it('subtracts the previous year-to-date value, Q1 as is', () => {
    const singles = cumulativeToSingles(TSMC_CUMULATIVE)
    expect(singles.map((s) => `${s.year}Q${s.quarter}`)).toEqual([
      '2025Q1', '2025Q2', '2025Q3', '2025Q4', '2026Q1', '2026Q2',
    ])
    const eps = singles.map((s) => s.eps)
    expect(eps[0]).toBeCloseTo(13.94, 4)
    expect(eps[1]).toBeCloseTo(15.37, 4)
    expect(eps[3]).toBeCloseTo(19.89, 4)
    expect(eps[4]).toBeCloseTo(16.0, 4)
    expect(eps[5]).toBeCloseTo(19.17, 4)
  })

  it('returns null for a quarter whose previous year-to-date value is missing', () => {
    const singles = cumulativeToSingles({ '2026Q2': { eps: 35.17 } })
    expect(singles).toEqual([{ year: 2026, quarter: 2, eps: null }])
  })
})

describe('computeTtm', () => {
  it('sums the latest four consecutive quarters', () => {
    const ttm = computeTtm(cumulativeToSingles(TSMC_CUMULATIVE))
    expect(ttm.eps).toBeCloseTo(72.11, 2)
    expect(ttm.quarters).toHaveLength(4)
    expect(ttm.formula).toContain('2025 Q3')
    expect(ttm.formula).toContain('72.11')
  })

  it('returns null with fewer than four quarters, a gap, or a null quarter', () => {
    expect(computeTtm([])).toBeNull()
    expect(computeTtm(cumulativeToSingles({ '2026Q1': { eps: 1 }, '2026Q2': { eps: 2 } }))).toBeNull()
    const gap = [
      { year: 2025, quarter: 1, eps: 1 },
      { year: 2025, quarter: 2, eps: 1 },
      { year: 2025, quarter: 4, eps: 1 },
      { year: 2026, quarter: 1, eps: 1 },
    ]
    expect(computeTtm(gap)).toBeNull()
    const withNull = cumulativeToSingles({ ...TSMC_CUMULATIVE, '2025Q4': { eps: null } })
    expect(computeTtm(withNull.slice(-4))).toBeNull()
  })
})

describe('peBandsFromHistory', () => {
  it('takes P25 / P50 / P75 with linear interpolation, ignoring invalid values', () => {
    const bands = peBandsFromHistory([9, 1, 8, 2, 7, 3, 6, 4, 5, null, -3, 0, Number.NaN])
    expect(bands).toEqual({ cheap: 3, fair: 5, expensive: 7, sampleSize: 9 })
  })

  it('returns null with fewer than 8 valid samples', () => {
    expect(peBandsFromHistory([10, 11, 12, 13, 14, 15, 16])).toBeNull()
  })
})

describe('resolvePeBands', () => {
  it('prefers positive overrides and flags them', () => {
    const resolved = resolvePeBands(
      { cheap: 12, fair: 15, expensive: 18 },
      { ...EMPTY_VALUATION_SETTINGS, peFair: 16 },
    )
    expect(resolved).toEqual({
      cheap: 12,
      fair: 16,
      expensive: 18,
      overridden: { cheap: false, fair: true, expensive: false },
    })
  })

  it('leaves bands null when there is neither history nor override', () => {
    expect(resolvePeBands(null, EMPTY_VALUATION_SETTINGS)).toMatchObject({ cheap: null, fair: null, expensive: null })
  })
})

describe('computeValuation', () => {
  const bands = { cheap: 12, fair: 15, expensive: 18 }

  it('prices the three bands and places the current price', () => {
    const result = computeValuation({ eps: 10, bands, price: 140 })
    expect(result.status).toBe('ok')
    expect(result.prices).toEqual({ cheap: 120, fair: 150, expensive: 180 })
    expect(result.zone).toBe('fair-low')
    expect(result.distanceToFair).toBeCloseTo(-0.0667, 4)
    expect(result.scale.min).toBeCloseTo(108, 6)
    expect(result.scale.max).toBeCloseTo(198, 6)
  })

  it('classifies all four zones at their boundaries', () => {
    expect(computeValuation({ eps: 10, bands, price: 119 }).zone).toBe('below')
    expect(computeValuation({ eps: 10, bands, price: 120 }).zone).toBe('fair-low')
    expect(computeValuation({ eps: 10, bands, price: 150 }).zone).toBe('fair-high')
    expect(computeValuation({ eps: 10, bands, price: 180 }).zone).toBe('above')
  })

  it('widens the scale to include a price outside the bands', () => {
    const result = computeValuation({ eps: 10, bands, price: 250 })
    expect(result.scale.max).toBeCloseTo(275, 6)
    expect(positionOnScale(250, result.scale)).toBeCloseTo(142 / 167, 6)
  })

  it('omits zone and distance without a price', () => {
    const result = computeValuation({ eps: 10, bands, price: undefined })
    expect(result.status).toBe('ok')
    expect(result.zone).toBeNull()
    expect(result.distanceToFair).toBeNull()
  })

  it('reports why it cannot value the stock', () => {
    expect(computeValuation({ eps: null, bands, price: 100 }).status).toBe('no-eps')
    expect(computeValuation({ eps: -1.2, bands, price: 100 }).status).toBe('loss')
    expect(computeValuation({ eps: 0, bands, price: 100 }).status).toBe('loss')
    expect(computeValuation({ eps: 10, bands: { cheap: 12, fair: null, expensive: 18 }, price: 100 }).status).toBe('missing-pe')
  })

  it('rejects non-monotonic P/E bands instead of drawing a broken ruler', () => {
    expect(computeValuation({ eps: 10, bands: { cheap: 20, fair: 15, expensive: 18 }, price: 100 }).status).toBe('invalid-pe')
  })
})

describe('positionOnScale', () => {
  it('clamps to 0..1', () => {
    expect(positionOnScale(50, { min: 100, max: 200 })).toBe(0)
    expect(positionOnScale(150, { min: 100, max: 200 })).toBe(0.5)
    expect(positionOnScale(300, { min: 100, max: 200 })).toBe(1)
  })
})
