import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('./firebase/cloudSyncService', async (importOriginal) => ({
  ...(await importOriginal()),
  assertCloudWriteReady: vi.fn(),
  writeCollectionRecord: vi.fn(),
}))

import { db } from '../db/database'
import { assertCloudWriteReady, writeCollectionRecord } from './firebase/cloudSyncService'
import { getExpenseDashboardView, getForecastSettings, saveForecastSettings } from './portfolioService'
import { FORECAST_DEFAULTS } from '../utils/forecast'

const TODAY = new Date('2026-10-04T10:00:00+08:00')
let clock = TODAY.getTime()
const tick = () => {
  clock += 1000
  vi.setSystemTime(clock)
}

const expense = (name, amountTwd, occurredAt) => ({
  name,
  amountTwd,
  occurredAt,
  entryType: 'ONE_TIME',
  payer: null,
  expenseKind: null,
  categoryId: null,
  deletedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
})

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  clock = TODAY.getTime()
  vi.setSystemTime(clock)
  await db.app_config.clear()
  await db.expense_entries.clear()
  await db.budgets.clear()
  await db.expense_categories.clear()
  await db.expense_templates.clear()
  writeCollectionRecord.mockReset()
  assertCloudWriteReady.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('forecast settings', () => {
  it('reads the defaults when nothing is stored', async () => {
    expect(await getForecastSettings()).toEqual(FORECAST_DEFAULTS)
  })

  it('merges a patch, mirrors it and reads it back', async () => {
    tick()
    await saveForecastSettings({ stockReturn: 0.07, monthlyExpenseTwd: 55000 })
    expect(writeCollectionRecord.mock.calls[0][0]).toMatchObject({
      collectionName: 'app_config',
      record: { key: 'forecast_settings', forecast: { stockReturn: 0.07, monthlyExpenseTwd: 55000 } },
    })
    tick()
    await saveForecastSettings({ horizonYears: 40 })
    expect(await getForecastSettings()).toEqual({
      ...FORECAST_DEFAULTS,
      stockReturn: 0.07,
      monthlyExpenseTwd: 55000,
      horizonYears: 40,
    })
  })

  it('puts an automatic value back with null', async () => {
    tick()
    await saveForecastSettings({ monthlyExpenseTwd: 55000 })
    tick()
    await saveForecastSettings({ monthlyExpenseTwd: null })
    expect((await getForecastSettings()).monthlyExpenseTwd).toBeNull()
  })

  it('rejects an out-of-range value without writing', async () => {
    await expect(saveForecastSettings({ stockReturn: 0.5 })).rejects.toThrow('股票年報酬需介於 -20% 到 30%')
    expect(writeCollectionRecord).not.toHaveBeenCalled()
  })

  it('refuses to save when the cloud is not writable', async () => {
    assertCloudWriteReady.mockImplementation(() => {
      throw new Error('請先登入')
    })
    await expect(saveForecastSettings({ stockReturn: 0.07 })).rejects.toThrow('請先登入')
    expect(writeCollectionRecord).not.toHaveBeenCalled()
  })
})

describe('getExpenseDashboardView — forecast inputs', () => {
  it('returns the forecast settings and the complete-month expense average', async () => {
    // August and September are complete; October (this month) is left out.
    await db.expense_entries.add(expense('房租', 3000, '2026-08-01'))
    await db.expense_entries.add(expense('旅遊', 5000, '2026-09-05'))
    await db.expense_entries.add(expense('午餐', 150, '2026-10-03'))
    tick()
    await saveForecastSettings({ inflation: 0.03 })

    const view = await getExpenseDashboardView({ month: '2026-10' })
    expect(view.averageMonthlyExpense).toEqual({ averageTwd: 4000, monthsUsed: 2 })
    expect(view.savingsGoalAverageMonthlyExpenseTwd).toBe(4000)
    expect(view.forecastSettings).toEqual({ ...FORECAST_DEFAULTS, inflation: 0.03 })
  })

  it('has no average before a month is complete', async () => {
    await db.expense_entries.add(expense('午餐', 150, '2026-10-03'))
    const view = await getExpenseDashboardView({ month: '2026-10' })
    expect(view.averageMonthlyExpense).toEqual({ averageTwd: null, monthsUsed: 0 })
  })
})
