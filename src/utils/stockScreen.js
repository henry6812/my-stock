// 低估篩選. Build time (scripts/split-tw-fundamentals.mjs): one row of raw
// valuation inputs per listed company → public/data/tw/screen.json. In the
// app: live prices, thresholds and the user's valuation overrides turn the
// rows into the 低估候選 list. Pure functions; see
// docs/superpowers/specs/2026-10-15-stock-screener-design.md.
// Imported by Node scripts too, so relative imports carry .js.
import { toSingleStatements } from './incomeModel.js'
import {
  buildValuationModel,
  computeTtm,
  cumulativeToSingles,
  peBandsFromHistory,
  quarterIndex,
  TW_BASES,
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
