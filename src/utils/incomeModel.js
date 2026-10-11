// Quarter-by-quarter income-statement projection for TW listed stocks.
// Pure functions; see
// docs/superpowers/specs/2026-10-11-income-statement-valuation-design.md.
// Amounts are in thousand NTD as published; ratios are fractions.

export const MODEL_FIELDS = ['revenueYoy', 'grossMargin', 'opexRatio', 'nonOperating', 'taxRate', 'nciRatio']

export const STATEMENT_FIELDS = [
  'revenue', 'grossProfit', 'operatingIncome', 'nonOperating',
  'pretaxIncome', 'tax', 'netIncome', 'parentNetIncome', 'eps',
]

export const UNAVAILABLE_REASONS = {
  financial: '金融股不適用損益表推估',
  incomplete: '近四季財報資料不完整',
  shares: '無法計算股數',
  'revenue-history': '月營收資料不足',
}

const CALIBRATION_TOLERANCE = 0.03
const DEFAULT_TAX_RATE = 0.2

const round = (value, digits = 4) => Math.round(value * 10 ** digits) / 10 ** digits
const sum = (values) => values.reduce((total, value) => total + value, 0)

export const quarterIndexOf = ({ year, quarter }) => year * 4 + (quarter - 1)
export const quarterOfIndex = (index) => ({ year: Math.floor(index / 4), quarter: (index % 4) + 1 })
export const quarterKeyOf = ({ year, quarter }) => `${year}Q${quarter}`
export const parseQuarterKey = (key) => {
  const [year, quarter] = key.split('Q').map(Number)
  return { year, quarter }
}

const monthKey = (year, month) => `${year}-${String(month).padStart(2, '0')}`
const monthIndex = (key) => Number(key.slice(0, 4)) * 12 + Number(key.slice(5, 7)) - 1
export const monthsOfQuarter = ({ year, quarter }) => [1, 2, 3].map((offset) => monthKey(year, (quarter - 1) * 3 + offset))
export const shiftYear = (key, years) => `${Number(key.slice(0, 4)) + years}${key.slice(4)}`

export const toSingleStatements = (cumulative) => {
  const entries = Object.entries(cumulative ?? {})
    .map(([key, values]) => ({ ...parseQuarterKey(key), values }))
    .sort((a, b) => quarterIndexOf(a) - quarterIndexOf(b))
  const byIndex = new Map(entries.map((entry) => [quarterIndexOf(entry), entry.values]))
  return entries.map(({ year, quarter, values }) => {
    const previous = quarter === 1 ? null : byIndex.get(quarterIndexOf({ year, quarter }) - 1)
    const single = { year, quarter }
    for (const field of STATEMENT_FIELDS) {
      const value = values?.[field]
      if (!Number.isFinite(value)) single[field] = null
      else if (quarter === 1) single[field] = value
      else single[field] = Number.isFinite(previous?.[field]) ? round(value - previous[field]) : null
    }
    return single
  })
}

const latestFourComplete = (singles) => {
  const quarters = singles.slice(-4)
  if (quarters.length < 4) return null
  for (let i = 1; i < quarters.length; i += 1) {
    if (quarterIndexOf(quarters[i]) !== quarterIndexOf(quarters[i - 1]) + 1) return null
  }
  if (quarters.some((item) => STATEMENT_FIELDS.some((field) => !Number.isFinite(item[field])))) return null
  return quarters
}

export const recentRevenueYoy = (monthlyRevenue) => {
  const recent = Object.keys(monthlyRevenue ?? {}).sort().slice(-3)
  if (recent.length < 3 || monthIndex(recent[2]) - monthIndex(recent[0]) !== 2) return null
  const current = recent.map((month) => monthlyRevenue[month])
  const base = recent.map((month) => monthlyRevenue[shiftYear(month, -1)])
  if ([...current, ...base].some((value) => !Number.isFinite(value))) return null
  const baseTotal = sum(base)
  return baseTotal > 0 ? sum(current) / baseTotal - 1 : null
}

// Statement revenue ÷ the same quarters' monthly revenue: corrects a
// company whose monthly figure is reported on a different basis.
export const revenueCalibration = (quarters, monthlyRevenue) => {
  const monthly = quarters.flatMap((quarter) => monthsOfQuarter(quarter).map((month) => monthlyRevenue?.[month]))
  if (monthly.some((value) => !Number.isFinite(value))) return 1
  const monthlyTotal = sum(monthly)
  if (!(monthlyTotal > 0)) return 1
  const factor = sum(quarters.map((quarter) => quarter.revenue)) / monthlyTotal
  return Math.abs(factor - 1) <= CALIBRATION_TOLERANCE ? 1 : factor
}

