import { describe, it, expect } from 'vitest'
import { formatTwd } from './formatters'
import {
  applyWhatIf,
  buildForecastChartData,
  DEFAULT_WHAT_IF,
  describeFiResult,
  describeWhatIfDiff,
  FORECAST_DEFAULTS,
  FORECAST_INCOMPLETE_TEXT,
  getFiHeadline,
  getWhatIfAmountRange,
  isWhatIfActive,
  findFiMonth,
  getAutoInvestRatio,
  getFiThreshold,
  getForecastStartingPoint,
  normalizeForecastSettings,
  resolveForecastAssumptions,
  validateForecastSettings,
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

describe('normalizeForecastSettings', () => {
  it('fills every field with its default when nothing is stored', () => {
    expect(normalizeForecastSettings(null)).toEqual(FORECAST_DEFAULTS)
    expect(normalizeForecastSettings(undefined)).toEqual(FORECAST_DEFAULTS)
  })

  it('keeps valid values and rounds amounts to whole TWD', () => {
    expect(
      normalizeForecastSettings({
        monthlyIncomeTwd: 80000.4,
        monthlyExpenseTwd: 0,
        investRatio: 0.6,
        stockReturn: 0.08,
        cashReturn: 0.015,
        inflation: 0.025,
        withdrawalRate: 0.035,
        horizonYears: 40,
      }),
    ).toEqual({
      monthlyIncomeTwd: 80000,
      monthlyExpenseTwd: 0,
      investRatio: 0.6,
      stockReturn: 0.08,
      cashReturn: 0.015,
      inflation: 0.025,
      withdrawalRate: 0.035,
      horizonYears: 40,
    })
  })

  it('drops broken or out-of-range values back to their defaults', () => {
    expect(
      normalizeForecastSettings({
        monthlyIncomeTwd: 'abc',
        monthlyExpenseTwd: -5,
        investRatio: 1.5,
        stockReturn: 0.9,
        cashReturn: 'x',
        inflation: -0.01,
        withdrawalRate: 0,
        horizonYears: 25,
      }),
    ).toEqual(FORECAST_DEFAULTS)
  })

  it('reads numeric strings', () => {
    expect(normalizeForecastSettings({ stockReturn: '0.05' }).stockReturn).toBe(0.05)
  })
})

describe('validateForecastSettings', () => {
  const valid = { ...FORECAST_DEFAULTS }

  it('accepts the defaults and null amounts / ratio', () => {
    expect(() => validateForecastSettings(valid)).not.toThrow()
  })

  it('accepts the range edges', () => {
    expect(() =>
      validateForecastSettings({ ...valid, stockReturn: -0.2, cashReturn: 0.3, inflation: 0, withdrawalRate: 0.1, investRatio: 1 }),
    ).not.toThrow()
  })

  it('rejects a rate out of range with its label', () => {
    expect(() => validateForecastSettings({ ...valid, stockReturn: 0.31 })).toThrow('股票年報酬需介於 -20% 到 30%')
    expect(() => validateForecastSettings({ ...valid, cashReturn: -0.21 })).toThrow('現金年利率需介於 -20% 到 30%')
    expect(() => validateForecastSettings({ ...valid, inflation: 0.16 })).toThrow('通膨率需介於 0% 到 15%')
    expect(() => validateForecastSettings({ ...valid, withdrawalRate: 0.005 })).toThrow('提領率需介於 1% 到 10%')
    expect(() => validateForecastSettings({ ...valid, investRatio: -0.1 })).toThrow('新存款投資比例需介於 0% 到 100%')
  })

  it('rejects a missing rate', () => {
    expect(() => validateForecastSettings({ ...valid, inflation: null })).toThrow('請輸入通膨率')
  })

  it('rejects negative amounts', () => {
    expect(() => validateForecastSettings({ ...valid, monthlyIncomeTwd: -1 })).toThrow('每月收入不能小於 0')
    expect(() => validateForecastSettings({ ...valid, monthlyExpenseTwd: -1 })).toThrow('每月支出不能小於 0')
  })

  it('rejects an unknown horizon', () => {
    expect(() => validateForecastSettings({ ...valid, horizonYears: 25 })).toThrow('預估年限只能是 10、20、30 或 40 年')
  })
})

describe('getForecastStartingPoint', () => {
  it('sums holdings and cash, and the return of holdings with a cost', () => {
    const start = getForecastStartingPoint({
      rows: [
        { market: 'TW', latestValueTwd: 1200, totalCost: 1000 },
        // 30 USD of cost at 32 → 960 TWD.
        { market: 'US', latestValueTwd: 1040, totalCost: 30, fxRateToTwd: 32 },
        { market: 'TW', latestValueTwd: 500, totalCost: null },
      ],
      cashRows: [{ balanceTwd: 300 }, { balanceTwd: 200 }],
    })
    expect(start.stockTwd).toBe(2740)
    expect(start.cashTwd).toBe(500)
    // (1200 + 1040 − 1000 − 960) / (1000 + 960)
    expect(start.holdingsReturn).toBeCloseTo(280 / 1960, 12)
    expect(start.unsetCostCount).toBe(1)
  })

  it('skips holdings without a price', () => {
    const start = getForecastStartingPoint({
      rows: [
        { market: 'TW', latestValueTwd: undefined, totalCost: 100 },
        { market: 'TW', latestValueTwd: 110, totalCost: 100 },
      ],
      cashRows: [],
    })
    expect(start.stockTwd).toBe(110)
    expect(start.holdingsReturn).toBeCloseTo(0.1, 12)
  })

  it('is all zero with no return when there is nothing yet', () => {
    const empty = { stockTwd: 0, cashTwd: 0, holdingsReturn: null, unsetCostCount: 0 }
    expect(getForecastStartingPoint({ rows: [], cashRows: [] })).toEqual(empty)
    expect(getForecastStartingPoint()).toEqual(empty)
  })
})

describe('getAutoInvestRatio', () => {
  it('is the current stock share', () => {
    expect(getAutoInvestRatio({ stockTwd: 300, cashTwd: 100 })).toBe(0.75)
  })

  it('is half when there are no assets', () => {
    expect(getAutoInvestRatio({ stockTwd: 0, cashTwd: 0 })).toBe(0.5)
  })
})

describe('resolveForecastAssumptions', () => {
  const auto = { monthlyIncomeTwd: 90000, monthlyExpenseTwd: 60000, investRatio: 0.7 }

  it('uses the automatic values when nothing is overridden', () => {
    expect(resolveForecastAssumptions({ settings: null, auto })).toEqual({
      monthlyIncomeTwd: 90000,
      monthlyExpenseTwd: 60000,
      investRatio: 0.7,
      stockReturn: 0.06,
      cashReturn: 0.01,
      inflation: 0.02,
      withdrawalRate: 0.04,
      horizonYears: 30,
      sources: { monthlyIncomeTwd: 'auto', monthlyExpenseTwd: 'auto', investRatio: 'auto' },
      isComplete: true,
    })
  })

  it('prefers overrides, including a zero expense', () => {
    const resolved = resolveForecastAssumptions({
      settings: { monthlyExpenseTwd: 0, investRatio: 1, stockReturn: 0.05 },
      auto,
    })
    expect(resolved.monthlyExpenseTwd).toBe(0)
    expect(resolved.investRatio).toBe(1)
    expect(resolved.stockReturn).toBe(0.05)
    expect(resolved.sources).toEqual({
      monthlyIncomeTwd: 'auto',
      monthlyExpenseTwd: 'custom',
      investRatio: 'custom',
    })
  })

  it('is incomplete without an income or an expense', () => {
    expect(
      resolveForecastAssumptions({ settings: null, auto: { ...auto, monthlyIncomeTwd: null } }).isComplete,
    ).toBe(false)
    expect(
      resolveForecastAssumptions({ settings: null, auto: { ...auto, monthlyExpenseTwd: null } }).isComplete,
    ).toBe(false)
  })
})

describe('what-if', () => {
  const base = { ...flat, monthlyIncomeTwd: 90000, monthlyExpenseTwd: 60000, investRatio: 0.7, stockReturn: 0.06 }

  it('leaves the assumptions alone with the default knobs', () => {
    expect(applyWhatIf(base, DEFAULT_WHAT_IF)).toEqual(base)
    expect(isWhatIfActive(base, DEFAULT_WHAT_IF)).toBe(false)
  })

  it('adds the deltas and replaces the ratio and return', () => {
    const knobs = { expenseDeltaTwd: -5000, incomeDeltaTwd: 2000, investRatio: 0.9, stockReturn: 0.08 }
    expect(applyWhatIf(base, knobs)).toMatchObject({
      monthlyIncomeTwd: 92000,
      monthlyExpenseTwd: 55000,
      investRatio: 0.9,
      stockReturn: 0.08,
    })
    expect(isWhatIfActive(base, knobs)).toBe(true)
  })

  it('never takes income or expense below zero', () => {
    const applied = applyWhatIf(base, { ...DEFAULT_WHAT_IF, expenseDeltaTwd: -70000, incomeDeltaTwd: -100000 })
    expect(applied.monthlyExpenseTwd).toBe(0)
    expect(applied.monthlyIncomeTwd).toBe(0)
  })

  it('is inactive when a knob is set back to the base value', () => {
    expect(isWhatIfActive(base, { ...DEFAULT_WHAT_IF, investRatio: 0.7, stockReturn: 6 / 100 })).toBe(false)
  })

  it('ranges the amount knobs over half the base, at least 10,000', () => {
    expect(getWhatIfAmountRange(60000)).toBe(30000)
    expect(getWhatIfAmountRange(61000)).toBe(31000)
    expect(getWhatIfAmountRange(5000)).toBe(10000)
    expect(getWhatIfAmountRange(null)).toBe(10000)
  })
})

describe('forecast copy', () => {
  const result = (fiMonthIndex, fiMonth = null) => ({ fiMonthIndex, fiMonth, horizonYears: 30, endTotalTwd: 0 })

  it('describes the FI result', () => {
    expect(describeFiResult(null)).toBe(FORECAST_INCOMPLETE_TEXT)
    expect(FORECAST_INCOMPLETE_TEXT).toBe('設定每月收入與支出以開始預估')
    expect(describeFiResult(result(0, '2026-10'))).toBe('已達財務自由門檻')
    expect(describeFiResult(result(180, '2041-10'))).toBe('照目前步調，2041 年可財務自由（約 15 年後）')
    expect(describeFiResult(result(5, '2027-03'))).toBe('照目前步調，2027 年可財務自由（約 5 個月後）')
    expect(describeFiResult(result(null))).toBe('30 年內未達財務自由')
  })

  it('heads the sheet with the FI year', () => {
    expect(getFiHeadline(result(0, '2026-10'))).toBe('已達成')
    expect(getFiHeadline(result(180, '2041-10'))).toBe('2041 年')
    expect(getFiHeadline(result(null))).toBe('未達')
  })

  it('describes how the what-if line differs', () => {
    const base = { fiMonthIndex: 180, fiMonth: '2041-10', horizonYears: 30, endTotalTwd: 10_000_000 }
    expect(
      describeWhatIfDiff(base, { ...base, fiMonthIndex: 144, fiMonth: '2038-10', endTotalTwd: 14_800_000 }),
    ).toBe(`財務自由提早 3 年 · 30 年後多 ${formatTwd(4_800_000, true)}`)
    expect(
      describeWhatIfDiff(base, { ...base, fiMonthIndex: 186, fiMonth: '2042-04', endTotalTwd: 9_000_000 }),
    ).toBe(`財務自由延後 6 個月 · 30 年後少 ${formatTwd(1_000_000, true)}`)
    expect(describeWhatIfDiff(base, { ...base })).toBe('跟目前步調一樣')
  })

  it('describes reaching or losing FI within the horizon', () => {
    const never = { fiMonthIndex: null, fiMonth: null, horizonYears: 30, endTotalTwd: 100 }
    const reached = { fiMonthIndex: 300, fiMonth: '2051-10', horizonYears: 30, endTotalTwd: 100 }
    expect(describeWhatIfDiff(never, reached)).toBe('變成 2051 年可財務自由')
    expect(describeWhatIfDiff(reached, never)).toBe('變成 30 年內未達財務自由')
  })
})

describe('buildForecastChartData', () => {
  it('keeps one point a year and lines up the what-if total', () => {
    const base = runForecast({ stockTwd: 0, cashTwd: 0, assumptions: flat, startMonth: '2026-10', horizonYears: 2 })
    const whatIf = runForecast({
      stockTwd: 0,
      cashTwd: 0,
      assumptions: { ...flat, monthlyIncomeTwd: 40 },
      startMonth: '2026-10',
      horizonYears: 2,
    })
    expect(buildForecastChartData({ base })).toEqual([
      { yearsFromNow: 0, year: 2026, stockTwd: 0, cashTwd: 0, totalTwd: 0, whatIfTotalTwd: null },
      { yearsFromNow: 1, year: 2027, stockTwd: 180, cashTwd: 60, totalTwd: 240, whatIfTotalTwd: null },
      { yearsFromNow: 2, year: 2028, stockTwd: 360, cashTwd: 120, totalTwd: 480, whatIfTotalTwd: null },
    ])
    expect(buildForecastChartData({ base, whatIf }).map((point) => point.whatIfTotalTwd)).toEqual([0, 360, 720])
  })
})
