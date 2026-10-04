import { describe, it, expect } from 'vitest'
import {
  getBudgetBarSegments,
  getCycleProgress,
  getDailyAllowance,
  listBudgetCycleExpenses,
  sortBudgetsByUrgency,
} from './budgetView'

describe('getCycleProgress', () => {
  it('reports the share of the cycle elapsed and the days left (today included)', () => {
    expect(getCycleProgress({ cycleStart: '2026-10-01', cycleEnd: '2026-10-31' }, '2026-10-04')).toEqual({
      elapsedRatio: 3 / 31,
      daysLeft: 28,
    })
  })

  it('clamps before the start and after the end', () => {
    const cycle = { cycleStart: '2026-10-01', cycleEnd: '2026-10-31' }
    expect(getCycleProgress(cycle, '2026-09-20')).toEqual({ elapsedRatio: 0, daysLeft: 31 })
    expect(getCycleProgress(cycle, '2026-11-02')).toEqual({ elapsedRatio: 1, daysLeft: 0 })
  })

  it('returns null without a valid cycle', () => {
    expect(getCycleProgress({ cycleStart: null, cycleEnd: '2026-10-31' }, '2026-10-04')).toBeNull()
  })
})

describe('getDailyAllowance', () => {
  it('spreads the remaining amount over the days left, rounded down', () => {
    expect(getDailyAllowance(15000, 28)).toBe(535)
  })

  it('is null when nothing is left or no days remain', () => {
    expect(getDailyAllowance(0, 10)).toBeNull()
    expect(getDailyAllowance(-50, 10)).toBeNull()
    expect(getDailyAllowance(500, 0)).toBeNull()
  })
})

describe('getBudgetBarSegments', () => {
  it('splits spending into charged and still-upcoming parts of the budget', () => {
    expect(getBudgetBarSegments({ spentTwd: 12000, upcomingTwd: 8000, availableTwd: 40000 })).toEqual({
      chargedPct: 10,
      upcomingPct: 20,
    })
  })

  it('caps the bar at 100%', () => {
    expect(getBudgetBarSegments({ spentTwd: 50000, upcomingTwd: 20000, availableTwd: 40000 })).toEqual({
      chargedPct: 75,
      upcomingPct: 25,
    })
  })

  it('fills the bar when there is no budget but some spending', () => {
    expect(getBudgetBarSegments({ spentTwd: 100, upcomingTwd: 0, availableTwd: 0 })).toEqual({
      chargedPct: 100,
      upcomingPct: 0,
    })
  })
})

describe('sortBudgetsByUrgency', () => {
  it('puts over-budget first, then near the limit, then the rest, each by usage', () => {
    const budgets = [
      { id: 'ok-low', spentTwd: 100, availableTwd: 1000 },
      { id: 'over', spentTwd: 1200, availableTwd: 1000 },
      { id: 'warn', spentTwd: 850, availableTwd: 1000 },
      { id: 'ok-high', spentTwd: 500, availableTwd: 1000 },
    ]
    expect(sortBudgetsByUrgency(budgets).map((budget) => budget.id)).toEqual([
      'over',
      'warn',
      'ok-high',
      'ok-low',
    ])
  })
})

describe('listBudgetCycleExpenses', () => {
  const entries = [
    { id: 1, name: '房租', entryType: 'RECURRING', recurrenceType: 'MONTHLY', monthlyDay: 20, amountTwd: 18000, occurredAt: '2026-01-01', budgetId: 7 },
    { id: 2, name: '午餐', entryType: 'ONE_TIME', amountTwd: 150, occurredAt: '2026-10-03', budgetId: 7 },
    { id: 3, name: '上個月', entryType: 'ONE_TIME', amountTwd: 99, occurredAt: '2026-09-30', budgetId: 7 },
    { id: 4, name: '別的預算', entryType: 'ONE_TIME', amountTwd: 50, occurredAt: '2026-10-03', budgetId: 8 },
    { id: 5, name: '已刪除', entryType: 'ONE_TIME', amountTwd: 70, occurredAt: '2026-10-03', budgetId: 7, deletedAt: '2026-10-03' },
  ]

  it('lists the budget’s one-time and recurring charges inside the cycle, flagging upcoming ones', () => {
    const rows = listBudgetCycleExpenses(entries, {
      budgetId: 7,
      cycleStart: '2026-10-01',
      cycleEnd: '2026-10-31',
      today: '2026-10-04',
    })
    expect(rows).toEqual([
      expect.objectContaining({ id: 1, name: '房租', occurredAt: '2026-10-20', amountTwd: 18000, isRecurringOccurrence: true, isUpcoming: true }),
      expect.objectContaining({ id: 2, name: '午餐', occurredAt: '2026-10-03', amountTwd: 150, isRecurringOccurrence: false, isUpcoming: false }),
    ])
  })

  it('returns nothing without a cycle', () => {
    expect(listBudgetCycleExpenses(entries, { budgetId: 7, cycleStart: null, cycleEnd: null, today: '2026-10-04' })).toEqual([])
  })
})
