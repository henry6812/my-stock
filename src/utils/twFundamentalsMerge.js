// Pure helpers for the TW fundamentals snapshot pipeline
// (scripts/update-tw-fundamentals.mjs, scripts/backfill-tw-fundamentals.mjs).
// Kept under src/ so Vitest covers them; no browser- or Node-only imports.

export const rocToYear = (roc) => Number(roc) + 1911

export const parseTwNumber = (value) => {
  if (value === null || value === undefined) return null
  const text = String(value).replaceAll(',', '').trim()
  if (text === '' || text === '-' || text === '--') return null
  const number = Number(text)
  return Number.isFinite(number) ? number : null
}

export const quarterKey = (year, quarter) => `${year}Q${quarter}`

const quarterIndexOfKey = (key) => {
  const [year, quarter] = key.split('Q').map(Number)
  return year * 4 + (quarter - 1)
}

const keyOfQuarterIndex = (index) => quarterKey(Math.floor(index / 4), (index % 4) + 1)

// Field names differ per industry file (一般業 / 金控 / 證券 …); the first
// one present wins.
const REVENUE_FIELDS = ['營業收入', '淨收益', '收益', '利息淨收益']
const OPERATING_INCOME_FIELDS = ['營業利益（損失）', '營業利益']
const NET_INCOME_FIELDS = ['本期淨利（淨損）', '本期稅後淨利（淨損）']
// Insurers moved to IFRS 17 in 2026; their MOPS layout drops the （元）.
const EPS_FIELDS = ['基本每股盈餘（元）', '基本每股盈餘']

const pickNumber = (row, names) => {
  for (const name of names) {
    if (row[name] !== undefined) return parseTwNumber(row[name])
  }
  return null
}

// One income-statement row (TWSE openapi t187ap06_L_* or a MOPS t163sb04
// table row) → our record. MOPS rows carry no 年度 / 季別, so the caller
// passes the period it queried.
export const normalizeIncomeRow = (row, period = {}) => {
  const code = String(row['公司代號'] ?? '').trim()
  const year = period.year ?? (row['年度'] ? rocToYear(row['年度']) : null)
  const quarter = period.quarter ?? (row['季別'] ? Number(row['季別']) : null)
  const eps = pickNumber(row, EPS_FIELDS)
  if (!code || !year || !(quarter >= 1 && quarter <= 4) || eps === null) return null
  return {
    code,
    name: String(row['公司名稱'] ?? '').trim(),
    year,
    quarter,
    eps,
    revenue: pickNumber(row, REVENUE_FIELDS),
    operatingIncome: pickNumber(row, OPERATING_INCOME_FIELDS),
    netIncome: pickNumber(row, NET_INCOME_FIELDS),
  }
}

const VALUE_FIELDS = ['eps', 'revenue', 'operatingIncome', 'netIncome']

const sameValues = (a, b) => Boolean(a && b) && VALUE_FIELDS.every((field) => a[field] === b[field])

// Values are year-to-date as published; a later row for the same company and
// quarter replaces the earlier one (restatements).
export const mergeEpsRows = (history, rows) => {
  const companies = { ...(history?.companies ?? {}) }
  let changed = false
  for (const row of rows) {
    const previous = companies[row.code] ?? { name: row.name, quarters: {} }
    const key = quarterKey(row.year, row.quarter)
    const value = Object.fromEntries(VALUE_FIELDS.map((field) => [field, row[field]]))
    const name = row.name || previous.name
    if (sameValues(previous.quarters[key], value) && name === previous.name) continue
    companies[row.code] = { name, quarters: { ...previous.quarters, [key]: value } }
    changed = true
  }
  return {
    history: { basis: 'cumulative', updatedAt: history?.updatedAt ?? null, companies },
    changed,
  }
}

// A company whose latest quarter is present but whose previous quarter is
// missing, while it has older data, means a daily run missed a filing.
// Semi-annual filers (創新板) only ever report Q2 / Q4, so a company with no
// Q1 / Q3 at all is treated as one and its missing Q1 / Q3 is not a gap.
export const findRecentGaps = (history) => {
  const gaps = []
  for (const [code, company] of Object.entries(history?.companies ?? {})) {
    const indexes = Object.keys(company.quarters ?? {}).map(quarterIndexOfKey).sort((a, b) => a - b)
    if (indexes.length < 2) continue
    const latest = indexes.at(-1)
    const previous = latest - 1
    const semiAnnual = indexes.every((index) => index % 2 === 1)
    if (!indexes.includes(previous) && indexes[0] < previous && !semiAnnual) {
      gaps.push({ code, missing: keyOfQuarterIndex(previous) })
    }
  }
  return gaps
}

// TWSE rwd BWIBBU_d (selectType=ALL). Non-trading days come back with a
// non-OK stat; "-" means no P/E (loss-making).
export const parseBwibbuRows = (json) => {
  if (json?.stat !== 'OK' || !Array.isArray(json.fields) || !Array.isArray(json.data)) return null
  const codeIndex = json.fields.indexOf('證券代號')
  const peIndex = json.fields.indexOf('本益比')
  if (codeIndex < 0 || peIndex < 0) return null
  return json.data.map((row) => {
    const pe = parseTwNumber(row[peIndex])
    return { code: String(row[codeIndex]).trim(), pe: pe !== null && pe > 0 ? pe : null }
  })
}

export const mergePeMonth = (history, month, rows) => {
  const companies = { ...(history?.companies ?? {}) }
  for (const { code, pe } of rows) {
    const series = (companies[code] ?? []).filter(([existing]) => existing !== month)
    series.push([month, pe])
    series.sort((a, b) => (a[0] < b[0] ? 1 : -1))
    companies[code] = series
  }
  return { updatedAt: history?.updatedAt ?? null, companies }
}

export const hasPeMonth = (history, month) =>
  Object.values(history?.companies ?? {}).some((series) => series.some(([existing]) => existing === month))

const pad2 = (value) => String(value).padStart(2, '0')

export const previousMonth = (date) => {
  const first = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1))
  return `${first.getUTCFullYear()}-${pad2(first.getUTCMonth() + 1)}`
}

export const monthDaysDescending = (month) => {
  const [year, monthNumber] = month.split('-').map(Number)
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  return Array.from({ length: lastDay }, (_, index) => `${year}${pad2(monthNumber)}${pad2(lastDay - index)}`)
}

const stripTags = (html) =>
  html.replace(/<[^>]+>/g, '').replaceAll('&nbsp;', ' ').replace(/\s+/g, ' ').trim()

const rowCells = (tr) => [...tr.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((match) => stripTags(match[1]))

// MOPS t163sb04 renders one <table class='hasBorder'> per industry layout;
// the first row of each is its header.
export const parseMopsIncomeTables = (html) => {
  const rows = []
  for (const table of html.match(/<table class=.hasBorder[\s\S]*?<\/table>/g) ?? []) {
    const trs = table.match(/<tr[\s\S]*?<\/tr>/g) ?? []
    if (trs.length < 2) continue
    const header = rowCells(trs[0])
    for (const tr of trs.slice(1)) {
      const values = rowCells(tr)
      if (values.length !== header.length) continue
      rows.push(Object.fromEntries(header.map((name, index) => [name, values[index]])))
    }
  }
  return rows
}
