import Dexie from 'dexie'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import { db, FX_PAIR_USD_TWD, SYNC_KEY_PRICES } from '../db/database'
import { getUsdTwdRate } from './priceProviders/fxProvider'
import { getHoldingQuote, sleepForRateLimit } from './priceProviders/finnhubProvider'
import {
  getSyncRuntimeState,
  initCloudSync,
  queueOrApplyMutation,
  setSyncUser,
  stopCloudSync,
  syncNowWithCloud,
} from './firebase/cloudSyncService'

dayjs.extend(utc)
dayjs.extend(timezone)

const MARKET = {
  TW: 'TW',
  US: 'US',
}

const DEFAULT_HOLDING_TAG_OPTIONS = [
  { value: 'STOCK', label: '個股', isDefault: true },
  { value: 'ETF', label: 'ETF' },
  { value: 'BOND', label: '債券' },
]

const SYNC_PENDING = 'pending'
const SYNC_SYNCED = 'synced'
const CLOUD_COLLECTION = {
  HOLDINGS: 'holdings',
  PRICE_SNAPSHOTS: 'price_snapshots',
  FX_RATES: 'fx_rates',
  SYNC_META: 'sync_meta',
  CASH_ACCOUNTS: 'cash_accounts',
  CASH_BALANCE_SNAPSHOTS: 'cash_balance_snapshots',
}

const TREND_RANGE_DAYS = {
  '24h': 2,
  '7d': 7,
  '30d': 30,
}

const isDeleted = (item) => Boolean(item?.deletedAt)

const getNowIso = () => new Date().toISOString()

const mirrorToCloud = async (collectionName, record) => {
  await queueOrApplyMutation({ collectionName, record })
}

const sortHoldingsByOrder = (a, b) => {
  const aOrder = Number(a?.sortOrder)
  const bOrder = Number(b?.sortOrder)
  const aHasOrder = Number.isFinite(aOrder)
  const bHasOrder = Number.isFinite(bOrder)

  if (aHasOrder && bHasOrder && aOrder !== bOrder) {
    return aOrder - bOrder
  }
  if (aHasOrder && !bHasOrder) return -1
  if (!aHasOrder && bHasOrder) return 1

  if (!a?.updatedAt && !b?.updatedAt) return 0
  if (!a?.updatedAt) return 1
  if (!b?.updatedAt) return -1
  return a.updatedAt > b.updatedAt ? -1 : 1
}

const normalizeSymbol = (symbol, market) => {
  const normalized = symbol.trim().toUpperCase()
  if (market === MARKET.TW) {
    return normalized.replace('.TW', '')
  }
  return normalized
}

const normalizeAssetTag = (assetTag) => String(assetTag ?? '').trim().toUpperCase()

const ensureHoldingTagOptions = async () => {
  const config = await db.app_config.get('holding_tags')
  const options = Array.isArray(config?.options) ? config.options : []
  if (options.length > 0) {
    return options
  }

  await db.app_config.put({
    key: 'holding_tags',
    options: DEFAULT_HOLDING_TAG_OPTIONS,
    updatedAt: getNowIso(),
  })
  return DEFAULT_HOLDING_TAG_OPTIONS
}

const getDefaultHoldingTag = (options) => {
  const defaultOption = options.find((item) => item.isDefault)
  return defaultOption?.value || options[0]?.value || 'STOCK'
}

const resolveHoldingTag = ({ inputTag, options }) => {
  const normalizedInputTag = normalizeAssetTag(inputTag)
  if (!normalizedInputTag) {
    return getDefaultHoldingTag(options)
  }
  const isValid = options.some((item) => item.value === normalizedInputTag)
  if (!isValid) {
    throw new Error('Invalid holding tag')
  }
  return normalizedInputTag
}

const getLatestTwoSnapshotsByHoldingId = async (holdingId) => {
  const snapshots = await db.price_snapshots
    .where('[holdingId+capturedAt]')
    .between([holdingId, Dexie.minKey], [holdingId, Dexie.maxKey])
    .reverse()
    .toArray()

  const activeSnapshots = snapshots.filter((item) => !isDeleted(item))
  return {
    latestSnapshot: activeSnapshots[0],
    previousSnapshot: activeSnapshots[1],
  }
}

