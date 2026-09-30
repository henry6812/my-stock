// One request for the whole TWSE market: MI_INDEX "每日收盤行情(全部)".
// Unlike the openapi STOCK_DAY_ALL (refreshed the next morning), this is
// published the same afternoon, so it matches the per-symbol STOCK_DAY data.
// TPEX (上櫃) symbols are not included.
const TWSE_MI_INDEX_URL = 'https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX'
const LOOKBACK_DAYS = 7
const RETRY_PAUSE_MS = 1_200
const MARKET_TIME_ZONE = 'Asia/Taipei'
const DAY_MS = 24 * 60 * 60 * 1000

const sleep = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms)
})

const parseNumber = (value) => {
  if (value === undefined || value === null || value === '' || value === '--') {
    return null
  }
  const parsed = Number(String(value).replaceAll(',', '').trim())
  return Number.isFinite(parsed) ? parsed : null
}

// YYYYMMDD of `daysAgo` days before now, in the market's time zone.
const formatMarketDate = (daysAgo) => {
  const date = new Date(Date.now() - daysAgo * DAY_MS)
  return new Intl.DateTimeFormat('en-CA', { timeZone: MARKET_TIME_ZONE })
    .format(date)
    .replaceAll('-', '')
}

// "漲跌(+/-)" is HTML such as `<p style= color:red>+</p>`, `<p> </p>` (flat)
// or `<p>X</p>` (ex-rights/dividend: the change is vs. a reference price).
const parseChangeSign = (html) => {
  const text = String(html ?? '').replace(/<[^>]*>/g, '').trim()
  if (text === '+') return 1
  if (text === '-') return -1
  if (text === '') return 0
  return null
}

const parseDailyTable = (table) => {
  const fields = table.fields
  const col = (name) => fields.indexOf(name)
  const codeIdx = col('證券代號')
  const nameIdx = col('證券名稱')
  const closeIdx = col('收盤價')
  const signIdx = col('漲跌(+/-)')
  const changeIdx = col('漲跌價差')

  const quotes = {}
  const listedSymbols = new Set()
  for (const row of table.data ?? []) {
    const symbol = String(row[codeIdx] ?? '').trim()
    if (!symbol) continue
    listedSymbols.add(symbol)

    const price = parseNumber(row[closeIdx])
    if (price === null || price <= 0) continue

    const sign = parseChangeSign(row[signIdx])
    const change = parseNumber(row[changeIdx])
    // Round away float noise from the subtraction (56.95 - 0.4 → 56.55).
    const previousClose =
      sign === null || change === null
        ? undefined
        : Math.round((price - sign * change) * 10_000) / 10_000

    quotes[symbol] = {
      price,
      name: String(row[nameIdx] ?? '').trim() || symbol,
      currency: 'TWD',
      previousClose,
    }
  }
  return { quotes, listedSymbols }
}

const findDailyTable = (data) => (
  (data?.tables ?? []).find((table) => (
    Array.isArray(table?.fields) &&
    table.fields.includes('證券代號') &&
    table.fields.includes('收盤價')
  ))
)

// Latest trading day's closes for every TWSE-listed symbol. Walks back day by
// day (weekends/holidays, or today before the data is published).
export const getTwseDailyQuotes = async () => {
  for (let daysAgo = 0; daysAgo < LOOKBACK_DAYS; daysAgo += 1) {
    if (daysAgo > 0) {
      await sleep(RETRY_PAUSE_MS)
    }
    const query = new URLSearchParams({
      response: 'json',
      type: 'ALLBUT0999',
      date: formatMarketDate(daysAgo),
    })
    const response = await fetch(`${TWSE_MI_INDEX_URL}?${query.toString()}`)
    if (!response.ok) {
      throw new Error(`TWSE MI_INDEX API error: ${response.status}`)
    }

    const data = await response.json()
    const table = findDailyTable(data)
    if (!table) {
      continue
    }
    return { date: data.date, ...parseDailyTable(table) }
  }

  throw new Error(`TWSE MI_INDEX: no trading data in the last ${LOOKBACK_DAYS} days`)
}
