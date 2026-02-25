import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import {
  db,
  DB_MAX_KEY,
  DB_MIN_KEY,
  FX_PAIR_USD_TWD,
  SYNC_KEY_PRICES,
} from '../db/database'
import { getUsdTwdRate } from './priceProviders/fxProvider'
import { getHoldingQuote, sleepForRateLimit } from './priceProviders/finnhubProvider'
import {
  getSyncRuntimeState,
  initCloudSync,
  writeCollectionRecord,
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
  EXPENSE_ENTRIES: 'expense_entries',
  EXPENSE_CATEGORIES: 'expense_categories',
  BUDGETS: 'budgets',
}

const TREND_RANGE_DAYS = {
  '24h': 2,
  '7d': 7,
  '30d': 30,
}

const EXPENSE_ENTRY_TYPE = {
  ONE_TIME: 'ONE_TIME',
  RECURRING: 'RECURRING',
}

const RECURRENCE_TYPE = {
  MONTHLY: 'MONTHLY',
  YEARLY: 'YEARLY',
}

const BUDGET_TYPE = {
  MONTHLY: 'MONTHLY',
  QUARTERLY: 'QUARTERLY',
  YEARLY: 'YEARLY',
}

const EXPENSE_PAYER_OPTIONS = ['Po', 'Wei', '共同帳戶']
const EXPENSE_KIND_OPTIONS = ['家庭', '個人']

const isDeleted = (item) => Boolean(item?.deletedAt)

