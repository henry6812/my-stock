import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db, DB_MIN_KEY, DB_MAX_KEY, flushPersistedTables } from './database'

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

// The cloud listener replays every snapshot on each sign-in. Rewriting the
// whole table to localStorage after every row made that O(n²) and froze the
// app on phones, so writes in one burst are persisted once.
describe('PersistedInMemoryTable persistence', () => {
  const STORAGE_KEY = 'my-stock:price_snapshots'
  const storedRows = () => JSON.parse(window.localStorage.getItem(STORAGE_KEY)).rows

  beforeEach(async () => {
    await db.price_snapshots.clear()
    flushPersistedTables()
  })

  it('writes a burst of adds to storage once', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    try {
      for (let index = 0; index < 50; index += 1) {
        await db.price_snapshots.add({ holdingId: 1, capturedAt: `2026-01-${index}`, price: index })
      }
      await new Promise((resolve) => setTimeout(resolve, 0))
      const writes = setItem.mock.calls.filter(([key]) => key === STORAGE_KEY)
      expect(writes).toHaveLength(1)
      expect(storedRows()).toHaveLength(50)
    } finally {
      setItem.mockRestore()
    }
  })

  it('flushes pending writes when the page is hidden', async () => {
    await db.price_snapshots.add({ holdingId: 1, capturedAt: '2026-01-01', price: 1 })
    window.dispatchEvent(new Event('pagehide'))
    expect(storedRows()).toHaveLength(1)
  })
})
