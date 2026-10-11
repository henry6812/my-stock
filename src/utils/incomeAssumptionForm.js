// Conversions and draft helpers for the 估價假設 form. Settings keep ratios
// as fractions and amounts in thousand NTD; the form shows % and 億.
import { MODEL_FIELDS } from './incomeModel'
import { VALUATION_SETTING_FIELDS } from './valuation'

export const THOUSANDS_PER_YI = 100_000

export const FIELD_META = {
  revenueYoy: { label: '營收 YoY', unit: '%', kind: 'percent', signed: true },
  grossMargin: { label: '毛利率', unit: '%', kind: 'percent', signed: true },
  opexRatio: { label: '營業費用率', unit: '%', kind: 'percent', signed: false },
  nonOperating: { label: '業外', unit: '億/季', kind: 'amount', signed: true },
  taxRate: { label: '稅率', unit: '%', kind: 'percent', signed: false },
  nciRatio: { label: '非控制權益比', unit: '%', kind: 'percent', signed: false },
}

const round = (value, digits) => Math.round(value * 10 ** digits) / 10 ** digits

export const toInput = (field, value) => {
  if (!Number.isFinite(value)) return null
  return FIELD_META[field].kind === 'percent' ? round(value * 100, 2) : round(value / THOUSANDS_PER_YI, 2)
}

export const fromInput = (field, input) => {
  if (!Number.isFinite(input)) return null
  return FIELD_META[field].kind === 'percent' ? input / 100 : input * THOUSANDS_PER_YI
}

export const formatAssumption = (field, value) => {
  if (!Number.isFinite(value)) return '--'
  return FIELD_META[field].kind === 'percent' ? (value * 100).toFixed(1) : (value / THOUSANDS_PER_YI).toFixed(1)
}

export const formatPercent = (ratio) => (Number.isFinite(ratio) ? `${(ratio * 100).toFixed(1)}%` : '--')

export const formatYi = (thousands) =>
  `${Math.round(thousands / THOUSANDS_PER_YI).toLocaleString('en-US')} 億`

export const formatShares = (thousandShares) => `${(thousandShares / THOUSANDS_PER_YI).toFixed(1)} 億股`

export const setGlobalValue = (draft, field, value) => ({
  ...draft,
  model: { ...draft.model, global: { ...draft.model.global, [field]: value } },
})

export const setQuarterValue = (draft, key, field, value) => {
  const current = { ...(draft.model.quarters[key] ?? {}) }
  if (value === null) delete current[field]
  else current[field] = value
  const quarters = { ...draft.model.quarters }
  if (Object.keys(current).length > 0) quarters[key] = current
  else delete quarters[key]
  return { ...draft, model: { ...draft.model, quarters } }
}

const changed = (before, after) => (after ?? null) !== (before ?? null)

export const diffSettings = (settings, draft) => {
  const patch = {}
  for (const field of VALUATION_SETTING_FIELDS) {
    if (changed(settings[field], draft[field])) patch[field] = draft[field] ?? null
  }
  const global = {}
  for (const field of MODEL_FIELDS) {
    if (changed(settings.model.global[field], draft.model.global[field])) global[field] = draft.model.global[field] ?? null
  }
  const quarters = {}
  const keys = new Set([...Object.keys(settings.model.quarters), ...Object.keys(draft.model.quarters)])
  for (const key of keys) {
    const before = settings.model.quarters[key] ?? {}
    const after = draft.model.quarters[key] ?? {}
    const fields = MODEL_FIELDS.filter((field) => changed(before[field], after[field]))
    if (fields.length > 0) quarters[key] = Object.fromEntries(fields.map((field) => [field, after[field] ?? null]))
  }
  const model = {
    ...(Object.keys(global).length > 0 ? { global } : {}),
    ...(Object.keys(quarters).length > 0 ? { quarters } : {}),
  }
  if (Object.keys(model).length > 0) patch.model = model
  return patch
}

export const snapshotOf = (nextQuarter) => ({
  quarter: nextQuarter.key,
  eps: nextQuarter.eps,
  revenue: nextQuarter.revenue,
  grossMargin: nextQuarter.assumptions.grossMargin.value,
  opexRatio: nextQuarter.assumptions.opexRatio.value,
})
