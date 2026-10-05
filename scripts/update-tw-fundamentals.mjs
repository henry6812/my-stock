// Daily: merge the latest quarter from TWSE openapi into tw_eps_history.json
// and, once a month, add last month's month-end P/E to tw_pe_history.json.
// Files are only rewritten when something changed, so the workflow commits
// only real updates.
import {
  hasPeMonth,
  mergeEpsRows,
  mergePeMonth,
  normalizeIncomeRow,
  previousMonth,
} from '../src/utils/twFundamentalsMerge.js'
import { EPS_PATH, PE_PATH, TWSE_DELAY_MS, fetchBwibbuMonth, fetchJson, readJson, sleep, writeJson } from './lib/twse.mjs'

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
