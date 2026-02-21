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
  buildHoldingKey,
  buildSnapshotKey,
  cashBalanceSnapshotToRemote,
  cashAccountToRemote,
  fxRateToRemote,
  holdingToRemote,
  isRemoteNewer,
  remoteToCashBalanceSnapshot,
  remoteToCashAccount,
  remoteToFxRate,
  remoteToHolding,
  remoteToSnapshot,
  remoteToSyncMeta,
  snapshotToRemote,
  syncMetaToRemote,
} from './firestoreMappers'

const SYNC_PENDING = 'pending'
const SYNC_ERROR = 'error'
const SYNC_SYNCED = 'synced'

const COLLECTIONS = {
  HOLDINGS: 'holdings',
  PRICE_SNAPSHOTS: 'price_snapshots',
  FX_RATES: 'fx_rates',
  SYNC_META: 'sync_meta',
  CASH_ACCOUNTS: 'cash_accounts',
  CASH_BALANCE_SNAPSHOTS: 'cash_balance_snapshots',
}

const OUTBOX_OP_SET = 'set'
const OUTBOX_OP_DELETE = 'delete'
export const CLOUD_SYNC_UPDATED_EVENT = 'cloud-sync-updated'

let currentUid = null
let syncInFlight = null
let outboxFlushInFlight = null
let realtimeUnsubscribers = []
let onlineHandler = null
let offlineHandler = null
let pendingSnapshotReplay = []
let pendingCashBalanceSnapshotReplay = []

const runtimeState = {
  connected: typeof navigator !== 'undefined' ? navigator.onLine : true,
  listenersReady: false,
  outboxPending: 0,
  lastCloudApplyAt: null,
  lastOutboxFlushAt: null,
  lastError: '',
}

const getNowIso = () => new Date().toISOString()

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

const refreshOutboxPendingCount = async () => {
  if (!currentUid || !db.outbox) {
    runtimeState.outboxPending = 0
    return 0
  }

  const count = await db.outbox
    .where('uid')
    .equals(currentUid)
    .and((item) => item.status === SYNC_PENDING || item.status === SYNC_ERROR)
    .count()
  runtimeState.outboxPending = count
  return count
}

const buildMutationPayload = ({ collectionName, record }) => {
  if (collectionName === COLLECTIONS.HOLDINGS) {
    return {
      docId: buildHoldingKey(record),
      payload: holdingToRemote(record),
      op: OUTBOX_OP_SET,
    }
  }

  if (collectionName === COLLECTIONS.PRICE_SNAPSHOTS) {
    return {
      docId: buildSnapshotKey(record),
      payload: snapshotToRemote(record),
      op: OUTBOX_OP_SET,
    }
  }

  if (collectionName === COLLECTIONS.FX_RATES) {
    return {
      docId: record.pair,
      payload: fxRateToRemote(record),
      op: OUTBOX_OP_SET,
    }
  }

  if (collectionName === COLLECTIONS.SYNC_META) {
    return {
      docId: record.key,
      payload: syncMetaToRemote(record),
      op: OUTBOX_OP_SET,
    }
  }

  if (collectionName === COLLECTIONS.CASH_ACCOUNTS) {
    return {
      docId: buildCashAccountKey(record),
      payload: cashAccountToRemote(record),
      op: OUTBOX_OP_SET,
    }
  }

  if (collectionName === COLLECTIONS.CASH_BALANCE_SNAPSHOTS) {
    return {
      docId: buildCashBalanceSnapshotKey(record),
      payload: cashBalanceSnapshotToRemote(record),
      op: OUTBOX_OP_SET,
    }
  }

  throw new Error(`Unsupported collection for mutation: ${collectionName}`)
}

const applyRemoteHolding = async (remote) => {
  if (!remote.symbol || !remote.market) {
    return
  }

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

  if (!isRemoteNewer(local.updatedAt, remote.updatedAt)) {
    return
  }

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

  if (pendingSnapshotReplay.length > 0) {
    const queue = [...pendingSnapshotReplay]
    pendingSnapshotReplay = []
    for (const item of queue) {
      await applyRemoteSnapshot(item)
    }
  }
}

