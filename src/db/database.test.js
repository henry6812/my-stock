import { describe, it, expect, beforeEach } from 'vitest'
import { db, DB_MIN_KEY, DB_MAX_KEY } from './database'

// Snapshots can be inserted out of chronological order (e.g. the Firestore
// listener replays docs in arbitrary order after a re-login). Index queries
// must return rows in index order, like Dexie, not in insertion order.
describe('InMemoryQuery ordering', () => {
  beforeEach(async () => {
    await db.price_snapshots.clear()
    await db.price_snapshots.add({ holdingId: 1, capturedAt: '2026-09-30T14:10:00.000Z', price: 230.42 })
    await db.price_snapshots.add({ holdingId: 1, capturedAt: '2026-03-01T10:00:00.000Z', price: 172.72 })
    await db.price_snapshots.add({ holdingId: 2, capturedAt: '2026-09-30T14:10:00.000Z', price: 608.63 })
    await db.price_snapshots.add({ holdingId: 1, capturedAt: '2026-09-29T14:10:00.000Z', price: 225.0 })
  })

  const latestFor = (holdingId, upper = DB_MAX_KEY) =>
    db.price_snapshots
      .where('[holdingId+capturedAt]')
      .between([holdingId, DB_MIN_KEY], [holdingId, upper], true, true)
      .reverse()
      .toArray()

  it('returns the newest snapshot first regardless of insertion order', async () => {
    const rows = await latestFor(1)
    expect(rows.map((r) => r.price)).toEqual([230.42, 225.0, 172.72])
  })

  it('returns ascending index order without reverse()', async () => {
    const rows = await db.price_snapshots
      .where('[holdingId+capturedAt]')
      .between([1, DB_MIN_KEY], [1, DB_MAX_KEY])
      .toArray()
    expect(rows.map((r) => r.capturedAt)).toEqual([
      '2026-03-01T10:00:00.000Z',
      '2026-09-29T14:10:00.000Z',
      '2026-09-30T14:10:00.000Z',
    ])
  })

  it('respects an upper bound when picking the latest at-or-before snapshot', async () => {
    const rows = await latestFor(1, '2026-09-30T00:00:00.000Z')
    expect(rows[0].price).toBe(225.0)
  })
})
