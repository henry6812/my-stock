const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1'
const TWSE_STOCK_DAY_URL = 'https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY'
const TPEX_OFF_MARKET_URL = 'https://www.tpex.org.tw/openapi/v1/tpex_off_market'
const FX_URL = 'https://open.er-api.com/v6/latest/USD'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const getFinnhubApiKey = () => {
  const value = process.env.FINNHUB_API_KEY?.trim()
  if (!value) {
    throw new Error('Missing FINNHUB_API_KEY in Functions environment')
  }
  return value
}

const requestFinnhub = async (path, params) => {
  const query = new URLSearchParams({
    ...params,
    token: getFinnhubApiKey(),
  })

  const response = await fetch(`${FINNHUB_BASE_URL}${path}?${query.toString()}`)
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Finnhub API error: 401 (invalid API key)')
    }
    if (response.status === 403) {
      throw new Error('Finnhub API error: 403 (plan does not include this symbol/resource)')
    }
    throw new Error(`Finnhub API error: ${response.status}`)
  }

  const data = await response.json()
  if (data?.error) {
    throw new Error(data.error)
  }

  return data
}

const parsePrice = (value) => {
  if (!value || value === '--') {
    return null
  }
  const parsed = Number(String(value).replaceAll(',', '').trim())
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null
  }
  return parsed
}

const formatTwseMonth = (date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${year}${month}01`
}

const getTwFromTwse = async (symbol) => {
  for (let monthOffset = 0; monthOffset < 3; monthOffset += 1) {
    const date = new Date()
    date.setMonth(date.getMonth() - monthOffset)

    const query = new URLSearchParams({
      response: 'json',
      date: formatTwseMonth(date),
      stockNo: symbol,
    })

    const response = await fetch(`${TWSE_STOCK_DAY_URL}?${query.toString()}`)
    if (!response.ok) {
      throw new Error(`TWSE API error: ${response.status}`)
    }

    const data = await response.json()
    if (!Array.isArray(data?.data) || data.data.length === 0) {
      continue
    }

    for (let i = data.data.length - 1; i >= 0; i -= 1) {
      const price = parsePrice(data.data[i]?.[6])
      if (price !== null) {
        return {
          price,
          currency: 'TWD',
        }
      }
    }
  }

  throw new Error(`No Taiwan quote found for symbol: ${symbol}`)
}

const getTwFromTpex = async (symbol) => {
  const response = await fetch(TPEX_OFF_MARKET_URL)
  if (!response.ok) {
    throw new Error(`TPEX API error: ${response.status}`)
  }

  const data = await response.json()
  if (!Array.isArray(data)) {
    throw new Error('Invalid TPEX response data')
  }

  const row = data.find((item) => item?.SecuritiesCompanyCode?.trim() === symbol)
  if (!row) {
    throw new Error(`No TPEX quote found for symbol: ${symbol}`)
  }

  const price = parsePrice(row.Close)
  if (price === null) {
    throw new Error(`No TPEX quote found for symbol: ${symbol}`)
  }

  return {
    price,
    currency: 'TWD',
  }
}

export const getUsdTwdRate = async () => {
  const response = await fetch(FX_URL)
  if (!response.ok) {
    throw new Error(`FX API error: ${response.status}`)
  }

  const data = await response.json()
  const rate = Number(data?.rates?.TWD)
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error('Unable to get USD/TWD rate from FX API')
  }

  return {
    rate,
    fetchedAt: new Date().toISOString(),
  }
}

export const getUsQuote = async (symbol) => {
  const quote = await requestFinnhub('/quote', { symbol })
  const price = Number(quote?.c)
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(`No US quote found for symbol: ${symbol}`)
  }

  return {
    price,
    currency: 'USD',
  }
}

export const getTwQuote = async (symbol) => {
  let finnhubError = null
  let twseError = null

  try {
    const quote = await requestFinnhub('/quote', { symbol: `${symbol}.TW` })
    const price = Number(quote?.c)
    if (Number.isFinite(price) && price > 0) {
      return {
        price,
        currency: 'TWD',
      }
    }
    finnhubError = new Error(`No TW quote found for symbol: ${symbol}.TW`)
  } catch (error) {
    finnhubError = error instanceof Error ? error : new Error(String(error))
  }

  try {
    return await getTwFromTwse(symbol)
  } catch (error) {
    twseError = error instanceof Error ? error : new Error(String(error))
  }

  try {
    return await getTwFromTpex(symbol)
  } catch (error) {
    const tpexError = error instanceof Error ? error : new Error(String(error))
    throw new Error(
      `TW quote fallback failed for ${symbol}. Finnhub: ${finnhubError?.message || ''} TWSE: ${twseError?.message || ''} TPEX: ${tpexError.message}`,
    )
  }
}

export const sleepForRateLimit = sleep
