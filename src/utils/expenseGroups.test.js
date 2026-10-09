import { describe, it, expect } from 'vitest'
import { buildExpenseDayStrip, defaultStripDate, formatDayHeading, groupExpenseRowsByDay } from './expenseGroups'

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

describe('buildExpenseDayStrip', () => {
  const r = (occurredAt, amountTwd, extra = {}) => ({ occurredAt, amountTwd, isUpcoming: false, ...extra })

  it('lists every day of the current month up to today, empty days included', () => {
    const strip = buildExpenseDayStrip(
      [r('2026-10-01', 100), r('2026-10-03', 50), r('2026-10-03', 25), r('2026-10-20', 999, { isUpcoming: true })],
      '2026-10',
      '2026-10-04',
    )
    expect(strip.map((day) => day.date)).toEqual(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'])
    expect(strip.map((day) => day.totalTwd)).toEqual([100, 0, 75, 0])
  })

  it('runs to the month end for a past month', () => {
    const strip = buildExpenseDayStrip([r('2026-09-10', 10)], '2026-09', '2026-10-04')
    expect(strip).toHaveLength(30)
    expect(strip[29].date).toBe('2026-09-30')
  })

  it('reaches a charged row dated after today within the month', () => {
    const strip = buildExpenseDayStrip([r('2026-10-06', 10)], '2026-10', '2026-10-04')
    expect(strip[strip.length - 1].date).toBe('2026-10-06')
  })
})

describe('defaultStripDate', () => {
  const day = (date, n) => ({ date, totalTwd: n, rows: Array.from({ length: n }, () => ({})) })

  it('opens on today when it is on the strip', () => {
    expect(defaultStripDate([day('2026-10-03', 1), day('2026-10-04', 0)], '2026-10-04')).toBe('2026-10-04')
  })

  it('otherwise opens on the latest day with spending', () => {
    expect(defaultStripDate([day('2026-09-28', 1), day('2026-09-29', 0)], '2026-10-04')).toBe('2026-09-28')
  })

  it('returns null for an empty strip', () => {
    expect(defaultStripDate([], '2026-10-04')).toBeNull()
  })
})