const unavailable = (reason) => ({ status: 'unavailable', reason })

// Parent net income ÷ EPS of the latest four cumulative records' largest
// |EPS|: a small EPS is mostly rounding (0.006 → 0.01) and would skew it.
const shareCount = (quarters, cumulative) => {
  const usable = quarters
    .map((quarter) => cumulative?.[quarterKeyOf(quarter)])
    .filter((record) => Number.isFinite(record?.eps) && record.eps !== 0 && Number.isFinite(record.parentNetIncome))
  if (usable.length === 0) return null
  const best = usable.reduce((top, record) => (Math.abs(record.eps) > Math.abs(top.eps) ? record : top))
  return best.parentNetIncome / best.eps
}

export const computeAutoAssumptions = ({ singles, cumulative, monthlyRevenue }) => {
  const recent = latestFourComplete(singles)
  if (!recent) return unavailable('incomplete')
  const total = (field) => sum(recent.map((item) => item[field]))
  const revenue = total('revenue')
  if (!(revenue > 0)) return unavailable('incomplete')
  const latest = { year: recent[3].year, quarter: recent[3].quarter }
  const shares = shareCount(recent, cumulative)
  if (!(shares > 0)) return unavailable('shares')
  const revenueYoy = recentRevenueYoy(monthlyRevenue)
  if (revenueYoy === null) return unavailable('revenue-history')
  const grossProfit = total('grossProfit')
  const pretax = total('pretaxIncome')
  const netIncome = total('netIncome')
  return {
    status: 'ok',
    latest,
    auto: {
      revenueYoy,
      grossMargin: grossProfit / revenue,
      opexRatio: (grossProfit - total('operatingIncome')) / revenue,
      nonOperating: total('nonOperating') / 4,
      taxRate: pretax > 0 ? total('tax') / pretax : DEFAULT_TAX_RATE,
      nciRatio: netIncome > 0 ? 1 - total('parentNetIncome') / netIncome : 0,
    },
    shares,
    calibration: revenueCalibration(recent, monthlyRevenue),
  }
}

const resolveAssumption = (field, key, auto, assumptions) => {
  const quarterValue = assumptions?.quarters?.[key]?.[field]
  if (Number.isFinite(quarterValue)) return { value: quarterValue, source: 'quarter' }
  const globalValue = assumptions?.global?.[field]
  if (Number.isFinite(globalValue)) return { value: globalValue, source: 'global' }
  return { value: auto[field], source: 'auto' }
}

const changeRatio = (value, base) => (Number.isFinite(value) && Number.isFinite(base) && base > 0 ? value / base - 1 : null)

