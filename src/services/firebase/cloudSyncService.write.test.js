import { describe, it, expect, beforeEach, vi } from 'vitest'

// Real write path down to the Firestore SDK: portfolioService → mirrorToCloud
// → writeCollectionRecord → setDoc. Only the SDK itself is mocked, so the
// assertions are on exactly what would be sent to Firestore.
const firestoreMocks = vi.hoisted(() => ({
  setDoc: null,
}))
firestoreMocks.setDoc = vi.fn(async () => {})

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((...parts) => parts.slice(1).join('/')),
  deleteDoc: vi.fn(),
  doc: vi.fn((collectionPath, docId) => `${collectionPath}/${docId}`),
  onSnapshot: vi.fn((_ref, onNext) => {
    queueMicrotask(() => onNext({ docChanges: () => [] }))
    return () => {}
  }),
  serverTimestamp: vi.fn(() => 'SERVER_TS'),
  setDoc: (...args) => firestoreMocks.setDoc(...args),
}))

vi.mock('./firebaseApp', () => ({
  firestoreDb: {},
  assertFirebaseConfigured: () => {},
}))

const { db } = await import('../../db/database')
const { initCloudSync, stopCloudSync, writeCollectionRecord } = await import('./cloudSyncService')
const { saveValuationSettings, saveIncomeSettings } = await import('../portfolioService')

const lastSetDocCall = () => firestoreMocks.setDoc.mock.calls.at(-1)

let clock = Date.parse('2026-10-11T00:00:00.000Z')
const tick = () => {
  clock += 1000
  vi.setSystemTime(clock)
}

describe('writeCollectionRecord → Firestore', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    stopCloudSync()
    await initCloudSync('uid-1')
    await db.app_config.clear()
    firestoreMocks.setDoc.mockClear()
  })

  // set-merge deep-merges nested maps, so a key dropped from `valuation`
  // locally would survive in the cloud doc and come back on the next load.
  it('replaces the whole valuation doc (no merge) so removed nested keys disappear', async () => {
    tick()
    await saveValuationSettings({
      market: 'TW',
      symbol: '2330',
      patch: { model: { quarters: { '2026Q4': { grossMargin: 0.6 } } } },
    })
    tick()
    await saveValuationSettings({
      market: 'TW',
      symbol: '2330',
      patch: { model: { quarters: { '2026Q4': { grossMargin: null } } } },
    })

    const [ref, payload, options] = lastSetDocCall()
    expect(ref).toBe('users/uid-1/app_config/valuation:TW_2330')
    expect(options).toEqual({ merge: false })
    expect(payload.key).toBe('valuation:TW_2330')
    expect(payload.valuation.model.quarters).toEqual({})
    expect(payload.serverUpdatedAt).toBe('SERVER_TS')
  })

  it('keeps merging for other app_config docs', async () => {
    tick()
    await saveIncomeSettings({ defaultMonthlyIncomeTwd: 80000, monthOverrides: [] })

    const [, payload, options] = lastSetDocCall()
    expect(payload).not.toHaveProperty('valuation')
    expect(options).toEqual({ merge: true })
  })

  it('keeps merging for other collections', async () => {
    await writeCollectionRecord({
      collectionName: 'holdings',
      record: { symbol: 'NVDA', market: 'US', holder: 'Po', shares: 1, updatedAt: '2026-10-11T00:00:00.000Z' },
    })

    const [, , options] = lastSetDocCall()
    expect(options).toEqual({ merge: true })
  })
})
