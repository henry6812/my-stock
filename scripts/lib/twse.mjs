import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import {
  monthDaysDescending,
  parseBwibbuRows,
  parseCompanyProfileRows,
  parseMopsRevenueRows,
} from '../../src/utils/twFundamentalsMerge.js'

export const EPS_PATH = 'data/twse/eps_history.json'
export const PE_PATH = 'data/twse/pe_history.json'
export const REVENUE_PATH = 'data/twse/monthly_revenue.json'
export const PROFILE_PATH = 'data/twse/company_profile.json'
export const TWSE_DELAY_MS = 1_200
export const MOPS_DELAY_MS = 3_000

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export const readJson = async (path, fallback) => {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return fallback
  }
}

export const writeJson = async (path, data) => {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(data)}\n`)
}

const HEADERS = { 'User-Agent': 'Mozilla/5.0 (my-stock snapshot bot)' }

export const fetchJson = async (url, init = {}) => {
  const response = await fetch(url, { ...init, headers: { ...HEADERS, ...init.headers } })
  if (!response.ok) throw new Error(`${url} → HTTP ${response.status}`)
  return response.json()
}

// Walks back from the month's last day until TWSE returns a trading day.
// 15 days covers the longest holiday (Lunar New Year).
export const fetchBwibbuMonth = async (month) => {
  for (const day of monthDaysDescending(month).slice(0, 15)) {
    const json = await fetchJson(
      `https://www.twse.com.tw/rwd/zh/afterTrading/BWIBBU_d?date=${day}&selectType=ALL&response=json`,
    )
    const rows = parseBwibbuRows(json)
    await sleep(TWSE_DELAY_MS)
    if (rows?.length) return rows
  }
  return null
}

// MOPS monthly revenue summary for 上市: _0 = domestic, _1 = foreign (KY)
// companies. An unpublished month is a short page with no rows.
export const fetchMopsRevenueMonth = async (month) => {
  const [year, monthNumber] = month.split('-').map(Number)
  const rows = []
  for (const suffix of ['0', '1']) {
    const url = `https://mopsov.twse.com.tw/nas/t21/sii/t21sc03_${year - 1911}_${monthNumber}_${suffix}.html`
    try {
      const response = await fetch(url, { headers: HEADERS })
      if (response.ok) {
        const html = new TextDecoder('big5').decode(await response.arrayBuffer())
        rows.push(...parseMopsRevenueRows(html))
      } else if (response.status !== 404) {
        throw new Error(`${url} → HTTP ${response.status}`)
      }
    } finally {
      // Also after a failure: the caller may go on to the next month.
      await sleep(MOPS_DELAY_MS)
    }
  }
  return rows
}

// 產業別 and issued shares for the screener: a snapshot, rewritten whole.
// A failure keeps the old file so the day's other updates still commit.
export const updateCompanyProfile = async () => {
  try {
    const companies = parseCompanyProfileRows(await fetchJson('https://openapi.twse.com.tw/v1/opendata/t187ap03_L'))
    if (Object.keys(companies).length === 0) throw new Error('t187ap03_L returned no rows')
    const previous = await readJson(PROFILE_PATH, null)
    if (JSON.stringify(previous?.companies) === JSON.stringify(companies)) {
      console.log('Profile: unchanged')
      return
    }
    await writeJson(PROFILE_PATH, { updatedAt: new Date().toISOString(), companies })
    console.log(`Profile: ${Object.keys(companies).length} companies`)
  } catch (error) {
    console.warn(`::warning::Company profile update failed: ${error.message}`)
  }
}
