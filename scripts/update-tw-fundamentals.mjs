// Daily: merge EPS / income statements, last month's month-end P/E and close,
// and the latest two months of monthly revenue into data/twse/*.json.
// Files are only rewritten when something changed, so the workflow commits
// only real updates.
import {
  hasPeMonth,
  mergeEpsRows,
  mergePeMonth,
  mergeRevenueMonths,
  monthsBack,
  normalizeIncomeRow,
  previousMonth,
} from '../src/utils/twFundamentalsMerge.js'
import {
  EPS_PATH,
  PE_PATH,
  REVENUE_PATH,
  TWSE_DELAY_MS,
  fetchBwibbuMonth,
  fetchJson,
  fetchMopsRevenueMonth,
  readJson,
  sleep,
  writeJson,
} from './lib/twse.mjs'

const INDUSTRIES = ['ci', 'basi', 'bd', 'fh', 'ins', 'mim']

const rows = []
for (const industry of INDUSTRIES) {
  const data = await fetchJson(`https://openapi.twse.com.tw/v1/opendata/t187ap06_L_${industry}`)
  rows.push(...data.map((row) => normalizeIncomeRow(row)).filter(Boolean))
  await sleep(TWSE_DELAY_MS)
}
if (rows.length === 0) throw new Error('TWSE openapi returned no income-statement rows')

const epsHistory = await readJson(EPS_PATH, { basis: 'cumulative', updatedAt: null, companies: {} })
const { history, changed } = mergeEpsRows(epsHistory, rows)
if (changed) {
  await writeJson(EPS_PATH, { ...history, updatedAt: new Date().toISOString() })
}
console.log(`EPS: ${rows.length} rows read, ${changed ? 'updated' : 'unchanged'}`)

const month = previousMonth(new Date())
const peHistory = await readJson(PE_PATH, { updatedAt: null, companies: {} })
if (hasPeMonth(peHistory, month)) {
  console.log(`P/E: ${month} already stored`)
} else {
  const peRows = await fetchBwibbuMonth(month)
  if (!peRows) throw new Error(`No TWSE P/E data found for ${month}`)
  await writeJson(PE_PATH, { ...mergePeMonth(peHistory, month, peRows), updatedAt: new Date().toISOString() })
  console.log(`P/E: stored ${peRows.length} rows for ${month}`)
}

// Companies publish last month's revenue by the 10th, a few each day, so
// the latest two months are re-read daily and merged. A MOPS failure only
// skips that month: the EPS / P/E updates above must still be committed.
const revenueHistory = await readJson(REVENUE_PATH, { updatedAt: null, companies: {} })
const { history: nextRevenue, changed: revenueChanged } = await mergeRevenueMonths(
  revenueHistory,
  monthsBack(previousMonth(new Date()), 2),
  { fetchMonth: fetchMopsRevenueMonth, warn: (message) => console.warn(`::warning::${message}`), log: console.log },
)
if (revenueChanged) {
  await writeJson(REVENUE_PATH, { ...nextRevenue, updatedAt: new Date().toISOString() })
}
