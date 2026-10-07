import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { db } from '../db/database'
import { getExpenseDashboardView } from './portfolioService'

// Today is 2026-10-04: rent (10/20) is still upcoming this month, the phone
// bill (10/02) has already been charged.
const TODAY = new Date('2026-10-04T10:00:00+08:00')

const base = {
  payer: null,
  expenseKind: null,
  categoryId: null,
  deletedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const seed = async () => {
  const budgetId = await db.budgets.add({
    remoteKey: 'budget_life',
    name: '日常生活',
    budgetMode: 'SPECIAL',
    specialAmountTwd: 50000,
    specialStartDate: '2026-10-01',
    specialEndDate: '2026-10-31',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
  })
  await db.expense_entries.add({
    ...base,
    name: '房租',
    amountTwd: 18000,
    occurredAt: '2026-01-01',
    entryType: 'RECURRING',
    recurrenceType: 'MONTHLY',
    monthlyDay: 20,
    budgetId,
    updatedAt: '2026-09-30T00:00:00.000Z',
  })
  await db.expense_entries.add({
    ...base,
    name: '電話費',
    amountTwd: 600,
    occurredAt: '2026-01-01',
    entryType: 'RECURRING',
    recurrenceType: 'MONTHLY',
    monthlyDay: 2,
    budgetId,
  })
  await db.expense_entries.add({
    ...base,
    name: '保險',
    amountTwd: 24000,
    occurredAt: '2026-01-01',
    entryType: 'RECURRING',
    recurrenceType: 'YEARLY',
    yearlyMonth: 3,
    yearlyDay: 1,
  })
  await db.expense_entries.add({
    ...base,
    name: '健身房',
    amountTwd: 1500,
    occurredAt: '2026-11-15',
    entryType: 'RECURRING',
    recurrenceType: 'MONTHLY',
    monthlyDay: 15,
  })
  await db.expense_entries.add({
    ...base,
    name: '午餐',
    amountTwd: 150,
    occurredAt: '2026-10-03',
    entryType: 'ONE_TIME',
    budgetId,
  })
  return { budgetId }
}

describe('getExpenseDashboardView — upcoming recurring charges', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(TODAY)
    await db.expense_entries.clear()
    await db.budgets.clear()
    await db.expense_categories.clear()
    await db.expense_templates.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('lists upcoming recurring rows but leaves them out of the month total', async () => {
    await seed()
    const view = await getExpenseDashboardView({ month: '2026-10' })

    const rent = view.expenseRows.find((row) => row.name === '房租')
    const phone = view.expenseRows.find((row) => row.name === '電話費')
    expect(rent).toMatchObject({ occurredAt: '2026-10-20', isUpcoming: true })
    expect(phone).toMatchObject({ occurredAt: '2026-10-02', isUpcoming: false })
    expect(view.expenseRows.find((row) => row.name === '午餐').isUpcoming).toBe(false)

    expect(view.monthlyExpenseTotalTwd).toBe(750)
    expect(view.upcomingMonthTotalTwd).toBe(18000)
  })

  it('keeps upcoming charges out of the month breakdown', async () => {
    await seed()
    const view = await getExpenseDashboardView({ month: '2026-10' })
    expect(view.expenseIncomeProgress.month.recurringNumerator).toBe(600)
    expect(view.expenseIncomeProgress.month.numerator).toBe(750)
  })

  it('still counts upcoming charges in the budget, and reports them separately', async () => {
    const { budgetId } = await seed()
    const view = await getExpenseDashboardView({ month: '2026-10' })
    const budget = view.budgetRows.find((row) => row.id === budgetId)
    expect(budget.spentTwd).toBe(18750)
    expect(budget.upcomingTwd).toBe(18000)
  })

  it('lists the budget cycle\'s expenses, adding up to what it has spent', async () => {
    const { budgetId } = await seed()
    const view = await getExpenseDashboardView({ month: '2026-10' })
    const budget = view.budgetRows.find((row) => row.id === budgetId)
    expect(budget.cycleExpenses.map((row) => [row.name, row.occurredAt, row.isUpcoming])).toEqual([
      ['房租', '2026-10-20', true],
      ['午餐', '2026-10-03', false],
      ['電話費', '2026-10-02', false],
    ])
    const total = budget.cycleExpenses.reduce((sum, row) => sum + row.amountTwd, 0)
    expect(total).toBe(budget.spentTwd)
    expect(budget.cycleExpenses[0]).toMatchObject({ categoryName: '未指定', payerName: '未指定' })
  })

  it('orders recurring rows by next charge date and summarises them', async () => {
    await seed()
    const view = await getExpenseDashboardView({ month: '2026-10' })
    expect(
      view.recurringExpenseRows.map((row) => [row.name, row.nextOccurrenceDate]),
    ).toEqual([
      ['房租', '2026-10-20'],
      ['電話費', '2026-11-02'],
      ['健身房', '2026-11-15'],
      ['保險', '2027-03-01'],
    ])
    const gym = view.recurringExpenseRows.find((row) => row.name === '健身房')
    expect(gym.startsInFuture).toBe(true)
    const insurance = view.recurringExpenseRows.find((row) => row.name === '保險')
    expect(insurance.monthlyEquivalentTwd).toBe(2000)
    expect(view.recurringSummary).toEqual({ count: 4, monthlyEquivalentTwd: 22100 })
  })

  it('treats every row of a past month as charged', async () => {
    await seed()
    const view = await getExpenseDashboardView({ month: '2026-09' })
    expect(view.expenseRows.every((row) => !row.isUpcoming)).toBe(true)
    expect(view.monthlyExpenseTotalTwd).toBe(18600)
    expect(view.upcomingMonthTotalTwd).toBe(0)
  })
})