const getLatestSnapshotAtOrBefore = async (holdingId, baselineAtIso) => {
  const snapshots = await db.price_snapshots
    .where('[holdingId+capturedAt]')
    .between([holdingId, Dexie.minKey], [holdingId, baselineAtIso], true, true)
    .reverse()
    .toArray()

  return snapshots.find((item) => !isDeleted(item))
}

const getLatestCashBalanceSnapshotAtOrBefore = async (cashAccountId, baselineAtIso) => {
  const snapshots = await db.cash_balance_snapshots
    .where('[cashAccountId+capturedAt]')
    .between([cashAccountId, Dexie.minKey], [cashAccountId, baselineAtIso], true, true)
    .reverse()
    .toArray()

  return snapshots.find((item) => !isDeleted(item))
}

const getBaselineAtIso = () => dayjs().tz('Asia/Taipei').subtract(1, 'day').endOf('day').utc().toISOString()

const recordCashBalanceSnapshot = async ({ cashAccount, balanceTwd, capturedAt = getNowIso() }) => {
  if (!cashAccount) {
    return
  }

  const snapshot = {
    cashAccountId: cashAccount.id,
    bankCode: cashAccount.bankCode ?? null,
    bankName: cashAccount.bankName,
    accountAlias: cashAccount.accountAlias,
    balanceTwd: Number(balanceTwd) || 0,
    capturedAt,
    updatedAt: capturedAt,
    deletedAt: null,
    syncState: SYNC_PENDING,
  }

  await db.cash_balance_snapshots.add(snapshot)
  await mirrorToCloud(CLOUD_COLLECTION.CASH_BALANCE_SNAPSHOTS, snapshot)
}

const setSyncMeta = async ({ status, errorMessage = '' }) => {
  const nowIso = getNowIso()
  await db.sync_meta.put({
    key: SYNC_KEY_PRICES,
    lastUpdatedAt: nowIso,
    status,
    errorMessage,
    updatedAt: nowIso,
    deletedAt: null,
    syncState: SYNC_PENDING,
  })
  const syncMeta = await db.sync_meta.get(SYNC_KEY_PRICES)
  if (syncMeta) {
    await mirrorToCloud(CLOUD_COLLECTION.SYNC_META, syncMeta)
  }
  return nowIso
}

const getActiveHoldings = async () => {
  const holdings = await db.holdings.toArray()
  return holdings.filter((item) => !isDeleted(item))
}

const getActiveCashAccounts = async () => {
  const cashAccounts = await db.cash_accounts.toArray()
  return cashAccounts.filter((item) => !isDeleted(item))
}

export const setCurrentUser = (uid) => {
  setSyncUser(uid ?? null)
}

export const initSync = async (uid) => {
  await initCloudSync(uid)
}

export const stopSync = () => {
  stopCloudSync()
}

export const syncNow = async () => syncNowWithCloud()
export const getCloudSyncRuntime = () => getSyncRuntimeState()

export const getHoldingTagOptions = async () => ensureHoldingTagOptions()

