// EPS × P/E valuation maths for the stock detail sheet. Pure functions; see
// docs/superpowers/specs/2026-10-05-stock-valuation-design.md for the rules.

export const VALUATION_SETTING_FIELDS = ['peCheap', 'peFair', 'peExpensive', 'growthRate', 'forwardEps']

export const EMPTY_VALUATION_SETTINGS = Object.freeze(
  Object.fromEntries(VALUATION_SETTING_FIELDS.map((field) => [field, null])),
)

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

export const positionOnScale = (value, scale) =>
  Math.min(1, Math.max(0, (value - scale.min) / (scale.max - scale.min)))
const formatPercent = (value) => `${(value * 100).toFixed(1)}%`

const quarterRangeLabel = (from) => (from === 4 ? 'Q4' : `Q${from}–Q4`)

// 台股今年預估: YTD + last year's remaining quarters × (1 + YTD growth).
// After Q4 (annual) is out, projects next year from the annual figure.
export const estimateTwForwardEps = (cumulative, settings) => {
  const singles = cumulativeToSingles(cumulative)
  const latest = [...singles].reverse().find((item) => Number.isFinite(cumulative?.[`${item.year}Q${item.quarter}`]?.eps))
  if (!latest) return null
  const { year, quarter } = latest
  const cumOf = (y, q) => cumulative?.[`${y}Q${q}`]?.eps
  const latestCum = cumOf(year, quarter)
  const base = cumOf(year - 1, quarter)
  const autoGrowthRate = Number.isFinite(base) && base > 0 ? latestCum / base - 1 : null
  const overrideGrowth = Number.isFinite(settings?.growthRate) ? settings.growthRate : null
  const growthRate = overrideGrowth ?? autoGrowthRate ?? 0
  let growthNote = '今年累計 YoY'
  if (overrideGrowth !== null) growthNote = '自訂成長率'
  else if (autoGrowthRate === null) growthNote = '無法計算成長率，以 0% 計'
  const targetYear = quarter === 4 ? year + 1 : year
  const common = { targetYear, growthRate, autoGrowthRate, growthNote }

  if (Number.isFinite(settings?.forwardEps)) {
    return {
      ...common,
      eps: settings.forwardEps,
      overridden: { forwardEps: true, growthRate: overrideGrowth !== null },
      formula: `自訂預估 EPS ${formatEps(settings.forwardEps)}`,
    }
  }
  const overridden = { forwardEps: false, growthRate: overrideGrowth !== null }

  if (quarter === 4) {
    return {
      ...common,
      overridden,
      eps: round(latestCum * (1 + growthRate)),
      formula: `${year} 全年 ${formatEps(latestCum)} × (1 + ${formatPercent(growthRate)})`,
    }
  }

  const range = quarterRangeLabel(quarter + 1)
  const rest = []
  for (let q = quarter + 1; q <= 4; q += 1) {
    rest.push(singles.find((item) => item.year === year - 1 && item.quarter === q)?.eps)
  }
  if (rest.some((value) => !Number.isFinite(value))) {
    return { ...common, overridden, eps: null, formula: `缺少 ${year - 1} 年 ${range} 資料，無法推估` }
  }
  const restSum = rest.reduce((sum, value) => sum + value, 0)
  return {
    ...common,
    overridden,
    eps: round(latestCum + restSum * (1 + growthRate)),
    formula: `今年 Q1–Q${quarter} 累計 ${formatEps(latestCum)} + 去年 ${range} ${formatEps(restSum)} × (1 + ${formatPercent(growthRate)})`,
  }
}

// 美股未來四季: up to 4 upcoming consensus estimates, topped up with the
// most recent actual quarters.
export const estimateUsForwardEps = ({ upcoming = [], singles = [] }, settings) => {
  if (Number.isFinite(settings?.forwardEps)) {
    return {
      eps: settings.forwardEps,
      overridden: { forwardEps: true, growthRate: false },
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
    overridden: { forwardEps: false, growthRate: false },
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

export const buildValuationModel = ({ fundamentals, settings, price, basis }) => {
  const autoBands = peBandsFromHistory(fundamentals.peSeries.map((point) => point.pe))
  const bands = resolvePeBands(autoBands, settings)
  const ttm = computeTtm(fundamentals.singles)
  const forward =
    fundamentals.market === 'TW'
      ? estimateTwForwardEps(fundamentals.cumulative, settings)
      : estimateUsForwardEps(fundamentals, settings)
  const chosen = basis === 'forward' ? forward : ttm
  return {
    basis,
    ttm,
    forward,
    autoBands,
    bands,
    valuation: computeValuation({ eps: chosen?.eps, bands, price }),
  }
}
