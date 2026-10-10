import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('./firebase/cloudSyncService', async (importOriginal) => ({
  ...(await importOriginal()),
  assertCloudWriteReady: vi.fn(),
  writeCollectionRecord: vi.fn(),
  deleteCollectionDoc: vi.fn(),
}))

import { db } from '../db/database'
import { deleteCollectionDoc } from './firebase/cloudSyncService'
import { getCashAccountsView, pruneEarlierSnapshotsSameDay } from './portfolioService'

const snapshot = (holdingId, capturedAt, extra = {}) => ({
  holdingId,
  symbol: holdingId === 1 ? '2330' : 'NVDA',
  market: holdingId === 1 ? 'TW' : 'US',
  holder: 'Po',
  price: 100,
  capturedAt,
  updatedAt: capturedAt,
  deletedAt: null,
  ...extra,
})

const capturedTimes = async (holdingId) =>
  (await db.price_snapshots.toArray())
    .filter((row) => row.holdingId === holdingId)
    .map((row) => row.capturedAt)
    .sort()

// Every price refresh used to add a snapshot, so one day could hold dozens
// per holding. Only the day's last one is ever read (latest price, the
// previous Taipei day-end baseline, daily trend points), so a refresh now
// drops the earlier same-day ones.
describe('pruneEarlierSnapshotsSameDay', () => {
  beforeEach(async () => {
    await db.price_snapshots.clear()
    deleteCollectionDoc.mockReset()
  })

  it('removes earlier snapshots of the same Taipei day, locally and in the cloud', async () => {
    // 2026-10-05 in Taipei runs from 2026-10-04T16:00Z to 2026-10-05T16:00Z.
    await db.price_snapshots.add(snapshot(1, '2026-10-04T15:59:00.000Z')) // previous day
    await db.price_snapshots.add(snapshot(1, '2026-10-04T16:00:00.000Z'))
    await db.price_snapshots.add(snapshot(1, '2026-10-05T06:00:00.000Z'))
    const latest = snapshot(1, '2026-10-05T10:00:00.000Z')
    await db.price_snapshots.add(latest)

    await pruneEarlierSnapshotsSameDay(latest)

    expect(await capturedTimes(1)).toEqual([
      '2026-10-04T15:59:00.000Z',
      '2026-10-05T10:00:00.000Z',
    ])
    expect(deleteCollectionDoc.mock.calls.map(([args]) => args)).toEqual([
      { collectionName: 'price_snapshots', docId: 'TW_2330_Po_2026-10-04T16:00:00.000Z' },
      { collectionName: 'price_snapshots', docId: 'TW_2330_Po_2026-10-05T06:00:00.000Z' },
    ])
  })

  it('leaves other holdings alone', async () => {
    await db.price_snapshots.add(snapshot(2, '2026-10-05T06:00:00.000Z'))
    const latest = snapshot(1, '2026-10-05T10:00:00.000Z')
    await db.price_snapshots.add(latest)

    await pruneEarlierSnapshotsSameDay(latest)

    expect(await capturedTimes(2)).toEqual(['2026-10-05T06:00:00.000Z'])
    expect(deleteCollectionDoc).not.toHaveBeenCalled()
  })

  it('uses each old snapshot\'s own holder for its cloud key', async () => {
    await db.price_snapshots.add(snapshot(1, '2026-10-05T06:00:00.000Z', { holder: null }))
    const latest = snapshot(1, '2026-10-05T10:00:00.000Z')
    await db.price_snapshots.add(latest)

    await pruneEarlierSnapshotsSameDay(latest)

    expect(deleteCollectionDoc).toHaveBeenCalledWith({
      collectionName: 'price_snapshots',
      docId: 'TW_2330_UNSET_2026-10-05T06:00:00.000Z',
    })
  })
})

describe('pruneEarlierSnapshotsSameDay failures', () => {
  beforeEach(async () => {
    await db.price_snapshots.clear()
    deleteCollectionDoc.mockReset()
  })

  it('keeps the row and does not throw when the cloud delete fails', async () => {
    deleteCollectionDoc.mockRejectedValueOnce(new Error('offline'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await db.price_snapshots.add(snapshot(1, '2026-10-05T06:00:00.000Z'))
    const latest = snapshot(1, '2026-10-05T10:00:00.000Z')
    await db.price_snapshots.add(latest)

    await expect(pruneEarlierSnapshotsSameDay(latest)).resolves.toBeUndefined()

    expect(await capturedTimes(1)).toHaveLength(2)
    warn.mockRestore()
  })
})

// The stale-balance hint keys off when the balance was last saved, so an
// alias or holder edit (which bumps updatedAt) doesn't hide it.
describe('getCashAccountsView balanceUpdatedAt', () => {
  beforeEach(async () => {
    await db.cash_accounts.clear()
    await db.cash_balance_snapshots.clear()
  })

  const addAccount = (accountAlias, updatedAt) =>
    db.cash_accounts.add({
      bankName: '台新',
      accountAlias,
      holder: null,
      balanceTwd: 1000,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt,
      deletedAt: null,
    })

  it('uses the newest balance snapshot, not the account edit time', async () => {
    const id = await addAccount('日常', '2026-10-09T00:00:00.000Z')
    for (const capturedAt of ['2026-08-01T00:00:00.000Z', '2026-08-20T00:00:00.000Z']) {
      await db.cash_balance_snapshots.add({ cashAccountId: id, bankName: '台新', accountAlias: '日常', holder: null, balanceTwd: 1000, capturedAt, deletedAt: null })
    }
    const { rows } = await getCashAccountsView()
    expect(rows[0].balanceUpdatedAt).toBe('2026-08-20T00:00:00.000Z')
  })

  it('falls back to updatedAt for an account without snapshots', async () => {
    await addAccount('備用', '2026-07-01T00:00:00.000Z')
    const { rows } = await getCashAccountsView()
    expect(rows[0].balanceUpdatedAt).toBe('2026-07-01T00:00:00.000Z')
  })
})
