const TWSE_STOCK_DAY_URL = 'https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY'

const parsePrice = (value) => {
  if (!value || value === '--') {
    return null
  }

  const price = Number(String(value).replaceAll(',', '').trim())
  return Number.isFinite(price) ? price : null
}

const formatDateParam = (date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${year}${month}01`
}

const COMPANY_NAME_SUFFIX = '各日成交資訊'

const extractCompanyName = (title, symbol) => {
  if (!title) {
    return symbol
  }

  // Preferred: the documented "<symbol> <name> 各日成交資訊" title shape.
  const anchored = title.match(new RegExp(`${symbol}\\s+(.+)\\s+${COMPANY_NAME_SUFFIX}`))
  if (anchored?.[1]) {
    return anchored[1].trim()
  }

  // Fallback: take whatever follows the symbol and drop a trailing "…資訊"
  // token, so a reworded TWSE suffix still yields a name instead of the symbol.
  const afterSymbol = title.match(new RegExp(`${symbol}\\s+(.+)`))
  const name = afterSymbol?.[1]?.replace(/\s*\S*資訊\s*$/, '').trim()
  return name || symbol
}

export const getTwQuoteFromTwse = async (symbol) => {
  for (let monthOffset = 0; monthOffset < 3; monthOffset += 1) {
    const date = new Date()
    date.setMonth(date.getMonth() - monthOffset)
    const query = new URLSearchParams({
      response: 'json',
      date: formatDateParam(date),
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

    // Walk from the most recent day: first valid close is the current price,
    // the next valid close is the previous trading day's close (the baseline
    // for daily change).
    let latest = null
    let previous = null
    for (let i = data.data.length - 1; i >= 0; i -= 1) {
      const price = parsePrice(data.data[i]?.[6])
      if (price === null) {
        continue
      }
      if (latest === null) {
        latest = price
        continue
      }
      previous = price
      break
    }
    if (latest !== null) {
      return {
        price: latest,
        name: extractCompanyName(data.title, symbol),
        currency: 'TWD',
        previousClose: previous ?? undefined,
      }
    }
  }

  throw new Error(`No Taiwan quote found for symbol: ${symbol}`)
}
