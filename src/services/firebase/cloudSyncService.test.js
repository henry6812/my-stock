import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../../db/database'
import {
  applyCollectionRecordLocally,
  removeCollectionDocLocally,
} from './cloudSyncService'

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

const baseTemplate = {
  remoteKey: 'template_abc',
  name: '停車',
  amountTwd: 60,
  categoryRemoteKey: 'category_x',
  budgetRemoteKey: null,
  payer: '小明',
  expenseKind: '個人',
  sortOrder: 1,
  createdAt: '2026-10-04T00:00:00.000Z',
  updatedAt: '2026-10-04T00:00:00.000Z',
  deletedAt: null,
}

// Templates keep only remote keys for their category / budget links; local ids
// are resolved when the dashboard view is built.
describe('applyCollectionRecordLocally (expense_templates)', () => {
  beforeEach(async () => {
    await db.expense_templates.clear()
  })

  it('adds a template with its remote association keys', async () => {
    await applyCollectionRecordLocally({ collectionName: 'expense_templates', record: baseTemplate })
    const [row] = await db.expense_templates.toArray()
    expect(row).toMatchObject({
      remoteKey: 'template_abc',
      name: '停車',
      amountTwd: 60,
      categoryRemoteKey: 'category_x',
      budgetRemoteKey: null,
      payer: '小明',
      expenseKind: '個人',
      sortOrder: 1,
      syncState: 'synced',
    })
  })

  it('updates only when the remote copy is newer', async () => {
    await applyCollectionRecordLocally({ collectionName: 'expense_templates', record: baseTemplate })
    await applyCollectionRecordLocally({
      collectionName: 'expense_templates',
      record: { ...baseTemplate, name: '舊的', updatedAt: '2026-10-03T00:00:00.000Z' },
    })
    await applyCollectionRecordLocally({
      collectionName: 'expense_templates',
      record: { ...baseTemplate, name: '停車場', amountTwd: null, updatedAt: '2026-10-04T01:00:00.000Z' },
    })
    const rows = await db.expense_templates.toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('停車場')
    expect(rows[0].amountTwd).toBeNull()
  })

  it('removes the local row when the remote doc is deleted', async () => {
    await applyCollectionRecordLocally({ collectionName: 'expense_templates', record: baseTemplate })
    await removeCollectionDocLocally({
      collectionName: 'expense_templates',
      docId: 'template_abc',
      snapshotData: baseTemplate,
    })
    expect(await db.expense_templates.toArray()).toEqual([])
  })
})


// Adding a stock another holder already owns writes a new doc and round-trips
// it locally; matching by symbol+market alone used to pick the other holder's
// row and overwrite it, so their holding vanished.
describe('applyCollectionRecordLocally (holdings, another holder owns the stock)', () => {
  beforeEach(async () => {
    await db.holdings.clear()
    await db.cash_accounts.clear()
  })

  it('adds a new row instead of taking over the other holder\'s row', async () => {
    await db.holdings.add({
      symbol: '2330',
      market: 'TW',
      holder: 'Po',
      shares: 100,
      updatedAt: '2026-09-01T00:00:00.000Z',
    })

    await applyCollectionRecordLocally({
      collectionName: 'holdings',
      record: {
        symbol: '2330',
        market: 'TW',
        holder: 'Wei',
        shares: 20,
        updatedAt: '2026-10-06T00:00:00.000Z',
      },
    })

    const rows = await db.holdings.toArray()
    expect(rows.map((row) => [row.holder, row.shares]).sort()).toEqual([
      ['Po', 100],
      ['Wei', 20],
    ])
  })

  it('still adopts a legacy row that has no holder', async () => {
    await db.holdings.add({
      symbol: '2330',
      market: 'TW',
      holder: null,
      shares: 100,
      updatedAt: '2026-09-01T00:00:00.000Z',
    })

    await applyCollectionRecordLocally({
      collectionName: 'holdings',
      record: {
        symbol: '2330',
        market: 'TW',
        holder: 'Po',
        shares: 100,
        updatedAt: '2026-10-06T00:00:00.000Z',
      },
    })

    const rows = await db.holdings.toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0].holder).toBe('Po')
  })

  it('adds a new cash account instead of taking over the other holder\'s one', async () => {
    await db.cash_accounts.add({
      bankName: '台新',
      accountAlias: '薪轉',
      holder: 'Po',
      balanceTwd: 1000,
      updatedAt: '2026-09-01T00:00:00.000Z',
    })

    await applyCollectionRecordLocally({
      collectionName: 'cash_accounts',
      record: {
        bankName: '台新',
        accountAlias: '薪轉',
        holder: 'Wei',
        balanceTwd: 500,
        updatedAt: '2026-10-06T00:00:00.000Z',
      },
    })

    const rows = await db.cash_accounts.toArray()
    expect(rows.map((row) => [row.holder, row.balanceTwd]).sort()).toEqual([
      ['Po', 1000],
      ['Wei', 500],
    ])
  })
})