export const upsertHolding = async ({ symbol, market, shares, assetTag }) => {
  const normalizedMarket = market === MARKET.US ? MARKET.US : MARKET.TW
  const normalizedSymbol = normalizeSymbol(symbol, normalizedMarket)
  const parsedShares = Number(shares)
  const options = await ensureHoldingTagOptions()
  const hasAssetTagInput = assetTag !== undefined && assetTag !== null && String(assetTag).trim() !== ''

  if (!normalizedSymbol) {
    throw new Error('Stock symbol is required')
  }

  if (!Number.isFinite(parsedShares) || parsedShares <= 0) {
    throw new Error('Shares must be a positive number')
  }

  const existing = await db.holdings.where('[symbol+market]').equals([normalizedSymbol, normalizedMarket]).first()
  const nowIso = getNowIso()

  if (existing) {
    const nextAssetTag = hasAssetTagInput
      ? resolveHoldingTag({ inputTag: assetTag, options })
      : (existing.assetTag || getDefaultHoldingTag(options))
    await db.holdings.update(existing.id, {
      shares: parsedShares,
      assetTag: nextAssetTag,
      updatedAt: nowIso,
      deletedAt: null,
      syncState: SYNC_PENDING,
    })
    const updatedHolding = await db.holdings.get(existing.id)
    if (updatedHolding) {
      await mirrorToCloud(CLOUD_COLLECTION.HOLDINGS, updatedHolding)
    }
    return {
      id: existing.id,
      created: false,
    }
  }

  const holdings = await getActiveHoldings()
  const maxSortOrder = holdings.reduce((max, item) => {
    const value = Number(item?.sortOrder)
    if (!Number.isFinite(value)) return max
    return Math.max(max, value)
  }, 0)

  const nextAssetTag = hasAssetTagInput
    ? resolveHoldingTag({ inputTag: assetTag, options })
    : getDefaultHoldingTag(options)

  const id = await db.holdings.add({
    symbol: normalizedSymbol,
    market: normalizedMarket,
    assetTag: nextAssetTag,
    shares: parsedShares,
    companyName: normalizedSymbol,
    sortOrder: maxSortOrder + 1,
    createdAt: nowIso,
    updatedAt: nowIso,
    deletedAt: null,
    syncState: SYNC_PENDING,
  })
  const insertedHolding = await db.holdings.get(id)
  if (insertedHolding) {
    await mirrorToCloud(CLOUD_COLLECTION.HOLDINGS, insertedHolding)
  }

  return {
    id,
    created: true,
  }
}

export const updateHoldingTag = async ({ id, assetTag }) => {
  const parsedId = Number(id)
  const options = await ensureHoldingTagOptions()
  const nextAssetTag = resolveHoldingTag({ inputTag: assetTag, options })

  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    throw new Error('Holding not found')
  }

  const existing = await db.holdings.get(parsedId)
  if (!existing || isDeleted(existing)) {
    throw new Error('Holding not found')
  }

  await db.holdings.update(parsedId, {
    assetTag: nextAssetTag,
    updatedAt: getNowIso(),
    syncState: SYNC_PENDING,
  })
  const updatedHolding = await db.holdings.get(parsedId)
  if (updatedHolding) {
    await mirrorToCloud(CLOUD_COLLECTION.HOLDINGS, updatedHolding)
  }
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
  if (!existing || isDeleted(existing)) {
    throw new Error('Holding not found')
  }

  await db.holdings.update(parsedId, {
    shares: parsedShares,
    updatedAt: getNowIso(),
    syncState: SYNC_PENDING,
  })
  const updatedHolding = await db.holdings.get(parsedId)
  if (updatedHolding) {
    await mirrorToCloud(CLOUD_COLLECTION.HOLDINGS, updatedHolding)
  }
}

export const removeHolding = async ({ id }) => {
  const parsedId = Number(id)

  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    throw new Error('Holding not found')
  }

  let nowIso
  await db.transaction('rw', db.holdings, db.price_snapshots, async () => {
    const existing = await db.holdings.get(parsedId)
    if (!existing || isDeleted(existing)) {
      throw new Error('Holding not found')
    }

    nowIso = getNowIso()

    await db.holdings.update(parsedId, {
      deletedAt: nowIso,
      updatedAt: nowIso,
      syncState: SYNC_PENDING,
    })

    await db.price_snapshots
      .where('holdingId')
      .equals(parsedId)
      .modify({
        deletedAt: nowIso,
        updatedAt: nowIso,
        syncState: SYNC_PENDING,
      })

    const allHoldings = await db.holdings.toArray()
    const remaining = allHoldings.filter((item) => !isDeleted(item) && item.id !== parsedId)
    remaining.sort(sortHoldingsByOrder)

    for (let i = 0; i < remaining.length; i += 1) {
      await db.holdings.update(remaining[i].id, {
        sortOrder: i + 1,
        updatedAt: nowIso,
        syncState: SYNC_PENDING,
      })
    }
  })

  const deletedHolding = await db.holdings.get(parsedId)
  if (deletedHolding) {
    await mirrorToCloud(CLOUD_COLLECTION.HOLDINGS, deletedHolding)
  }

  const affectedSnapshots = await db.price_snapshots.where('holdingId').equals(parsedId).toArray()
  for (const snapshot of affectedSnapshots) {
    if (snapshot.updatedAt === nowIso || snapshot.deletedAt) {
      await mirrorToCloud(CLOUD_COLLECTION.PRICE_SNAPSHOTS, snapshot)
    }
  }

  const remaining = (await db.holdings.toArray()).filter((item) => !isDeleted(item))
  for (const holding of remaining) {
    if (holding.updatedAt === nowIso) {
      await mirrorToCloud(CLOUD_COLLECTION.HOLDINGS, holding)
    }
  }
}

