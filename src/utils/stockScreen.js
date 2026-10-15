// 低估篩選. Build time (scripts/split-tw-fundamentals.mjs): one row of raw
// valuation inputs per listed company → public/data/tw/screen.json. In the
// app: live prices, thresholds and the user's valuation overrides turn the
// rows into the 低估候選 list. Pure functions; see
// docs/superpowers/specs/2026-10-15-stock-screener-design.md.
// Imported by Node scripts too, so relative imports carry .js.
import { toSingleStatements } from './incomeModel.js'
import { CONSTRUCTION_INDUSTRY, industryName } from './twIndustries.js'
import {
  buildValuationModel,
  computeTtm,
  computeValuation,
  cumulativeToSingles,
  peBandsFromHistory,
  quarterIndex,
  TW_BASES,
  VALUATION_SETTING_FIELDS,
} from './valuation.js'

export const SCREEN_BASES = TW_BASES

// Same month-end window as twFundamentalsProvider (which cannot be imported
// here: it reads import.meta.env).
const PE_MONTHS = 60
const DEFAULT_TAX_RATE = 0.2
const MAX_TAX_RATE = 0.4
const TTM_FIELDS = ['operatingIncome', 'nonOperating', 'pretaxIncome', 'tax', 'netIncome', 'parentNetIncome']

const round = (value, digits = 4) => Math.round(value * 10 ** digits) / 10 ** digits
const sum = (values) => values.reduce((total, value) => total + value, 0)
const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

// A split company file → the fundamentals buildValuationModel expects
// (the TW half of loadStockFundamentals).
export const toTwFundamentals = (file) => {
  const cumulative = file.quarters ?? {}
  const monthly = (file.monthly ?? [])
    .slice(0, PE_MONTHS)
    .map(([month, pe, close]) => ({ month, pe: pe ?? null, close: close ?? null }))
    .reverse()
  return {
    market: 'TW',
    singles: cumulativeToSingles(cumulative),
    cumulative,
    company: { statement: file.statement ?? null, cumulative, monthlyRevenue: file.monthlyRevenue ?? {}, monthly },
    peSeries: monthly.map(({ month, pe }) => ({ label: month, pe })),
  }
}

// The latest `count` items when they are consecutive quarters, else null.
const latestConsecutive = (items, count) => {
  const tail = items.slice(-count)
  if (tail.length < count) return null
  for (let i = 1; i < tail.length; i += 1) {
    if (quarterIndex(tail[i]) !== quarterIndex(tail[i - 1]) + 1) return null
  }
  return tail
}

// Latest four quarters' income-statement totals (thousand NTD).
const statementTtm = (cumulative) => {
  const quarters = latestConsecutive(toSingleStatements(cumulative), 4)
  if (!quarters) return null
  const totals = {}
  for (const field of TTM_FIELDS) {
    if (quarters.some((quarter) => !Number.isFinite(quarter[field]))) return null
    totals[field] = sum(quarters.map((quarter) => quarter[field]))
  }
  return totals
}

const epsGrowthOf = (singles) => {
  const eight = latestConsecutive(singles, 8)
  if (!eight || eight.some((quarter) => !Number.isFinite(quarter.eps))) return null
  const previous = sum(eight.slice(0, 4).map((quarter) => quarter.eps))
  const current = sum(eight.slice(4).map((quarter) => quarter.eps))
  return previous > 0 ? round(current / previous) : null
}

// Operating income after tax and minority interest, per share: the EPS
// without 業外.
const coreEpsOf = (statement, totals, ttmEps) => {
  if (statement !== 'general' || !totals || !(ttmEps > 0) || !(totals.parentNetIncome > 0)) return null
  const taxRate =
    totals.pretaxIncome > 0 ? clamp(totals.tax / totals.pretaxIncome, 0, MAX_TAX_RATE) : DEFAULT_TAX_RATE
  const parentShare = totals.netIncome > 0 ? totals.parentNetIncome / totals.netIncome : 1
  const shares = totals.parentNetIncome / ttmEps
  return round((totals.operatingIncome * (1 - taxRate) * parentShare) / shares)
}

