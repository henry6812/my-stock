import { logger } from 'firebase-functions'
import {
  FieldValue,
  getFirestore,
} from 'firebase-admin/firestore'
import {
  getTwQuote,
  getUsQuote,
  getUsdTwdRate,
  sleepForRateLimit,
} from '../providers/marketProviders.js'

const SYNC_META_KEY = 'prices'
const FX_PAIR_USD_TWD = 'USD_TWD'

const isDeleted = (item) => Boolean(item?.deletedAt)
const normalizeIsoToSecond = (date) => date.toISOString().replace(/\.\d{3}Z$/, 'Z')

const buildSnapshotId = ({ market, symbol, capturedAt }) => `${market}_${symbol}_${capturedAt}`
const buildHoldingDocId = ({ market, symbol }) => `${market}_${symbol}`

const chunk = (items, size) => {
  const result = []
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size))
  }
  return result
}

const writeUserSyncMeta = async ({ firestore, uid, status, errorMessage = '', capturedAt }) => {
  const syncMetaRef = firestore.collection('users').doc(uid).collection('sync_meta').doc(SYNC_META_KEY)
  await syncMetaRef.set(
    {
      key: SYNC_META_KEY,
      lastUpdatedAt: capturedAt,
      status,
      errorMessage,
      lastScheduledAt: capturedAt,
      lastScheduledStatus: status,
      lastScheduledError: errorMessage,
      updatedAt: capturedAt,
      deletedAt: null,
      syncState: 'synced',
      clientUpdatedAt: capturedAt,
      serverUpdatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  )
}

const processUser = async ({ firestore, uid, holdings, quoteCache, usdTwdRate, capturedAt }) => {
  const fxRef = firestore.collection('users').doc(uid).collection('fx_rates').doc(FX_PAIR_USD_TWD)
  const holdingsRef = firestore.collection('users').doc(uid).collection('holdings')
  const snapshotsRef = firestore.collection('users').doc(uid).collection('price_snapshots')

  const activeHoldings = holdings.filter((item) => !isDeleted(item))
  if (activeHoldings.length === 0) {
    await writeUserSyncMeta({
      firestore,
      uid,
      status: 'success',
      capturedAt,
    })
    return { updated: 0 }
  }

  const hasUsHolding = activeHoldings.some((item) => item.market === 'US')
  if (hasUsHolding && usdTwdRate) {
    await fxRef.set(
      {
        pair: FX_PAIR_USD_TWD,
        rate: usdTwdRate.rate,
        fetchedAt: usdTwdRate.fetchedAt,
        source: 'open.er-api',
        updatedAt: capturedAt,
        deletedAt: null,
        syncState: 'synced',
        clientUpdatedAt: capturedAt,
        serverUpdatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    )
  }

  let updatedCount = 0

  for (const holding of activeHoldings) {
    const symbol = String(holding.symbol || '').trim().toUpperCase()
    const market = holding.market === 'US' ? 'US' : 'TW'
    const shares = Number(holding.shares)

    if (!symbol || !Number.isFinite(shares) || shares <= 0) {
      continue
    }

    const cacheKey = `${market}_${symbol}`
    let quote = quoteCache.get(cacheKey)
    if (!quote) {
      quote = market === 'US' ? await getUsQuote(symbol) : await getTwQuote(symbol)
      quoteCache.set(cacheKey, quote)
      await sleepForRateLimit(1200)
    }

    const fxRateToTwd = market === 'US' ? usdTwdRate?.rate : 1
    if (market === 'US' && (!Number.isFinite(fxRateToTwd) || fxRateToTwd <= 0)) {
      throw new Error('Missing USD/TWD rate for US holding update')
    }

    const valueTwd = market === 'US'
      ? quote.price * shares * fxRateToTwd
      : quote.price * shares

    const snapshotPayload = {
      holdingId: holding.id,
      symbol,
      market,
      price: quote.price,
      currency: quote.currency,
      fxRateToTwd,
      valueTwd,
      capturedAt,
      updatedAt: capturedAt,
      deletedAt: null,
      syncState: 'synced',
      clientUpdatedAt: capturedAt,
      serverUpdatedAt: FieldValue.serverTimestamp(),
    }

    const snapshotId = buildSnapshotId({ market, symbol, capturedAt })
    await snapshotsRef.doc(snapshotId).set(snapshotPayload, { merge: true })

    const holdingDocId = buildHoldingDocId({ market, symbol })
    await holdingsRef.doc(holdingDocId).set(
      {
        updatedAt: capturedAt,
        deletedAt: null,
        syncState: 'synced',
        clientUpdatedAt: capturedAt,
        serverUpdatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    )

    updatedCount += 1
  }

  await writeUserSyncMeta({
    firestore,
    uid,
    status: 'success',
    capturedAt,
  })

  return { updated: updatedCount }
}

export const runDailyPriceUpdate = async () => {
  const firestore = getFirestore()
  const capturedAt = normalizeIsoToSecond(new Date())
  const quoteCache = new Map()

  let usdTwdRate = null
  try {
    usdTwdRate = await getUsdTwdRate()
  } catch (error) {
    logger.error('Failed to fetch USD/TWD rate before daily update', error)
  }

  const holdingsSnapshot = await firestore.collectionGroup('holdings').get()

  const users = new Map()
  for (const doc of holdingsSnapshot.docs) {
    const segments = doc.ref.path.split('/')
    const uid = segments[1]
    if (!uid) {
      continue
    }

    if (!users.has(uid)) {
      users.set(uid, [])
    }

    users.get(uid).push({
      id: doc.data().id,
      ...doc.data(),
    })
  }

  const userEntries = Array.from(users.entries())
  const userChunks = chunk(userEntries, 100)

  let usersProcessed = 0
  let holdingsUpdated = 0
  let errors = 0

  for (const group of userChunks) {
    for (const [uid, holdings] of group) {
      try {
        const result = await processUser({
          firestore,
          uid,
          holdings,
          quoteCache,
          usdTwdRate,
          capturedAt,
        })
        usersProcessed += 1
        holdingsUpdated += result.updated
      } catch (error) {
        errors += 1
        const message = error instanceof Error ? error.message : String(error)
        logger.error(`Daily update failed for user ${uid}`, error)

        await writeUserSyncMeta({
          firestore,
          uid,
          status: 'error',
          errorMessage: message,
          capturedAt,
        })
      }
    }
  }

  logger.info('Daily price update finished', {
    usersProcessed,
    holdingsUpdated,
    errors,
    capturedAt,
  })

  return {
    usersProcessed,
    holdingsUpdated,
    errors,
  }
}
