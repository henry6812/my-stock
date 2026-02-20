const TWSE_STOCK_DAY_ALL_URL = 'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL'

const parseTwPrice = (value) => {
  if (!value || value === '--') {
    return null
  }

  const price = Number(String(value).replaceAll(',', '').trim())
  return Number.isFinite(price) ? price : null
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

    result[symbol] = { price, name }
  }

  return result
}