export const reorderHoldings = async ({ orderedIds }) => {
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    throw new Error('orderedIds is required')
  }

  const normalizedIds = orderedIds.map((id) => Number(id))
  if (normalizedIds.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw new Error('orderedIds contains invalid id')
  }

  const uniqueIds = new Set(normalizedIds)
  if (uniqueIds.size !== normalizedIds.length) {
    throw new Error('orderedIds contains duplicate id')
  }

  let nowIso
  await db.transaction('rw', db.holdings, async () => {
    const holdings = (await db.holdings.toArray()).filter((item) => !isDeleted(item))
    const existingIds = holdings.map((item) => item.id)

    if (existingIds.length !== normalizedIds.length) {
      throw new Error('orderedIds does not match holdings length')
    }

    const existingIdSet = new Set(existingIds)
    for (const id of normalizedIds) {
      if (!existingIdSet.has(id)) {
        throw new Error('orderedIds contains unknown id')
      }
    }

    nowIso = getNowIso()
    for (let i = 0; i < normalizedIds.length; i += 1) {
      await db.holdings.update(normalizedIds[i], {
        sortOrder: i + 1,
        updatedAt: nowIso,
        syncState: SYNC_PENDING,
      })
    }
  })

  const holdings = await db.holdings.where('id').anyOf(normalizedIds).toArray()
  for (const holding of holdings) {
    if (holding.updatedAt === nowIso) {
      await mirrorToCloud(CLOUD_COLLECTION.HOLDINGS, holding)
    }
  }
}

export const refreshHoldingPrice = async ({ holdingId }) => {
  const parsedHoldingId = Number(holdingId)
  if (!Number.isInteger(parsedHoldingId) || parsedHoldingId <= 0) {
    throw new Error('Holding not found')
  }

  const holding = await db.holdings.get(parsedHoldingId)
  if (!holding || isDeleted(holding)) {
    throw new Error('Holding not found')
  }

  const quote = await getHoldingQuote(holding)
  let fxRateToTwd = 1

  if (holding.market === MARKET.US) {
    const fx = await getUsdTwdRate()
    fxRateToTwd = fx.rate
    await db.fx_rates.put({
      pair: FX_PAIR_USD_TWD,
      rate: fx.rate,
      fetchedAt: fx.fetchedAt,
      source: 'open.er-api',
      updatedAt: getNowIso(),
      deletedAt: null,
      syncState: SYNC_PENDING,
    })
    const fxRate = await db.fx_rates.get(FX_PAIR_USD_TWD)
    if (fxRate) {
      await mirrorToCloud(CLOUD_COLLECTION.FX_RATES, fxRate)
    }
  }

  const nowIso = getNowIso()
  const valueTwd = holding.market === MARKET.US
    ? quote.price * holding.shares * fxRateToTwd
    : quote.price * holding.shares

  await db.price_snapshots.add({
    holdingId: holding.id,
    symbol: holding.symbol,
    market: holding.market,
    price: quote.price,
    currency: quote.currency,
    fxRateToTwd,
    valueTwd,
    capturedAt: nowIso,
    updatedAt: nowIso,
    deletedAt: null,
    syncState: SYNC_PENDING,
  })
  const insertedSnapshot = await db.price_snapshots
    .where('[holdingId+capturedAt]')
    .equals([holding.id, nowIso])
    .first()
  if (insertedSnapshot) {
    await mirrorToCloud(CLOUD_COLLECTION.PRICE_SNAPSHOTS, insertedSnapshot)
  }

  if (quote.name && quote.name !== holding.companyName) {
    await db.holdings.update(holding.id, {
      companyName: quote.name,
      updatedAt: nowIso,
      syncState: SYNC_PENDING,
    })
    const updatedHolding = await db.holdings.get(holding.id)
    if (updatedHolding) {
      await mirrorToCloud(CLOUD_COLLECTION.HOLDINGS, updatedHolding)
    }
  }

  await db.sync_meta.put({
    key: SYNC_KEY_PRICES,
    lastUpdatedAt: nowIso,
    status: 'success',
    errorMessage: '',
    updatedAt: nowIso,
    deletedAt: null,
    syncState: SYNC_PENDING,
  })
  const syncMeta = await db.sync_meta.get(SYNC_KEY_PRICES)
  if (syncMeta) {
    await mirrorToCloud(CLOUD_COLLECTION.SYNC_META, syncMeta)
  }

  return {
    updatedAt: nowIso,
  }
}

