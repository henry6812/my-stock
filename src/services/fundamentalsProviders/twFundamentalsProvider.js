// Reads public/data/tw/{code}.json, split from data/twse/ at build time
// (scripts/split-tw-fundamentals.mjs).
const MONTH_POINTS = 60

const cache = new Map()

const companyUrl = (symbol) => `${import.meta.env.BASE_URL}data/tw/${encodeURIComponent(symbol)}.json`

// GitHub Pages answers a missing file with 404; the Vite dev server answers
// with index.html, so anything that is not JSON also means "no file".
const fetchCompany = async (symbol) => {
  const response = await fetch(companyUrl(symbol))
  const isJson = (response.headers.get('content-type') ?? '').includes('json')
  if (response.status === 404 || (response.ok && !isJson)) return null
  if (!response.ok) throw new Error(`無法載入台股財報資料（HTTP ${response.status}）`)
  return response.json()
}

const loadCompany = (symbol) => {
  if (!cache.has(symbol)) {
    cache.set(
      symbol,
      fetchCompany(symbol).catch((error) => {
        cache.delete(symbol)
        throw error
      }),
    )
  }
  return cache.get(symbol)
}

export const resetTwFundamentalsCache = () => {
  cache.clear()
}

// null = the code has no file (上櫃, newly listed, ETF …).
export const getTwFundamentals = async (symbol) => {
  const file = await loadCompany(symbol)
  if (!file) return null
  const monthly = (file.monthly ?? [])
    .slice(0, MONTH_POINTS)
    .map(([month, pe, close]) => ({ month, pe: pe ?? null, close: close ?? null }))
    .reverse()
  return {
    name: file.name,
    statement: file.statement ?? null,
    cumulative: file.quarters ?? {},
    monthlyRevenue: file.monthlyRevenue ?? {},
    monthly,
    peSeries: monthly.map(({ month, pe }) => ({ label: month, pe })),
    updatedAt: file.updatedAt ?? null,
  }
}