export const projectIncome = (company, assumptions, { todayIso }) => {
  if (company?.statement !== 'general') return unavailable('financial')
  const reported = toSingleStatements(company.cumulative)
  const base = computeAutoAssumptions({ singles: reported, cumulative: company.cumulative, monthlyRevenue: company.monthlyRevenue })
  if (base.status !== 'ok') return base
  const { auto, shares, calibration, latest } = base
  const thisYear = Number(todayIso.slice(0, 4))
  const firstIndex = quarterIndexOf(latest) + 1
  const lastIndex = quarterIndexOf({ year: thisYear + 1, quarter: 4 })

  // Published months, then each projected month as it is computed, so next
  // year's months grow this year's projections.
  const revenueByMonth = { ...company.monthlyRevenue }
  const quarters = []
  for (let index = firstIndex; index <= lastIndex; index += 1) {
    const period = quarterOfIndex(index)
    const key = quarterKeyOf(period)
    const resolved = Object.fromEntries(
      MODEL_FIELDS.map((field) => [field, resolveAssumption(field, key, auto, assumptions)]),
    )
    // Each month as published, or grown from the same month a year earlier
    // (itself published or projected) — kept for the quarter's breakdown.
    const months = []
    for (const month of monthsOfQuarter(period)) {
      const lastYearMonth = shiftYear(month, -1)
      const base = revenueByMonth[lastYearMonth]
      const baseActual = Number.isFinite(company.monthlyRevenue?.[lastYearMonth])
      const published = company.monthlyRevenue?.[month]
      if (Number.isFinite(published)) {
        months.push({
          month,
          revenue: published,
          actual: true,
          base: Number.isFinite(base) ? base : null,
          baseActual,
          yoy: Number.isFinite(base) && base > 0 ? published / base - 1 : null,
        })
        continue
      }
      if (!Number.isFinite(base)) return unavailable('revenue-history')
      revenueByMonth[month] = base * (1 + resolved.revenueYoy.value)
      months.push({
        month,
        revenue: revenueByMonth[month],
        actual: false,
        base,
        baseActual,
        yoy: resolved.revenueYoy.value,
      })
    }
    const reportedMonths = months.filter((item) => item.actual).length
    const monthlyTotal = sum(months.map((item) => item.revenue))
    const revenue = monthlyTotal * calibration
    const grossProfit = revenue * resolved.grossMargin.value
    const operatingIncome = grossProfit - revenue * resolved.opexRatio.value
    const pretaxIncome = operatingIncome + resolved.nonOperating.value
    const netIncome = pretaxIncome * (1 - resolved.taxRate.value)
    const parentNetIncome = netIncome * (1 - resolved.nciRatio.value)
    const overrides = assumptions?.quarters?.[key] ?? {}
    quarters.push({
      ...period,
      key,
      reportedMonths,
      months,
      revenue,
      grossProfit,
      operatingIncome,
      pretaxIncome,
      netIncome,
      parentNetIncome,
      eps: round(parentNetIncome / shares),
      overridden: MODEL_FIELDS.some((field) => Number.isFinite(overrides[field])),
      assumptions: resolved,
    })
  }

  const epsByIndex = new Map([
    ...reported.map((item) => [quarterIndexOf(item), item.eps]),
    ...quarters.map((item) => [quarterIndexOf(item), item.eps]),
  ])
  const sumEps = (from, to) => {
    let total = 0
    for (let index = from; index <= to; index += 1) {
      const value = epsByIndex.get(index)
      if (!Number.isFinite(value)) return null
      total += value
    }
    return round(total)
  }

  const next = quarters[0]
  return {
    status: 'ok',
    latest,
    shares,
    calibration,
    auto,
    reported,
    quarters,
    nextQuarter: {
      ...next,
      yoy: changeRatio(next.eps, epsByIndex.get(firstIndex - 4)),
      qoq: changeRatio(next.eps, epsByIndex.get(firstIndex - 1)),
    },
    ttmAfterNext: { eps: sumEps(firstIndex - 3, firstIndex), from: quarterOfIndex(firstIndex - 3) },
    thisYear: {
      year: thisYear,
      eps: sumEps(quarterIndexOf({ year: thisYear, quarter: 1 }), quarterIndexOf({ year: thisYear, quarter: 4 })),
      reportedQuarters: latest.year === thisYear ? latest.quarter : 0,
    },
    nextYear: {
      year: thisYear + 1,
      eps: sumEps(quarterIndexOf({ year: thisYear + 1, quarter: 1 }), lastIndex),
    },
    rollingTtm: quarters.map((item) => ({
      year: item.year,
      quarter: item.quarter,
      eps: sumEps(quarterIndexOf(item) - 3, quarterIndexOf(item)),
    })),
  }
}

const ratioOf = (part, whole) => (Number.isFinite(part) && whole > 0 ? part / whole : null)

// Snapshots of quarters that have since been published, with the actual
// figures next to the estimate.
export const compareSnapshots = (snapshots, reported) =>
  Object.entries(snapshots ?? {})
    .map(([key, estimate]) => {
      const { year, quarter } = parseQuarterKey(key)
      const actual = reported.find((item) => item.year === year && item.quarter === quarter)
      if (!actual || !Number.isFinite(actual.eps) || !(actual.revenue > 0)) return null
      return {
        key,
        year,
        quarter,
        savedAt: estimate.savedAt ?? null,
        estimate,
        actual: {
          eps: actual.eps,
          revenue: actual.revenue,
          grossMargin: ratioOf(actual.grossProfit, actual.revenue),
          opexRatio: ratioOf(actual.grossProfit - actual.operatingIncome, actual.revenue),
        },
        epsDiff: changeRatio(actual.eps, estimate.eps),
      }
    })
    .filter(Boolean)
    .sort((a, b) => quarterIndexOf(b) - quarterIndexOf(a))

// The latest published month with its YoY and quarter, for the detail
// sheet's 月營收 row.
export const latestMonthRevenue = (monthlyRevenue) => {
  const month = Object.keys(monthlyRevenue ?? {}).sort().at(-1)
  if (!month) return null
  const revenue = monthlyRevenue[month]
  const base = monthlyRevenue[shiftYear(month, -1)]
  const [year, monthNumber] = month.split('-').map(Number)
  return {
    month,
    revenue,
    yoy: Number.isFinite(base) && base > 0 ? revenue / base - 1 : null,
    quarterKey: quarterKeyOf({ year, quarter: Math.ceil(monthNumber / 3) }),
  }
}
