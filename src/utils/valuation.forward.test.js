import { describe, it, expect } from 'vitest'
import {
  buildValuationModel,
  cumulativeToSingles,
  EMPTY_VALUATION_SETTINGS,
  estimateTwForwardEps,
  estimateUsForwardEps,
  nextTwFilingDeadline,
} from './valuation'

const TSMC_CUMULATIVE = {
  '2025Q1': { eps: 13.94 },
  '2025Q2': { eps: 29.31 },
  '2025Q3': { eps: 46.36 },
  '2025Q4': { eps: 66.25 },
  '2026Q1': { eps: 16.0 },
  '2026Q2': { eps: 35.17 },
}

describe('estimateTwForwardEps', () => {
  it('grows last year’s remaining quarters by this year’s YTD growth', () => {
    const result = estimateTwForwardEps(TSMC_CUMULATIVE, EMPTY_VALUATION_SETTINGS)
    // g = 35.17 / 29.31 − 1 ≈ 19.99%; 35.17 + (17.05 + 19.89) × 1.1999
    expect(result.autoGrowthRate).toBeCloseTo(0.19993, 4)
    expect(result.eps).toBeCloseTo(79.5, 1)
    expect(result.targetYear).toBe(2026)
    expect(result.formula).toContain('今年 Q1–Q2 累計 35.17')
    expect(result.formula).toContain('去年 Q3–Q4 36.94')
    expect(result.overridden).toEqual({ forwardEps: false, growthRate: false })
  })

  it('uses an overridden growth rate', () => {
    const result = estimateTwForwardEps(TSMC_CUMULATIVE, { ...EMPTY_VALUATION_SETTINGS, growthRate: 0.1 })
    expect(result.eps).toBeCloseTo(75.8, 2)
    expect(result.growthRate).toBe(0.1)
    expect(result.overridden.growthRate).toBe(true)
  })

  it('uses an overridden forward EPS above everything else', () => {
    const result = estimateTwForwardEps(TSMC_CUMULATIVE, { ...EMPTY_VALUATION_SETTINGS, growthRate: 0.1, forwardEps: 80 })
    expect(result.eps).toBe(80)
    expect(result.overridden.forwardEps).toBe(true)
  })

  it('projects next year from the annual figure once Q4 is out', () => {
    const result = estimateTwForwardEps({ '2024Q4': { eps: 50 }, '2025Q4': { eps: 60 } }, EMPTY_VALUATION_SETTINGS)
    expect(result.targetYear).toBe(2026)
    expect(result.eps).toBeCloseTo(72, 6)
  })

  it('labels a single remaining quarter without a range', () => {
    const result = estimateTwForwardEps(
      { ...TSMC_CUMULATIVE, '2026Q3': { eps: 55 } },
      EMPTY_VALUATION_SETTINGS,
    )
    expect(result.formula).toContain('去年 Q4 19.89')
  })

  it('falls back to 0% growth and reports missing data without NaN', () => {
    const result = estimateTwForwardEps({ '2026Q1': { eps: 4 }, '2026Q2': { eps: 10 } }, EMPTY_VALUATION_SETTINGS)
    expect(result.autoGrowthRate).toBeNull()
    expect(result.eps).toBeNull()
    expect(result.formula).toContain('缺少 2025 年 Q3–Q4 資料')
    expect(result.formula).not.toContain('NaN')
  })

  it('returns null without any data', () => {
    expect(estimateTwForwardEps({}, EMPTY_VALUATION_SETTINGS)).toBeNull()
  })
})

describe('estimateUsForwardEps', () => {
  const singles = [
    { year: 2026, quarter: 1, eps: 2.0 },
    { year: 2026, quarter: 2, eps: 2.02 },
  ]
  const upcoming = [
    { date: '2027-01-27', hour: '', epsEstimate: 2.95 },
    { date: '2026-10-29', hour: 'amc', epsEstimate: 2.02 },
    { date: '2027-04-28', hour: '', epsEstimate: 2.29 },
  ]

  it('adds up to 4 upcoming estimates and fills with the latest actuals', () => {
    const result = estimateUsForwardEps({ upcoming, singles }, EMPTY_VALUATION_SETTINGS)
    expect(result.eps).toBeCloseTo(9.28, 6)
    expect(result.formula).toContain('未來 3 季預估')
    expect(result.formula).toContain('最近 1 季實際')
    expect(result.formula).toContain('調整後 EPS')
  })

  it('needs no actuals when 4 estimates exist', () => {
    const four = [...upcoming, { date: '2027-07-28', hour: '', epsEstimate: 2.5 }]
    const result = estimateUsForwardEps({ upcoming: four, singles: [] }, EMPTY_VALUATION_SETTINGS)
    expect(result.eps).toBeCloseTo(9.76, 6)
    expect(result.formula).not.toContain('實際')
  })

  it('returns null without estimates, or without enough actuals', () => {
    expect(estimateUsForwardEps({ upcoming: [], singles }, EMPTY_VALUATION_SETTINGS)).toBeNull()
    expect(estimateUsForwardEps({ upcoming: upcoming.slice(0, 1), singles }, EMPTY_VALUATION_SETTINGS)).toBeNull()
  })

  it('honours a forward EPS override', () => {
    expect(estimateUsForwardEps({ upcoming: [], singles: [] }, { ...EMPTY_VALUATION_SETTINGS, forwardEps: 9 }).eps).toBe(9)
  })
})

describe('nextTwFilingDeadline', () => {
  it('returns the next statutory deadline, inclusive of today', () => {
    expect(nextTwFilingDeadline('2026-10-05')).toEqual({ date: '2026-11-14', label: 'Q3 財報' })
    expect(nextTwFilingDeadline('2026-11-14')).toEqual({ date: '2026-11-14', label: 'Q3 財報' })
    expect(nextTwFilingDeadline('2026-11-15')).toEqual({ date: '2027-03-31', label: '年報' })
  })
})

describe('buildValuationModel', () => {
  const peSeries = [10, 12, 14, 15, 16, 18, 20, 22].map((pe, i) => ({ label: `m${i}`, pe }))
  const fundamentals = {
    market: 'TW',
    singles: cumulativeToSingles(TSMC_CUMULATIVE),
    cumulative: TSMC_CUMULATIVE,
    surprises: [],
    upcoming: [],
    peSeries,
    nextEarnings: null,
    updatedAt: null,
  }

  it('values on TTM by default and on the forward estimate when asked', () => {
    const ttm = buildValuationModel({ fundamentals, settings: EMPTY_VALUATION_SETTINGS, price: 1000, basis: 'ttm' })
    expect(ttm.autoBands.sampleSize).toBe(8)
    expect(ttm.valuation.status).toBe('ok')
    expect(ttm.valuation.prices.fair).toBeCloseTo(72.11 * ttm.bands.fair, 1)

    const forward = buildValuationModel({ fundamentals, settings: EMPTY_VALUATION_SETTINGS, price: 1000, basis: 'forward' })
    expect(forward.valuation.prices.fair).toBeCloseTo(forward.forward.eps * forward.bands.fair, 1)
  })

  it('reports no-eps on the TTM tab when history is too short', () => {
    const short = { ...fundamentals, singles: fundamentals.singles.slice(-2) }
    expect(buildValuationModel({ fundamentals: short, settings: EMPTY_VALUATION_SETTINGS, price: 1000, basis: 'ttm' }).valuation.status).toBe('no-eps')
  })
})