export const refreshPrices = async () => {
  const holdings = await getActiveHoldings()
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
        updatedAt: getNowIso(),
        deletedAt: null,
        syncState: SYNC_PENDING,
      })
      const fxRate = await db.fx_rates.get(FX_PAIR_USD_TWD)
      if (fxRate) {
        await mirrorToCloud(CLOUD_COLLECTION.FX_RATES, fxRate)
      }
    }

    const nowIso = getNowIso()
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
        updatedAt: nowIso,
        deletedAt: null,
        syncState: SYNC_PENDING,
      })

      if (quote.name && quote.name !== holding.companyName) {
        await db.holdings.update(holding.id, {
          companyName: quote.name,
          updatedAt: nowIso,
          syncState: SYNC_PENDING,
        })
        const updatedHolding = await db.holdings.get(holding.id)
        if (updatedHolding) {
          await mirrorToCloud(CLOUD_COLLECTION.HOLDINGS, updatedHolding)
        }
      }
    }

    if (snapshots.length > 0) {
      await db.price_snapshots.bulkAdd(snapshots)
      for (const snapshot of snapshots) {
        await mirrorToCloud(CLOUD_COLLECTION.PRICE_SNAPSHOTS, snapshot)
      }
    }

    await db.sync_meta.put({
      key: SYNC_KEY_PRICES,
      lastUpdatedAt: nowIso,
      status: 'success',
      errorMessage: '',
      updatedAt: nowIso,
      deletedAt: null,
      syncState: SYNC_PENDING,
    })
    const syncMeta = await db.sync_meta.get(SYNC_KEY_PRICES)
    if (syncMeta) {
      await mirrorToCloud(CLOUD_COLLECTION.SYNC_META, syncMeta)
    }

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

