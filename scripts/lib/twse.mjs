import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { monthDaysDescending, parseBwibbuRows } from '../../src/utils/twFundamentalsMerge.js'

export const EPS_PATH = 'public/data/tw_eps_history.json'
export const PE_PATH = 'public/data/tw_pe_history.json'
export const TWSE_DELAY_MS = 1_200

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
