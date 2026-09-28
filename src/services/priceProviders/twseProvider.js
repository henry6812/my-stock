const TWSE_STOCK_DAY_ALL_URL = 'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL'

const parseTwPrice = (value) => {
  if (!value || value === '--') {
    return null
  }

  const price = Number(String(value).replaceAll(',', '').trim())
  return Number.isFinite(price) ? price : null
}

// "漲跌價差" (Change) can legitimately be 0 or negative, so parse it separately.
const parseTwChange = (value) => {
  if (value === undefined || value === null || value === '' || value === '--') {
    return null
  }
  const change = Number(String(value).replaceAll(',', '').trim())
  return Number.isFinite(change) ? change : null
}

export const getTwClosePrices = async () => {
  const response = await fetch(TWSE_STOCK_DAY_ALL_URL)
  if (!response.ok) {
    throw new Error(`TWSE API error: ${response.status}`)
  }

  const data = await response.json()
  const result = {}

  for (const row of data) {
    const symbol = row.Code?.trim()
    const name = row.Name?.trim()
    const price = parseTwPrice(row.ClosingPrice)

    if (!symbol || !name || price === null) {
      continue
    }

    const change = parseTwChange(row.Change)
    const previousClose =
      change === null ? undefined : price - change

    result[symbol] = { price, name, previousClose }
  }

  return result
}

export const getTwQuoteFromTwseAll = async (symbol) => {
  const normalizedSymbol = String(symbol ?? '').trim().toUpperCase()
  if (!normalizedSymbol) {
    throw new Error('No Taiwan quote found for symbol: invalid symbol')
  }

  const closePrices = await getTwClosePrices()
  const hit = closePrices[normalizedSymbol]
  if (!hit) {
    throw new Error(`No Taiwan quote found for symbol: ${normalizedSymbol}`)
  }

  return {
    price: hit.price,
    name: hit.name || normalizedSymbol,
    currency: 'TWD',
    previousClose: hit.previousClose,
  }
}
