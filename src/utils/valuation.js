// EPS × P/E valuation maths for the stock detail sheet. Pure functions; see
// docs/superpowers/specs/2026-10-05-stock-valuation-design.md for the rules.

import { MODEL_FIELDS, projectIncome, UNAVAILABLE_REASONS } from './incomeModel'

export const VALUATION_SETTING_FIELDS = ['peCheap', 'peFair', 'peExpensive', 'forwardEps']

export const EMPTY_MODEL_ASSUMPTIONS = Object.freeze({
  global: Object.freeze(Object.fromEntries(MODEL_FIELDS.map((field) => [field, null]))),
  quarters: Object.freeze({}),
})

export const EMPTY_VALUATION_SETTINGS = Object.freeze({
  ...Object.fromEntries(VALUATION_SETTING_FIELDS.map((field) => [field, null])),
  model: EMPTY_MODEL_ASSUMPTIONS,
  snapshots: Object.freeze({}),
})

export const MIN_PE_SAMPLES = 8

export const ZONE_LABELS = {
  below: '低於便宜價',
  'fair-low': '合理偏低',
  'fair-high': '合理偏高',
  above: '高於昂貴價',
}

const round = (value, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits

export const formatEps = (value) => value.toFixed(2)

export const quarterIndex = ({ year, quarter }) => year * 4 + (quarter - 1)

export const formatQuarter = ({ year, quarter }) => `${year} Q${quarter}`

const parseQuarterKey = (key) => {
  const [year, quarter] = key.split('Q').map(Number)
  return { year, quarter }
}

// TWSE publishes year-to-date EPS: Qn = cum(n) − cum(n−1), Q1 = cum(1).
export const cumulativeToSingles = (cumulative) => {
  const entries = Object.entries(cumulative ?? {})
    .map(([key, value]) => ({ ...parseQuarterKey(key), cum: Number.isFinite(value?.eps) ? value.eps : null }))
    .sort((a, b) => quarterIndex(a) - quarterIndex(b))
  const byIndex = new Map(entries.map((entry) => [quarterIndex(entry), entry]))
  return entries.map(({ year, quarter, cum }) => {
    if (cum === null) return { year, quarter, eps: null }
    if (quarter === 1) return { year, quarter, eps: cum }
    const previous = byIndex.get(quarterIndex({ year, quarter }) - 1)
    return { year, quarter, eps: Number.isFinite(previous?.cum) ? round(cum - previous.cum, 4) : null }
  })
}

// `singles` must be sorted oldest → newest.
export const computeTtm = (singles) => {
  if (!Array.isArray(singles) || singles.length < 4) return null
  const quarters = singles.slice(-4)
  for (let i = 1; i < quarters.length; i += 1) {
    if (quarterIndex(quarters[i]) !== quarterIndex(quarters[i - 1]) + 1) return null
  }
  if (quarters.some((item) => !Number.isFinite(item.eps))) return null
  const eps = round(quarters.reduce((sum, item) => sum + item.eps, 0), 4)
  return {
    eps,
    quarters,
    formula: `近四季 ${formatQuarter(quarters[0])}–${formatQuarter(quarters[3])} 合計 ${formatEps(eps)}`,
  }
}

const percentile = (sorted, p) => {
  const position = (sorted.length - 1) * p
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower)
}

export const peBandsFromHistory = (values) => {
  const valid = (values ?? []).filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b)
  if (valid.length < MIN_PE_SAMPLES) return null
  return {
    cheap: round(percentile(valid, 0.25)),
    fair: round(percentile(valid, 0.5)),
    expensive: round(percentile(valid, 0.75)),
    sampleSize: valid.length,
  }
}

const BAND_FIELDS = { cheap: 'peCheap', fair: 'peFair', expensive: 'peExpensive' }

export const resolvePeBands = (auto, settings) => {
  const result = { overridden: {} }
  for (const [band, field] of Object.entries(BAND_FIELDS)) {
    const override = settings?.[field]
    const isOverride = Number.isFinite(override) && override > 0
    result[band] = isOverride ? override : auto?.[band] ?? null
    result.overridden[band] = isOverride
  }
  return result
}

const isPositive = (value) => Number.isFinite(value) && value > 0

export const computeValuation = ({ eps, bands, price }) => {
  if (!Number.isFinite(eps)) return { status: 'no-eps' }
  if (eps <= 0) return { status: 'loss' }
  const { cheap, fair, expensive } = bands ?? {}
  if (![cheap, fair, expensive].every(isPositive)) return { status: 'missing-pe' }
  if (!(cheap <= fair && fair <= expensive)) return { status: 'invalid-pe' }

  const prices = { cheap: round(eps * cheap), fair: round(eps * fair), expensive: round(eps * expensive) }
  const hasPrice = isPositive(price)
  const scale = {
    min: Math.min(prices.cheap, hasPrice ? price : Infinity) * 0.9,
    max: Math.max(prices.expensive, hasPrice ? price : -Infinity) * 1.1,
  }
  let zone = null
  if (hasPrice) {
    if (price < prices.cheap) zone = 'below'
    else if (price < prices.fair) zone = 'fair-low'
    else if (price < prices.expensive) zone = 'fair-high'
    else zone = 'above'
  }
  return {
    status: 'ok',
    prices,
    zone,
    distanceToFair: hasPrice ? price / prices.fair - 1 : null,
    scale,
    price: hasPrice ? price : null,
  }
}


