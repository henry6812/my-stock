// Watched stocks: no holder, no shares — a stock to research, with the
// last quote stored on it (not in price_snapshots, which feed the asset
// trend).

export const WATCHLIST_REFRESH_INTERVAL_MS = 10 * 60 * 1000
export const WATCHLIST_DUPLICATE_MESSAGE = "已在觀察清單"
export const WATCHLIST_NOT_FOUND_MESSAGE = "查不到這個代號的報價"

const MARKET_ORDER = ["TW", "US"]

// One watched stock per market + symbol: the cloud doc id, so two devices
// adding the same stock land on the same doc.
export const buildWatchlistRemoteKey = ({ market, symbol }) => `${market}_${symbol}`

export const watchlistQuoteFields = (quote, nowIso) => ({
  latestPrice: quote.price,
  previousClose: Number.isFinite(quote.previousClose) ? quote.previousClose : null,
  currency: quote.currency,
  priceUpdatedAt: nowIso,
})

const toRow = (item) => {
  const hasChange =
    Number.isFinite(item.latestPrice) && Number.isFinite(item.previousClose) && item.previousClose > 0
  const change = hasChange ? item.latestPrice - item.previousClose : null
  return {
    id: item.id,
    remoteKey: item.remoteKey,
    market: item.market,
    symbol: item.symbol,
    name: item.name || item.symbol,
    latestPrice: Number.isFinite(item.latestPrice) ? item.latestPrice : null,
    previousClose: Number.isFinite(item.previousClose) ? item.previousClose : null,
    currency: item.currency || (item.market === "US" ? "USD" : "TWD"),
    priceUpdatedAt: item.priceUpdatedAt ?? null,
    createdAt: item.createdAt ?? null,
    change,
    changePct: hasChange ? change / item.previousClose : null,
  }
}

const byAdded = (a, b) =>
  String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")) || a.id - b.id

export const buildWatchlistView = (items) => {
  const rows = items.filter((item) => !item.deletedAt).map(toRow).sort(byAdded)
  const groups = MARKET_ORDER.map((market) => ({
    market,
    rows: rows.filter((row) => row.market === market),
  })).filter((group) => group.rows.length > 0)
  const stamps = rows.map((row) => row.priceUpdatedAt).filter(Boolean).sort()
  return { rows, groups, lastUpdatedAt: stamps.at(-1) ?? null }
}

// Entering 研究 refreshes when a price is missing or the oldest one is past
// the interval; the stamps come from the cloud, so another device's recent
// refresh counts too.
export const shouldAutoRefreshWatchlist = (rows, nowMs) => {
  if (rows.length === 0) return false
  if (rows.some((row) => !row.priceUpdatedAt)) return true
  const oldest = Math.min(...rows.map((row) => Date.parse(row.priceUpdatedAt)))
  return nowMs - oldest > WATCHLIST_REFRESH_INTERVAL_MS
}