// Issued shares ÷ the shares implied by the latest statement: far from 1
// after a split or capital change the EPS history does not reflect.
const shareRatioOf = (cumulative, sharesIssued) => {
  const latestKey = Object.keys(cumulative).sort().at(-1)
  const latest = latestKey ? cumulative[latestKey] : null
  if (!(sharesIssued > 0) || !(latest?.eps > 0.05) || !Number.isFinite(latest?.parentNetIncome)) return null
  return round(sharesIssued / ((latest.parentNetIncome * 1000) / latest.eps))
}

export const buildScreenRow = (file, profile, todayIso) => {
  const fundamentals = toTwFundamentals(file)
  const eps = Object.fromEntries(
    SCREEN_BASES.map((basis) => {
      const value = buildValuationModel({ fundamentals, settings: null, price: null, basis, todayIso }).chosen?.eps
      return [basis, Number.isFinite(value) ? value : null]
    }),
  )
  const bands = peBandsFromHistory(fundamentals.peSeries.map((point) => point.pe))
  if (!bands && SCREEN_BASES.every((basis) => eps[basis] === null)) return null

  const totals = statementTtm(fundamentals.cumulative)
  const ttmEps = computeTtm(fundamentals.singles)?.eps ?? null
  const fallback = (file.monthly ?? []).find(([, , close]) => Number.isFinite(close) && close > 0)
  return {
    code: file.code,
    name: file.name,
    industry: profile?.industry ?? null,
    statement: file.statement ?? null,
    eps,
    bands,
    nonOpRatio: totals && totals.pretaxIncome > 0 ? round(totals.nonOperating / totals.pretaxIncome) : null,
    profitQuarters: fundamentals.singles.slice(-8).filter((quarter) => quarter.eps > 0).length,
    epsGrowth: epsGrowthOf(fundamentals.singles),
    coreEps: coreEpsOf(file.statement, totals, ttmEps),
    shareRatio: shareRatioOf(fundamentals.cumulative, profile?.sharesIssued),
    fallbackClose: fallback ? fallback[2] : null,
    fallbackMonth: fallback ? fallback[0] : null,
  }
}

export const buildScreenFile = ({ files, profiles, todayIso, generatedAt }) => ({
  generatedAt,
  todayIso,
  rows: Object.values(files ?? {})
    .map((file) => buildScreenRow(file, profiles?.companies?.[file.code], todayIso))
    .filter(Boolean)
    .sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0)),
})

// ── In the app ──────────────────────────────────────────────────────────

export const SCREEN_BASIS_OPTIONS = [
  { value: 'ttm', label: '近四季' },
  { value: 'ttmAfterNext', label: '下季後' },
  { value: 'thisYear', label: '今年' },
  { value: 'nextYear', label: '明年（參考）' },
]

export const SCREEN_FLAG_KEYS = [
  'nonOperating',
  'unstableProfit',
  'epsSpike',
  'coreNotCheap',
  'fewPeSamples',
  'shareChange',
  'construction',
  'lowTurnover',
]

// field.unit: how the settings sheet shows the threshold — percent (0.3 ↔
// 30), wan (10,000,000 ↔ 1,000 萬), count / times as stored.
export const FLAG_DEFINITIONS = {
  nonOperating: {
    label: '業外占比高',
    description: '近四季業外損益占稅前淨利超過上限，獲利可能是一次性的',
    generalOnly: true,
    field: { key: 'max', label: '業外占比上限', unit: 'percent' },
  },
  unstableProfit: {
    label: '獲利不穩',
    description: '近 8 季中獲利的季數少於門檻',
    field: { key: 'minProfitQuarters', label: '至少獲利季數', unit: 'count' },
  },
  epsSpike: {
    label: 'EPS 暴增',
    description: '近四季 EPS 超過前一年的倍數上限，含轉虧為盈',
    field: { key: 'maxGrowth', label: '成長倍數上限', unit: 'times' },
  },
  coreNotCheap: {
    label: '本業不便宜',
    description: '只用營業利益換算 EPS 估價時，現價不低於合理價',
    generalOnly: true,
  },
  fewPeSamples: {
    label: '本益比樣本少',
    description: '歷史本益比的月份數少於門檻，區間不可靠',
    field: { key: 'minSamples', label: '至少月份數', unit: 'count' },
  },
  shareChange: {
    label: '股本變動',
    description: '目前股數與財報隱含股數差距超過上限，EPS 可能還沒反映',
    field: { key: 'maxDeviation', label: '差距上限', unit: 'percent' },
  },
  construction: {
    label: '營建業',
    description: '建材營造業交屋才認列，EPS 起伏大',
  },
  lowTurnover: {
    label: '成交量低',
    description: '當日成交金額低於門檻',
    field: { key: 'minTradeValue', label: '最低成交金額', unit: 'wan' },
  },
}