export const upsertCashAccount = async ({
  bankCode,
  bankName,
  accountAlias,
  balanceTwd,
}) => {
  const normalizedBankCode = typeof bankCode === 'string' ? bankCode.trim() : undefined
  const normalizedBankName = String(bankName ?? '').trim()
  const normalizedAlias = String(accountAlias ?? '').trim()
  const parsedBalance = Number(balanceTwd)

  if (!normalizedBankName) {
    throw new Error('Bank name is required')
  }
  if (!normalizedAlias) {
    throw new Error('Account alias is required')
  }
  if (!Number.isFinite(parsedBalance) || parsedBalance < 0) {
    throw new Error('Balance must be a non-negative number')
  }

  const existing = await db.cash_accounts
    .where('[bankName+accountAlias]')
    .equals([normalizedBankName, normalizedAlias])
    .first()

  const nowIso = getNowIso()
  if (existing) {
    await db.cash_accounts.update(existing.id, {
      bankCode: normalizedBankCode || null,
      bankName: normalizedBankName,
      accountAlias: normalizedAlias,
      balanceTwd: parsedBalance,
      updatedAt: nowIso,
      deletedAt: null,
      syncState: SYNC_PENDING,
    })
    const updatedCash = await db.cash_accounts.get(existing.id)
    if (updatedCash) {
      await mirrorToCloud(CLOUD_COLLECTION.CASH_ACCOUNTS, updatedCash)
      await recordCashBalanceSnapshot({
        cashAccount: updatedCash,
        balanceTwd: parsedBalance,
        capturedAt: nowIso,
      })
    }
    return {
      id: existing.id,
      created: false,
    }
  }

  const id = await db.cash_accounts.add({
    bankCode: normalizedBankCode || null,
    bankName: normalizedBankName,
    accountAlias: normalizedAlias,
    balanceTwd: parsedBalance,
    createdAt: nowIso,
    updatedAt: nowIso,
    deletedAt: null,
    syncState: SYNC_PENDING,
  })
  const insertedCash = await db.cash_accounts.get(id)
  if (insertedCash) {
    await mirrorToCloud(CLOUD_COLLECTION.CASH_ACCOUNTS, insertedCash)
    await recordCashBalanceSnapshot({
      cashAccount: insertedCash,
      balanceTwd: parsedBalance,
      capturedAt: nowIso,
    })
  }

  return {
    id,
    created: true,
  }
}

export const updateCashAccountBalance = async ({ id, balanceTwd }) => {
  const parsedId = Number(id)
  const parsedBalance = Number(balanceTwd)

  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    throw new Error('Cash account not found')
  }
  if (!Number.isFinite(parsedBalance) || parsedBalance < 0) {
    throw new Error('Balance must be a non-negative number')
  }

  const existing = await db.cash_accounts.get(parsedId)
  if (!existing || isDeleted(existing)) {
    throw new Error('Cash account not found')
  }

  const nowIso = getNowIso()
  await db.cash_accounts.update(parsedId, {
    balanceTwd: parsedBalance,
    updatedAt: nowIso,
    syncState: SYNC_PENDING,
  })
  const updatedCash = await db.cash_accounts.get(parsedId)
  if (updatedCash) {
    await mirrorToCloud(CLOUD_COLLECTION.CASH_ACCOUNTS, updatedCash)
    await recordCashBalanceSnapshot({
      cashAccount: updatedCash,
      balanceTwd: parsedBalance,
      capturedAt: nowIso,
    })
  }
}

export const removeCashAccount = async ({ id }) => {
  const parsedId = Number(id)

  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    throw new Error('Cash account not found')
  }

  const existing = await db.cash_accounts.get(parsedId)
  if (!existing || isDeleted(existing)) {
    throw new Error('Cash account not found')
  }

  const nowIso = getNowIso()
  await db.cash_accounts.update(parsedId, {
    deletedAt: nowIso,
    updatedAt: nowIso,
    syncState: SYNC_PENDING,
  })
  const deletedCash = await db.cash_accounts.get(parsedId)
  if (deletedCash) {
    await mirrorToCloud(CLOUD_COLLECTION.CASH_ACCOUNTS, deletedCash)
    await recordCashBalanceSnapshot({
      cashAccount: deletedCash,
      balanceTwd: 0,
      capturedAt: nowIso,
    })
  }
}

export const getCashAccountsView = async () => {
  const cashAccounts = await getActiveCashAccounts()
  cashAccounts.sort((a, b) => {
    if (!a?.updatedAt && !b?.updatedAt) return 0
    if (!a?.updatedAt) return 1
    if (!b?.updatedAt) return -1
    return a.updatedAt > b.updatedAt ? -1 : 1
  })

  let totalCashTwd = 0
  const rows = cashAccounts.map((item) => {
    totalCashTwd += Number(item.balanceTwd) || 0
    return {
      id: item.id,
      bankCode: item.bankCode || undefined,
      bankName: item.bankName,
      accountAlias: item.accountAlias,
      balanceTwd: Number(item.balanceTwd) || 0,
      updatedAt: item.updatedAt,
    }
  })

  return {
    rows,
    totalCashTwd,
  }
}

