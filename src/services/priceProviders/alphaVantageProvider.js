const ALPHA_VANTAGE_BASE_URL = 'https://www.alphavantage.co/query'

const sleep = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms)
})

const getApiKey = () => {
  const apiKey = import.meta.env.VITE_ALPHA_VANTAGE_API_KEY?.trim()
  if (!apiKey) {
    throw new Error('Missing VITE_ALPHA_VANTAGE_API_KEY. Add it in .env.local.')
  }
  return apiKey
}

const requestAlphaVantage = async (params, retries = 2) => {
  const apiKey = getApiKey()
  const query = new URLSearchParams({ ...params, apikey: apiKey })
  const response = await fetch(`${ALPHA_VANTAGE_BASE_URL}?${query.toString()}`)

  if (!response.ok) {
    throw new Error(`Alpha Vantage API error: ${response.status}`)
  }

  const data = await response.json()

  if (data.Note) {
    if (retries > 0) {
      await sleep(12_000)
      return requestAlphaVantage(params, retries - 1)
    }
    throw new Error('Alpha Vantage rate limit exceeded. Please try again later.')
  }

  if (data['Error Message']) {
    throw new Error(data['Error Message'])
  }

  return data
}

export const getUsQuote = async (symbol) => {
  const data = await requestAlphaVantage({
    function: 'GLOBAL_QUOTE',
    symbol,
  })

  const quote = data['Global Quote']
  const price = Number(quote?.['05. price'])

  if (!quote || !Number.isFinite(price)) {
    throw new Error(`No quote found for US symbol: ${symbol}`)
  }

  return {
    price,
    name: symbol,
    currency: 'USD',
  }
}

export const getUsdTwdRate = async () => {
  const data = await requestAlphaVantage({
    function: 'CURRENCY_EXCHANGE_RATE',
    from_currency: 'USD',
    to_currency: 'TWD',
  })

  const rateNode = data['Realtime Currency Exchange Rate']
  const rate = Number(rateNode?.['5. Exchange Rate'])
  const fetchedAt = rateNode?.['6. Last Refreshed']

  if (!Number.isFinite(rate) || !fetchedAt) {
    throw new Error('Unable to get USD/TWD exchange rate from Alpha Vantage')
  }

  return {
    rate,
    fetchedAt: new Date(fetchedAt).toISOString(),
  }
}

export const sleepForRateLimit = sleep
