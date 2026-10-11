import { describe, it, expect } from 'vitest'
import {
  compareSnapshots,
  computeAutoAssumptions,
  latestMonthRevenue,
  projectIncome,
  recentRevenueYoy,
  revenueCalibration,
  toSingleStatements,
} from './incomeModel'
import { COMPANY, CUMULATIVE, MONTHLY_REVENUE, Q2025, Q2026 } from './incomeModel.fixture'

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

  // A tiny cumulative EPS is mostly rounding (0.006 → 0.01): dividing by it
  // would be far off, so the largest |EPS| of the latest four records wins.
  it('takes the share count from the latest-four record with the largest |EPS|', () => {
    const tiny = { ...CUMULATIVE, '2026Q2': { ...CUMULATIVE['2026Q2'], parentNetIncome: 0.6, eps: 0.01 } }
    const result = computeAutoAssumptions({ singles: toSingleStatements(tiny), cumulative: tiny, monthlyRevenue: MONTHLY_REVENUE })
    // 2025Q4: 928 thousand NTD ÷ 9.28 NTD
    expect(result.shares).toBeCloseTo(100, 6)
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

    const zeroEps = Object.fromEntries(Object.entries(CUMULATIVE).map(([key, values]) => [key, { ...values, eps: 0 }]))
    expect(
      computeAutoAssumptions({ singles: toSingleStatements(zeroEps), cumulative: zeroEps, monthlyRevenue: MONTHLY_REVENUE }).reason,
    ).toBe('shares')

    expect(computeAutoAssumptions({ singles, cumulative: CUMULATIVE, monthlyRevenue: {} }).reason).toBe('revenue-history')
  })
})

const TODAY = '2026-10-11'
const project = (assumptions, todayIso = TODAY, company = COMPANY) => projectIncome(company, assumptions, { todayIso })
const epsOf = (result) => Object.fromEntries(result.quarters.map((item) => [item.key, item.eps]))

describe('projectIncome', () => {
  it('projects from the first unpublished quarter to next year\'s Q4', () => {
    const result = project()
    expect(result.status).toBe('ok')
    expect(result.quarters.map((item) => item.key)).toEqual([
      '2026Q3', '2026Q4', '2027Q1', '2027Q2', '2027Q3', '2027Q4',
    ])
    // Q3 revenue is all published (3 × 450); Q4 grows last year's 300s by 50%;
    // 2027 grows 2026's actual / projected months by another 50%.
    expect(result.quarters[0]).toMatchObject({ reportedMonths: 3, revenue: 1350 })
    expect(result.quarters[1]).toMatchObject({ reportedMonths: 0, revenue: 1350 })
    expect(result.quarters[2].revenue).toBeCloseTo(1800, 6)
    expect(result.quarters[4].revenue).toBeCloseTo(2025, 6)
    expect(result.quarters[5].revenue).toBeCloseTo(2025, 6)
    const eps = epsOf(result)
    expect(eps['2026Q3']).toBeCloseTo(3.4, 6)
    expect(eps['2026Q4']).toBeCloseTo(3.4, 6)
    expect(eps['2027Q1']).toBeCloseTo(4.48, 6)
    expect(eps['2027Q3']).toBeCloseTo(5.02, 6)
  })

  it('walks the chain revenue → gross profit → operating → pre-tax → net', () => {
    const q3 = project().quarters[0]
    expect(q3.grossProfit).toBeCloseTo(675, 6)
    expect(q3.operatingIncome).toBeCloseTo(405, 6)
    expect(q3.pretaxIncome).toBeCloseTo(425, 6)
    expect(q3.netIncome).toBeCloseTo(340, 6)
    expect(q3.parentNetIncome).toBeCloseTo(340, 6)
    expect(q3.assumptions.grossMargin).toEqual({ value: expect.closeTo(0.5, 6), source: 'auto' })
  })

  it('sums next quarter, the TTM after it, this year, next year and the rolling TTM', () => {
    const result = project()
    expect(result.nextQuarter.key).toBe('2026Q3')
    expect(result.nextQuarter.yoy).toBeCloseTo(3.4 / 2.32 - 1, 6)
    expect(result.nextQuarter.qoq).toBeCloseTo(3.4 / 3.04 - 1, 6)
    expect(result.ttmAfterNext.eps).toBeCloseTo(11.8, 4)
    expect(result.ttmAfterNext.from).toEqual({ year: 2025, quarter: 4 })
    expect(result.thisYear).toEqual({ year: 2026, eps: expect.closeTo(12.88, 4), reportedQuarters: 2 })
    expect(result.nextYear).toEqual({ year: 2027, eps: expect.closeTo(19.0, 4) })
    expect(result.rollingTtm.map((item) => item.eps)).toEqual([
      expect.closeTo(11.8, 4), expect.closeTo(12.88, 4), expect.closeTo(14.32, 4),
      expect.closeTo(15.76, 4), expect.closeTo(17.38, 4), expect.closeTo(19.0, 4),
    ])
  })

  it('prefers a quarter override over a global one over the default', () => {
    const result = project({
      global: { grossMargin: 0.6 },
      quarters: { '2026Q4': { grossMargin: 0.55 }, '2026Q2': { grossMargin: 0.9 } },
    })
    const [q3, q4] = result.quarters
    expect(q3.assumptions.grossMargin).toEqual({ value: 0.6, source: 'global' })
    expect(q3.eps).toBeCloseTo(4.48, 6)
    expect(q4.assumptions.grossMargin).toEqual({ value: 0.55, source: 'quarter' })
    expect(q4.overridden).toBe(true)
    expect(q4.eps).toBeCloseTo(3.94, 6)
    expect(q3.overridden).toBe(false)
  })

  it('grows only the unpublished months by the revenue YoY', () => {
    const result = project({ global: {}, quarters: { '2026Q3': { revenueYoy: 0 }, '2026Q4': { revenueYoy: 0 } } })
    expect(result.quarters[0].revenue).toBe(1350)
    expect(result.quarters[1].revenue).toBe(900)
    expect(result.quarters[1].eps).toBeCloseTo(2.32, 6)
  })

  it('takes minority interest out before EPS', () => {
    const q3 = project({ global: { nciRatio: 0.1 }, quarters: {} }).quarters[0]
    expect(q3.parentNetIncome).toBeCloseTo(306, 6)
    expect(q3.eps).toBeCloseTo(3.06, 6)
  })

  it('projects from last year\'s Q4 in January', () => {
    const result = project(undefined, '2027-01-20')
    expect(result.quarters[0].key).toBe('2026Q3')
    expect(result.quarters.at(-1).key).toBe('2028Q4')
    expect(result.thisYear).toEqual({ year: 2027, eps: expect.closeTo(19.0, 4), reportedQuarters: 0 })
    expect(result.nextYear.year).toBe(2028)
  })

  it('is unavailable for financial statements and missing revenue history', () => {
    expect(project(undefined, TODAY, { ...COMPANY, statement: 'financial' })).toEqual({
      status: 'unavailable',
      reason: 'financial',
    })
    const thin = { ...COMPANY, monthlyRevenue: { '2025-07': 300, '2025-08': 300, '2025-09': 300, '2026-07': 450, '2026-08': 450, '2026-09': 450 } }
    expect(project(undefined, TODAY, thin)).toEqual({ status: 'unavailable', reason: 'revenue-history' })
  })
})