// Where a price sits on the valuation ruler drawn as four equal zones
// (below 便宜價 / to 合理價 / to 昂貴價 / above), so the three prices land on
// the quarter marks. Inside a zone the price is placed proportionally.
export const zonePosition = (price, prices, scale) => {
  const stops = [scale.min, prices.cheap, prices.fair, prices.expensive, scale.max]
  if (price <= stops[0]) return 0
  if (price >= stops[4]) return 1
  // The last stop at or below the price: a price equal to a stop sits on its
  // mark even when neighbouring stops are equal (便宜價 = 合理價).
  let zone = 3
  while (stops[zone] > price) zone -= 1
  const from = stops[zone]
  const to = stops[zone + 1]
  return (zone + (to > from ? (price - from) / (to - from) : 0)) / 4
}

const quarterRangeLabel = (from) => (from === 4 ? 'Q4' : `Q${from}–Q4`)

// 美股未來四季: up to 4 upcoming consensus estimates, topped up with the
// most recent actual quarters.
export const estimateUsForwardEps = ({ upcoming = [], singles = [] }, settings) => {
  if (Number.isFinite(settings?.forwardEps)) {
    return {
      eps: settings.forwardEps,
      formula: `自訂預估 EPS ${formatEps(settings.forwardEps)}`,
    }
  }
  const estimates = upcoming
    .filter((item) => Number.isFinite(item.epsEstimate))
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .slice(0, 4)
  if (estimates.length === 0) return null
  const need = 4 - estimates.length
  const actuals = need > 0 ? singles.filter((item) => Number.isFinite(item.eps)).slice(-need) : []
  if (actuals.length < need) return null
  const estimateSum = estimates.reduce((sum, item) => sum + item.epsEstimate, 0)
  const actualSum = actuals.reduce((sum, item) => sum + item.eps, 0)
  const parts = [`未來 ${estimates.length} 季預估 ${formatEps(estimateSum)}`]
  if (need > 0) parts.push(`最近 ${need} 季實際 ${formatEps(actualSum)}`)
  return {
    eps: round(estimateSum + actualSum, 4),
    formula: `${parts.join(' + ')}（分析師 consensus，調整後 EPS）`,
  }
}

// 一般業法定申報期限.
const TW_DEADLINES = [
  { month: '03', day: '31', label: '年報' },
  { month: '05', day: '15', label: 'Q1 財報' },
  { month: '08', day: '14', label: 'Q2 財報' },
  { month: '11', day: '14', label: 'Q3 財報' },
]

export const nextTwFilingDeadline = (todayIso) => {
  const year = Number(todayIso.slice(0, 4))
  for (const candidateYear of [year, year + 1]) {
    for (const { month, day, label } of TW_DEADLINES) {
      const date = `${candidateYear}-${month}-${day}`
      if (date >= todayIso) return { date, label }
    }
  }
  return null
}

export const TW_BASES = ['ttm', 'ttmAfterNext', 'thisYear', 'nextYear']
export const US_BASES = ['ttm', 'forward']

const NO_EPS = '資料不足，無法計算'

const epsOrReason = (eps, formula) =>
  Number.isFinite(eps) ? { eps, formula: formula(eps) } : { eps: null, reason: NO_EPS }

// 台股: TTM plus three projections from the income model; a custom
// forward EPS replaces this year's and next year's.
const twBasisEps = (income, ttm, settings) => {
  const custom = Number.isFinite(settings?.forwardEps)
    ? { eps: settings.forwardEps, formula: `自訂預估 EPS ${formatEps(settings.forwardEps)}` }
    : null
  const fromIncome = (pick) =>
    income.status === 'ok' ? pick(income) : { eps: null, reason: UNAVAILABLE_REASONS[income.reason] ?? NO_EPS }
  return {
    ttm,
    ttmAfterNext: fromIncome(({ ttmAfterNext, latest, nextQuarter }) =>
      epsOrReason(
        ttmAfterNext.eps,
        (eps) =>
          `${formatQuarter(ttmAfterNext.from)}–${formatQuarter(latest)} 實際 + ${formatQuarter(nextQuarter)} 推估 合計 ${formatEps(eps)}`,
      ),
    ),
    thisYear:
      custom ??
      fromIncome(({ thisYear }) =>
        epsOrReason(thisYear.eps, (eps) =>
          thisYear.reportedQuarters === 0
            ? `${thisYear.year} 全年推估 合計 ${formatEps(eps)}`
            : `${thisYear.year} Q1–Q${thisYear.reportedQuarters} 實際 + ${quarterRangeLabel(thisYear.reportedQuarters + 1)} 推估 合計 ${formatEps(eps)}`,
        ),
      ),
    nextYear:
      custom ??
      fromIncome(({ nextYear }) => epsOrReason(nextYear.eps, (eps) => `${nextYear.year} 全年推估 合計 ${formatEps(eps)}`)),
  }
}

export const buildValuationModel = ({ fundamentals, settings, price, basis, todayIso }) => {
  const autoBands = peBandsFromHistory(fundamentals.peSeries.map((point) => point.pe))
  const bands = resolvePeBands(autoBands, settings)
  const ttm = computeTtm(fundamentals.singles)
  const income =
    fundamentals.market === 'TW' ? projectIncome(fundamentals.company, settings?.model, { todayIso }) : undefined
  const byBasis =
    fundamentals.market === 'TW'
      ? twBasisEps(income, ttm, settings)
      : { ttm, forward: estimateUsForwardEps(fundamentals, settings) }
  const chosen = byBasis[basis] ?? byBasis.ttm
  return {
    basis,
    ttm,
    income,
    byBasis,
    chosen,
    autoBands,
    bands,
    valuation: computeValuation({ eps: chosen?.eps, bands, price }),
  }
}
