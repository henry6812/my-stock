// One-off (re-runnable) backfill: 13 quarters of year-to-date EPS from MOPS
// and 60 month-end P/E snapshots from TWSE. Writes after every period so an
// interrupted run keeps its progress; already-stored months are skipped.
import {
  hasPeMonth,
  mergeEpsRows,
  mergePeMonth,
  normalizeIncomeRow,
  parseMopsIncomeTables,
  previousMonth,
} from '../src/utils/twFundamentalsMerge.js'
import { EPS_PATH, PE_PATH, fetchBwibbuMonth, readJson, sleep, writeJson } from './lib/twse.mjs'

const MOPS_URL = 'https://mopsov.twse.com.tw/mops/web/ajax_t163sb04'
const MOPS_DELAY_MS = 3_000
const EPS_QUARTERS = 13
const PE_MONTHS = 60

const fetchMopsSeason = async (year, quarter) => {
  const body = new URLSearchParams({
    encodeURIComponent: '1',
    step: '1',
    firstin: '1',
    off: '1',
    isQuery: 'Y',
    TYPEK: 'sii',
    year: String(year - 1911),
    season: String(quarter).padStart(2, '0'),
  })
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(MOPS_URL, {
      method: 'POST',
      body,
      headers: { 'User-Agent': 'Mozilla/5.0', 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    // MOPS answers 502 / 503 now and then; the same query succeeds on retry.
    if (response.status >= 500) {
      await sleep(10_000)
      continue
    }
    if (!response.ok) throw new Error(`MOPS ${year}Q${quarter} → HTTP ${response.status}`)
    const html = await response.text()
    const rows = parseMopsIncomeTables(html).map((row) => normalizeIncomeRow(row, { year, quarter })).filter(Boolean)
    if (rows.length > 0 || !html.includes('頻繁')) return rows
    // "查詢過於頻繁": back off and retry.
    await sleep(10_000)
  }
  throw new Error(`MOPS ${year}Q${quarter}: rate limited`)
}

const now = new Date()
const currentIndex = now.getUTCFullYear() * 4 + Math.floor(now.getUTCMonth() / 3)

let epsHistory = await readJson(EPS_PATH, { basis: 'cumulative', updatedAt: null, companies: {} })
for (let offset = EPS_QUARTERS; offset >= 1; offset -= 1) {
  const index = currentIndex - offset
  const year = Math.floor(index / 4)
  const quarter = (index % 4) + 1
  const rows = await fetchMopsSeason(year, quarter)
  if (rows.length === 0) {
    console.log(`EPS ${year}Q${quarter}: no data (not filed yet)`)
  } else {
    const { history, changed } = mergeEpsRows(epsHistory, rows)
    epsHistory = changed ? { ...history, updatedAt: new Date().toISOString() } : history
    await writeJson(EPS_PATH, epsHistory)
    console.log(`EPS ${year}Q${quarter}: ${rows.length} rows`)
  }
  await sleep(MOPS_DELAY_MS)
}

let peHistory = await readJson(PE_PATH, { updatedAt: null, companies: {} })
let monthDate = now
for (let count = 0; count < PE_MONTHS; count += 1) {
  const month = previousMonth(monthDate)
  monthDate = new Date(`${month}-15T00:00:00Z`)
  if (hasPeMonth(peHistory, month)) continue
  const rows = await fetchBwibbuMonth(month)
  if (!rows) {
    console.log(`P/E ${month}: no data`)
    continue
  }
  peHistory = { ...mergePeMonth(peHistory, month, rows), updatedAt: new Date().toISOString() }
  await writeJson(PE_PATH, peHistory)
  console.log(`P/E ${month}: ${rows.length} rows`)
}
