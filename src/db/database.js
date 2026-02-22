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

    this.version(3)
      .stores({
        holdings: '++id,[symbol+market],symbol,market,sortOrder,updatedAt,deletedAt,syncState',
        price_snapshots: '++id,holdingId,symbol,market,capturedAt,[holdingId+capturedAt],updatedAt,deletedAt,syncState',
        fx_rates: '&pair,fetchedAt,updatedAt,deletedAt,syncState',
        sync_meta: '&key,lastUpdatedAt,updatedAt,deletedAt,syncState',
        expense_entries: '++id,occurredAt,category',
      })
      .upgrade(async (tx) => {
        const nowIso = new Date().toISOString()

        const holdings = await tx.table('holdings').toArray()
        for (const holding of holdings) {
          await tx.table('holdings').update(holding.id, {
            deletedAt: holding.deletedAt ?? null,
            syncState: holding.syncState ?? 'pending',
            updatedAt: holding.updatedAt ?? nowIso,
          })
        }

        const snapshots = await tx.table('price_snapshots').toArray()
        for (const snapshot of snapshots) {
          await tx.table('price_snapshots').update(snapshot.id, {
            updatedAt: snapshot.updatedAt ?? snapshot.capturedAt ?? nowIso,
            deletedAt: snapshot.deletedAt ?? null,
            syncState: snapshot.syncState ?? 'pending',
          })
        }

        const fxRates = await tx.table('fx_rates').toArray()
        for (const rate of fxRates) {
          await tx.table('fx_rates').put({
            ...rate,
            updatedAt: rate.updatedAt ?? rate.fetchedAt ?? nowIso,
            deletedAt: rate.deletedAt ?? null,
            syncState: rate.syncState ?? 'pending',
          })
        }

        const syncMeta = await tx.table('sync_meta').toArray()
        for (const meta of syncMeta) {
          await tx.table('sync_meta').put({
            ...meta,
            updatedAt: meta.updatedAt ?? meta.lastUpdatedAt ?? nowIso,
            deletedAt: meta.deletedAt ?? null,
            syncState: meta.syncState ?? 'pending',
          })
        }
      })

    this.version(4)
      .stores({
        holdings: '++id,[symbol+market],symbol,market,sortOrder,updatedAt,deletedAt,syncState',
        price_snapshots: '++id,holdingId,symbol,market,capturedAt,[holdingId+capturedAt],updatedAt,deletedAt,syncState',
        fx_rates: '&pair,fetchedAt,updatedAt,deletedAt,syncState',
        sync_meta: '&key,lastUpdatedAt,updatedAt,deletedAt,syncState',
        expense_entries: '++id,occurredAt,category',
        cash_accounts: '++id,[bankName+accountAlias],bankName,accountAlias,updatedAt,deletedAt,syncState',
      })

    this.version(5)
      .stores({
        holdings: '++id,[symbol+market],symbol,market,assetTag,sortOrder,updatedAt,deletedAt,syncState',
        price_snapshots: '++id,holdingId,symbol,market,capturedAt,[holdingId+capturedAt],updatedAt,deletedAt,syncState',
        fx_rates: '&pair,fetchedAt,updatedAt,deletedAt,syncState',
        sync_meta: '&key,lastUpdatedAt,updatedAt,deletedAt,syncState',
        expense_entries: '++id,occurredAt,category',
        cash_accounts: '++id,[bankName+accountAlias],bankName,accountAlias,updatedAt,deletedAt,syncState',
        app_config: '&key',
      })
      .upgrade(async (tx) => {
        const holdings = await tx.table('holdings').toArray()
        for (const holding of holdings) {
          await tx.table('holdings').update(holding.id, {
            assetTag: holding.assetTag || 'STOCK',
          })
        }

        const configTable = tx.table('app_config')
        const existingTags = await configTable.get('holding_tags')
        if (!existingTags) {
          await configTable.put({
            key: 'holding_tags',
            options: [
              { value: 'STOCK', label: '個股', isDefault: true },
              { value: 'ETF', label: 'ETF' },
              { value: 'BOND', label: '債券' },
            ],
            updatedAt: new Date().toISOString(),
          })
        }
      })

    this.version(6)
      .stores({
        holdings: '++id,[symbol+market],symbol,market,assetTag,sortOrder,updatedAt,deletedAt,syncState',
        price_snapshots: '++id,holdingId,symbol,market,capturedAt,[holdingId+capturedAt],updatedAt,deletedAt,syncState',
        fx_rates: '&pair,fetchedAt,updatedAt,deletedAt,syncState',
        sync_meta: '&key,lastUpdatedAt,updatedAt,deletedAt,syncState',
        expense_entries: '++id,occurredAt,category',
        cash_accounts: '++id,[bankName+accountAlias],bankName,accountAlias,updatedAt,deletedAt,syncState',
        app_config: '&key',
        outbox: '++id,uid,status,collection,docId,createdAt,retryAt',
      })

    this.version(7)
      .stores({
        holdings: '++id,[symbol+market],symbol,market,assetTag,sortOrder,updatedAt,deletedAt,syncState',
        price_snapshots: '++id,holdingId,symbol,market,capturedAt,[holdingId+capturedAt],updatedAt,deletedAt,syncState',
        fx_rates: '&pair,fetchedAt,updatedAt,deletedAt,syncState',
        sync_meta: '&key,lastUpdatedAt,updatedAt,deletedAt,syncState',
        expense_entries: '++id,occurredAt,category',
        cash_accounts: '++id,[bankName+accountAlias],bankName,accountAlias,updatedAt,deletedAt,syncState',
        cash_balance_snapshots: '++id,cashAccountId,bankName,accountAlias,capturedAt,[cashAccountId+capturedAt],updatedAt,deletedAt,syncState',
        app_config: '&key',
        outbox: '++id,uid,status,collection,docId,createdAt,retryAt',
      })

    this.version(8)
      .stores({
        holdings: '++id,[symbol+market],symbol,market,assetTag,sortOrder,updatedAt,deletedAt,syncState',
        price_snapshots: '++id,holdingId,symbol,market,capturedAt,[holdingId+capturedAt],updatedAt,deletedAt,syncState',
        fx_rates: '&pair,fetchedAt,updatedAt,deletedAt,syncState',
        sync_meta: '&key,lastUpdatedAt,updatedAt,deletedAt,syncState',
        expense_entries: '++id,remoteKey,occurredAt,entryType,budgetId,categoryId,updatedAt,deletedAt,syncState',
        expense_categories: '++id,remoteKey,name,updatedAt,deletedAt,syncState',
        budgets: '++id,remoteKey,budgetType,startDate,updatedAt,deletedAt,syncState',
        cash_accounts: '++id,[bankName+accountAlias],bankName,accountAlias,updatedAt,deletedAt,syncState',
        cash_balance_snapshots: '++id,cashAccountId,bankName,accountAlias,capturedAt,[cashAccountId+capturedAt],updatedAt,deletedAt,syncState',
        app_config: '&key',
        outbox: '++id,uid,status,collection,docId,createdAt,retryAt',
      })
      .upgrade(async (tx) => {
        const nowIso = new Date().toISOString()
        const expenseEntries = await tx.table('expense_entries').toArray()
        for (const entry of expenseEntries) {
          const occurredAt = entry.occurredAt || entry.createdAt || nowIso.slice(0, 10)
          await tx.table('expense_entries').update(entry.id, {
            remoteKey: entry.remoteKey || `expense_${entry.id}`,
            name: entry.name || entry.title || '未命名支出',
            amountTwd: Number(entry.amountTwd ?? entry.amount ?? 0) || 0,
            occurredAt,
            entryType: entry.entryType || 'ONE_TIME',
            recurrenceType: entry.recurrenceType || null,
            monthlyDay: entry.monthlyDay ?? null,
            yearlyMonth: entry.yearlyMonth ?? null,
            yearlyDay: entry.yearlyDay ?? null,
            recurrenceUntil: entry.recurrenceUntil ?? null,
            categoryId: entry.categoryId ?? null,
            budgetId: entry.budgetId ?? null,
            createdAt: entry.createdAt || nowIso,
            updatedAt: entry.updatedAt || entry.occurredAt || nowIso,
            deletedAt: entry.deletedAt ?? null,
            syncState: entry.syncState || 'pending',
          })
        }
      })
  }
}

export const db = new StockDatabase()

export const SYNC_KEY_PRICES = 'prices'
export const FX_PAIR_USD_TWD = 'USD_TWD'
