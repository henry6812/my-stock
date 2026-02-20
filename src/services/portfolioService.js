import Dexie from 'dexie'
import dayjs from 'dayjs'
import { db, FX_PAIR_USD_TWD, SYNC_KEY_PRICES } from '../db/database'
import { getUsdTwdRate } from './priceProviders/fxProvider'
import { getHoldingQuote, sleepForRateLimit } from './priceProviders/finnhubProvider'

const MARKET = {
  TW: 'TW',
  US: 'US',
}

const TREND_RANGE_HOURS = {
  '24h': 24,
  '7d': 24 * 7,
  '30d': 24 * 30,
}

const normalizeSymbol = (symbol, market) => {
  const normalized = symbol.trim().toUpperCase()
  if (market === MARKET.TW) {
    return normalized.replace('.TW', '')
  }
  return normalized
}

const getLatestSnapshotByHoldingId = async (holdingId) => (
  db.price_snapshots
    .where('[holdingId+capturedAt]')
    .between([holdingId, Dexie.minKey], [holdingId, Dexie.maxKey])
    .last()
)

const setSyncMeta = async ({ status, errorMessage = '' }) => {
  const nowIso = new Date().toISOString()
  await db.sync_meta.put({
    key: SYNC_KEY_PRICES,
    lastUpdatedAt: nowIso,
    status,
    errorMessage,
  })
  return nowIso
}

export const upsertHolding = async ({ symbol, market, shares }) => {
  const normalizedMarket = market === MARKET.US ? MARKET.US : MARKET.TW
  const normalizedSymbol = normalizeSymbol(symbol, normalizedMarket)
  const parsedShares = Number(shares)

  if (!normalizedSymbol) {
    throw new Error('Stock symbol is required')
  }

  if (!Number.isFinite(parsedShares) || parsedShares <= 0) {
    throw new Error('Shares must be a positive number')
  }

  const existing = await db.holdings.where('[symbol+market]').equals([normalizedSymbol, normalizedMarket]).first()
  const nowIso = new Date().toISOString()

  if (existing) {
    await db.holdings.update(existing.id, {
      shares: parsedShares,
      updatedAt: nowIso,
    })
    return
  }

  await db.holdings.add({
    symbol: normalizedSymbol,
    market: normalizedMarket,
    shares: parsedShares,
    companyName: normalizedSymbol,
    createdAt: nowIso,
    updatedAt: nowIso,
  })
}

export const updateHoldingShares = async ({ id, shares }) => {
  const parsedId = Number(id)
  const parsedShares = Number(shares)

  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    throw new Error('Holding not found')
  }

  if (!Number.isFinite(parsedShares) || parsedShares <= 0) {
    throw new Error('Shares must be a positive number')
  }

  const existing = await db.holdings.get(parsedId)
  if (!existing) {
    throw new Error('Holding not found')
  }

  await db.holdings.update(parsedId, {
    shares: parsedShares,
    updatedAt: new Date().toISOString(),
  })
}

export const removeHolding = async ({ id }) => {
  const parsedId = Number(id)

  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    throw new Error('Holding not found')
  }

  await db.transaction('rw', db.holdings, db.price_snapshots, async () => {
    const existing = await db.holdings.get(parsedId)
    if (!existing) {
      throw new Error('Holding not found')
    }

    await db.holdings.delete(parsedId)
    await db.price_snapshots.where('holdingId').equals(parsedId).delete()
  })
}

export const refreshPrices = async () => {
  const holdings = await db.holdings.toArray()
  if (holdings.length === 0) {
    const lastUpdatedAt = await setSyncMeta({ status: 'success' })
    return { updatedCount: 0, lastUpdatedAt }
  }

  const usHoldings = holdings.filter((item) => item.market === MARKET.US)

  try {
    let usdTwdRate = 1
    if (usHoldings.length > 0) {
      const fx = await getUsdTwdRate()
      usdTwdRate = fx.rate
      await db.fx_rates.put({
        pair: FX_PAIR_USD_TWD,
        rate: fx.rate,
        fetchedAt: fx.fetchedAt,
        source: 'open.er-api',
      })
    }

    const nowIso = new Date().toISOString()
    const snapshots = []

    for (let i = 0; i < holdings.length; i += 1) {
      if (i > 0) {
        await sleepForRateLimit(1_200)
      }

      const holding = holdings[i]
      const quote = await getHoldingQuote(holding)
      const valueTwd = holding.market === MARKET.US
        ? quote.price * holding.shares * usdTwdRate
        : quote.price * holding.shares

      snapshots.push({
        holdingId: holding.id,
        symbol: holding.symbol,
        market: holding.market,
        price: quote.price,
        currency: quote.currency,
        fxRateToTwd: usdTwdRate,
        valueTwd,
        capturedAt: nowIso,
      })

      if (quote.name && quote.name !== holding.companyName) {
        await db.holdings.update(holding.id, {
          companyName: quote.name,
          updatedAt: nowIso,
        })
      }
    }

    if (snapshots.length > 0) {
      await db.price_snapshots.bulkAdd(snapshots)
    }

    await db.sync_meta.put({
      key: SYNC_KEY_PRICES,
      lastUpdatedAt: nowIso,
      status: 'success',
      errorMessage: '',
    })

    return {
      updatedCount: snapshots.length,
      lastUpdatedAt: nowIso,
    }
  } catch (error) {
    const errorMessage = error instanceof Error
      ? error.message
      : String(error)
    await setSyncMeta({
      status: 'error',
      errorMessage,
    })
    throw new Error(errorMessage)
  }
}

export const getPortfolioView = async () => {
  const holdings = await db.holdings.orderBy('updatedAt').reverse().toArray()
  const rows = []
  let totalTwd = 0

  for (const holding of holdings) {
    const latestSnapshot = await getLatestSnapshotByHoldingId(holding.id)

    const row = {
      id: holding.id,
      symbol: holding.symbol,
      companyName: holding.companyName,
      market: holding.market,
      shares: holding.shares,
      latestPrice: latestSnapshot?.price,
      latestValueTwd: latestSnapshot?.valueTwd,
      latestCurrency: latestSnapshot?.currency,
      latestCapturedAt: latestSnapshot?.capturedAt,
    }

    if (typeof row.latestValueTwd === 'number') {
      totalTwd += row.latestValueTwd
    }

    rows.push(row)
  }

  const syncMeta = await db.sync_meta.get(SYNC_KEY_PRICES)

  return {
    rows,
    totalTwd,
    lastUpdatedAt: syncMeta?.lastUpdatedAt,
    syncStatus: syncMeta?.status,
    syncError: syncMeta?.errorMessage,
  }
}

export const getTrend = async (range) => {
  const hours = TREND_RANGE_HOURS[range] ?? TREND_RANGE_HOURS['24h']
  const fromIso = dayjs().subtract(hours, 'hour').toISOString()

  const snapshots = await db.price_snapshots
    .where('capturedAt')
    .aboveOrEqual(fromIso)
    .sortBy('capturedAt')

  const sumByTimestamp = new Map()
  for (const snapshot of snapshots) {
    const previous = sumByTimestamp.get(snapshot.capturedAt) ?? 0
    sumByTimestamp.set(snapshot.capturedAt, previous + snapshot.valueTwd)
  }

  return Array.from(sumByTimestamp.entries())
    .sort(([a], [b]) => (a > b ? 1 : -1))
    .map(([ts, totalTwd]) => ({ ts, totalTwd }))
}
