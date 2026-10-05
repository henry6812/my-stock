import { requestFinnhub } from '../priceProviders/finnhubProvider'

const CACHE_PREFIX = 'my-stock:fundamentals:US:'
export const US_CACHE_TTL_MS = 24 * 60 * 60 * 1000
const PE_POINTS = 20

const readCache = (symbol, now) => {
  try {
    const raw = window.localStorage.getItem(CACHE_PREFIX + symbol)
    if (!raw) return null
    const cached = JSON.parse(raw)
    return now - cached.fetchedAt < US_CACHE_TTL_MS ? cached : null
  } catch {
    return null
  }
}

const writeCache = (symbol, data) => {
  try {
    window.localStorage.setItem(CACHE_PREFIX + symbol, JSON.stringify(data))
  } catch {
    // Private mode / quota: skip caching, the data is still returned.
  }
}

// Fiscal period ends drift around quarter boundaries (2026-01-02 closes Q4);
// shifting back 15 days files each period under the quarter it mostly covers.
export const periodToQuarter = (period) => {
  const date = new Date(`${period}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() - 15)
  return { year: date.getUTCFullYear(), quarter: Math.floor(date.getUTCMonth() / 3) + 1 }
}

const isoDate = (ms) => new Date(ms).toISOString().slice(0, 10)

const addMonths = (iso, months) => {
  const date = new Date(`${iso}T00:00:00Z`)
  date.setUTCMonth(date.getUTCMonth() + months)
  return isoDate(date.getTime())
}

const byPeriodAsc = (a, b) => (a.period < b.period ? -1 : 1)

export const getUsFundamentals = async (symbol, { now = Date.now() } = {}) => {
  const cached = readCache(symbol, now)
  if (cached) return cached

  const today = isoDate(now)
  const [metric, earnings, calendar] = await Promise.all([
    requestFinnhub('/stock/metric', { symbol, metric: 'all' }),
    requestFinnhub('/stock/earnings', { symbol }),
    requestFinnhub('/calendar/earnings', { symbol, from: today, to: addMonths(today, 15) }),
  ])

  const quarterly = metric?.series?.quarterly ?? {}
  const singles = (quarterly.eps ?? [])
    .filter((point) => point?.period && Number.isFinite(point.v))
    .map((point) => ({ ...periodToQuarter(point.period), period: point.period, eps: point.v }))
    .sort(byPeriodAsc)
  // Finnhub series are newest first.
  const peSeries = (quarterly.peTTM ?? [])
    .slice(0, PE_POINTS)
    .map((point) => ({ label: point.period, pe: Number.isFinite(point.v) ? point.v : null }))
    .reverse()
  const surprises = (Array.isArray(earnings) ? earnings : [])
    .filter((item) => item?.period)
    .map((item) => ({
      ...periodToQuarter(item.period),
      period: item.period,
      actual: Number.isFinite(item.actual) ? item.actual : null,
      estimate: Number.isFinite(item.estimate) ? item.estimate : null,
      surprisePercent: Number.isFinite(item.surprisePercent) ? item.surprisePercent : null,
    }))
    .sort(byPeriodAsc)
  const upcoming = (calendar?.earningsCalendar ?? [])
    .filter((item) => item?.date && item.date >= today && item.epsActual == null)
    .map((item) => ({
      date: item.date,
      hour: item.hour || '',
      epsEstimate: Number.isFinite(item.epsEstimate) ? item.epsEstimate : null,
    }))
    .sort((a, b) => (a.date < b.date ? -1 : 1))

  const data = { fetchedAt: now, singles, peSeries, surprises, upcoming }
  writeCache(symbol, data)
  return data
}
