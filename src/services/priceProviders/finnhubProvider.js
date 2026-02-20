import { getTwQuoteFromTwse } from './twseRwdProvider'
import { getTwQuoteFromTpex } from './tpexProvider'
const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1'

const sleep = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms)
})

const getApiKey = () => {
  const apiKey = import.meta.env.VITE_FINNHUB_API_KEY?.trim()
  if (!apiKey) {
    throw new Error('Missing VITE_FINNHUB_API_KEY. Add it in .env.local.')
  }
  return apiKey
}

const requestFinnhub = async (path, params) => {
  const apiKey = getApiKey()
  const query = new URLSearchParams({ ...params, token: apiKey })
  const url = `${FINNHUB_BASE_URL}${path}?${query.toString()}`

  let response
  try {
    response = await fetch(url)
  } catch (error) {
    throw new Error('Failed to fetch quote API. Please check network and API key settings.')
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Finnhub API error: 401 (invalid API key). Please check VITE_FINNHUB_API_KEY in .env.local and restart dev server.')
    }
    if (response.status === 403) {
      throw new Error('Finnhub API error: 403 (plan does not include this symbol/resource).')
    }
    throw new Error(`Finnhub API error: ${response.status}`)
  }

  const data = await response.json()
  if (data.error) {
    throw new Error(data.error)
  }

  return data
}

const toFinnhubSymbol = (symbol, market) => {
  if (market === 'TW') {
    return `${symbol}.TW`
  }
  return symbol
}

export const getHoldingQuote = async ({ symbol, market }) => {
  if (market === 'TW') {
    let finnhubError = null
    let twseError = null

    try {
      const finnhubSymbol = toFinnhubSymbol(symbol, market)
      const quote = await requestFinnhub('/quote', { symbol: finnhubSymbol })
      const price = Number(quote?.c)
      if (Number.isFinite(price) && price > 0) {
        return {
          price,
          name: symbol,
          currency: 'TWD',
        }
      }
      finnhubError = new Error(`No quote found for symbol: ${finnhubSymbol}`)
    } catch (error) {
      finnhubError = error
    }

    try {
      return await getTwQuoteFromTwse(symbol)
    } catch (error) {
      twseError = error
    }

    try {
      return await getTwQuoteFromTpex(symbol)
    } catch (tpexError) {
      const finalMessage = [
        `Taiwan quote fallback failed for ${symbol}.`,
        `Finnhub: ${finnhubError instanceof Error ? finnhubError.message : String(finnhubError)}`,
        `TWSE: ${twseError instanceof Error ? twseError.message : String(twseError)}`,
        `TPEX: ${tpexError instanceof Error ? tpexError.message : String(tpexError)}`,
      ].join(' ')
      throw new Error(finalMessage)
    }
  }

  const finnhubSymbol = toFinnhubSymbol(symbol, market)
  const quote = await requestFinnhub('/quote', { symbol: finnhubSymbol })
  const price = Number(quote?.c)

  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(`No quote found for symbol: ${finnhubSymbol}`)
  }

  let companyName = symbol
  try {
    const profile = await requestFinnhub('/stock/profile2', { symbol: finnhubSymbol })
    if (profile?.name) {
      companyName = profile.name
    }
  } catch {
    // Profile name is optional; keep symbol fallback.
  }

  return {
    price,
    name: companyName,
    currency: market === 'TW' ? 'TWD' : 'USD',
  }
}

export const sleepForRateLimit = sleep
