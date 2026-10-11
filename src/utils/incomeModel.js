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

export const computeAutoAssumptions = ({ singles, cumulative, monthlyRevenue }) => {
  const recent = latestFourComplete(singles)
  if (!recent) return unavailable('incomplete')
  const total = (field) => sum(recent.map((item) => item[field]))
  const revenue = total('revenue')
  if (!(revenue > 0)) return unavailable('incomplete')
  const latest = { year: recent[3].year, quarter: recent[3].quarter }
  const latestCumulative = cumulative?.[quarterKeyOf(latest)]
  const shares =
    Number.isFinite(latestCumulative?.eps) && latestCumulative.eps !== 0
      ? latestCumulative.parentNetIncome / latestCumulative.eps
      : null
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
