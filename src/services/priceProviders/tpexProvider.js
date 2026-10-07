// 上櫃每日收盤行情. Not tpex_off_market (盤後定價): that one has Close 0.00
// for every stock without an after-hours trade, and no Change column.
const TPEX_DAILY_CLOSE_URL = 'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes'
const TPEX_SNAPSHOT_URL = `${import.meta.env.BASE_URL}data/tpex_daily_close_quotes.json`
const DEFAULT_PROXY_URLS = [
  `https://api.codetabs.com/v1/proxy/?quest=${TPEX_DAILY_CLOSE_URL}`,
  `https://corsproxy.io/?${encodeURIComponent(TPEX_DAILY_CLOSE_URL)}`,
]
const REQUEST_TIMEOUT_MS = 8000
const RETRY_COUNT = 2

const parseNumber = (value) => {
  const text = String(value ?? '').replaceAll(',', '').trim()
  // Number('') is 0, so reject blanks explicitly; '---' (no trade) and
  // '除息'/'除權' fall out as NaN.
  if (!text) {
    return null
  }
  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : null
}

const parsePrice = (value) => {
  const price = parseNumber(value)
  return price !== null && price > 0 ? price : null
}

// Change is signed ('+10.00', '-0.03', '0.00'). On ex-dividend/ex-rights
// days it reads '除息'/'除權' — the change is vs. a reference price, not the
// previous close — so leave previousClose unknown.
const parsePreviousClose = (price, change) => {
  const delta = parseNumber(change)
  if (delta === null) {
    return undefined
  }
  // Round away float noise from the subtraction (24.3 + 0.03 → 24.33).
  return Math.round((price - delta) * 10_000) / 10_000
}

export const getTwQuoteFromTpex = async (symbol) => {
  const customProxyUrl = import.meta.env.VITE_TPEX_PROXY_URL?.trim()
  const urls = [
    // Same-origin snapshot is the most reliable option on GitHub Pages.
    TPEX_SNAPSHOT_URL,
    TPEX_DAILY_CLOSE_URL,
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
    previousClose: parsePreviousClose(price, row.Change),
  }
}
