import { describe, it, expect } from 'vitest'
import {
  computeAutoAssumptions,
  recentRevenueYoy,
  revenueCalibration,
  toSingleStatements,
} from './incomeModel'
import { CUMULATIVE, MONTHLY_REVENUE, Q2025, Q2026 } from './incomeModel.fixture'

const singles = toSingleStatements(CUMULATIVE)

describe('toSingleStatements', () => {
  it('turns year-to-date statements into single quarters, oldest first', () => {
    expect(singles.map(({ year, quarter }) => `${year}Q${quarter}`)).toEqual([
      '2025Q1', '2025Q2', '2025Q3', '2025Q4', '2026Q1', '2026Q2',
    ])
    expect(singles[2]).toEqual({ year: 2025, quarter: 3, ...Q2025 })
    expect(singles[5]).toEqual({ year: 2026, quarter: 2, ...Q2026 })
  })

  it('leaves a field null when the previous year-to-date value is missing', () => {
    const result = toSingleStatements({ '2025Q2': { revenue: 1800, eps: 4.64 }, '2025Q3': { revenue: 2700 } })
    expect(result[0].revenue).toBeNull()
    expect(result[1].revenue).toBe(900)
    expect(result[1].eps).toBeNull()
  })
})

describe('recentRevenueYoy', () => {
  it('compares the latest three months with the same months a year earlier', () => {
    expect(recentRevenueYoy(MONTHLY_REVENUE)).toBeCloseTo(0.5, 6)
  })

  it('returns null without a year-earlier base or with a gap in the latest months', () => {
    expect(recentRevenueYoy({ '2026-07': 1, '2026-08': 1, '2026-09': 1 })).toBeNull()
    const gap = { ...MONTHLY_REVENUE }
    delete gap['2026-08']
    expect(recentRevenueYoy(gap)).toBeNull()
  })
})

describe('revenueCalibration', () => {
  const recent = singles.slice(-4)

  it('is 1 when monthly revenue matches the statements', () => {
    expect(revenueCalibration(recent, MONTHLY_REVENUE)).toBe(1)
  })

  it('is 1 within 3%, the ratio beyond it, and 1 when months are missing', () => {
    const scaled = (factor) =>
      Object.fromEntries(Object.entries(MONTHLY_REVENUE).map(([month, value]) => [month, value * factor]))
    expect(revenueCalibration(recent, scaled(1 / 1.02))).toBe(1)
    expect(revenueCalibration(recent, scaled(1 / 1.1))).toBeCloseTo(1.1, 6)
    expect(revenueCalibration(recent, {})).toBe(1)
  })
})

describe('computeAutoAssumptions', () => {
  it('derives every default from the latest four quarters', () => {
    const result = computeAutoAssumptions({ singles, cumulative: CUMULATIVE, monthlyRevenue: MONTHLY_REVENUE })
    expect(result.status).toBe('ok')
    expect(result.latest).toEqual({ year: 2026, quarter: 2 })
    expect(result.auto.revenueYoy).toBeCloseTo(0.5, 6)
    expect(result.auto.grossMargin).toBeCloseTo(0.5, 6)
    // (2100 − 1260) / 4200
    expect(result.auto.opexRatio).toBeCloseTo(0.2, 6)
    expect(result.auto.nonOperating).toBeCloseTo(20, 6)
    // 268 / 1340
    expect(result.auto.taxRate).toBeCloseTo(0.2, 6)
    expect(result.auto.nciRatio).toBeCloseTo(0, 6)
    // 608 thousand NTD ÷ 6.08 NTD
    expect(result.shares).toBeCloseTo(100, 6)
    expect(result.calibration).toBe(1)
  })

  it('falls back to a 20% tax rate when pre-tax income is not positive', () => {
    const loss = Object.fromEntries(
      Object.entries(CUMULATIVE).map(([key, values]) => [key, { ...values, pretaxIncome: -values.pretaxIncome, tax: -values.tax }]),
    )
    const result = computeAutoAssumptions({ singles: toSingleStatements(loss), cumulative: loss, monthlyRevenue: MONTHLY_REVENUE })
    expect(result.auto.taxRate).toBe(0.2)
  })

  it('reports why it cannot run', () => {
    const missingField = { ...CUMULATIVE, '2026Q2': { ...CUMULATIVE['2026Q2'], grossProfit: null } }
    expect(
      computeAutoAssumptions({ singles: toSingleStatements(missingField), cumulative: missingField, monthlyRevenue: MONTHLY_REVENUE }),
    ).toEqual({ status: 'unavailable', reason: 'incomplete' })

    const short = { '2026Q1': CUMULATIVE['2026Q1'], '2026Q2': CUMULATIVE['2026Q2'] }
    expect(
      computeAutoAssumptions({ singles: toSingleStatements(short), cumulative: short, monthlyRevenue: MONTHLY_REVENUE }).reason,
    ).toBe('incomplete')

    const zeroEps = { ...CUMULATIVE, '2026Q2': { ...CUMULATIVE['2026Q2'], eps: 0 } }
    expect(
      computeAutoAssumptions({ singles: toSingleStatements(zeroEps), cumulative: zeroEps, monthlyRevenue: MONTHLY_REVENUE }).reason,
    ).toBe('shares')

    expect(computeAutoAssumptions({ singles, cumulative: CUMULATIVE, monthlyRevenue: {} }).reason).toBe('revenue-history')
  })
})