const getNowIso = () => new Date().toISOString()
const getNowDate = () => dayjs().format('YYYY-MM-DD')
const makeRemoteKey = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`

const normalizeDateOnly = (value) => {
  const parsed = dayjs(value)
  if (!parsed.isValid()) {
    return null
  }
  return parsed.format('YYYY-MM-DD')
}

const toDayjsDateOnly = (value) => dayjs(normalizeDateOnly(value))

const mirrorToCloud = async (collectionName, record) => {
  await writeCollectionRecord({ collectionName, record })
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
    .between([holdingId, DB_MIN_KEY], [holdingId, DB_MAX_KEY])
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
    .between([holdingId, DB_MIN_KEY], [holdingId, baselineAtIso], true, true)
    .reverse()
    .toArray()

  return snapshots.find((item) => !isDeleted(item))
}

const getLatestCashBalanceSnapshotAtOrBefore = async (cashAccountId, baselineAtIso) => {
  const snapshots = await db.cash_balance_snapshots
    .where('[cashAccountId+capturedAt]')
    .between([cashAccountId, DB_MIN_KEY], [cashAccountId, baselineAtIso], true, true)
    .reverse()
    .toArray()

  return snapshots.find((item) => !isDeleted(item))
}

const getEarliestCashBalanceSnapshotAfter = async (cashAccountId, baselineAtIso) => {
  const snapshots = await db.cash_balance_snapshots
    .where('[cashAccountId+capturedAt]')
    .between([cashAccountId, baselineAtIso], [cashAccountId, DB_MAX_KEY], false, true)
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
  void uid
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

export const refreshPrices = async ({ market: inputMarket = 'ALL' } = {}) => {
  const normalized = String(inputMarket ?? 'ALL').toUpperCase()
  const market = (normalized === 'TW' || normalized === 'US' || normalized === 'ALL')
    ? normalized
    : 'ALL'

  const holdings = await getActiveHoldings()
  const targetHoldings = market === 'ALL'
    ? holdings
    : holdings.filter((item) => item.market === market)

  if (targetHoldings.length === 0) {
    const lastUpdatedAt = await setSyncMeta({ status: 'success' })
    return {
      updatedCount: 0,
      targetCount: 0,
      market,
      lastUpdatedAt,
    }
  }

  const usHoldings = targetHoldings.filter((item) => item.market === MARKET.US)

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

    for (let i = 0; i < targetHoldings.length; i += 1) {
      if (i > 0) {
        await sleepForRateLimit(1_200)
      }

      const holding = targetHoldings[i]
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
      targetCount: targetHoldings.length,
      market,
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

  const nowTs = Date.now()
  const beforeIso = new Date(nowTs - 1).toISOString()
  const afterIso = new Date(nowTs).toISOString()

  // Capture "before" value first so baseline fallback can infer delta correctly
  // for legacy accounts that had no historical cash snapshots.
  await recordCashBalanceSnapshot({
    cashAccount: existing,
    balanceTwd: existing.balanceTwd,
    capturedAt: beforeIso,
  })

  await db.cash_accounts.update(parsedId, {
    balanceTwd: parsedBalance,
    updatedAt: afterIso,
    syncState: SYNC_PENDING,
  })
  const updatedCash = await db.cash_accounts.get(parsedId)
  if (updatedCash) {
    await mirrorToCloud(CLOUD_COLLECTION.CASH_ACCOUNTS, updatedCash)
    await recordCashBalanceSnapshot({
      cashAccount: updatedCash,
      balanceTwd: parsedBalance,
      capturedAt: afterIso,
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
      continue
    }

    // Legacy fallback: if there is no snapshot at/before baseline, use the first
    // snapshot after baseline as an approximation of baseline value.
    const firstSnapshotAfterBaseline = await getEarliestCashBalanceSnapshotAfter(cashAccount.id, baselineAt)
    if (typeof firstSnapshotAfterBaseline?.balanceTwd === 'number') {
      baselineCashTotalTwd += firstSnapshotAfterBaseline.balanceTwd
      continue
    }

    // Backward compatibility: older cash accounts may not have balance snapshots yet.
    // If account was already created and not updated after baseline time, treat current
    // balance as the baseline value.
    if (
      cashAccount.createdAt &&
      cashAccount.createdAt <= baselineAt &&
      cashAccount.updatedAt &&
      cashAccount.updatedAt <= baselineAt
    ) {
      const fallbackBalance = Number(cashAccount.balanceTwd)
      if (Number.isFinite(fallbackBalance)) {
        baselineCashTotalTwd += fallbackBalance
      }
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
    baselineStockTotalTwd,
    baselineCashTotalTwd,
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
      .between([holding.id, DB_MIN_KEY], [holding.id, DB_MAX_KEY], true, true)
      .toArray()
    stockSnapshotsByHolding.set(holding.id, snapshots)
  }

  const cashSnapshotsByAccount = new Map()
  for (const cashAccount of allCashAccounts) {
    const snapshots = await db.cash_balance_snapshots
      .where('[cashAccountId+capturedAt]')
      .between([cashAccount.id, DB_MIN_KEY], [cashAccount.id, DB_MAX_KEY], true, true)
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

const monthRange = (month) => {
  const parsed = dayjs(`${month}-01`)
  const start = parsed.startOf('month')
  const end = parsed.endOf('month')
  return { start, end }
}

const clampDayInMonth = (date, day) => {
  const daysInMonth = date.daysInMonth()
  return Math.min(Math.max(1, day), daysInMonth)
}

const resolveRecurringOccurrenceDate = (entry, monthStart) => {
  if (entry.recurrenceType === RECURRENCE_TYPE.MONTHLY) {
    const day = Number(entry.monthlyDay || toDayjsDateOnly(entry.occurredAt).date())
    const d = clampDayInMonth(monthStart, day)
    return monthStart.date(d)
  }

  if (entry.recurrenceType === RECURRENCE_TYPE.YEARLY) {
    const month = Number(entry.yearlyMonth || toDayjsDateOnly(entry.occurredAt).month() + 1)
    const day = Number(entry.yearlyDay || toDayjsDateOnly(entry.occurredAt).date())
    const candidateMonth = monthStart.month() + 1
    if (candidateMonth !== month) {
      return null
    }
    const d = clampDayInMonth(monthStart, day)
    return monthStart.date(d)
  }

  return null
}

const entryIsActiveOnDate = (entry, dateObj) => {
  const start = toDayjsDateOnly(entry.occurredAt)
  if (!start.isValid() || dateObj.isBefore(start, 'day')) {
    return false
  }
  if (entry.recurrenceUntil) {
    const until = toDayjsDateOnly(entry.recurrenceUntil)
    if (until.isValid() && dateObj.isAfter(until, 'day')) {
      return false
    }
  }
  return true
}

const expandRecurringOccurrencesForMonth = (entries, month) => {
  const { start, end } = monthRange(month)
  const rows = []

  for (const entry of entries) {
    if (isDeleted(entry)) {
      continue
    }

    if (entry.entryType !== EXPENSE_ENTRY_TYPE.RECURRING) {
      const occurred = toDayjsDateOnly(entry.occurredAt)
      if (occurred.isValid() && !occurred.isBefore(start, 'day') && !occurred.isAfter(end, 'day')) {
        rows.push({
          ...entry,
          occurrenceDate: occurred.format('YYYY-MM-DD'),
          isRecurringOccurrence: false,
        })
      }
      continue
    }

    const occurrence = resolveRecurringOccurrenceDate(entry, start.clone())
    if (!occurrence || occurrence.isBefore(start, 'day') || occurrence.isAfter(end, 'day')) {
      continue
    }
    if (!entryIsActiveOnDate(entry, occurrence)) {
      continue
    }
    rows.push({
      ...entry,
      occurrenceDate: occurrence.format('YYYY-MM-DD'),
      isRecurringOccurrence: true,
    })
  }

  rows.sort((a, b) => {
    const aCreatedAt = a.createdAt || ''
    const bCreatedAt = b.createdAt || ''
    if (aCreatedAt !== bCreatedAt) {
      return bCreatedAt.localeCompare(aCreatedAt)
    }

    const aUpdatedAt = a.updatedAt || ''
    const bUpdatedAt = b.updatedAt || ''
    if (aUpdatedAt !== bUpdatedAt) {
      return bUpdatedAt.localeCompare(aUpdatedAt)
    }

    const aOccurrence = a.occurrenceDate || ''
    const bOccurrence = b.occurrenceDate || ''
    if (aOccurrence !== bOccurrence) {
      return bOccurrence.localeCompare(aOccurrence)
    }

    const aId = Number(a.id)
    const bId = Number(b.id)
    if (Number.isFinite(aId) && Number.isFinite(bId) && aId !== bId) {
      return bId - aId
    }
    return 0
  })

  return rows
}

const computeCumulativeExpenseTotal = (entries, endDateInput = getNowDate()) => {
  const endDate = toDayjsDateOnly(endDateInput)
  if (!endDate.isValid()) {
    return 0
  }

  let total = 0

  for (const entry of entries) {
    if (isDeleted(entry)) {
      continue
    }

    const amount = Number(entry.amountTwd) || 0
    if (amount <= 0) {
      continue
    }

    if (entry.entryType !== EXPENSE_ENTRY_TYPE.RECURRING) {
      const occurred = toDayjsDateOnly(entry.occurredAt)
      if (occurred.isValid() && !occurred.isAfter(endDate, 'day')) {
        total += amount
      }
      continue
    }

    const start = toDayjsDateOnly(entry.occurredAt)
    if (!start.isValid() || start.isAfter(endDate, 'day')) {
      continue
    }

    const until = entry.recurrenceUntil
      ? toDayjsDateOnly(entry.recurrenceUntil)
      : endDate
    const limit = until.isValid() && until.isBefore(endDate, 'day') ? until : endDate

    let cursor = start.startOf('month')
    while (!cursor.isAfter(limit, 'month')) {
      const occurrence = resolveRecurringOccurrenceDate(entry, cursor.clone())
      if (
        occurrence &&
        !occurrence.isBefore(start, 'day') &&
        !occurrence.isAfter(limit, 'day') &&
        entryIsActiveOnDate(entry, occurrence)
      ) {
        total += amount
      }
      cursor = cursor.add(1, 'month')
    }
  }

  return total
}

const getBudgetCycleRange = (budget, refDateInput = getNowDate()) => {
  const start = toDayjsDateOnly(budget.startDate)
  const refDate = toDayjsDateOnly(refDateInput)
  if (!start.isValid() || !refDate.isValid() || refDate.isBefore(start, 'day')) {
    return null
  }

  const monthsPerCycle = budget.budgetType === BUDGET_TYPE.MONTHLY
    ? 1
    : budget.budgetType === BUDGET_TYPE.QUARTERLY
      ? 3
      : 12

  const monthsDiff = refDate.diff(start, 'month')
  const cycleIndex = Math.floor(Math.max(0, monthsDiff) / monthsPerCycle)
  const cycleStart = start.add(cycleIndex * monthsPerCycle, 'month')
  const cycleEnd = cycleStart.add(monthsPerCycle, 'month').subtract(1, 'day')

  return {
    cycleStart: cycleStart.format('YYYY-MM-DD'),
    cycleEnd: cycleEnd.format('YYYY-MM-DD'),
  }
}

const computeBudgetRemaining = ({ budget, entries, cycleRange }) => {
  if (!cycleRange) {
    return {
      spentTwd: 0,
      remainingTwd: Number(budget.amountTwd) || 0,
      progressPct: 0,
    }
  }

  const start = toDayjsDateOnly(cycleRange.cycleStart)
  const end = toDayjsDateOnly(cycleRange.cycleEnd)
  let spentTwd = 0

  for (const entry of entries) {
    if (isDeleted(entry)) continue
    if (entry.budgetId !== budget.id) continue

    const amount = Number(entry.amountTwd) || 0
    if (amount <= 0) continue

    if (entry.entryType !== EXPENSE_ENTRY_TYPE.RECURRING) {
      const occurred = toDayjsDateOnly(entry.occurredAt)
      if (!occurred.isValid()) continue
      if (occurred.isBefore(start, 'day') || occurred.isAfter(end, 'day')) continue
      spentTwd += amount
      continue
    }

    const recurringStart = toDayjsDateOnly(entry.occurredAt)
    if (!recurringStart.isValid()) continue

    const until = entry.recurrenceUntil ? toDayjsDateOnly(entry.recurrenceUntil) : end
    const limit = until.isValid() && until.isBefore(end, 'day') ? until : end
    if (limit.isBefore(start, 'day')) continue

    let cursor = start.startOf('month')
    while (!cursor.isAfter(end, 'month')) {
      const occurrence = resolveRecurringOccurrenceDate(entry, cursor.clone())
      if (
        occurrence &&
        !occurrence.isBefore(start, 'day') &&
        !occurrence.isAfter(limit, 'day') &&
        !occurrence.isBefore(recurringStart, 'day') &&
        entryIsActiveOnDate(entry, occurrence)
      ) {
        spentTwd += amount
      }
      cursor = cursor.add(1, 'month')
    }
  }

  const total = Number(budget.amountTwd) || 0
  const remaining = total - spentTwd
  return {
    spentTwd,
    remainingTwd: remaining,
    progressPct: total > 0 ? Math.min(100, Math.max(0, (spentTwd / total) * 100)) : 0,
  }
}

export const upsertExpenseCategory = async ({ id, name }) => {
  const normalizedName = String(name || '').trim()
  if (!normalizedName) {
    throw new Error('Category name is required')
  }

  const nowIso = getNowIso()
  const parsedId = Number(id)
  if (Number.isInteger(parsedId) && parsedId > 0) {
    const existing = await db.expense_categories.get(parsedId)
    if (!existing || isDeleted(existing)) {
      throw new Error('Category not found')
    }
    await db.expense_categories.update(parsedId, {
      name: normalizedName,
      updatedAt: nowIso,
      syncState: SYNC_PENDING,
    })
    const updated = await db.expense_categories.get(parsedId)
    if (updated) {
      await mirrorToCloud(CLOUD_COLLECTION.EXPENSE_CATEGORIES, updated)
    }
    return { id: parsedId, created: false }
  }

  const remoteKey = makeRemoteKey('category')
  const newId = await db.expense_categories.add({
    remoteKey,
    name: normalizedName,
    createdAt: nowIso,
    updatedAt: nowIso,
    deletedAt: null,
    syncState: SYNC_PENDING,
  })
  const inserted = await db.expense_categories.get(newId)
  if (inserted) {
    await mirrorToCloud(CLOUD_COLLECTION.EXPENSE_CATEGORIES, inserted)
  }
  return { id: newId, created: true }
}

export const removeExpenseCategory = async ({ id }) => {
  const parsedId = Number(id)
  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    throw new Error('Category not found')
  }
  const existing = await db.expense_categories.get(parsedId)
  if (!existing || isDeleted(existing)) {
    throw new Error('Category not found')
  }
  const nowIso = getNowIso()
  await db.expense_categories.update(parsedId, {
    deletedAt: nowIso,
    updatedAt: nowIso,
    syncState: SYNC_PENDING,
  })

  const entries = await db.expense_entries.where('categoryId').equals(parsedId).toArray()
  for (const entry of entries) {
    await db.expense_entries.update(entry.id, {
      categoryId: null,
      updatedAt: nowIso,
      syncState: SYNC_PENDING,
    })
  }

  const deleted = await db.expense_categories.get(parsedId)
  if (deleted) {
    await mirrorToCloud(CLOUD_COLLECTION.EXPENSE_CATEGORIES, deleted)
  }
  const updatedEntries = await db.expense_entries.where('categoryId').equals(null).toArray()
  for (const entry of updatedEntries) {
    if (entry.updatedAt === nowIso) {
      await mirrorToCloud(CLOUD_COLLECTION.EXPENSE_ENTRIES, entry)
    }
  }
}

export const upsertBudget = async ({ id, name, amountTwd, budgetType, startDate }) => {
  const normalizedName = String(name || '').trim()
  const normalizedStartDate = normalizeDateOnly(startDate)
  const normalizedType = String(budgetType || '').toUpperCase()
  const parsedAmount = Number(amountTwd)
  if (!normalizedName) throw new Error('Budget name is required')
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) throw new Error('Budget amount must be positive')
  if (![BUDGET_TYPE.MONTHLY, BUDGET_TYPE.QUARTERLY, BUDGET_TYPE.YEARLY].includes(normalizedType)) {
    throw new Error('Invalid budget type')
  }
  if (!normalizedStartDate) throw new Error('Budget start date is required')

  const nowIso = getNowIso()
  const parsedId = Number(id)
  if (Number.isInteger(parsedId) && parsedId > 0) {
    const existing = await db.budgets.get(parsedId)
    if (!existing || isDeleted(existing)) throw new Error('Budget not found')
    await db.budgets.update(parsedId, {
      name: normalizedName,
      amountTwd: parsedAmount,
      budgetType: normalizedType,
      startDate: normalizedStartDate,
      updatedAt: nowIso,
      syncState: SYNC_PENDING,
    })
    const updated = await db.budgets.get(parsedId)
    if (updated) {
      await mirrorToCloud(CLOUD_COLLECTION.BUDGETS, updated)
    }
    return { id: parsedId, created: false }
  }

  const remoteKey = makeRemoteKey('budget')
  const newId = await db.budgets.add({
    remoteKey,
    name: normalizedName,
    amountTwd: parsedAmount,
    budgetType: normalizedType,
    startDate: normalizedStartDate,
    createdAt: nowIso,
    updatedAt: nowIso,
    deletedAt: null,
    syncState: SYNC_PENDING,
  })
  const inserted = await db.budgets.get(newId)
  if (inserted) {
    await mirrorToCloud(CLOUD_COLLECTION.BUDGETS, inserted)
  }
  return { id: newId, created: true }
}

export const removeBudget = async ({ id }) => {
  const parsedId = Number(id)
  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    throw new Error('Budget not found')
  }
  const existing = await db.budgets.get(parsedId)
  if (!existing || isDeleted(existing)) {
    throw new Error('Budget not found')
  }
  const nowIso = getNowIso()
  await db.budgets.update(parsedId, {
    deletedAt: nowIso,
    updatedAt: nowIso,
    syncState: SYNC_PENDING,
  })
  const entries = await db.expense_entries.where('budgetId').equals(parsedId).toArray()
  for (const entry of entries) {
    await db.expense_entries.update(entry.id, {
      budgetId: null,
      updatedAt: nowIso,
      syncState: SYNC_PENDING,
    })
  }
  const deleted = await db.budgets.get(parsedId)
  if (deleted) {
    await mirrorToCloud(CLOUD_COLLECTION.BUDGETS, deleted)
  }
  const maybeUpdatedEntries = await db.expense_entries.where('budgetId').equals(null).toArray()
  for (const entry of maybeUpdatedEntries) {
    if (entry.updatedAt === nowIso) {
      await mirrorToCloud(CLOUD_COLLECTION.EXPENSE_ENTRIES, entry)
    }
  }
}

export const upsertExpenseEntry = async (input) => {
  const nowIso = getNowIso()
  const name = String(input?.name || '').trim()
  const payerRaw = String(input?.payer || '').trim()
  const normalizedPayerRaw = payerRaw === '共同' ? '共同帳戶' : payerRaw
  const payer = EXPENSE_PAYER_OPTIONS.includes(normalizedPayerRaw) ? normalizedPayerRaw : null
  const expenseKindRaw = String(input?.expenseKind || '').trim()
  const expenseKind = EXPENSE_KIND_OPTIONS.includes(expenseKindRaw) ? expenseKindRaw : null
  const amountTwd = Number(input?.amountTwd)
  const occurredAt = normalizeDateOnly(input?.occurredAt) || getNowDate()
  const entryType = String(input?.entryType || EXPENSE_ENTRY_TYPE.ONE_TIME).toUpperCase()
  const recurrenceType = input?.recurrenceType ? String(input.recurrenceType).toUpperCase() : null
  const monthlyDay = input?.monthlyDay ? Number(input.monthlyDay) : null
  const yearlyMonth = input?.yearlyMonth ? Number(input.yearlyMonth) : null
  const yearlyDay = input?.yearlyDay ? Number(input.yearlyDay) : null
  const categoryId = input?.categoryId ? Number(input.categoryId) : null
  const budgetId = input?.budgetId ? Number(input.budgetId) : null

  if (!name) throw new Error('Expense name is required')
  if (!Number.isFinite(amountTwd) || amountTwd <= 0) throw new Error('Expense amount must be positive')
  if (!occurredAt) throw new Error('Expense date is required')
  if (![EXPENSE_ENTRY_TYPE.ONE_TIME, EXPENSE_ENTRY_TYPE.RECURRING].includes(entryType)) {
    throw new Error('Invalid expense type')
  }
  if (entryType === EXPENSE_ENTRY_TYPE.RECURRING) {
    if (![RECURRENCE_TYPE.MONTHLY, RECURRENCE_TYPE.YEARLY].includes(recurrenceType)) {
      throw new Error('Invalid recurrence type')
    }
    if (recurrenceType === RECURRENCE_TYPE.MONTHLY && (!Number.isInteger(monthlyDay) || monthlyDay < 1 || monthlyDay > 31)) {
      throw new Error('Monthly day must be between 1 and 31')
    }
    if (recurrenceType === RECURRENCE_TYPE.YEARLY) {
      if (!Number.isInteger(yearlyMonth) || yearlyMonth < 1 || yearlyMonth > 12) {
        throw new Error('Yearly month must be between 1 and 12')
      }
      if (!Number.isInteger(yearlyDay) || yearlyDay < 1 || yearlyDay > 31) {
        throw new Error('Yearly day must be between 1 and 31')
      }
    }
  }

  const parsedId = Number(input?.id)
  if (Number.isInteger(parsedId) && parsedId > 0) {
    const existing = await db.expense_entries.get(parsedId)
    if (!existing || isDeleted(existing)) {
      throw new Error('Expense not found')
    }

    const today = getNowDate()
    const editingRecurringFutureOnly = existing.entryType === EXPENSE_ENTRY_TYPE.RECURRING
      && existing.recurrenceUntil == null
      && toDayjsDateOnly(existing.occurredAt).isBefore(toDayjsDateOnly(today), 'day')
      && entryType === EXPENSE_ENTRY_TYPE.RECURRING

    if (editingRecurringFutureOnly) {
      const until = dayjs(today).subtract(1, 'day').format('YYYY-MM-DD')
      await db.expense_entries.update(parsedId, {
        recurrenceUntil: until,
        updatedAt: nowIso,
        syncState: SYNC_PENDING,
      })
      const closed = await db.expense_entries.get(parsedId)
      if (closed) await mirrorToCloud(CLOUD_COLLECTION.EXPENSE_ENTRIES, closed)

      const newId = await db.expense_entries.add({
        remoteKey: makeRemoteKey('expense'),
        name,
        payer,
        expenseKind,
        amountTwd,
        occurredAt: today,
        entryType,
        recurrenceType: recurrenceType ?? null,
        monthlyDay: recurrenceType === RECURRENCE_TYPE.MONTHLY ? monthlyDay : null,
        yearlyMonth: recurrenceType === RECURRENCE_TYPE.YEARLY ? yearlyMonth : null,
        yearlyDay: recurrenceType === RECURRENCE_TYPE.YEARLY ? yearlyDay : null,
        recurrenceUntil: null,
        categoryId: Number.isInteger(categoryId) ? categoryId : null,
        budgetId: Number.isInteger(budgetId) ? budgetId : null,
        createdAt: nowIso,
        updatedAt: nowIso,
        deletedAt: null,
        syncState: SYNC_PENDING,
      })
      const inserted = await db.expense_entries.get(newId)
      if (inserted) await mirrorToCloud(CLOUD_COLLECTION.EXPENSE_ENTRIES, inserted)
      return { id: newId, created: true }
    }

    await db.expense_entries.update(parsedId, {
      name,
      payer,
      expenseKind,
      amountTwd,
      occurredAt,
      entryType,
      recurrenceType: entryType === EXPENSE_ENTRY_TYPE.RECURRING ? recurrenceType : null,
      monthlyDay: entryType === EXPENSE_ENTRY_TYPE.RECURRING && recurrenceType === RECURRENCE_TYPE.MONTHLY ? monthlyDay : null,
      yearlyMonth: entryType === EXPENSE_ENTRY_TYPE.RECURRING && recurrenceType === RECURRENCE_TYPE.YEARLY ? yearlyMonth : null,
      yearlyDay: entryType === EXPENSE_ENTRY_TYPE.RECURRING && recurrenceType === RECURRENCE_TYPE.YEARLY ? yearlyDay : null,
      categoryId: Number.isInteger(categoryId) ? categoryId : null,
      budgetId: Number.isInteger(budgetId) ? budgetId : null,
      updatedAt: nowIso,
      syncState: SYNC_PENDING,
    })
    const updated = await db.expense_entries.get(parsedId)
    if (updated) await mirrorToCloud(CLOUD_COLLECTION.EXPENSE_ENTRIES, updated)
    return { id: parsedId, created: false }
  }

  const remoteKey = makeRemoteKey('expense')
  const newId = await db.expense_entries.add({
    remoteKey,
    name,
    payer,
    expenseKind,
    amountTwd,
    occurredAt,
    entryType,
    recurrenceType: entryType === EXPENSE_ENTRY_TYPE.RECURRING ? recurrenceType : null,
    monthlyDay: entryType === EXPENSE_ENTRY_TYPE.RECURRING && recurrenceType === RECURRENCE_TYPE.MONTHLY ? monthlyDay : null,
    yearlyMonth: entryType === EXPENSE_ENTRY_TYPE.RECURRING && recurrenceType === RECURRENCE_TYPE.YEARLY ? yearlyMonth : null,
    yearlyDay: entryType === EXPENSE_ENTRY_TYPE.RECURRING && recurrenceType === RECURRENCE_TYPE.YEARLY ? yearlyDay : null,
    recurrenceUntil: null,
    categoryId: Number.isInteger(categoryId) ? categoryId : null,
    budgetId: Number.isInteger(budgetId) ? budgetId : null,
    createdAt: nowIso,
    updatedAt: nowIso,
    deletedAt: null,
    syncState: SYNC_PENDING,
  })
  const inserted = await db.expense_entries.get(newId)
  if (inserted) await mirrorToCloud(CLOUD_COLLECTION.EXPENSE_ENTRIES, inserted)
  return { id: newId, created: true }
}

export const removeExpenseEntry = async ({ id }) => {
  const parsedId = Number(id)
  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    throw new Error('Expense not found')
  }
  const existing = await db.expense_entries.get(parsedId)
  if (!existing || isDeleted(existing)) {
    throw new Error('Expense not found')
  }
  const nowIso = getNowIso()
  await db.expense_entries.update(parsedId, {
    deletedAt: nowIso,
    updatedAt: nowIso,
    syncState: SYNC_PENDING,
  })
  const deleted = await db.expense_entries.get(parsedId)
  if (deleted) await mirrorToCloud(CLOUD_COLLECTION.EXPENSE_ENTRIES, deleted)
}

export const getExpenseMonthOptions = async () => {
  const entries = (await db.expense_entries.toArray()).filter((item) => !isDeleted(item))
  const nowMonth = dayjs().format('YYYY-MM')
  let firstMonth = null
  let lastMonth = null

  for (const entry of entries) {
    const occurred = normalizeDateOnly(entry.occurredAt)
    if (!occurred) continue
    const monthValue = occurred.slice(0, 7)
    if (!firstMonth || monthValue < firstMonth) {
      firstMonth = monthValue
    }
    if (!lastMonth || monthValue > lastMonth) {
      lastMonth = monthValue
    }

    if (entry.entryType === EXPENSE_ENTRY_TYPE.RECURRING && entry.recurrenceUntil) {
      const until = normalizeDateOnly(entry.recurrenceUntil)
      if (until) {
        const untilMonth = until.slice(0, 7)
        if (!lastMonth || untilMonth > lastMonth) {
          lastMonth = untilMonth
        }
      }
    }
  }

  if (!firstMonth) {
    return [nowMonth]
  }

  const options = []
  let cursor = dayjs(`${firstMonth}-01`)
  const endMonth = lastMonth && lastMonth > nowMonth ? lastMonth : nowMonth
  const end = dayjs(`${endMonth}-01`)

  while (!cursor.isAfter(end, 'month')) {
    options.push(cursor.format('YYYY-MM'))
    cursor = cursor.add(1, 'month')
  }

  return options
}

export const getExpenseDashboardView = async (input = {}) => {
  const monthOptions = await getExpenseMonthOptions()
  const currentMonth = dayjs().format('YYYY-MM')
  const activeMonth = monthOptions.includes(input.month)
    ? input.month
    : (monthOptions.includes(currentMonth) ? currentMonth : monthOptions[monthOptions.length - 1])
  const entries = (await db.expense_entries.toArray()).filter((item) => !isDeleted(item))
  const categories = (await db.expense_categories.toArray()).filter((item) => !isDeleted(item))
  const budgets = (await db.budgets.toArray()).filter((item) => !isDeleted(item))

  const expenseRows = expandRecurringOccurrencesForMonth(entries, activeMonth).map((item) => ({
    id: item.id,
    name: item.name,
    payer: item.payer ?? null,
    expenseKind: item.expenseKind ?? null,
    amountTwd: Number(item.amountTwd) || 0,
    occurredAt: item.occurrenceDate,
    originalOccurredAt: item.occurredAt,
    entryType: item.entryType,
    recurrenceType: item.recurrenceType ?? null,
    monthlyDay: item.monthlyDay ?? null,
    yearlyMonth: item.yearlyMonth ?? null,
    yearlyDay: item.yearlyDay ?? null,
    categoryId: item.categoryId ?? null,
    budgetId: item.budgetId ?? null,
    isRecurringOccurrence: Boolean(item.isRecurringOccurrence),
    updatedAt: item.updatedAt,
  }))

  const categoryMap = new Map(categories.map((item) => [item.id, item.name]))
  const budgetMap = new Map(budgets.map((item) => [item.id, item.name]))
  const decoratedExpenseRows = expenseRows.map((row) => ({
    ...row,
    payerName: row.payer === '共同' ? '共同帳戶' : (row.payer || '未指定'),
    expenseKindName: row.expenseKind ? row.expenseKind : '未指定',
    categoryName: row.categoryId ? categoryMap.get(row.categoryId) || '未指定' : '未指定',
    budgetName: row.budgetId ? budgetMap.get(row.budgetId) || '未指定' : '未指定',
  }))
  const monthlyExpenseTotalTwd = decoratedExpenseRows.reduce(
    (sum, row) => sum + (Number(row.amountTwd) || 0),
    0,
  )
  const cumulativeExpenseTotalTwd = computeCumulativeExpenseTotal(entries, getNowDate())
  const firstExpenseDate = entries
    .map((entry) => normalizeDateOnly(entry.occurredAt))
    .filter(Boolean)
    .sort()[0] || null

  const today = getNowDate()
  const budgetRows = budgets.map((budget) => {
    const cycleRange = getBudgetCycleRange(budget, today)
    const stats = computeBudgetRemaining({
      budget,
      entries,
      cycleRange,
    })
    return {
      id: budget.id,
      name: budget.name,
      amountTwd: Number(budget.amountTwd) || 0,
      budgetType: budget.budgetType,
      startDate: budget.startDate,
      cycleStart: cycleRange?.cycleStart || null,
      cycleEnd: cycleRange?.cycleEnd || null,
      spentTwd: stats.spentTwd,
      remainingTwd: stats.remainingTwd,
      progressPct: stats.progressPct,
      updatedAt: budget.updatedAt,
    }
  })

  const selectableBudgets = budgetRows.filter((budget) => {
    if (!budget.cycleStart || !budget.cycleEnd) return false
    return today >= budget.cycleStart && today <= budget.cycleEnd
  })

  const recurringExpenseRows = entries
    .filter((entry) => entry.entryType === EXPENSE_ENTRY_TYPE.RECURRING)
    .map((entry) => ({
      id: entry.id,
      name: entry.name,
      amountTwd: Number(entry.amountTwd) || 0,
      recurrenceType: entry.recurrenceType ?? null,
      monthlyDay: entry.monthlyDay ?? null,
      yearlyMonth: entry.yearlyMonth ?? null,
      yearlyDay: entry.yearlyDay ?? null,
      recurrenceUntil: entry.recurrenceUntil ?? null,
      updatedAt: entry.updatedAt ?? null,
      createdAt: entry.createdAt ?? null,
    }))
    .sort((a, b) => {
      const updatedCompare = (b.updatedAt || '').localeCompare(a.updatedAt || '')
      if (updatedCompare !== 0) return updatedCompare
      const createdCompare = (b.createdAt || '').localeCompare(a.createdAt || '')
      if (createdCompare !== 0) return createdCompare
      return Number(b.id || 0) - Number(a.id || 0)
    })

  return {
    monthOptions,
    activeMonth,
    monthlyExpenseTotalTwd,
    cumulativeExpenseTotalTwd,
    firstExpenseDate,
    expenseRows: decoratedExpenseRows,
    categoryRows: categories
      .map((item) => ({ id: item.id, name: item.name, updatedAt: item.updatedAt }))
      .sort((a, b) => (a.updatedAt || '').localeCompare(b.updatedAt || ''))
      .reverse(),
    budgetRows: budgetRows
      .sort((a, b) => (a.updatedAt || '').localeCompare(b.updatedAt || ''))
      .reverse(),
    selectableBudgets: selectableBudgets.map((item) => ({ id: item.id, name: item.name })),
    recurringExpenseRows,
  }
}
