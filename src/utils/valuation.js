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
