import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore'
import { db } from '../../db/database'
import { parseNumericLike } from '../../utils/number'
import { firestoreDb, assertFirebaseConfigured } from './firebaseApp'
import {
  buildCashBalanceSnapshotKey,
  buildCashAccountKey,
  buildBudgetKey,
  buildAppConfigKey,
  buildExpenseCategoryKey,
  buildExpenseEntryKey,
  buildHoldingKey,
  buildSnapshotKey,
  budgetToRemote,
  appConfigToRemote,
  cashBalanceSnapshotToRemote,
  cashAccountToRemote,
  expenseCategoryToRemote,
  expenseEntryToRemote,
  fxRateToRemote,
  holdingToRemote,
  isRemoteNewer,
  remoteToBudget,
  remoteToAppConfig,
  remoteToCashBalanceSnapshot,
  remoteToCashAccount,
  remoteToExpenseCategory,
  remoteToExpenseEntry,
  remoteToFxRate,
  remoteToHolding,
  remoteToSnapshot,
  remoteToSyncMeta,
  snapshotToRemote,
  syncMetaToRemote,
} from './firestoreMappers'

const SYNC_SYNCED = 'synced'
export const CLOUD_SYNC_UPDATED_EVENT = 'cloud-sync-updated'
const LOCAL_SYNC_UID_KEY = 'cloud_sync_last_uid'
const SYNC_READY_TIMEOUT_MS = 15_000
const MIGRATED_DOC_KEY_TTL_MS = 5 * 60 * 1000

const COLLECTIONS = {
  HOLDINGS: 'holdings',
  PRICE_SNAPSHOTS: 'price_snapshots',
  FX_RATES: 'fx_rates',
  SYNC_META: 'sync_meta',
  CASH_ACCOUNTS: 'cash_accounts',
  CASH_BALANCE_SNAPSHOTS: 'cash_balance_snapshots',
  EXPENSE_ENTRIES: 'expense_entries',
  EXPENSE_CATEGORIES: 'expense_categories',
  BUDGETS: 'budgets',
  APP_CONFIG: 'app_config',
}

let currentUid = null
let syncInFlight = null
let realtimeUnsubscribers = []
let onlineHandler = null
let offlineHandler = null
let firstSnapshotTracker = null
const migratedDocKeyTracker = new Map()

const runtimeState = {
  authenticated: false,
  connected: typeof navigator !== 'undefined' ? navigator.onLine : true,
  firestoreAvailable: Boolean(firestoreDb),
  listenersReady: false,
  outboxPending: 0,
  lastCloudApplyAt: null,
  lastOutboxFlushAt: null,
  lastError: '',
}

const getNowIso = () => new Date().toISOString()
const hasFirestore = () => Boolean(firestoreDb)
const isCloudReadOnly = () => (
  !runtimeState.authenticated
  || !runtimeState.connected
  || !runtimeState.listenersReady
  || !runtimeState.firestoreAvailable
)

const buildMigratedDocTrackerKey = ({ collectionName, docId }) => (
  `${collectionName}:${docId}`
)

const pruneMigratedDocKeyTracker = () => {
  const nowMs = Date.now()
  for (const [key, entry] of migratedDocKeyTracker.entries()) {
    if (!entry || nowMs - entry.recordedAtMs > MIGRATED_DOC_KEY_TTL_MS) {
      migratedDocKeyTracker.delete(key)
    }
  }
}

const shouldIgnoreMigratedDocEvent = ({ collectionName, docId, remoteUpdatedAt }) => {
  if (!collectionName || !docId) {
    return false
  }
  pruneMigratedDocKeyTracker()
  const entry = migratedDocKeyTracker.get(
    buildMigratedDocTrackerKey({ collectionName, docId }),
  )
  if (!entry) {
    return false
  }
  if (!remoteUpdatedAt) {
    return true
  }
  return !isRemoteNewer(entry.updatedAt, remoteUpdatedAt)
}

export const registerMigratedDocKey = ({ collectionName, docId, updatedAt }) => {
  if (!collectionName || !docId) {
    return
  }
  pruneMigratedDocKeyTracker()
  migratedDocKeyTracker.set(
    buildMigratedDocTrackerKey({ collectionName, docId }),
    {
      updatedAt: updatedAt ?? getNowIso(),
      recordedAtMs: Date.now(),
    },
  )
}

const setLastSyncedUid = (uid) => {
  if (typeof window === 'undefined') {
    return
  }
  try {
    if (uid) {
      window.localStorage.setItem(LOCAL_SYNC_UID_KEY, uid)
      return
    }
    window.localStorage.removeItem(LOCAL_SYNC_UID_KEY)
  } catch {
    // ignore localStorage failures
  }
}

const ensureFirestore = () => {
  assertFirebaseConfigured()
  if (!firestoreDb) {
    throw new Error('Firestore is unavailable.')
  }
  if (!currentUid) {
    throw new Error('No active sync user.')
  }
  return firestoreDb
}

export const assertCloudWriteReady = () => {
  if (!runtimeState.authenticated || !currentUid) {
    throw new Error('請先登入後再修改資料')
  }
  if (!runtimeState.firestoreAvailable) {
    throw new Error('Firebase 服務目前不可用')
  }
  if (!runtimeState.connected) {
    throw new Error('目前離線，暫時只能檢視資料')
  }
  if (!runtimeState.listenersReady) {
    throw new Error('雲端同步尚未完成，請稍後再試')
  }
}

