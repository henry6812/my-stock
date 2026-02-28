import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore'
import { db } from '../../db/database'
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

const runtimeState = {
  connected: typeof navigator !== 'undefined' ? navigator.onLine : true,
  listenersReady: false,
  outboxPending: 0,
  lastCloudApplyAt: null,
  lastOutboxFlushAt: null,
  lastError: '',
}

const getNowIso = () => new Date().toISOString()

const getLastSyncedUid = () => {
  if (typeof window === 'undefined') {
    return null
  }
  try {
    return window.localStorage.getItem(LOCAL_SYNC_UID_KEY)
  } catch {
    return null
  }
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

const applyRemoteHolding = async (remote) => {
  if (!remote.symbol || !remote.market) return
  const local = await db.holdings.where('[symbol+market]').equals([remote.symbol, remote.market]).first()
  const nowIso = getNowIso()
  if (!local) {
    await db.holdings.add({
      symbol: remote.symbol,
      market: remote.market,
      assetTag: remote.assetTag ?? 'STOCK',
      shares: remote.shares,
      companyName: remote.companyName || remote.symbol,
      sortOrder: Number(remote.sortOrder) || 1,
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
    shares: remote.shares,
    companyName: remote.companyName || local.companyName,
    sortOrder: Number(remote.sortOrder) || local.sortOrder,
    createdAt: remote.createdAt || local.createdAt,
    updatedAt: remote.updatedAt || local.updatedAt,
    deletedAt: remote.deletedAt ?? null,
    syncState: SYNC_SYNCED,
  })
}

const applyRemoteSnapshot = async (remote) => {
  if (!remote.symbol || !remote.market || !remote.capturedAt) return
  const holding = await db.holdings.where('[symbol+market]').equals([remote.symbol, remote.market]).first()
  if (!holding) return
  const local = await db.price_snapshots.where('[holdingId+capturedAt]').equals([holding.id, remote.capturedAt]).first()
  if (!local) {
    await db.price_snapshots.add({
      holdingId: holding.id,
      symbol: remote.symbol,
      market: remote.market,
      price: remote.price,
      currency: remote.currency,
      fxRateToTwd: remote.fxRateToTwd,
      valueTwd: remote.valueTwd,
      capturedAt: remote.capturedAt,
      updatedAt: remote.updatedAt ?? remote.capturedAt,
      deletedAt: remote.deletedAt ?? null,
      syncState: SYNC_SYNCED,
    })
    return
  }
  if (!isRemoteNewer(local.updatedAt, remote.updatedAt)) return
  await db.price_snapshots.update(local.id, {
    price: remote.price,
    currency: remote.currency,
    fxRateToTwd: remote.fxRateToTwd,
    valueTwd: remote.valueTwd,
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

const applyRemoteCashAccount = async (remote) => {
  if (!remote.bankName || !remote.accountAlias) return
  const key = [remote.bankName, remote.accountAlias]
  const local = await db.cash_accounts.where('[bankName+accountAlias]').equals(key).first()
  const nowIso = getNowIso()
  if (!local) {
    await db.cash_accounts.add({
      bankCode: remote.bankCode ?? null,
      bankName: remote.bankName,
      accountAlias: remote.accountAlias,
      balanceTwd: Number(remote.balanceTwd) || 0,
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
    balanceTwd: Number(remote.balanceTwd) || 0,
    createdAt: remote.createdAt || local.createdAt,
    updatedAt: remote.updatedAt || local.updatedAt,
    deletedAt: remote.deletedAt ?? null,
    syncState: SYNC_SYNCED,
  })
}

const applyRemoteCashBalanceSnapshot = async (remote) => {
  if (!remote.bankName || !remote.accountAlias || !remote.capturedAt) return
  const cashAccount = await db.cash_accounts.where('[bankName+accountAlias]').equals([remote.bankName, remote.accountAlias]).first()
  if (!cashAccount) return
  const local = await db.cash_balance_snapshots.where('[cashAccountId+capturedAt]').equals([cashAccount.id, remote.capturedAt]).first()
  if (!local) {
    await db.cash_balance_snapshots.add({
      cashAccountId: cashAccount.id,
      bankCode: remote.bankCode ?? cashAccount.bankCode ?? null,
      bankName: remote.bankName,
      accountAlias: remote.accountAlias,
      balanceTwd: Number(remote.balanceTwd) || 0,
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
    balanceTwd: Number(remote.balanceTwd) || 0,
    updatedAt: remote.updatedAt ?? local.updatedAt,
    deletedAt: remote.deletedAt ?? null,
    syncState: SYNC_SYNCED,
  })
}

const applyRemoteExpenseEntry = async (remote) => {
  if (!remote.remoteKey || !remote.name) return
  const local = await db.expense_entries.where('remoteKey').equals(remote.remoteKey).first()
  const nowIso = getNowIso()
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
      categoryId: remote.categoryId ?? null,
      budgetId: remote.budgetId ?? null,
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
    categoryId: remote.categoryId ?? null,
    budgetId: remote.budgetId ?? null,
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
    await db.expense_categories.add({
      remoteKey: remote.remoteKey,
      name: remote.name,
      createdAt: remote.createdAt || nowIso,
      updatedAt: remote.updatedAt || nowIso,
      deletedAt: remote.deletedAt ?? null,
      syncState: SYNC_SYNCED,
    })
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
}

const applyRemoteBudget = async (remote) => {
  if (!remote.remoteKey || !remote.name) return
  const local = await db.budgets.where('remoteKey').equals(remote.remoteKey).first()
  const nowIso = getNowIso()
  if (!local) {
    await db.budgets.add({
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

const applyRealtimeSnapshot = async (collectionName, snapshot) => {
  for (const change of snapshot.docChanges()) {
    if (change.type === 'removed') {
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

export const getSyncRuntimeState = () => ({ ...runtimeState })

export const stopRealtimeSync = () => {
  stopRealtimeSyncInternal()
}

export const startRealtimeSync = async (uid) => {
  const lastSyncedUid = getLastSyncedUid()
  const shouldClearOnSwitch = Boolean(uid && uid !== lastSyncedUid)

  stopRealtimeSyncInternal()

  if (shouldClearOnSwitch) {
    await clearLocalCloudBackedData()
  }

  currentUid = uid
  runtimeState.connected = typeof navigator !== 'undefined' ? navigator.onLine : true
  runtimeState.outboxPending = 0

  if (!uid) {
    return
  }

  runtimeState.lastError = ''
  runtimeState.listenersReady = false
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
  runtimeState.connected = typeof navigator !== 'undefined' ? navigator.onLine : true
  runtimeState.outboxPending = 0
}