export const DEFAULT_SCREEN_SETTINGS = Object.freeze({
  version: 1,
  industries: Object.freeze([]),
  flags: Object.freeze({
    nonOperating: Object.freeze({ enabled: true, max: 0.3 }),
    unstableProfit: Object.freeze({ enabled: true, minProfitQuarters: 7 }),
    epsSpike: Object.freeze({ enabled: true, maxGrowth: 2 }),
    coreNotCheap: Object.freeze({ enabled: true }),
    fewPeSamples: Object.freeze({ enabled: true, minSamples: 36 }),
    shareChange: Object.freeze({ enabled: true, maxDeviation: 0.3 }),
    construction: Object.freeze({ enabled: true }),
    lowTurnover: Object.freeze({ enabled: true, minTradeValue: 10_000_000 }),
  }),
})

const isNonNegative = (value) => Number.isFinite(value) && value >= 0

// Stored settings (any version, possibly partial or broken) → complete,
// valid settings; bad values fall back to the defaults field by field.
export const normalizeScreenSettings = (stored) => ({
  version: 1,
  industries: Array.isArray(stored?.industries)
    ? [...new Set(stored.industries.filter((code) => typeof code === 'string'))]
    : [],
  flags: Object.fromEntries(
    SCREEN_FLAG_KEYS.map((key) => {
      const defaults = DEFAULT_SCREEN_SETTINGS.flags[key]
      const saved = stored?.flags?.[key] ?? {}
      const next = { enabled: typeof saved.enabled === 'boolean' ? saved.enabled : defaults.enabled }
      const fieldKey = FLAG_DEFINITIONS[key].field?.key
      if (fieldKey) next[fieldKey] = isNonNegative(saved[fieldKey]) ? saved[fieldKey] : defaults[fieldKey]
      return [key, next]
    }),
  ),
})

// Thresholds are inclusive: a value exactly at the limit does not flag.
// `fair` is the P/E the row is valued at (an override's when present);
// tradeValue is undefined on a month-end price.
export const computeFlags = (row, { price, tradeValue, fair }, flags) => {
  const general = row.statement === 'general'
  const on = (key) => flags[key]?.enabled === true
  const result = []
  if (on('nonOperating') && general && !(row.nonOpRatio !== null && row.nonOpRatio <= flags.nonOperating.max)) {
    result.push('nonOperating')
  }
  if (on('unstableProfit') && row.profitQuarters < flags.unstableProfit.minProfitQuarters) {
    result.push('unstableProfit')
  }
  if (on('epsSpike') && !(row.epsGrowth !== null && row.epsGrowth <= flags.epsSpike.maxGrowth)) {
    result.push('epsSpike')
  }
  if (on('coreNotCheap') && general && row.coreEps !== null && (row.coreEps <= 0 || price >= round(row.coreEps * fair, 6))) {
    result.push('coreNotCheap')
  }
  if (on('fewPeSamples') && (row.bands?.sampleSize ?? 0) < flags.fewPeSamples.minSamples) {
    result.push('fewPeSamples')
  }
  if (on('shareChange') && row.shareRatio !== null && round(Math.abs(row.shareRatio - 1), 6) > flags.shareChange.maxDeviation) {
    result.push('shareChange')
  }
  if (on('construction') && row.industry === CONSTRUCTION_INDUSTRY) {
    result.push('construction')
  }
  if (on('lowTurnover') && Number.isFinite(tradeValue) && tradeValue < flags.lowTurnover.minTradeValue) {
    result.push('lowTurnover')
  }
  return result
}

const byDistance = (a, b) => a.distanceToFair - b.distanceToFair