export const getPortfolioView = async () => {
  const allHoldings = await db.holdings.toArray()
  const holdings = allHoldings.filter((item) => !isDeleted(item))
  holdings.sort(sortHoldingsByOrder)
  const allCashAccounts = await db.cash_accounts.toArray()
  const tagOptions = await ensureHoldingTagOptions()
  const tagLabelMap = new Map(tagOptions.map((item) => [item.value, item.label]))
  const defaultTag = getDefaultHoldingTag(tagOptions)
  const baselineAt = getBaselineAtIso()

  const rows = []
  let stockTotalTwd = 0

  for (const holding of holdings) {
    const { latestSnapshot, previousSnapshot } = await getLatestTwoSnapshotsByHoldingId(holding.id)
    const hasLatestPrice = typeof latestSnapshot?.price === 'number'
    const fxRateToTwd = holding.market === MARKET.US
      ? (typeof latestSnapshot?.fxRateToTwd === 'number' ? latestSnapshot.fxRateToTwd : 1)
      : 1
    const latestValueTwd = hasLatestPrice
      ? latestSnapshot.price * holding.shares * fxRateToTwd
      : latestSnapshot?.valueTwd
    const prevPrice = typeof previousSnapshot?.price === 'number' ? previousSnapshot.price : undefined
    const prevValueTwd = typeof previousSnapshot?.valueTwd === 'number' ? previousSnapshot.valueTwd : undefined
    const hasPreviousSnapshot = Boolean(previousSnapshot)
    const priceChange = hasLatestPrice && typeof prevPrice === 'number'
      ? latestSnapshot.price - prevPrice
      : undefined
    const valueChangeTwd = typeof latestValueTwd === 'number' && typeof prevValueTwd === 'number'
      ? latestValueTwd - prevValueTwd
      : undefined
    const priceChangePct = typeof priceChange === 'number' && typeof prevPrice === 'number' && prevPrice !== 0
      ? (priceChange / prevPrice) * 100
      : null
    const valueChangePct = typeof valueChangeTwd === 'number' && typeof prevValueTwd === 'number' && prevValueTwd !== 0
      ? (valueChangeTwd / prevValueTwd) * 100
      : null

    const row = {
      id: holding.id,
      symbol: holding.symbol,
      companyName: holding.companyName,
      market: holding.market,
      assetTag: holding.assetTag || defaultTag,
      assetTagLabel: tagLabelMap.get(holding.assetTag || defaultTag) || (holding.assetTag || defaultTag),
      shares: holding.shares,
      latestPrice: latestSnapshot?.price,
      prevPrice,
      priceChange,
      priceChangePct,
      latestValueTwd,
      prevValueTwd,
      valueChangeTwd,
      valueChangePct,
      hasPreviousSnapshot,
      latestCurrency: latestSnapshot?.currency,
      latestCapturedAt: latestSnapshot?.capturedAt,
    }

    if (typeof row.latestValueTwd === 'number') {
      stockTotalTwd += row.latestValueTwd
    }

    rows.push(row)
  }

  let baselineStockTotalTwd = 0
  for (const holding of allHoldings) {
    if (holding.deletedAt && holding.deletedAt <= baselineAt) {
      continue
    }
    const baselineSnapshot = await getLatestSnapshotAtOrBefore(holding.id, baselineAt)
    if (typeof baselineSnapshot?.valueTwd === 'number') {
      baselineStockTotalTwd += baselineSnapshot.valueTwd
    }
  }

  let baselineCashTotalTwd = 0
  for (const cashAccount of allCashAccounts) {
    if (cashAccount.deletedAt && cashAccount.deletedAt <= baselineAt) {
      continue
    }
    const baselineSnapshot = await getLatestCashBalanceSnapshotAtOrBefore(cashAccount.id, baselineAt)
    if (typeof baselineSnapshot?.balanceTwd === 'number') {
      baselineCashTotalTwd += baselineSnapshot.balanceTwd
    }
  }

  const syncMeta = await db.sync_meta.get(SYNC_KEY_PRICES)
  const cashView = await getCashAccountsView()
  const totalTwd = stockTotalTwd + cashView.totalCashTwd
  const baselineTotalTwd = baselineStockTotalTwd + baselineCashTotalTwd
  const totalChangeTwd = totalTwd - baselineTotalTwd
  const totalChangePct = Number.isFinite(baselineTotalTwd) && baselineTotalTwd !== 0
    ? (totalChangeTwd / baselineTotalTwd) * 100
    : null

  return {
    rows,
    cashRows: cashView.rows,
    stockTotalTwd,
    totalCashTwd: cashView.totalCashTwd,
    totalTwd,
    baselineAt,
    baselineTotalTwd,
    totalChangeTwd,
    totalChangePct,
    lastUpdatedAt: syncMeta?.lastUpdatedAt,
    syncStatus: syncMeta?.status,
    syncError: syncMeta?.errorMessage,
    cloudSyncState: syncMeta?.syncState ?? SYNC_SYNCED,
  }
}