describe('getExpenseDashboardView — monthly summaries', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(TODAY)
    await db.expense_entries.clear()
    await db.budgets.clear()
    await db.expense_categories.clear()
    await db.expense_templates.clear()
    await db.app_config.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('lists every month up to today with charged spending and that month\'s income', async () => {
    await seed()
    await db.app_config.put({
      key: 'income_settings',
      defaultMonthlyIncomeTwd: 100000,
      monthOverrides: [{ month: '2026-03', incomeTwd: 50000 }],
    })
    const view = await getExpenseDashboardView({ month: '2026-10' })
    const rows = view.monthlySummaries

    expect(rows.map((r) => r.month)).toEqual([
      '2026-01', '2026-02', '2026-03', '2026-04', '2026-05',
      '2026-06', '2026-07', '2026-08', '2026-09', '2026-10',
    ])
    // 房租 18000 + 電話費 600 every month.
    expect(rows[0]).toMatchObject({ expenseTwd: 18600, recurringTwd: 18600, oneTimeTwd: 0, incomeTwd: 100000, isCurrent: false })
    // March adds the yearly 保險 and uses the income override.
    expect(rows[2]).toMatchObject({ expenseTwd: 42600, incomeTwd: 50000 })
    // October: 房租 (10/20) is still upcoming → not counted; 電話費 + 午餐 are.
    expect(rows[9]).toMatchObject({ expenseTwd: 750, recurringTwd: 600, oneTimeTwd: 150, isCurrent: true })
  })

  it('counts a one-time expense dated later this month, like the month total does', async () => {
    await seed()
    await db.expense_entries.add({
      payer: null, expenseKind: null, categoryId: null, deletedAt: null,
      createdAt: '2026-10-04T00:00:00.000Z', updatedAt: '2026-10-04T00:00:00.000Z',
      name: '演唱會門票', amountTwd: 3200, occurredAt: '2026-10-25', entryType: 'ONE_TIME',
    })
    const view = await getExpenseDashboardView({ month: '2026-10' })
    const october = view.monthlySummaries[view.monthlySummaries.length - 1]
    expect(october).toMatchObject({ expenseTwd: 3950, oneTimeTwd: 3350 })
    expect(october.expenseTwd).toBe(view.monthlyExpenseTotalTwd)
  })

  it('reports null income when none is configured', async () => {
    await seed()
    const view = await getExpenseDashboardView({ month: '2026-10' })
    expect(view.monthlySummaries.every((r) => r.incomeTwd === null)).toBe(true)
  })
})
