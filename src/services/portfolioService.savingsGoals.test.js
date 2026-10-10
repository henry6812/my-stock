import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('./firebase/cloudSyncService', async (importOriginal) => ({
  ...(await importOriginal()),
  assertCloudWriteReady: vi.fn(),
  writeCollectionRecord: vi.fn(),
  deleteCollectionDoc: vi.fn(),
  registerMigratedDocKey: vi.fn(),
}))

import { db } from '../db/database'
import { buildCashAccountKey } from './firebase/firestoreMappers'
import {
  exportBackupData,
  getExpenseDashboardView,
  removeSavingsGoal,
  setSavingsGoalArchived,
  updateCashAccountHolder,
  upsertSavingsGoal,
} from './portfolioService'

// Writes apply locally only when newer, so each call gets its own second.
let clock = Date.parse('2026-10-10T02:00:00.000Z')
const tick = () => {
  clock += 1000
  vi.setSystemTime(clock)
}

const addCash = async (accountAlias, balanceTwd, holder = 'Po') => {
  const record = {
    bankCode: '812',
    bankName: '台新',
    accountAlias,
    holder,
    balanceTwd,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
  }
  const id = await db.cash_accounts.add(record)
  return { id, key: buildCashAccountKey(record) }
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  tick()
  await db.savings_goals.clear()
  await db.cash_accounts.clear()
  await db.cash_balance_snapshots.clear()
  await db.expense_entries.clear()
  await db.app_config.clear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('upsertSavingsGoal', () => {
  it('creates a goal starting from the linked balances today', async () => {
    const a = await addCash('日常', 30000)
    const b = await addCash('旅遊', 20000)
    const { id, created } = await upsertSavingsGoal({
      name: '日本旅遊', icon: null, kind: 'deadline', targetTwd: 150000, deadline: '2027-03-31', cashAccountKeys: [a.key, b.key],
    })
    expect(created).toBe(true)
    const goal = await db.savings_goals.get(id)
    expect(goal).toMatchObject({
      name: '日本旅遊',
      kind: 'deadline',
      targetTwd: 150000,
      deadline: '2027-03-31',
      startTwd: 50000,
      startDate: '2026-10-10',
      cashAccountKeys: [a.key, b.key],
      sortOrder: 1,
      archivedAt: null,
      deletedAt: null,
    })
    expect(goal.remoteKey).toMatch(/^goal_/)
  })

  it('keeps the start when editing, but restarts it when a goal gains a deadline', async () => {
    const a = await addCash('日常', 30000)
    const { id } = await upsertSavingsGoal({ name: '存錢', kind: 'open', targetTwd: 100000, cashAccountKeys: [a.key] })
    await db.cash_accounts.update(a.id, { balanceTwd: 45000 })

    tick()
    await upsertSavingsGoal({ id, name: '存更多', kind: 'open', targetTwd: 200000, cashAccountKeys: [a.key] })
    expect(await db.savings_goals.get(id)).toMatchObject({ name: '存更多', targetTwd: 200000, startTwd: 30000 })

    tick()
    await upsertSavingsGoal({ id, name: '存更多', kind: 'deadline', targetTwd: 200000, deadline: '2027-01-01', cashAccountKeys: [a.key] })
    expect(await db.savings_goals.get(id)).toMatchObject({ kind: 'deadline', startTwd: 45000, startDate: '2026-10-10' })
  })

  it('lets an overdue goal be edited without moving its deadline', async () => {
    const goalId = await db.savings_goals.add({
      remoteKey: 'goal_old', name: '舊目標', icon: null, kind: 'deadline', targetTwd: 1000, targetMonths: null,
      deadline: '2026-05-01', startTwd: 0, startDate: '2026-01-01', cashAccountKeys: [], sortOrder: 1,
      archivedAt: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', deletedAt: null,
    })
    await upsertSavingsGoal({ id: goalId, name: '舊目標改名', kind: 'deadline', targetTwd: 1000, deadline: '2026-05-01', cashAccountKeys: [] })
    expect((await db.savings_goals.get(goalId)).name).toBe('舊目標改名')
  })
})

describe('archive and remove', () => {
  it('archives, unarchives and soft-deletes', async () => {
    const { id } = await upsertSavingsGoal({ name: '買車', kind: 'open', targetTwd: 500000, cashAccountKeys: [] })
    tick()
    await setSavingsGoalArchived({ id, archived: true })
    expect((await db.savings_goals.get(id)).archivedAt).toBe(new Date(clock).toISOString())
    tick()
    await setSavingsGoalArchived({ id, archived: false })
    expect((await db.savings_goals.get(id)).archivedAt).toBeNull()
    tick()
    await removeSavingsGoal({ id })
    expect((await db.savings_goals.get(id)).deletedAt).toBe(new Date(clock).toISOString())
    await expect(removeSavingsGoal({ id })).rejects.toThrow('Savings goal not found')
  })
})

describe('cash account key changes', () => {
  it('keeps tracking an account after its holder changes', async () => {
    // No holder_options config → the defaults (Po, Wei) apply.
    const a = await addCash('日常', 30000, 'Po')
    const { id } = await upsertSavingsGoal({ name: '存錢', kind: 'open', targetTwd: 100000, cashAccountKeys: [a.key, 'other'] })
    tick()
    await updateCashAccountHolder({ id: a.id, holder: 'Wei' })
    const newKey = buildCashAccountKey({ ...(await db.cash_accounts.get(a.id)) })
    expect(newKey).not.toBe(a.key)
    expect((await db.savings_goals.get(id)).cashAccountKeys).toEqual([newKey, 'other'])
  })
})

describe('getExpenseDashboardView — savings goals', () => {
  it('returns goal rows resolved by account key, and the account options', async () => {
    const a = await addCash('日常', 30000)
    const gone = await addCash('舊帳戶', 5000)
    await db.cash_accounts.update(gone.id, { deletedAt: '2026-10-01T00:00:00.000Z' })
    await upsertSavingsGoal({ name: '日本旅遊', kind: 'open', targetTwd: 60000, cashAccountKeys: [a.key, gone.key] })

    const view = await getExpenseDashboardView({})
    expect(view.savingsGoals).toHaveLength(1)
    expect(view.savingsGoals[0]).toMatchObject({
      name: '日本旅遊',
      iconKey: 'travel',
      currentTwd: 30000,
      missingAccountCount: 1,
      status: 'in-progress',
      progressRatio: 0.5,
    })
    expect(view.savingsGoalAccountOptions).toEqual([
      { key: a.key, bankName: '台新', accountAlias: '日常', holder: 'Po', balanceTwd: 30000 },
    ])
  })

  it('leaves deleted goals out of the view and the backup', async () => {
    const { id } = await upsertSavingsGoal({ name: 'x', kind: 'open', targetTwd: 1, cashAccountKeys: [] })
    await upsertSavingsGoal({ name: 'y', kind: 'open', targetTwd: 1, cashAccountKeys: [] })
    tick()
    await removeSavingsGoal({ id })
    expect((await getExpenseDashboardView({})).savingsGoals.map((row) => row.name)).toEqual(['y'])
    expect((await exportBackupData()).savingsGoals.map((row) => row.name)).toEqual(['y'])
  })
})