export const getTrend = async (range) => {
  const pointCount = TREND_RANGE_DAYS[range] ?? TREND_RANGE_DAYS['24h']
  const latestCompletedDayEnd = dayjs().tz('Asia/Taipei').subtract(1, 'day').endOf('day')

  const cutoffs = []
  for (let i = pointCount - 1; i >= 0; i -= 1) {
    cutoffs.push(latestCompletedDayEnd.subtract(i, 'day'))
  }

  const allHoldings = await db.holdings.toArray()
  const allCashAccounts = await db.cash_accounts.toArray()

  const stockSnapshotsByHolding = new Map()
  for (const holding of allHoldings) {
    const snapshots = await db.price_snapshots
      .where('[holdingId+capturedAt]')
      .between([holding.id, Dexie.minKey], [holding.id, Dexie.maxKey], true, true)
      .toArray()
    stockSnapshotsByHolding.set(holding.id, snapshots)
  }

  const cashSnapshotsByAccount = new Map()
  for (const cashAccount of allCashAccounts) {
    const snapshots = await db.cash_balance_snapshots
      .where('[cashAccountId+capturedAt]')
      .between([cashAccount.id, Dexie.minKey], [cashAccount.id, Dexie.maxKey], true, true)
      .toArray()
    cashSnapshotsByAccount.set(cashAccount.id, snapshots)
  }

  const findLatestAtOrBefore = (snapshots, cutoffIso) => {
    for (let i = snapshots.length - 1; i >= 0; i -= 1) {
      const snapshot = snapshots[i]
      if (snapshot.capturedAt > cutoffIso) {
        continue
      }
      if (!isDeleted(snapshot)) {
        return snapshot
      }
    }
    return undefined
  }

  return cutoffs.map((cutoff) => {
    const cutoffIso = cutoff.utc().toISOString()

    let stockTotalTwd = 0
    for (const holding of allHoldings) {
      if (holding.deletedAt && holding.deletedAt <= cutoffIso) {
        continue
      }
      const snapshots = stockSnapshotsByHolding.get(holding.id) || []
      const snapshot = findLatestAtOrBefore(snapshots, cutoffIso)
      if (typeof snapshot?.valueTwd === 'number') {
        stockTotalTwd += snapshot.valueTwd
      }
    }

    let cashTotalTwd = 0
    for (const cashAccount of allCashAccounts) {
      if (cashAccount.deletedAt && cashAccount.deletedAt <= cutoffIso) {
        continue
      }
      const snapshots = cashSnapshotsByAccount.get(cashAccount.id) || []
      const snapshot = findLatestAtOrBefore(snapshots, cutoffIso)
      if (typeof snapshot?.balanceTwd === 'number') {
        cashTotalTwd += snapshot.balanceTwd
      }
    }

    return {
      ts: cutoffIso,
      totalTwd: stockTotalTwd + cashTotalTwd,
    }
  })
}
