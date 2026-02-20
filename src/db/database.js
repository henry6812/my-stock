import Dexie from 'dexie'

class StockDatabase extends Dexie {
  constructor() {
    super('stock-portfolio-db')

    this.version(1).stores({
      holdings: '++id,[symbol+market],symbol,market,updatedAt',
      price_snapshots: '++id,holdingId,symbol,market,capturedAt,[holdingId+capturedAt]',
      fx_rates: '&pair,fetchedAt',
      sync_meta: '&key,lastUpdatedAt',
      expense_entries: '++id,occurredAt,category',
    })

    this.version(2)
      .stores({
        holdings: '++id,[symbol+market],symbol,market,sortOrder,updatedAt',
        price_snapshots: '++id,holdingId,symbol,market,capturedAt,[holdingId+capturedAt]',
        fx_rates: '&pair,fetchedAt',
        sync_meta: '&key,lastUpdatedAt',
        expense_entries: '++id,occurredAt,category',
      })
      .upgrade(async (tx) => {
        const holdings = await tx.table('holdings').toArray()
        holdings.sort((a, b) => {
          if (!a?.updatedAt && !b?.updatedAt) return 0
          if (!a?.updatedAt) return 1
          if (!b?.updatedAt) return -1
          return a.updatedAt > b.updatedAt ? -1 : 1
        })

        for (let i = 0; i < holdings.length; i += 1) {
          const holding = holdings[i]
          await tx.table('holdings').update(holding.id, { sortOrder: i + 1 })
        }
      })
  }
}

export const db = new StockDatabase()

export const SYNC_KEY_PRICES = 'prices'
export const FX_PAIR_USD_TWD = 'USD_TWD'
