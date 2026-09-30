import { getTwQuoteFromTwse } from './twseRwdProvider'
import { getTwQuoteFromTwseAll } from './twseProvider'
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

// Quotes are fetched in parallel, so a burst can trip Finnhub's rate limit;
// back off and retry a couple of times before giving up.
const RATE_LIMIT_MAX_RETRIES = 2
const RATE_LIMIT_BACKOFF_MS = 1_500

const requestFinnhub = async (path, params) => {
  const apiKey = getApiKey()
  const query = new URLSearchParams({ ...params, token: apiKey })
  const url = `${FINNHUB_BASE_URL}${path}?${query.toString()}`

  let response
  for (let attempt = 0; ; attempt += 1) {
    try {
      response = await fetch(url)
    } catch {
      throw new Error('Failed to fetch quote API. Please check network and API key settings.')
    }
    if (response.status !== 429 || attempt >= RATE_LIMIT_MAX_RETRIES) {
      break
    }
    await sleep(RATE_LIMIT_BACKOFF_MS * (attempt + 1))
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

export const getHoldingQuote = async (
  { symbol, market, companyName: knownName },
  { tpexFirst = false } = {},
) => {
  if (market === 'TW') {
    // Caller already knows the symbol isn't TWSE-listed (e.g. from the
    // MI_INDEX batch) → skip the TWSE requests that would only fail.
    if (tpexFirst) {
      try {
        return await getTwQuoteFromTpex(symbol)
      } catch {
        // Fall through to the full chain below.
      }
    }

    let twseError = null
    let twseAllError = null

    try {
      return await getTwQuoteFromTwse(symbol)
    } catch (error) {
      twseError = error
    }

    try {
      return await getTwQuoteFromTwseAll(symbol)
    } catch (error) {
      twseAllError = error
    }

    try {
      return await getTwQuoteFromTpex(symbol)
    } catch (tpexError) {
      const finalMessage = [
        `Taiwan quote fallback failed for ${symbol}.`,
        `TWSE: ${twseError instanceof Error ? twseError.message : String(twseError)}`,
        `TWSE_ALL: ${twseAllError instanceof Error ? twseAllError.message : String(twseAllError)}`,
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

  // A company name never changes, so only look it up (a second Finnhub call)
  // when the holding doesn't have a real one yet.
  const hasKnownName = Boolean(knownName) && knownName !== symbol
  let companyName = hasKnownName ? knownName : symbol
  if (!hasKnownName) {
    try {
      const profile = await requestFinnhub('/stock/profile2', { symbol: finnhubSymbol })
      if (profile?.name) {
        companyName = profile.name
      }
    } catch {
      // Profile name is optional; keep symbol fallback.
    }
  }

  const previousClose = Number(quote?.pc)

  return {
    price,
    name: companyName,
    currency: market === 'TW' ? 'TWD' : 'USD',
    previousClose: Number.isFinite(previousClose) && previousClose > 0
      ? previousClose
      : undefined,
  }
}

export const sleepForRateLimit = sleep
