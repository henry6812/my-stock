import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../../db/database'
import { applyCollectionRecordLocally } from './cloudSyncService'

const baseSnapshot = {
  symbol: 'NVDA',
  market: 'US',
  holder: 'Po',
  price: 230.42,
  previousClose: 225.1,
  currency: 'USD',
  fxRateToTwd: 31.84,
  valueTwd: 366827,
  capturedAt: '2026-09-30T14:10:53.080Z',
  updatedAt: '2026-09-30T14:10:53.080Z',
}

// previousClose is the baseline for 漲跌; dropping it on the way into the
// local store makes every daily change render as "--".
describe('applyCollectionRecordLocally (price_snapshots)', () => {
  let holdingId

  beforeEach(async () => {
    await db.holdings.clear()
    await db.price_snapshots.clear()
    holdingId = await db.holdings.add({
      symbol: 'NVDA',
      market: 'US',
      holder: 'Po',
      shares: 50,
      updatedAt: '2026-09-01T00:00:00.000Z',
    })
  })

  it('keeps previousClose when adding a snapshot', async () => {
    await applyCollectionRecordLocally({ collectionName: 'price_snapshots', record: baseSnapshot })
    const [row] = await db.price_snapshots.toArray()
    expect(row.holdingId).toBe(holdingId)
    expect(row.previousClose).toBe(225.1)
  })

  it('keeps previousClose when updating an existing snapshot', async () => {
    await applyCollectionRecordLocally({
      collectionName: 'price_snapshots',
      record: { ...baseSnapshot, previousClose: null },
    })
    await applyCollectionRecordLocally({
      collectionName: 'price_snapshots',
      record: { ...baseSnapshot, updatedAt: '2026-09-30T14:11:00.000Z' },
    })
    const rows = await db.price_snapshots.toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0].previousClose).toBe(225.1)
  })

  it('stores null when the source has no previous close (e.g. TPEX)', async () => {
    await applyCollectionRecordLocally({
      collectionName: 'price_snapshots',
      record: { ...baseSnapshot, previousClose: undefined },
    })
    const [row] = await db.price_snapshots.toArray()
    expect(row.previousClose).toBeNull()
  })
})
