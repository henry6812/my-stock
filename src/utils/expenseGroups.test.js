import { describe, it, expect } from 'vitest'
import { formatDayHeading, groupExpenseRowsByDay } from './expenseGroups'

const row = (id, occurredAt, amountTwd, extra = {}) => ({
  id,
  occurredAt,
  amountTwd,
  isRecurringOccurrence: false,
  isUpcoming: false,
  ...extra,
})

describe('groupExpenseRowsByDay', () => {
  it('groups charged rows by day, newest day first, with subtotals', () => {
    const { days } = groupExpenseRowsByDay([
      row(1, '2026-10-02', 100),
      row(2, '2026-10-04', 50),
      row(3, '2026-10-02', 30),
      row(4, '2026-10-04', 20),
    ])
    expect(days).toEqual([
      { date: '2026-10-04', totalTwd: 70, rows: [row(2, '2026-10-04', 50), row(4, '2026-10-04', 20)] },
      { date: '2026-10-02', totalTwd: 130, rows: [row(1, '2026-10-02', 100), row(3, '2026-10-02', 30)] },
    ])
  })

  it('keeps upcoming recurring charges apart, soonest first', () => {
    const upcomingA = row(5, '2026-10-30', 1488, { isRecurringOccurrence: true, isUpcoming: true })
    const upcomingB = row(6, '2026-10-20', 18000, { isRecurringOccurrence: true, isUpcoming: true })
    const { days, upcoming } = groupExpenseRowsByDay([upcomingA, upcomingB, row(1, '2026-10-03', 150)])
    expect(days.map((day) => day.date)).toEqual(['2026-10-03'])
    expect(upcoming).toEqual({ totalTwd: 19488, rows: [upcomingB, upcomingA] })
  })

  it('handles an empty list', () => {
    expect(groupExpenseRowsByDay([])).toEqual({ days: [], upcoming: { totalTwd: 0, rows: [] } })
    expect(groupExpenseRowsByDay(undefined)).toEqual({ days: [], upcoming: { totalTwd: 0, rows: [] } })
  })
})

describe('formatDayHeading', () => {
  it('labels today and yesterday, otherwise shows the weekday', () => {
    expect(formatDayHeading('2026-10-04', '2026-10-04')).toBe('今天 · 10/04（日）')
    expect(formatDayHeading('2026-10-03', '2026-10-04')).toBe('昨天 · 10/03（六）')
    expect(formatDayHeading('2026-09-28', '2026-10-04')).toBe('09/28（一）')
  })
})