async function applyRemoteSnapshot(remote) {
  if (!remote.symbol || !remote.market || !remote.capturedAt) {
    return
  }

  const holding = await db.holdings.where('[symbol+market]').equals([remote.symbol, remote.market]).first()
  if (!holding) {
    pendingSnapshotReplay.push(remote)
    return
  }

  const local = await db.price_snapshots
    .where('[holdingId+capturedAt]')
    .equals([holding.id, remote.capturedAt])
    .first()

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

  if (!isRemoteNewer(local.updatedAt, remote.updatedAt)) {
    return
  }

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
  if (!remote.pair) {
    return
  }

  const local = await db.fx_rates.get(remote.pair)
  if (local && local.updatedAt && remote.updatedAt && local.updatedAt >= remote.updatedAt) {
    return
  }

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
  if (!remote.key) {
    return
  }

  const local = await db.sync_meta.get(remote.key)
  if (local && local.updatedAt && remote.updatedAt && local.updatedAt >= remote.updatedAt) {
    return
  }

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
  if (!remote.bankName || !remote.accountAlias) {
    return
  }

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

  if (!isRemoteNewer(local.updatedAt, remote.updatedAt)) {
    return
  }

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

  if (pendingCashBalanceSnapshotReplay.length > 0) {
    const queue = [...pendingCashBalanceSnapshotReplay]
    pendingCashBalanceSnapshotReplay = []
    for (const item of queue) {
      await applyRemoteCashBalanceSnapshot(item)
    }
  }
}

const applyRemoteCashBalanceSnapshot = async (remote) => {
  if (!remote.bankName || !remote.accountAlias || !remote.capturedAt) {
    return
  }

  const cashAccount = await db.cash_accounts
    .where('[bankName+accountAlias]')
    .equals([remote.bankName, remote.accountAlias])
    .first()

  if (!cashAccount) {
    pendingCashBalanceSnapshotReplay.push(remote)
    return
  }

  const local = await db.cash_balance_snapshots
    .where('[cashAccountId+capturedAt]')
    .equals([cashAccount.id, remote.capturedAt])
    .first()

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

  if (!isRemoteNewer(local.updatedAt, remote.updatedAt)) {
    return
  }

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
    }
  }

  runtimeState.lastCloudApplyAt = getNowIso()
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CLOUD_SYNC_UPDATED_EVENT))
  }
}

const sendMutationToCloud = async (mutation) => {
  const firestore = ensureFirestore()
  const ref = doc(collection(firestore, 'users', currentUid, mutation.collection), mutation.docId)

  if (mutation.op === OUTBOX_OP_DELETE) {
    await deleteDoc(ref)
    return
  }

  await setDoc(
    ref,
    {
      ...mutation.payload,
      lastMutationId: mutation.clientMutationId,
      serverUpdatedAt: serverTimestamp(),
    },
    { merge: true },
  )
}

export const enqueueMutation = async ({ collectionName, docId, payload, op = OUTBOX_OP_SET }) => {
  if (!currentUid || !db.outbox) {
    return { queued: false }
  }

  await db.outbox.add({
    uid: currentUid,
    status: SYNC_PENDING,
    collection: collectionName,
    docId,
    payload,
    op,
    attempts: 0,
    clientMutationId: `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    createdAt: getNowIso(),
    retryAt: null,
    lastError: '',
  })

  await refreshOutboxPendingCount()
  return { queued: true }
}

export const queueOrApplyMutation = async ({ collectionName, record }) => {
  if (!currentUid) {
    return { queued: false, sent: 0 }
  }

  const mutation = buildMutationPayload({ collectionName, record })

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    await enqueueMutation({
      collectionName,
      docId: mutation.docId,
      payload: mutation.payload,
      op: mutation.op,
    })
    return { queued: true, sent: 0 }
  }

  try {
    await sendMutationToCloud({
      collection: collectionName,
      docId: mutation.docId,
      payload: mutation.payload,
      op: mutation.op,
      clientMutationId: `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    })
    return { queued: false, sent: 1 }
  } catch (error) {
    runtimeState.lastError = error instanceof Error ? error.message : String(error)
    await enqueueMutation({
      collectionName,
      docId: mutation.docId,
      payload: mutation.payload,
      op: mutation.op,
    })
    return { queued: true, sent: 0 }
  }
}

