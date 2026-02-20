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

const extractCompanyName = (title, symbol) => {
  if (!title) {
    return symbol
  }

  const match = title.match(new RegExp(`${symbol}\\s+(.+)\\s+各日成交資訊`))
  return match?.[1]?.trim() || symbol
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

    for (let i = data.data.length - 1; i >= 0; i -= 1) {
      const row = data.data[i]
      const price = parsePrice(row?.[6])
      if (price !== null) {
        return {
          price,
          name: extractCompanyName(data.title, symbol),
          currency: 'TWD',
        }
      }
    }
  }

  throw new Error(`No Taiwan quote found for symbol: ${symbol}`)
}
