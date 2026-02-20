import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore'
import { db } from '../../db/database'
import { firestoreDb, assertFirebaseConfigured } from './firebaseApp'
import {
  buildHoldingKey,
  buildSnapshotKey,
  fxRateToRemote,
  holdingToRemote,
  isRemoteNewer,
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
const AUTO_SYNC_INTERVAL_MS = 30_000

let currentUid = null
let autoSyncTimer = null
let onlineHandler = null
let syncInFlight = null

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

const compareUpdatedAt = (a, b) => {
  if (!a && !b) return 0
  if (!a) return -1
  if (!b) return 1
  if (a === b) return 0
  return a > b ? 1 : -1
}

const markLegacyRowsPending = async () => {
  const holdings = await db.holdings.toArray()
  for (const item of holdings) {
    if (!item.syncState) {
      await db.holdings.update(item.id, { syncState: SYNC_PENDING })
    }
  }

  const snapshots = await db.price_snapshots.toArray()
  for (const item of snapshots) {
    if (!item.syncState) {
      await db.price_snapshots.update(item.id, { syncState: SYNC_PENDING })
    }
  }

  const fxRates = await db.fx_rates.toArray()
  for (const item of fxRates) {
    if (!item.syncState) {
      await db.fx_rates.put({ ...item, syncState: SYNC_PENDING })
    }
  }

  const syncMeta = await db.sync_meta.toArray()
  for (const item of syncMeta) {
    if (!item.syncState) {
      await db.sync_meta.put({ ...item, syncState: SYNC_PENDING })
    }
  }
}

const pushHoldings = async () => {
  const pending = await db.holdings.where('syncState').anyOf(SYNC_PENDING, SYNC_ERROR).toArray()
  let pushed = 0

  for (const holding of pending) {
    const id = buildHoldingKey(holding)
    await setDoc(
      doc(userCollection('holdings'), id),
      {
        ...holdingToRemote(holding),
        serverUpdatedAt: serverTimestamp(),
      },
      { merge: true },
    )
    await db.holdings.update(holding.id, { syncState: SYNC_SYNCED })
    pushed += 1
  }

  return pushed
}

const pushSnapshots = async () => {
  const pending = await db.price_snapshots.where('syncState').anyOf(SYNC_PENDING, SYNC_ERROR).toArray()
  let pushed = 0

  for (const snapshot of pending) {
    const id = buildSnapshotKey(snapshot)
    await setDoc(
      doc(userCollection('price_snapshots'), id),
      {
        ...snapshotToRemote(snapshot),
        serverUpdatedAt: serverTimestamp(),
      },
      { merge: true },
    )
    await db.price_snapshots.update(snapshot.id, { syncState: SYNC_SYNCED })
    pushed += 1
  }

  return pushed
}

const pushFxRates = async () => {
  const pending = await db.fx_rates.where('syncState').anyOf(SYNC_PENDING, SYNC_ERROR).toArray()
  let pushed = 0

  for (const rate of pending) {
    await setDoc(
      doc(userCollection('fx_rates'), rate.pair),
      {
        ...fxRateToRemote(rate),
        serverUpdatedAt: serverTimestamp(),
      },
      { merge: true },
    )
    await db.fx_rates.put({ ...rate, syncState: SYNC_SYNCED })
    pushed += 1
  }

  return pushed
}

const pushSyncMeta = async () => {
  const pending = await db.sync_meta.where('syncState').anyOf(SYNC_PENDING, SYNC_ERROR).toArray()
  let pushed = 0

  for (const meta of pending) {
    await setDoc(
      doc(userCollection('sync_meta'), meta.key),
      {
        ...syncMetaToRemote(meta),
        serverUpdatedAt: serverTimestamp(),
      },
      { merge: true },
    )
    await db.sync_meta.put({ ...meta, syncState: SYNC_SYNCED })
    pushed += 1
  }

  return pushed
}

const pushPendingChanges = async () => {
  const holdingCount = await pushHoldings()
  const snapshotCount = await pushSnapshots()
  const fxCount = await pushFxRates()
  const metaCount = await pushSyncMeta()
  return holdingCount + snapshotCount + fxCount + metaCount
}

const pullHoldings = async () => {
  const localByKey = new Map()
  const locals = await db.holdings.toArray()
  for (const item of locals) {
    localByKey.set(buildHoldingKey(item), item)
  }

  const remoteDocs = await getDocs(userCollection('holdings'))
  let pulled = 0

  for (const item of remoteDocs.docs) {
    const remote = remoteToHolding(item.data())
    if (!remote.symbol || !remote.market) {
      continue
    }

    const key = buildHoldingKey(remote)
    const local = localByKey.get(key)

    if (!local) {
      const nowIso = new Date().toISOString()
      const newId = await db.holdings.add({
        symbol: remote.symbol,
        market: remote.market,
        shares: remote.shares,
        companyName: remote.companyName || remote.symbol,
        sortOrder: Number(remote.sortOrder) || 1,
        createdAt: remote.createdAt || nowIso,
        updatedAt: remote.updatedAt || nowIso,
        deletedAt: remote.deletedAt ?? null,
        syncState: SYNC_SYNCED,
      })
      localByKey.set(key, { ...remote, id: newId })
      pulled += 1
      continue
    }

    if (!isRemoteNewer(local.updatedAt, remote.updatedAt)) {
      continue
    }

    await db.holdings.update(local.id, {
      shares: remote.shares,
      companyName: remote.companyName || local.companyName,
      sortOrder: Number(remote.sortOrder) || local.sortOrder,
      createdAt: remote.createdAt || local.createdAt,
      updatedAt: remote.updatedAt || local.updatedAt,
      deletedAt: remote.deletedAt ?? null,
      syncState: SYNC_SYNCED,
    })
    pulled += 1
  }

  return pulled
}

const pullSnapshots = async () => {
  const holdings = await db.holdings.toArray()
  const holdingIdByKey = new Map()
  for (const holding of holdings) {
    holdingIdByKey.set(buildHoldingKey(holding), holding.id)
  }

  const remoteDocs = await getDocs(userCollection('price_snapshots'))
  let pulled = 0

  for (const item of remoteDocs.docs) {
    const remote = remoteToSnapshot(item.data())
    if (!remote.symbol || !remote.market || !remote.capturedAt) {
      continue
    }

    const holdingId = holdingIdByKey.get(buildHoldingKey(remote))
    if (!holdingId) {
      continue
    }

    const local = await db.price_snapshots
      .where('[holdingId+capturedAt]')
      .equals([holdingId, remote.capturedAt])
      .first()

    if (!local) {
      await db.price_snapshots.add({
        holdingId,
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
      pulled += 1
      continue
    }

    if (!isRemoteNewer(local.updatedAt, remote.updatedAt)) {
      continue
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
    pulled += 1
  }

  return pulled
}

const pullFxRates = async () => {
  const remoteDocs = await getDocs(userCollection('fx_rates'))
  let pulled = 0

  for (const item of remoteDocs.docs) {
    const remote = remoteToFxRate(item.data())
    if (!remote.pair) {
      continue
    }

    const local = await db.fx_rates.get(remote.pair)
    if (local && compareUpdatedAt(local.updatedAt, remote.updatedAt) >= 0) {
      continue
    }

    await db.fx_rates.put({
      pair: remote.pair,
      rate: remote.rate,
      fetchedAt: remote.fetchedAt,
      source: remote.source,
      updatedAt: remote.updatedAt ?? remote.fetchedAt,
      deletedAt: remote.deletedAt ?? null,
      syncState: SYNC_SYNCED,
    })
    pulled += 1
  }

  return pulled
}

const pullSyncMeta = async () => {
  const remoteDocs = await getDocs(userCollection('sync_meta'))
  let pulled = 0

  for (const item of remoteDocs.docs) {
    const remote = remoteToSyncMeta(item.data())
    if (!remote.key) {
      continue
    }

    const local = await db.sync_meta.get(remote.key)
    if (local && compareUpdatedAt(local.updatedAt, remote.updatedAt) >= 0) {
      continue
    }

    await db.sync_meta.put({
      key: remote.key,
      lastUpdatedAt: remote.lastUpdatedAt,
      status: remote.status,
      errorMessage: remote.errorMessage,
      updatedAt: remote.updatedAt ?? remote.lastUpdatedAt ?? new Date().toISOString(),
      deletedAt: remote.deletedAt ?? null,
      syncState: SYNC_SYNCED,
    })
    pulled += 1
  }

  return pulled
}

const pullRemoteChanges = async () => {
  const holdings = await pullHoldings()
  const snapshots = await pullSnapshots()
  const fxRates = await pullFxRates()
  const syncMeta = await pullSyncMeta()
  return holdings + snapshots + fxRates + syncMeta
}

const performSync = async () => {
  const pushed = await pushPendingChanges()
  const pulled = await pullRemoteChanges()
  return { pushed, pulled }
}

const markPendingAsError = async () => {
  await db.holdings.where('syncState').equals(SYNC_PENDING).modify({ syncState: SYNC_ERROR })
  await db.price_snapshots.where('syncState').equals(SYNC_PENDING).modify({ syncState: SYNC_ERROR })
  await db.fx_rates.where('syncState').equals(SYNC_PENDING).modify({ syncState: SYNC_ERROR })
  await db.sync_meta.where('syncState').equals(SYNC_PENDING).modify({ syncState: SYNC_ERROR })
}

export const setSyncUser = (uid) => {
  currentUid = uid
}

export const syncNowWithCloud = async () => {
  if (!currentUid) {
    return { pushed: 0, pulled: 0 }
  }

  if (syncInFlight) {
    return syncInFlight
  }

  syncInFlight = (async () => {
    try {
      const result = await performSync()
      return result
    } catch (error) {
      await markPendingAsError()
      throw error
    }
  })()

  try {
    return await syncInFlight
  } finally {
    syncInFlight = null
  }
}

export const initCloudSync = async (uid) => {
  setSyncUser(uid)

  if (!uid) {
    return
  }

  await markLegacyRowsPending()
  // Avoid blocking login UX on first full sync; run it in background.
  syncNowWithCloud().catch(() => {})

  if (onlineHandler) {
    window.removeEventListener('online', onlineHandler)
  }
  onlineHandler = () => {
    syncNowWithCloud().catch(() => {})
  }
  window.addEventListener('online', onlineHandler)

  if (autoSyncTimer) {
    window.clearInterval(autoSyncTimer)
  }

  autoSyncTimer = window.setInterval(() => {
    syncNowWithCloud().catch(() => {})
  }, AUTO_SYNC_INTERVAL_MS)
}

export const stopCloudSync = () => {
  if (autoSyncTimer) {
    window.clearInterval(autoSyncTimer)
    autoSyncTimer = null
  }

  if (onlineHandler) {
    window.removeEventListener('online', onlineHandler)
    onlineHandler = null
  }

  syncInFlight = null
  currentUid = null
}