export const flushOutbox = async () => {
  if (!currentUid || !db.outbox) {
    return { sent: 0, failed: 0 }
  }

  if (outboxFlushInFlight) {
    return outboxFlushInFlight
  }

  outboxFlushInFlight = (async () => {
    const nowIso = getNowIso()
    const pending = await db.outbox
      .where('uid')
      .equals(currentUid)
      .and((item) => {
        if (!(item.status === SYNC_PENDING || item.status === SYNC_ERROR)) {
          return false
        }
        if (!item.retryAt) {
          return true
        }
        return item.retryAt <= nowIso
      })
      .sortBy('createdAt')

    let sent = 0
    let failed = 0

    for (const item of pending) {
      try {
        await sendMutationToCloud(item)
        await db.outbox.delete(item.id)
        sent += 1
      } catch (error) {
        failed += 1
        const attempts = Number(item.attempts || 0) + 1
        const backoffMs = Math.min(60_000, attempts * 2_000)
        const retryAt = new Date(Date.now() + backoffMs).toISOString()
        await db.outbox.update(item.id, {
          status: SYNC_ERROR,
          attempts,
          retryAt,
          lastError: error instanceof Error ? error.message : String(error),
        })
        runtimeState.lastError = error instanceof Error ? error.message : String(error)
      }
    }

    runtimeState.lastOutboxFlushAt = getNowIso()
    await refreshOutboxPendingCount()
    return { sent, failed }
  })()

  try {
    return await outboxFlushInFlight
  } finally {
    outboxFlushInFlight = null
  }
}

export const getSyncRuntimeState = () => ({ ...runtimeState })

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
  pendingSnapshotReplay = []
  pendingCashBalanceSnapshotReplay = []
}

export const stopRealtimeSync = () => {
  stopRealtimeSyncInternal()
}

export const startRealtimeSync = async (uid) => {
  currentUid = uid
  stopRealtimeSyncInternal()

  if (!uid) {
    runtimeState.connected = typeof navigator !== 'undefined' ? navigator.onLine : true
    runtimeState.outboxPending = 0
    return
  }

  runtimeState.connected = typeof navigator !== 'undefined' ? navigator.onLine : true
  runtimeState.lastError = ''
  runtimeState.listenersReady = false

  const waitingFirstSnapshots = new Set([
    COLLECTIONS.HOLDINGS,
    COLLECTIONS.PRICE_SNAPSHOTS,
    COLLECTIONS.FX_RATES,
    COLLECTIONS.SYNC_META,
    COLLECTIONS.CASH_ACCOUNTS,
    COLLECTIONS.CASH_BALANCE_SNAPSHOTS,
  ])

  for (const name of waitingFirstSnapshots) {
    const unsubscribe = onSnapshot(
      userCollection(name),
      async (snapshot) => {
        await applyRealtimeSnapshot(name, snapshot)
        waitingFirstSnapshots.delete(name)
        runtimeState.listenersReady = waitingFirstSnapshots.size === 0
      },
      (error) => {
        runtimeState.lastError = error instanceof Error ? error.message : String(error)
      },
    )
    realtimeUnsubscribers.push(unsubscribe)
  }

  onlineHandler = () => {
    runtimeState.connected = true
    flushOutbox().catch(() => {})
  }
  offlineHandler = () => {
    runtimeState.connected = false
  }

  window.addEventListener('online', onlineHandler)
  window.addEventListener('offline', offlineHandler)

  await refreshOutboxPendingCount()
  await flushOutbox()
}

export const setSyncUser = (uid) => {
  currentUid = uid
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
    const flushResult = await flushOutbox()
    return {
      pushed: flushResult.sent,
      pulled: 0,
      durationMs: Date.now() - startedAt,
      triggeredFullResync: false,
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
  outboxFlushInFlight = null
  currentUid = null
  runtimeState.connected = typeof navigator !== 'undefined' ? navigator.onLine : true
}