const userCollection = (name) => (
  collection(ensureFirestore(), 'users', currentUid, name)
)

const emitCloudUpdated = () => {
  runtimeState.lastCloudApplyAt = getNowIso()
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CLOUD_SYNC_UPDATED_EVENT))
  }
}

const markFirstSnapshotReady = (name) => {
  if (!firstSnapshotTracker?.pending) {
    return
  }
  firstSnapshotTracker.pending.delete(name)
  if (firstSnapshotTracker.pending.size === 0) {
    runtimeState.listenersReady = true
    const waiters = firstSnapshotTracker.waiters.splice(0)
    waiters.forEach((resolve) => resolve())
  }
}

const waitForFirstSnapshotsReady = async (timeoutMs = SYNC_READY_TIMEOUT_MS) => {
  if (runtimeState.listenersReady) {
    return
  }

  await new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Cloud sync timeout after ${timeoutMs}ms`))
    }, timeoutMs)

    const done = () => {
      clearTimeout(timeoutId)
      resolve()
    }

    if (runtimeState.listenersReady) {
      done()
      return
    }

    if (!firstSnapshotTracker) {
      done()
      return
    }
    firstSnapshotTracker.waiters.push(done)
  })
}

const clearLocalCloudBackedData = async () => {
  await db.transaction(
    'rw',
    db.holdings,
    db.price_snapshots,
    db.fx_rates,
    db.sync_meta,
    db.cash_accounts,
    db.cash_balance_snapshots,
    db.expense_entries,
    db.expense_categories,
    db.budgets,
    db.app_config,
    async () => {
      await db.holdings.clear()
      await db.price_snapshots.clear()
      await db.fx_rates.clear()
      await db.sync_meta.clear()
      await db.cash_accounts.clear()
      await db.cash_balance_snapshots.clear()
      await db.expense_entries.clear()
      await db.expense_categories.clear()
      await db.budgets.clear()
      await db.app_config.clear()
    },
  )
}

const buildMutationPayload = ({ collectionName, record }) => {
  if (collectionName === COLLECTIONS.HOLDINGS) {
    return { docId: buildHoldingKey(record), payload: holdingToRemote(record) }
  }
  if (collectionName === COLLECTIONS.PRICE_SNAPSHOTS) {
    return { docId: buildSnapshotKey(record), payload: snapshotToRemote(record) }
  }
  if (collectionName === COLLECTIONS.FX_RATES) {
    return { docId: record.pair, payload: fxRateToRemote(record) }
  }
  if (collectionName === COLLECTIONS.SYNC_META) {
    return { docId: record.key, payload: syncMetaToRemote(record) }
  }
  if (collectionName === COLLECTIONS.CASH_ACCOUNTS) {
    return { docId: buildCashAccountKey(record), payload: cashAccountToRemote(record) }
  }
  if (collectionName === COLLECTIONS.CASH_BALANCE_SNAPSHOTS) {
    return { docId: buildCashBalanceSnapshotKey(record), payload: cashBalanceSnapshotToRemote(record) }
  }
  if (collectionName === COLLECTIONS.EXPENSE_ENTRIES) {
    return { docId: buildExpenseEntryKey(record), payload: expenseEntryToRemote(record) }
  }
  if (collectionName === COLLECTIONS.EXPENSE_CATEGORIES) {
    return { docId: buildExpenseCategoryKey(record), payload: expenseCategoryToRemote(record) }
  }
  if (collectionName === COLLECTIONS.BUDGETS) {
    return { docId: buildBudgetKey(record), payload: budgetToRemote(record) }
  }
  if (collectionName === COLLECTIONS.APP_CONFIG) {
    return { docId: buildAppConfigKey(record), payload: appConfigToRemote(record) }
  }
  throw new Error(`Unsupported collection for mutation: ${collectionName}`)
}

const resolveLocalExpenseCategoryId = async (remoteKey) => {
  if (!remoteKey) {
    return null
  }
  const category = await db.expense_categories.where('remoteKey').equals(remoteKey).first()
  return category?.id ?? null
}

const resolveLocalBudgetId = async (remoteKey) => {
  if (!remoteKey) {
    return null
  }
  const budget = await db.budgets.where('remoteKey').equals(remoteKey).first()
  return budget?.id ?? null
}

const relinkExpenseEntriesForCategory = async (remoteKey, categoryId) => {
  if (!remoteKey) {
    return
  }
  const entries = await db.expense_entries.where('categoryRemoteKey').equals(remoteKey).toArray()
  for (const entry of entries) {
    await db.expense_entries.update(entry.id, {
      categoryId,
      syncState: SYNC_SYNCED,
    })
  }
}

const relinkExpenseEntriesForBudget = async (remoteKey, budgetId) => {
  if (!remoteKey) {
    return
  }
  const entries = await db.expense_entries.where('budgetRemoteKey').equals(remoteKey).toArray()
  for (const entry of entries) {
    await db.expense_entries.update(entry.id, {
      budgetId,
      syncState: SYNC_SYNCED,
    })
  }
}

const findLocalHoldingByRemote = async (remote) => {
  if (!remote.symbol || !remote.market) {
    return undefined
  }
  const normalizedHolder = remote.holder ?? null
  let local = await db.holdings
    .where('[symbol+market+holder]')
    .equals([remote.symbol, remote.market, normalizedHolder])
    .first()
  if (local) {
    return local
  }
  const candidates = await db.holdings
    .where('[symbol+market]')
    .equals([remote.symbol, remote.market])
    .toArray()
  if (candidates.length === 1) {
    return candidates[0]
  }
  if (normalizedHolder === null) {
    return candidates.find((item) => (item.holder ?? null) === null)
  }
  return undefined
}

const findLocalCashAccountByRemote = async (remote) => {
  if (!remote.bankName || !remote.accountAlias) {
    return undefined
  }
  const normalizedHolder = remote.holder ?? null
  let local = await db.cash_accounts
    .where('[bankName+accountAlias+holder]')
    .equals([remote.bankName, remote.accountAlias, normalizedHolder])
    .first()
  if (local) {
    return local
  }
  const candidates = await db.cash_accounts
    .where('[bankName+accountAlias]')
    .equals([remote.bankName, remote.accountAlias])
    .toArray()
  if (candidates.length === 1) {
    return candidates[0]
  }
  if (normalizedHolder === null) {
    return candidates.find((item) => (item.holder ?? null) === null)
  }
  return undefined
}

const applyRemoteHolding = async (remote, { preferLocalId } = {}) => {
  if (!remote.symbol || !remote.market) return
  const normalizedHolder = remote.holder ?? null
  if (
    shouldIgnoreMigratedDocEvent({
      collectionName: COLLECTIONS.HOLDINGS,
      docId: buildHoldingKey({ ...remote, holder: normalizedHolder }),
      remoteUpdatedAt: remote.updatedAt,
    })
  ) {
    return
  }
  let local = await findLocalHoldingByRemote({ ...remote, holder: normalizedHolder })
  if (!local && Number.isInteger(preferLocalId)) {
    local = await db.holdings.get(preferLocalId)
  }
  const nowIso = getNowIso()
  if (!local) {
    await db.holdings.add({
      symbol: remote.symbol,
      market: remote.market,
      assetTag: remote.assetTag ?? 'STOCK',
      holder: normalizedHolder,
      shares: parseNumericLike(remote.shares, {
        fallback: 0,
        context: 'applyRemoteHolding.shares',
      }),
      companyName: remote.companyName || remote.symbol,
      sortOrder: parseNumericLike(remote.sortOrder, {
        fallback: 1,
        context: 'applyRemoteHolding.sortOrder',
      }),
      createdAt: remote.createdAt || nowIso,
      updatedAt: remote.updatedAt || nowIso,
      deletedAt: remote.deletedAt ?? null,
      syncState: SYNC_SYNCED,
    })
    return
  }
  if (!isRemoteNewer(local.updatedAt, remote.updatedAt)) return
  await db.holdings.update(local.id, {
    assetTag: remote.assetTag ?? local.assetTag ?? 'STOCK',
    holder: normalizedHolder,
    shares: parseNumericLike(remote.shares, {
      fallback: 0,
      context: 'applyRemoteHolding.shares',
    }),
    companyName: remote.companyName || local.companyName,
    sortOrder: parseNumericLike(remote.sortOrder, {
      fallback: local.sortOrder ?? 1,
      context: 'applyRemoteHolding.sortOrder',
    }),
    createdAt: remote.createdAt || local.createdAt,
    updatedAt: remote.updatedAt || local.updatedAt,
    deletedAt: remote.deletedAt ?? null,
    syncState: SYNC_SYNCED,
  })
}

const applyRemoteSnapshot = async (remote) => {
  if (!remote.symbol || !remote.market || !remote.capturedAt) return
  const normalizedHolder = remote.holder ?? null
  let holding = await findLocalHoldingByRemote({ ...remote, holder: normalizedHolder })
  if (!holding) return
  const local = await db.price_snapshots.where('[holdingId+capturedAt]').equals([holding.id, remote.capturedAt]).first()
  if (!local) {
    await db.price_snapshots.add({
      holdingId: holding.id,
      symbol: remote.symbol,
      market: remote.market,
      holder: normalizedHolder,
      price: parseNumericLike(remote.price, {
        fallback: 0,
        context: 'applyRemoteSnapshot.price',
      }),
      currency: remote.currency,
      fxRateToTwd: parseNumericLike(remote.fxRateToTwd, {
        fallback: 0,
        context: 'applyRemoteSnapshot.fxRateToTwd',
      }),
      valueTwd: parseNumericLike(remote.valueTwd, {
        fallback: 0,
        context: 'applyRemoteSnapshot.valueTwd',
      }),
      capturedAt: remote.capturedAt,
      updatedAt: remote.updatedAt ?? remote.capturedAt,
      deletedAt: remote.deletedAt ?? null,
      syncState: SYNC_SYNCED,
    })
    return
  }
  if (!isRemoteNewer(local.updatedAt, remote.updatedAt)) return
  await db.price_snapshots.update(local.id, {
    holder: normalizedHolder,
    price: parseNumericLike(remote.price, {
      fallback: 0,
      context: 'applyRemoteSnapshot.price',
    }),
    currency: remote.currency,
    fxRateToTwd: parseNumericLike(remote.fxRateToTwd, {
      fallback: 0,
      context: 'applyRemoteSnapshot.fxRateToTwd',
    }),
    valueTwd: parseNumericLike(remote.valueTwd, {
      fallback: 0,
      context: 'applyRemoteSnapshot.valueTwd',
    }),
    updatedAt: remote.updatedAt ?? local.updatedAt,
    deletedAt: remote.deletedAt ?? null,
    syncState: SYNC_SYNCED,
  })
}

const applyRemoteFxRate = async (remote) => {
  if (!remote.pair) return
  const local = await db.fx_rates.get(remote.pair)
  if (local?.updatedAt && remote.updatedAt && local.updatedAt >= remote.updatedAt) return
  await db.fx_rates.put({
    pair: remote.pair,
    rate: remote.rate,
    fetchedAt: remote.fetchedAt,
    source: remote.source,
    updatedAt: remote.updatedAt ?? remote.fetchedAt ?? getNowIso(),
    deletedAt: remote.deletedAt ?? null,
    syncState: SYNC_SYNCED,
  })
}

const applyRemoteSyncMeta = async (remote) => {
  if (!remote.key) return
  const local = await db.sync_meta.get(remote.key)
  if (local?.updatedAt && remote.updatedAt && local.updatedAt >= remote.updatedAt) return
  await db.sync_meta.put({
    key: remote.key,
    lastUpdatedAt: remote.lastUpdatedAt,
    status: remote.status,
    errorMessage: remote.errorMessage,
    updatedAt: remote.updatedAt ?? remote.lastUpdatedAt ?? getNowIso(),
    deletedAt: remote.deletedAt ?? null,
    syncState: SYNC_SYNCED,
  })
}

const applyRemoteCashAccount = async (remote, { preferLocalId } = {}) => {
  if (!remote.bankName || !remote.accountAlias) return
  const normalizedHolder = remote.holder ?? null
  if (
    shouldIgnoreMigratedDocEvent({
      collectionName: COLLECTIONS.CASH_ACCOUNTS,
      docId: buildCashAccountKey({ ...remote, holder: normalizedHolder }),
      remoteUpdatedAt: remote.updatedAt,
    })
  ) {
    return
  }
  let local = await findLocalCashAccountByRemote({ ...remote, holder: normalizedHolder })
  if (!local && Number.isInteger(preferLocalId)) {
    local = await db.cash_accounts.get(preferLocalId)
  }
  const nowIso = getNowIso()
  if (!local) {
    await db.cash_accounts.add({
      bankCode: remote.bankCode ?? null,
      bankName: remote.bankName,
      accountAlias: remote.accountAlias,
      holder: normalizedHolder,
      balanceTwd: parseNumericLike(remote.balanceTwd, {
        fallback: 0,
        context: 'applyRemoteCashAccount.balanceTwd',
      }),
      createdAt: remote.createdAt || nowIso,
      updatedAt: remote.updatedAt || nowIso,
      deletedAt: remote.deletedAt ?? null,
      syncState: SYNC_SYNCED,
    })
    return
  }
  if (!isRemoteNewer(local.updatedAt, remote.updatedAt)) return
  await db.cash_accounts.update(local.id, {
    bankCode: remote.bankCode ?? null,
    bankName: remote.bankName,
    accountAlias: remote.accountAlias,
    holder: normalizedHolder,
    balanceTwd: parseNumericLike(remote.balanceTwd, {
      fallback: 0,
      context: 'applyRemoteCashAccount.balanceTwd',
    }),
    createdAt: remote.createdAt || local.createdAt,
    updatedAt: remote.updatedAt || local.updatedAt,
    deletedAt: remote.deletedAt ?? null,
    syncState: SYNC_SYNCED,
  })
}

const applyRemoteCashBalanceSnapshot = async (remote) => {
  if (!remote.bankName || !remote.accountAlias || !remote.capturedAt) return
  const normalizedHolder = remote.holder ?? null
  let cashAccount = await findLocalCashAccountByRemote({ ...remote, holder: normalizedHolder })
  if (!cashAccount) return
  const local = await db.cash_balance_snapshots.where('[cashAccountId+capturedAt]').equals([cashAccount.id, remote.capturedAt]).first()
  if (!local) {
    await db.cash_balance_snapshots.add({
      cashAccountId: cashAccount.id,
      bankCode: remote.bankCode ?? cashAccount.bankCode ?? null,
      bankName: remote.bankName,
      accountAlias: remote.accountAlias,
      holder: normalizedHolder,
      balanceTwd: parseNumericLike(remote.balanceTwd, {
        fallback: 0,
        context: 'applyRemoteCashBalanceSnapshot.balanceTwd',
      }),
      capturedAt: remote.capturedAt,
      updatedAt: remote.updatedAt ?? remote.capturedAt,
      deletedAt: remote.deletedAt ?? null,
      syncState: SYNC_SYNCED,
    })
    return
  }
  if (!isRemoteNewer(local.updatedAt, remote.updatedAt)) return
  await db.cash_balance_snapshots.update(local.id, {
    bankCode: remote.bankCode ?? local.bankCode ?? null,
    bankName: remote.bankName,
    accountAlias: remote.accountAlias,
    holder: normalizedHolder,
    balanceTwd: parseNumericLike(remote.balanceTwd, {
      fallback: 0,
      context: 'applyRemoteCashBalanceSnapshot.balanceTwd',
    }),
    updatedAt: remote.updatedAt ?? local.updatedAt,
    deletedAt: remote.deletedAt ?? null,
    syncState: SYNC_SYNCED,
  })
}

const applyRemoteExpenseEntry = async (remote) => {
  if (!remote.remoteKey || !remote.name) return
  const local = await db.expense_entries.where('remoteKey').equals(remote.remoteKey).first()
  const nowIso = getNowIso()
  const categoryId = remote.categoryRemoteKey
    ? await resolveLocalExpenseCategoryId(remote.categoryRemoteKey)
    : (Number.isInteger(remote.legacyCategoryId) ? remote.legacyCategoryId : null)
  const budgetId = remote.budgetRemoteKey
    ? await resolveLocalBudgetId(remote.budgetRemoteKey)
    : (Number.isInteger(remote.legacyBudgetId) ? remote.legacyBudgetId : null)
  if (!local) {
    await db.expense_entries.add({
      remoteKey: remote.remoteKey,
      name: remote.name,
      payer: remote.payer ?? null,
      expenseKind: remote.expenseKind ?? null,
      amountTwd: Number(remote.amountTwd) || 0,
      occurredAt: remote.occurredAt || nowIso.slice(0, 10),
      entryType: remote.entryType || 'ONE_TIME',
      recurrenceType: remote.recurrenceType ?? null,
      monthlyDay: remote.monthlyDay ?? null,
      yearlyMonth: remote.yearlyMonth ?? null,
      yearlyDay: remote.yearlyDay ?? null,
      recurrenceUntil: remote.recurrenceUntil ?? null,
      categoryId,
      budgetId,
      categoryRemoteKey: remote.categoryRemoteKey ?? null,
      budgetRemoteKey: remote.budgetRemoteKey ?? null,
      createdAt: remote.createdAt || nowIso,
      updatedAt: remote.updatedAt || nowIso,
      deletedAt: remote.deletedAt ?? null,
      syncState: SYNC_SYNCED,
    })
    return
  }
  if (!isRemoteNewer(local.updatedAt, remote.updatedAt)) return
  await db.expense_entries.update(local.id, {
    name: remote.name,
    payer: remote.payer ?? null,
    expenseKind: remote.expenseKind ?? null,
    amountTwd: Number(remote.amountTwd) || 0,
    occurredAt: remote.occurredAt || local.occurredAt,
    entryType: remote.entryType || local.entryType || 'ONE_TIME',
    recurrenceType: remote.recurrenceType ?? null,
    monthlyDay: remote.monthlyDay ?? null,
    yearlyMonth: remote.yearlyMonth ?? null,
    yearlyDay: remote.yearlyDay ?? null,
    recurrenceUntil: remote.recurrenceUntil ?? null,
    categoryId,
    budgetId,
    categoryRemoteKey: remote.categoryRemoteKey ?? null,
    budgetRemoteKey: remote.budgetRemoteKey ?? null,
    createdAt: remote.createdAt || local.createdAt,
    updatedAt: remote.updatedAt || local.updatedAt,
    deletedAt: remote.deletedAt ?? null,
    syncState: SYNC_SYNCED,
  })
}

const applyRemoteExpenseCategory = async (remote) => {
  if (!remote.remoteKey || !remote.name) return
  const local = await db.expense_categories.where('remoteKey').equals(remote.remoteKey).first()
  const nowIso = getNowIso()
  if (!local) {
    const id = await db.expense_categories.add({
      remoteKey: remote.remoteKey,
      name: remote.name,
      createdAt: remote.createdAt || nowIso,
      updatedAt: remote.updatedAt || nowIso,
      deletedAt: remote.deletedAt ?? null,
      syncState: SYNC_SYNCED,
    })
    await relinkExpenseEntriesForCategory(remote.remoteKey, id)
    return
  }
  if (!isRemoteNewer(local.updatedAt, remote.updatedAt)) return
  await db.expense_categories.update(local.id, {
    name: remote.name,
    createdAt: remote.createdAt || local.createdAt,
    updatedAt: remote.updatedAt || local.updatedAt,
    deletedAt: remote.deletedAt ?? null,
    syncState: SYNC_SYNCED,
  })
  await relinkExpenseEntriesForCategory(remote.remoteKey, local.id)
}

const applyRemoteBudget = async (remote) => {
  if (!remote.remoteKey || !remote.name) return
  const local = await db.budgets.where('remoteKey').equals(remote.remoteKey).first()
  const nowIso = getNowIso()
  if (!local) {
    const id = await db.budgets.add({
      remoteKey: remote.remoteKey,
      name: remote.name,
      amountTwd:
        typeof remote.amountTwd === 'number' ? Number(remote.amountTwd) : null,
      budgetMode: remote.budgetMode || 'RESIDENT',
      budgetType: remote.budgetType || 'MONTHLY',
      startDate: remote.startDate || null,
      residentPercent:
        typeof remote.residentPercent === 'number'
          ? Number(remote.residentPercent)
          : null,
      specialAmountTwd:
        typeof remote.specialAmountTwd === 'number'
          ? Number(remote.specialAmountTwd)
          : null,
      specialStartDate: remote.specialStartDate ?? null,
      specialEndDate: remote.specialEndDate ?? null,
      createdAt: remote.createdAt || nowIso,
      updatedAt: remote.updatedAt || nowIso,
      deletedAt: remote.deletedAt ?? null,
      syncState: SYNC_SYNCED,
    })
    await relinkExpenseEntriesForBudget(remote.remoteKey, id)
    return
  }
  if (!isRemoteNewer(local.updatedAt, remote.updatedAt)) return
  await db.budgets.update(local.id, {
    name: remote.name,
    amountTwd:
      typeof remote.amountTwd === 'number' ? Number(remote.amountTwd) : null,
    budgetMode: remote.budgetMode || local.budgetMode || 'RESIDENT',
    budgetType: remote.budgetType || 'MONTHLY',
    startDate: remote.startDate || local.startDate || null,
    residentPercent:
      typeof remote.residentPercent === 'number'
        ? Number(remote.residentPercent)
        : null,
    specialAmountTwd:
      typeof remote.specialAmountTwd === 'number'
        ? Number(remote.specialAmountTwd)
        : null,
    specialStartDate: remote.specialStartDate ?? null,
    specialEndDate: remote.specialEndDate ?? null,
    createdAt: remote.createdAt || local.createdAt,
    updatedAt: remote.updatedAt || local.updatedAt,
    deletedAt: remote.deletedAt ?? null,
    syncState: SYNC_SYNCED,
  })
  await relinkExpenseEntriesForBudget(remote.remoteKey, local.id)
}

const applyRemoteAppConfig = async (remote) => {
  if (!remote.key) return
  const local = await db.app_config.get(remote.key)
  if (local?.updatedAt && remote.updatedAt && local.updatedAt >= remote.updatedAt) return
  await db.app_config.put({
    ...local,
    ...remote,
    key: remote.key,
    updatedAt: remote.updatedAt ?? local?.updatedAt ?? getNowIso(),
    deletedAt: remote.deletedAt ?? null,
    syncState: SYNC_SYNCED,
  })
}

export const applyCollectionRecordLocally = async ({
  collectionName,
  record,
  preferLocalId,
}) => {
  const mutation = buildMutationPayload({ collectionName, record })
  const { payload, docId } = mutation

  if (collectionName === COLLECTIONS.HOLDINGS) {
    await applyRemoteHolding(remoteToHolding(payload), { preferLocalId })
  } else if (collectionName === COLLECTIONS.PRICE_SNAPSHOTS) {
    await applyRemoteSnapshot(remoteToSnapshot(payload))
  } else if (collectionName === COLLECTIONS.FX_RATES) {
    await applyRemoteFxRate(remoteToFxRate(payload))
  } else if (collectionName === COLLECTIONS.SYNC_META) {
    await applyRemoteSyncMeta(remoteToSyncMeta(payload))
  } else if (collectionName === COLLECTIONS.CASH_ACCOUNTS) {
    await applyRemoteCashAccount(remoteToCashAccount(payload), { preferLocalId })
  } else if (collectionName === COLLECTIONS.CASH_BALANCE_SNAPSHOTS) {
    await applyRemoteCashBalanceSnapshot(remoteToCashBalanceSnapshot(payload))
  } else if (collectionName === COLLECTIONS.EXPENSE_ENTRIES) {
    await applyRemoteExpenseEntry(remoteToExpenseEntry(payload))
  } else if (collectionName === COLLECTIONS.EXPENSE_CATEGORIES) {
    await applyRemoteExpenseCategory(remoteToExpenseCategory(payload))
  } else if (collectionName === COLLECTIONS.BUDGETS) {
    await applyRemoteBudget(remoteToBudget(payload))
  } else if (collectionName === COLLECTIONS.APP_CONFIG) {
    await applyRemoteAppConfig(remoteToAppConfig(payload))
  } else {
    throw new Error(`Unsupported collection for local apply: ${collectionName}`)
  }

  emitCloudUpdated()
  return docId
}

export const removeCollectionDocLocally = async ({ collectionName, docId, snapshotData = null }) => {
  if (!collectionName) {
    return
  }

  if (collectionName === COLLECTIONS.HOLDINGS) {
    const remote = snapshotData ? remoteToHolding(snapshotData) : null
    const holding = remote ? await findLocalHoldingByRemote(remote) : undefined
    if (!holding) return
    const snapshots = await db.price_snapshots.where('holdingId').equals(holding.id).toArray()
    for (const item of snapshots) {
      await db.price_snapshots.delete(item.id)
    }
    await db.holdings.delete(holding.id)
  } else if (collectionName === COLLECTIONS.PRICE_SNAPSHOTS) {
    const remote = snapshotData ? remoteToSnapshot(snapshotData) : null
    if (!remote) return
    const holding = await findLocalHoldingByRemote(remote)
    if (!holding) return
    const snapshot = await db.price_snapshots
      .where('[holdingId+capturedAt]')
      .equals([holding.id, remote.capturedAt])
      .first()
    if (snapshot) {
      await db.price_snapshots.delete(snapshot.id)
    }
  } else if (collectionName === COLLECTIONS.FX_RATES) {
    if (docId) {
      await db.fx_rates.delete(docId)
    }
  } else if (collectionName === COLLECTIONS.SYNC_META) {
    if (docId) {
      await db.sync_meta.delete(docId)
    }
  } else if (collectionName === COLLECTIONS.CASH_ACCOUNTS) {
    const remote = snapshotData ? remoteToCashAccount(snapshotData) : null
    const cashAccount = remote ? await findLocalCashAccountByRemote(remote) : undefined
    if (!cashAccount) return
    const snapshots = await db.cash_balance_snapshots
      .where('cashAccountId')
      .equals(cashAccount.id)
      .toArray()
    for (const item of snapshots) {
      await db.cash_balance_snapshots.delete(item.id)
    }
    await db.cash_accounts.delete(cashAccount.id)
  } else if (collectionName === COLLECTIONS.CASH_BALANCE_SNAPSHOTS) {
    const remote = snapshotData ? remoteToCashBalanceSnapshot(snapshotData) : null
    if (!remote) return
    const cashAccount = await findLocalCashAccountByRemote(remote)
    if (!cashAccount) return
    const snapshot = await db.cash_balance_snapshots
      .where('[cashAccountId+capturedAt]')
      .equals([cashAccount.id, remote.capturedAt])
      .first()
    if (snapshot) {
      await db.cash_balance_snapshots.delete(snapshot.id)
    }
  } else if (collectionName === COLLECTIONS.EXPENSE_ENTRIES) {
    const remote = snapshotData ? remoteToExpenseEntry(snapshotData) : null
    if (!remote?.remoteKey) return
    const entry = await db.expense_entries.where('remoteKey').equals(remote.remoteKey).first()
    if (entry) {
      await db.expense_entries.delete(entry.id)
    }
  } else if (collectionName === COLLECTIONS.EXPENSE_CATEGORIES) {
    const remote = snapshotData ? remoteToExpenseCategory(snapshotData) : null
    if (!remote?.remoteKey) return
    const category = await db.expense_categories.where('remoteKey').equals(remote.remoteKey).first()
    if (!category) return
    await relinkExpenseEntriesForCategory(remote.remoteKey, null)
    await db.expense_categories.delete(category.id)
  } else if (collectionName === COLLECTIONS.BUDGETS) {
    const remote = snapshotData ? remoteToBudget(snapshotData) : null
    if (!remote?.remoteKey) return
    const budget = await db.budgets.where('remoteKey').equals(remote.remoteKey).first()
    if (!budget) return
    await relinkExpenseEntriesForBudget(remote.remoteKey, null)
    await db.budgets.delete(budget.id)
  } else if (collectionName === COLLECTIONS.APP_CONFIG) {
    const key = snapshotData ? remoteToAppConfig(snapshotData).key : docId
    if (key) {
      await db.app_config.delete(key)
    }
  }

  emitCloudUpdated()
}

const applyRealtimeSnapshot = async (collectionName, snapshot) => {
  for (const change of snapshot.docChanges()) {
    if (change.type === 'removed') {
      await removeCollectionDocLocally({
        collectionName,
        docId: change.doc.id,
        snapshotData: change.doc.data(),
      })
      continue
    }
    const data = change.doc.data()
    if (collectionName === COLLECTIONS.HOLDINGS) {
      await applyRemoteHolding(remoteToHolding(data))
      continue
    }
    if (collectionName === COLLECTIONS.PRICE_SNAPSHOTS) {
      await applyRemoteSnapshot(remoteToSnapshot(data))
      continue
    }
    if (collectionName === COLLECTIONS.FX_RATES) {
      await applyRemoteFxRate(remoteToFxRate(data))
      continue
    }
    if (collectionName === COLLECTIONS.SYNC_META) {
      await applyRemoteSyncMeta(remoteToSyncMeta(data))
      continue
    }
    if (collectionName === COLLECTIONS.CASH_ACCOUNTS) {
      await applyRemoteCashAccount(remoteToCashAccount(data))
      continue
    }
    if (collectionName === COLLECTIONS.CASH_BALANCE_SNAPSHOTS) {
      await applyRemoteCashBalanceSnapshot(remoteToCashBalanceSnapshot(data))
      continue
    }
    if (collectionName === COLLECTIONS.EXPENSE_ENTRIES) {
      await applyRemoteExpenseEntry(remoteToExpenseEntry(data))
      continue
    }
    if (collectionName === COLLECTIONS.EXPENSE_CATEGORIES) {
      await applyRemoteExpenseCategory(remoteToExpenseCategory(data))
      continue
    }
    if (collectionName === COLLECTIONS.BUDGETS) {
      await applyRemoteBudget(remoteToBudget(data))
      continue
    }
    if (collectionName === COLLECTIONS.APP_CONFIG) {
      await applyRemoteAppConfig(remoteToAppConfig(data))
    }
  }
  emitCloudUpdated()
}

const subscribeCollection = (name) => new Promise((resolve, reject) => {
  let first = true
  const unsubscribe = onSnapshot(
    userCollection(name),
    async (snapshot) => {
      try {
        await applyRealtimeSnapshot(name, snapshot)
        if (first) {
          first = false
          markFirstSnapshotReady(name)
          resolve()
        }
      } catch (error) {
        runtimeState.lastError = error instanceof Error ? error.message : String(error)
        if (first) {
          first = false
          reject(error)
        }
      }
    },
    (error) => {
      runtimeState.lastError = error instanceof Error ? error.message : String(error)
      if (first) {
        first = false
        reject(error)
      }
    },
  )
  realtimeUnsubscribers.push(unsubscribe)
})

const stopRealtimeSyncInternal = () => {
  for (const unsubscribe of realtimeUnsubscribers) {
    unsubscribe()
  }
  realtimeUnsubscribers = []
  if (onlineHandler) {
    window.removeEventListener('online', onlineHandler)
    onlineHandler = null
  }
  if (offlineHandler) {
    window.removeEventListener('offline', offlineHandler)
    offlineHandler = null
  }
  runtimeState.listenersReady = false
  firstSnapshotTracker = null
  migratedDocKeyTracker.clear()
}

export const writeCollectionDoc = async ({ collectionName, docId, payload, merge = true }) => {
  const firestore = ensureFirestore()
  const ref = doc(collection(firestore, 'users', currentUid, collectionName), docId)
  await setDoc(
    ref,
    {
      ...payload,
      serverUpdatedAt: serverTimestamp(),
    },
    { merge },
  )
}

export const deleteCollectionDoc = async ({ collectionName, docId }) => {
  const firestore = ensureFirestore()
  const ref = doc(collection(firestore, 'users', currentUid, collectionName), docId)
  await deleteDoc(ref)
}

export const writeCollectionRecord = async ({ collectionName, record }) => {
  const mutation = buildMutationPayload({ collectionName, record })
  await writeCollectionDoc({
    collectionName,
    docId: mutation.docId,
    payload: mutation.payload,
    merge: true,
  })
}

export const getSyncRuntimeState = () => ({
  ...runtimeState,
  readOnly: isCloudReadOnly(),
})

export const stopRealtimeSync = () => {
  stopRealtimeSyncInternal()
}

export const startRealtimeSync = async (uid) => {
  stopRealtimeSyncInternal()

  currentUid = uid
  runtimeState.authenticated = Boolean(uid)
  runtimeState.connected = typeof navigator !== 'undefined' ? navigator.onLine : true
  runtimeState.firestoreAvailable = hasFirestore()
  runtimeState.outboxPending = 0
  runtimeState.lastError = ''

  if (!uid) {
    setLastSyncedUid(null)
    return
  }

  runtimeState.listenersReady = false
  await clearLocalCloudBackedData()
  firstSnapshotTracker = {
    pending: new Set([
      COLLECTIONS.HOLDINGS,
      COLLECTIONS.PRICE_SNAPSHOTS,
      COLLECTIONS.FX_RATES,
      COLLECTIONS.SYNC_META,
      COLLECTIONS.CASH_ACCOUNTS,
      COLLECTIONS.CASH_BALANCE_SNAPSHOTS,
      COLLECTIONS.EXPENSE_ENTRIES,
      COLLECTIONS.EXPENSE_CATEGORIES,
      COLLECTIONS.BUDGETS,
      COLLECTIONS.APP_CONFIG,
    ]),
    waiters: [],
  }

  // Subscribe dependencies first so dependent snapshots can resolve links.
  await Promise.allSettled([
    subscribeCollection(COLLECTIONS.HOLDINGS),
    subscribeCollection(COLLECTIONS.CASH_ACCOUNTS),
  ])

  await Promise.allSettled([
    subscribeCollection(COLLECTIONS.PRICE_SNAPSHOTS),
    subscribeCollection(COLLECTIONS.FX_RATES),
    subscribeCollection(COLLECTIONS.SYNC_META),
    subscribeCollection(COLLECTIONS.CASH_BALANCE_SNAPSHOTS),
    subscribeCollection(COLLECTIONS.EXPENSE_ENTRIES),
    subscribeCollection(COLLECTIONS.EXPENSE_CATEGORIES),
    subscribeCollection(COLLECTIONS.BUDGETS),
    subscribeCollection(COLLECTIONS.APP_CONFIG),
  ])

  onlineHandler = () => {
    runtimeState.connected = true
  }
  offlineHandler = () => {
    runtimeState.connected = false
  }
  window.addEventListener('online', onlineHandler)
  window.addEventListener('offline', offlineHandler)

  await waitForFirstSnapshotsReady()
  setLastSyncedUid(uid)
}

export const setSyncUser = () => {
  // Deprecated in cloud-only flow. Keep as no-op for compatibility.
}

export const syncNowWithCloud = async () => {
  if (!currentUid) {
    return {
      pushed: 0,
      pulled: 0,
      durationMs: 0,
      triggeredFullResync: false,
    }
  }
  if (syncInFlight) {
    return syncInFlight
  }

  syncInFlight = (async () => {
    const startedAt = Date.now()
    const uid = currentUid
    await startRealtimeSync(uid)
    return {
      pushed: 0,
      pulled: 0,
      durationMs: Date.now() - startedAt,
      triggeredFullResync: true,
    }
  })()

  try {
    return await syncInFlight
  } finally {
    syncInFlight = null
  }
}

export const initCloudSync = async (uid) => {
  await startRealtimeSync(uid)
}

export const stopCloudSync = () => {
  stopRealtimeSyncInternal()
  syncInFlight = null
  currentUid = null
  runtimeState.authenticated = false
  runtimeState.connected = typeof navigator !== 'undefined' ? navigator.onLine : true
  runtimeState.firestoreAvailable = hasFirestore()
  runtimeState.lastError = ''
  runtimeState.outboxPending = 0
  migratedDocKeyTracker.clear()
  setLastSyncedUid(null)
  void clearLocalCloudBackedData()
}
