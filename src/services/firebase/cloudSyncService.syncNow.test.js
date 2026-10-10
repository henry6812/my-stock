import { describe, it, expect, beforeEach, vi } from 'vitest'

// Each subscribe answers with an empty first snapshot, so startRealtimeSync
// resolves and the listeners count as ready. Error callbacks are kept so a
// test can make a listener fail afterwards.
const firestoreMocks = vi.hoisted(() => ({
  errorCallbacks: [],
  onSnapshot: null,
}))
firestoreMocks.onSnapshot = vi.fn((_ref, onNext, onError) => {
  firestoreMocks.errorCallbacks.push(onError)
  queueMicrotask(() => onNext({ docChanges: () => [] }))
  return () => {}
})

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((...parts) => parts.slice(1).join('/')),
  deleteDoc: vi.fn(),
  doc: vi.fn(),
  onSnapshot: (...args) => firestoreMocks.onSnapshot(...args),
  serverTimestamp: vi.fn(),
  setDoc: vi.fn(),
}))

vi.mock('./firebaseApp', () => ({
  firestoreDb: {},
  assertFirebaseConfigured: () => {},
}))

const { db } = await import('../../db/database')
const { initCloudSync, stopCloudSync, syncNowWithCloud } = await import('./cloudSyncService')

const COLLECTION_COUNT = 12

// The realtime listeners already keep the local store current; a sync after
// every write used to tear them down, wipe the store and re-download every
// collection (thousands of price snapshots) each time.
describe('syncNowWithCloud', () => {
  beforeEach(async () => {
    stopCloudSync()
    await initCloudSync('uid-1')
    firestoreMocks.onSnapshot.mockClear()
  })

  it('subscribes every collection on sign-in', async () => {
    stopCloudSync()
    await initCloudSync('uid-1')
    expect(firestoreMocks.onSnapshot).toHaveBeenCalledTimes(COLLECTION_COUNT)
  })

  it('keeps the live listeners and local data instead of re-downloading', async () => {
    await db.holdings.add({ symbol: 'NVDA', market: 'US', holder: 'Po', shares: 1 })

    const result = await syncNowWithCloud()

    expect(firestoreMocks.onSnapshot).not.toHaveBeenCalled()
    expect(await db.holdings.toArray()).toHaveLength(1)
    expect(result.triggeredFullResync).toBe(false)
  })

  it('resubscribes after a listener has failed', async () => {
    firestoreMocks.errorCallbacks.at(-1)(new Error('permission-denied'))

    const result = await syncNowWithCloud()

    expect(firestoreMocks.onSnapshot).toHaveBeenCalledTimes(COLLECTION_COUNT)
    expect(result.triggeredFullResync).toBe(true)
  })
})
