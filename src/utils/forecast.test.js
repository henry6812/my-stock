import { describe, it, expect } from 'vitest'
import {
  findFiMonth,
  getFiThreshold,
  projectNetWorth,
  runForecast,
  toRealMonthlyRate,
} from './forecast'

// Zero returns and zero inflation: the curve is just the monthly surplus.
const flat = {
  monthlyIncomeTwd: 30,
  monthlyExpenseTwd: 10,
  investRatio: 0.75,
  stockReturn: 0,
  cashReturn: 0,
  inflation: 0,
  withdrawalRate: 0.04,
  horizonYears: 30,
}

// 1% a month, compounded: (1.01)^12 − 1.
const ONE_PERCENT_MONTHLY_ANNUAL = Math.pow(1.01, 12) - 1

describe('toRealMonthlyRate', () => {
  it('is zero when the nominal return equals inflation', () => {
    expect(toRealMonthlyRate(0.02, 0.02)).toBeCloseTo(0, 12)
  })

  it('compounds the annual rate down to a month', () => {
    expect(toRealMonthlyRate(ONE_PERCENT_MONTHLY_ANNUAL, 0)).toBeCloseTo(0.01, 12)
  })

  it('takes inflation out before converting', () => {
    // 1.071 / 1.02 = 1.05 → a 5% real year.
    expect(toRealMonthlyRate(0.071, 0.02)).toBeCloseTo(Math.pow(1.05, 1 / 12) - 1, 12)
  })
})

describe('projectNetWorth', () => {
  it('adds the surplus split by the invest ratio when returns are zero', () => {
    const series = projectNetWorth({
      stockTwd: 100,
      cashTwd: 50,
      assumptions: flat,
      months: 2,
      startMonth: '2026-10',
    })
    expect(series).toEqual([
      { monthIndex: 0, month: '2026-10', stockTwd: 100, cashTwd: 50, totalTwd: 150 },
      { monthIndex: 1, month: '2026-11', stockTwd: 115, cashTwd: 55, totalTwd: 170 },
      { monthIndex: 2, month: '2026-12', stockTwd: 130, cashTwd: 60, totalTwd: 190 },
    ])
  })

  it('grows each side by its own real return before adding the surplus', () => {
    const series = projectNetWorth({
      stockTwd: 1000,
      cashTwd: 1000,
      assumptions: {
        ...flat,
        monthlyIncomeTwd: 0,
        monthlyExpenseTwd: 0,
        stockReturn: ONE_PERCENT_MONTHLY_ANNUAL,
      },
      months: 1,
      startMonth: '2026-10',
    })
    expect(series[1].stockTwd).toBeCloseTo(1010, 6)
    expect(series[1].cashTwd).toBeCloseTo(1000, 6)
  })

  it('takes a deficit from cash first, then stock, never below zero', () => {
    const series = projectNetWorth({
      stockTwd: 100,
      cashTwd: 10,
      assumptions: { ...flat, monthlyIncomeTwd: 0, monthlyExpenseTwd: 30 },
      months: 5,
      startMonth: '2026-10',
    })
    expect(series.map((point) => [point.stockTwd, point.cashTwd])).toEqual([
      [100, 10],
      [80, 0],
      [50, 0],
      [20, 0],
      [0, 0],
      [0, 0],
    ])
  })

  it('grows from nothing when there are no assets yet', () => {
    const series = projectNetWorth({
      stockTwd: 0,
      cashTwd: 0,
      assumptions: { ...flat, investRatio: 0.5 },
      months: 1,
      startMonth: '2026-10',
    })
    expect(series[1]).toMatchObject({ stockTwd: 10, cashTwd: 10, totalTwd: 20 })
  })
})

describe('financial independence', () => {
  it('needs annual expense ÷ withdrawal rate', () => {
    expect(getFiThreshold({ monthlyExpenseTwd: 10000, withdrawalRate: 0.04 })).toBeCloseTo(3_000_000, 6)
  })

  it('needs nothing when there is no expense', () => {
    expect(getFiThreshold({ monthlyExpenseTwd: 0, withdrawalRate: 0.04 })).toBe(0)
  })

  it('has no threshold without an expense or a positive withdrawal rate', () => {
    expect(getFiThreshold({ monthlyExpenseTwd: null, withdrawalRate: 0.04 })).toBeNull()
    expect(getFiThreshold({ monthlyExpenseTwd: 100, withdrawalRate: 0 })).toBeNull()
  })

  it('finds the first month at or above the threshold', () => {
    const series = [{ totalTwd: 100 }, { totalTwd: 200 }, { totalTwd: 300 }]
    expect(findFiMonth(series, 200)).toBe(1)
    expect(findFiMonth(series, 50)).toBe(0)
    expect(findFiMonth(series, 0)).toBe(0)
    expect(findFiMonth(series, 1000)).toBeNull()
    expect(findFiMonth(series, null)).toBeNull()
  })
})

describe('runForecast', () => {
  it('projects horizonYears × 12 months and reports when FI is reached', () => {
    const result = runForecast({
      stockTwd: 0,
      cashTwd: 0,
      // Threshold 10 × 12 / 0.04 = 3000; +20 a month reaches it in month 150.
      assumptions: flat,
      startMonth: '2026-10',
      horizonYears: 20,
    })
    expect(result.series).toHaveLength(241)
    expect(result.series[12].month).toBe('2027-10')
    expect(result.thresholdTwd).toBeCloseTo(3000, 6)
    expect(result.fiMonthIndex).toBe(150)
    expect(result.fiMonth).toBe('2039-04')
    expect(result.endTotalTwd).toBe(240 * 20)
    expect(result.horizonYears).toBe(20)
  })

  it('falls back to the assumptions horizon and reports no FI month', () => {
    const result = runForecast({
      stockTwd: 0,
      cashTwd: 0,
      assumptions: { ...flat, horizonYears: 10 },
      startMonth: '2026-10',
    })
    expect(result.series).toHaveLength(121)
    expect(result.fiMonthIndex).toBeNull()
    expect(result.fiMonth).toBeNull()
  })
})
