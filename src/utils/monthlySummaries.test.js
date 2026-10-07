import { describe, expect, it } from 'vitest'
import { buildMonthlySummaries } from './monthlySummaries'

const occ = (occurredAt, amountTwd, isRecurringOccurrence = false) => ({
  occurredAt,
  amountTwd,
  isRecurringOccurrence,
  entryType: isRecurringOccurrence ? 'RECURRING' : 'ONE_TIME',
})

describe('buildMonthlySummaries', () => {
  it('covers every month from the first expense to now, empty months included', () => {
    const rows = buildMonthlySummaries({
      occurrences: [occ('2026-07-03', 100), occ('2026-09-10', 300, true), occ('2026-09-11', 50)],
      firstMonth: '2026-07',
      currentMonth: '2026-09',
      incomeForMonth: () => 1000,
    })
    expect(rows).toEqual([
      { month: '2026-07', expenseTwd: 100, recurringTwd: 0, oneTimeTwd: 100, incomeTwd: 1000, isCurrent: false },
      { month: '2026-08', expenseTwd: 0, recurringTwd: 0, oneTimeTwd: 0, incomeTwd: 1000, isCurrent: false },
      { month: '2026-09', expenseTwd: 350, recurringTwd: 300, oneTimeTwd: 50, incomeTwd: 1000, isCurrent: true },
    ])
  })

  it('crosses the year boundary', () => {
    const rows = buildMonthlySummaries({
      occurrences: [],
      firstMonth: '2025-11',
      currentMonth: '2026-02',
      incomeForMonth: () => null,
    })
    expect(rows.map((r) => r.month)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
  })

  it('reports income per month and null when not set', () => {
    const income = { '2026-01': 500, '2026-02': 0 }
    const rows = buildMonthlySummaries({
      occurrences: [],
      firstMonth: '2026-01',
      currentMonth: '2026-03',
      incomeForMonth: (month) => income[month] ?? null,
    })
    expect(rows.map((r) => r.incomeTwd)).toEqual([500, null, null])
  })

  it('ignores occurrences outside the range and non-positive amounts', () => {
    const rows = buildMonthlySummaries({
      occurrences: [occ('2026-05-01', 100), occ('2026-06-01', 0), occ('2026-06-02', -5), occ('2026-07-01', 9)],
      firstMonth: '2026-06',
      currentMonth: '2026-06',
      incomeForMonth: () => null,
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].expenseTwd).toBe(0)
  })

  it('falls back to the current month when there is no first month', () => {
    const rows = buildMonthlySummaries({
      occurrences: [],
      firstMonth: null,
      currentMonth: '2026-10',
      incomeForMonth: () => 100,
    })
    expect(rows.map((r) => r.month)).toEqual(['2026-10'])
  })
})
