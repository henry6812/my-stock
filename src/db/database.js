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
  }
}

export const db = new StockDatabase()

export const SYNC_KEY_PRICES = 'prices'
export const FX_PAIR_USD_TWD = 'USD_TWD'