export const screenStocks = ({ rows, quotes = {}, settings, basis, overrides = {}, owned = new Set(), watched = new Set() }) => {
  const industries = new Set(settings.industries)
  const below = []
  const fairLow = []
  const flagged = []
  for (const row of rows) {
    if (industries.size > 0 && !industries.has(row.industry)) continue
    const override = overrides[row.code]?.[basis]
    const eps = override ? override.eps : row.eps?.[basis] ?? null
    const bands = override ? override.bands : row.bands
    const quote = quotes[row.code]
    const daily = Number.isFinite(quote?.price) && quote.price > 0
    const price = daily ? quote.price : row.fallbackClose
    const valuation = computeValuation({ eps, bands, price })
    if (valuation.status !== 'ok' || (valuation.zone !== 'below' && valuation.zone !== 'fair-low')) continue
    const item = {
      code: row.code,
      name: row.name,
      industry: row.industry,
      industryName: industryName(row.industry),
      price,
      priceSource: daily ? 'daily' : 'month-end',
      fallbackMonth: daily ? null : row.fallbackMonth,
      eps,
      prices: valuation.prices,
      zone: valuation.zone,
      distanceToFair: valuation.distanceToFair,
      flags: computeFlags(row, { price, tradeValue: daily ? quote.tradeValue : undefined, fair: bands.fair }, settings.flags),
      custom: Boolean(override?.custom),
      owned: owned.has(row.code),
      watched: watched.has(row.code),
    }
    if (item.flags.length > 0 && !item.owned && !item.watched) flagged.push(item)
    else if (item.zone === 'below') below.push(item)
    else fairLow.push(item)
  }
  below.sort(byDistance)
  fairLow.sort(byDistance)
  flagged.sort(byDistance)
  return { below, fairLow, flagged, counts: { listed: below.length + fairLow.length, flagged: flagged.length } }
}

// ── Valuation overrides (細節頁的自訂假設) ────────────────────────────────

export const hasCustomValuation = (settings) =>
  VALUATION_SETTING_FIELDS.some((field) => Number.isFinite(settings?.[field])) ||
  Object.values(settings?.model?.global ?? {}).some(Number.isFinite) ||
  Object.keys(settings?.model?.quarters ?? {}).length > 0

const pickBasis = (model) => ({
  eps: Number.isFinite(model.chosen?.eps) ? model.chosen.eps : null,
  bands: {
    cheap: model.bands?.cheap ?? null,
    fair: model.bands?.fair ?? null,
    expensive: model.bands?.expensive ?? null,
  },
})

// Both models are built from the same fundamentals and basis, with and
// without the user's settings, so 自訂 means the settings change this
// basis's result — not that the data moved since the build.
export const toOverride = (customModel, autoModel) => {
  const mine = pickBasis(customModel)
  const auto = pickBasis(autoModel)
  const custom = mine.eps !== auto.eps || ['cheap', 'fair', 'expensive'].some((key) => mine.bands[key] !== auto.bands[key])
  return { ...mine, custom }
}

// ── Display ─────────────────────────────────────────────────────────────

export const formatDistance = (distance) => {
  const percent = Math.round(distance * 100)
  return `距合理價 ${percent < 0 ? '−' : ''}${Math.abs(percent)}%`
}

export const monthEndLabel = (month) => `${Number(month.slice(5))} 月底價`

export const describeRowMeta = (item) => [
  ...(item.owned ? ['持有'] : []),
  ...(item.watched ? ['觀察'] : []),
  ...(item.custom ? ['自訂'] : []),
  ...(item.priceSource === 'month-end' && item.fallbackMonth ? [monthEndLabel(item.fallbackMonth)] : []),
  ...item.flags.map((key) => FLAG_DEFINITIONS[key].label),
]

// MI_INDEX date (YYYYMMDD) → MM/DD.
export const formatQuotesDate = (date) => (date ? `${date.slice(4, 6)}/${date.slice(6, 8)}` : null)

export const industrySummary = (codes) => {
  if (!codes?.length) return '全部產業'
  const first = industryName(codes[0])
  return codes.length === 1 ? first : `${first} 等 ${codes.length} 類`
}
