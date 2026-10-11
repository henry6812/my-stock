import { describe, it, expect } from 'vitest'
import {
  buildValuationModel,
  EMPTY_VALUATION_SETTINGS,
  estimateUsForwardEps,
  nextTwFilingDeadline,
} from './valuation'
import { TW_FUNDAMENTALS } from './incomeModel.fixture'

const TSMC_CUMULATIVE = {
  '2025Q1': { eps: 13.94 },
  '2025Q2': { eps: 29.31 },
  '2025Q3': { eps: 46.36 },
  '2025Q4': { eps: 66.25 },
  '2026Q1': { eps: 16.0 },
  '2026Q2': { eps: 35.17 },
}

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
  const build = (basis, settings = EMPTY_VALUATION_SETTINGS, fundamentals = TW_FUNDAMENTALS) =>
    buildValuationModel({ fundamentals, settings, price: 50, basis, todayIso: '2026-10-11' })

  it('values TW stocks on TTM and on the income model’s three projections', () => {
    const ttm = build('ttm')
    expect(ttm.autoBands.sampleSize).toBe(8)
    expect(ttm.byBasis.ttm.eps).toBeCloseTo(10.72, 4)
    expect(ttm.valuation.prices.fair).toBeCloseTo(10.72 * ttm.bands.fair, 1)

    const afterNext = build('ttmAfterNext')
    expect(afterNext.chosen).toEqual({
      eps: expect.closeTo(11.8, 4),
      formula: '2025 Q4–2026 Q2 實際 + 2026 Q3 推估 合計 11.80',
    })
    expect(build('thisYear').chosen.formula).toBe('2026 Q1–Q2 實際 + Q3–Q4 推估 合計 12.88')
    expect(build('nextYear').chosen.formula).toBe('2027 全年推估 合計 19.00')
  })

  it('uses a custom forward EPS for this year and next year', () => {
    const settings = { ...EMPTY_VALUATION_SETTINGS, forwardEps: 20 }
    expect(build('thisYear', settings).chosen).toEqual({ eps: 20, formula: '自訂預估 EPS 20.00' })
    expect(build('nextYear', settings).chosen.eps).toBe(20)
    expect(build('ttmAfterNext', settings).chosen.eps).toBeCloseTo(11.8, 4)
  })

  it('explains why a projection is unavailable', () => {
    const financial = { ...TW_FUNDAMENTALS, company: { ...TW_FUNDAMENTALS.company, statement: 'financial' } }
    const model = build('nextYear', EMPTY_VALUATION_SETTINGS, financial)
    expect(model.chosen).toEqual({ eps: null, reason: '金融股不適用損益表推估' })
    expect(model.valuation.status).toBe('no-eps')
  })

  it('reports a projected loss as loss', () => {
    const settings = { ...EMPTY_VALUATION_SETTINGS, model: { global: { grossMargin: 0.1 }, quarters: {} } }
    expect(build('nextYear', settings).valuation.status).toBe('loss')
  })

  it('keeps TTM and the consensus forward estimate for US stocks', () => {
    const us = {
      ...TW_FUNDAMENTALS,
      market: 'US',
      company: undefined,
      upcoming: [{ date: '2026-11-01', epsEstimate: 3 }],
    }
    const model = build('forward', EMPTY_VALUATION_SETTINGS, us)
    expect(model.income).toBeUndefined()
    expect(model.byBasis.forward.eps).toBeCloseTo(3 + 3.04 + 3.04 + 2.32, 4)
  })
})
