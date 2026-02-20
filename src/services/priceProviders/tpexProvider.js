const TPEX_OFF_MARKET_URL = 'https://www.tpex.org.tw/openapi/v1/tpex_off_market'
const TPEX_SNAPSHOT_URL = `${import.meta.env.BASE_URL}data/tpex_off_market.json`
const DEFAULT_PROXY_URLS = [
  `https://api.codetabs.com/v1/proxy/?quest=${TPEX_OFF_MARKET_URL}`,
  `https://corsproxy.io/?${encodeURIComponent(TPEX_OFF_MARKET_URL)}`,
]
const REQUEST_TIMEOUT_MS = 8000
const RETRY_COUNT = 2

const parsePrice = (value) => {
  if (!value || value === '--') {
    return null
  }

  const price = Number(String(value).replaceAll(',', '').trim())
  if (!Number.isFinite(price) || price <= 0) {
    return null
  }

  return price
}

export const getTwQuoteFromTpex = async (symbol) => {
  const customProxyUrl = import.meta.env.VITE_TPEX_PROXY_URL?.trim()
  const urls = [
    // Same-origin snapshot is the most reliable option on GitHub Pages.
    TPEX_SNAPSHOT_URL,
    TPEX_OFF_MARKET_URL,
    ...(customProxyUrl ? [customProxyUrl] : []),
    ...DEFAULT_PROXY_URLS,
  ]

  let data = null
  let lastError = null

  for (const url of urls) {
    for (let attempt = 1; attempt <= RETRY_COUNT; attempt += 1) {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

      try {
        const response = await fetch(url, { signal: controller.signal })
        if (!response.ok) {
          lastError = new Error(`TPEX API error: ${response.status}`)
          // Retry transient server failures; skip to next URL otherwise.
          if (response.status >= 500 && attempt < RETRY_COUNT) {
            continue
          }
          break
        }

        const json = await response.json()
        if (!Array.isArray(json)) {
          lastError = new Error('No TPEX quote found for symbol: invalid data format')
          break
        }

        data = json
        break
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (message.includes('aborted')) {
          lastError = new Error(`TPEX API timeout after ${REQUEST_TIMEOUT_MS}ms`)
        } else {
          lastError = error instanceof Error ? error : new Error(message)
        }
        if (attempt < RETRY_COUNT) {
          continue
        }
      } finally {
        clearTimeout(timeoutId)
      }
    }

    if (data) {
      break
    }
  }

  if (!data) {
    throw new Error(
      `Failed to fetch TPEX API (possible CORS/network issue). ${lastError ? `Last error: ${lastError.message}` : ''}`.trim(),
    )
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
    name: row.CompanyName?.trim() || symbol,
    currency: 'TWD',
  }
}