describe('projectIncome — monthly breakdown', () => {
  it('lists each month of a quarter as published or projected, with its base', () => {
    const company = { ...COMPANY, monthlyRevenue: { ...MONTHLY_REVENUE, '2026-10': 500 } }
    const [q3, q4, , , , q2027q4] = project(undefined, TODAY, company).quarters
    expect(q3.months).toEqual([
      { month: '2026-07', revenue: 450, actual: true, base: 300, baseActual: true, yoy: 0.5 },
      { month: '2026-08', revenue: 450, actual: true, base: 300, baseActual: true, yoy: 0.5 },
      { month: '2026-09', revenue: 450, actual: true, base: 300, baseActual: true, yoy: 0.5 },
    ])
    // Latest three months 2026-08..10 vs 2025: (450 + 450 + 500) / 900 − 1
    const yoy = 1400 / 900 - 1
    expect(q4.months[0]).toEqual({ month: '2026-10', revenue: 500, actual: true, base: 300, baseActual: true, yoy: expect.closeTo(2 / 3, 6) })
    expect(q4.months[1]).toEqual({
      month: '2026-11',
      revenue: expect.closeTo(300 * (1 + yoy), 6),
      actual: false,
      base: 300,
      baseActual: true,
      yoy: expect.closeTo(yoy, 6),
    })
    expect(q4.revenue).toBeCloseTo(500 + 2 * 300 * (1 + yoy), 6)
    // Next year's Q4 grows this year's months: October's base is published,
    // November's is itself projected.
    expect(q2027q4.months[0]).toMatchObject({ month: '2027-10', base: 500, baseActual: true })
    expect(q2027q4.months[1]).toMatchObject({ month: '2027-11', baseActual: false, base: expect.closeTo(300 * (1 + yoy), 6) })
  })
})

describe('compareSnapshots', () => {
  const reported = toSingleStatements(CUMULATIVE)

  it('pairs each snapshot with the quarter\'s actual figures, newest first, once published', () => {
    const snapshots = {
      '2026Q1': { eps: 2.8, revenue: 1100, grossMargin: 0.48, opexRatio: 0.21, savedAt: '2026-04-20T00:00:00Z' },
      '2026Q2': { eps: 3.2, revenue: 1250, grossMargin: 0.5, opexRatio: 0.2, savedAt: '2026-07-20T00:00:00Z' },
      '2026Q3': { eps: 3.4, revenue: 1350, grossMargin: 0.5, opexRatio: 0.2, savedAt: '2026-10-11T00:00:00Z' },
    }
    const result = compareSnapshots(snapshots, reported)
    expect(result.map((item) => item.key)).toEqual(['2026Q2', '2026Q1'])
    expect(result[0]).toMatchObject({
      year: 2026,
      quarter: 2,
      savedAt: '2026-07-20T00:00:00Z',
      estimate: { eps: 3.2, revenue: 1250 },
      actual: { eps: 3.04, revenue: 1200, grossMargin: 0.5, opexRatio: 0.2 },
    })
    expect(result[0].epsDiff).toBeCloseTo(3.04 / 3.2 - 1, 6)
  })
})

describe('latestMonthRevenue', () => {
  it('gives the latest published month, its YoY and the quarter it belongs to', () => {
    expect(latestMonthRevenue(MONTHLY_REVENUE)).toEqual({
      month: '2026-09',
      revenue: 450,
      yoy: expect.closeTo(0.5, 6),
      quarterKey: '2026Q3',
    })
    expect(latestMonthRevenue({ '2026-10': 10 })).toEqual({ month: '2026-10', revenue: 10, yoy: null, quarterKey: '2026Q4' })
    expect(latestMonthRevenue({})).toBeNull()
  })
})
