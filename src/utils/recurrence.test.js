import { describe, it, expect } from 'vitest'
import dayjs from 'dayjs'
import {
  describeRecurrenceStart,
  getMonthlyEquivalentTwd,
  getNextRecurringOccurrence,
  listRecurringOccurrences,
  sumUpcomingRecurringTwd,
} from './recurrence'

const recurring = (overrides) => ({
  entryType: 'RECURRING',
  recurrenceType: 'MONTHLY',
  monthlyDay: 7,
  occurredAt: dayjs('2026-10-04'),
  ...overrides,
})

describe('describeRecurrenceStart', () => {
  it('returns null for one-time expenses', () => {
    expect(describeRecurrenceStart({ entryType: 'ONE_TIME', occurredAt: dayjs('2026-10-04') })).toBeNull()
  })

  it('starts in the same month when the day is on or after the start date', () => {
    expect(describeRecurrenceStart(recurring())).toBe(
      '從 2026/10/04 起，每月 7 號記一筆，第一筆在 2026/10/07',
    )
    expect(describeRecurrenceStart(recurring({ monthlyDay: 4 }))).toBe(
      '從 2026/10/04 起，每月 4 號記一筆，第一筆在 2026/10/04',
    )
  })

  it('starts next month when the day is before the start date', () => {
    expect(describeRecurrenceStart(recurring({ occurredAt: dayjs('2026-10-10') }))).toBe(
      '從 2026/10/10 起，每月 7 號記一筆，第一筆在 2026/11/07',
    )
  })

  it('mentions month-end clamping for days after the 28th', () => {
    expect(
      describeRecurrenceStart(recurring({ monthlyDay: 31, occurredAt: dayjs('2026-02-01') })),
    ).toBe('從 2026/02/01 起，每月 31 號記一筆，第一筆在 2026/02/28；沒有這天的月份記在月底')
  })

  it('describes yearly recurrences', () => {
    expect(
      describeRecurrenceStart(
        recurring({ recurrenceType: 'YEARLY', monthlyDay: undefined, yearlyMonth: 3, yearlyDay: 15 }),
      ),
    ).toBe('從 2026/10/04 起，每年 3 月 15 號記一筆，第一筆在 2027/03/15')
    expect(
      describeRecurrenceStart(
        recurring({ recurrenceType: 'YEARLY', yearlyMonth: 10, yearlyDay: 20 }),
      ),
    ).toBe('從 2026/10/04 起，每年 10 月 20 號記一筆，第一筆在 2026/10/20')
  })

  it('falls back to a generic hint until frequency and day are set', () => {
    const generic = '定期支出從這天開始生效，當天本身不會記一筆'
    expect(describeRecurrenceStart(recurring({ recurrenceType: undefined }))).toBe(generic)
    expect(describeRecurrenceStart(recurring({ monthlyDay: undefined }))).toBe(generic)
    expect(
      describeRecurrenceStart(recurring({ recurrenceType: 'YEARLY', yearlyMonth: 3, yearlyDay: undefined })),
    ).toBe(generic)
  })

  it('falls back to the generic hint without a valid start date', () => {
    expect(describeRecurrenceStart(recurring({ occurredAt: null }))).toBe(
      '定期支出從這天開始生效，當天本身不會記一筆',
    )
  })
})

const monthlyRent = {
  entryType: 'RECURRING',
  recurrenceType: 'MONTHLY',
  monthlyDay: 20,
  amountTwd: 18000,
  occurredAt: '2026-01-01',
  recurrenceUntil: null,
}

describe('listRecurringOccurrences', () => {
  it('lists monthly dates inside the range, on or after the start', () => {
    expect(listRecurringOccurrences(monthlyRent, '2025-11-01', '2026-03-31')).toEqual([
      '2026-01-20',
      '2026-02-20',
      '2026-03-20',
    ])
  })

  it('clamps to month end and stops after recurrenceUntil', () => {
    const entry = { ...monthlyRent, monthlyDay: 31, recurrenceUntil: '2026-03-30' }
    expect(listRecurringOccurrences(entry, '2026-01-01', '2026-06-30')).toEqual([
      '2026-01-31',
      '2026-02-28',
    ])
  })

  it('lists yearly dates only in their month', () => {
    const entry = {
      ...monthlyRent,
      recurrenceType: 'YEARLY',
      yearlyMonth: 3,
      yearlyDay: 15,
    }
    expect(listRecurringOccurrences(entry, '2026-01-01', '2027-12-31')).toEqual([
      '2026-03-15',
      '2027-03-15',
    ])
  })

  it('falls back to the start date for a missing day', () => {
    const entry = { ...monthlyRent, monthlyDay: null, occurredAt: '2026-01-09' }
    expect(listRecurringOccurrences(entry, '2026-01-01', '2026-02-28')).toEqual([
      '2026-01-09',
      '2026-02-09',
    ])
  })

  it('returns nothing for one-time entries', () => {
    expect(listRecurringOccurrences({ ...monthlyRent, entryType: 'ONE_TIME' }, '2026-01-01', '2026-12-31')).toEqual([])
  })
})

describe('getNextRecurringOccurrence', () => {
  it('returns today when it is a charge day', () => {
    expect(getNextRecurringOccurrence(monthlyRent, '2026-10-20')).toBe('2026-10-20')
  })

  it('returns the next charge day', () => {
    expect(getNextRecurringOccurrence(monthlyRent, '2026-10-21')).toBe('2026-11-20')
  })

  it('waits for a future start date', () => {
    expect(getNextRecurringOccurrence({ ...monthlyRent, occurredAt: '2026-12-25' }, '2026-10-04')).toBe('2027-01-20')
  })

  it('finds a yearly charge up to a year ahead', () => {
    const entry = { ...monthlyRent, recurrenceType: 'YEARLY', yearlyMonth: 3, yearlyDay: 15 }
    expect(getNextRecurringOccurrence(entry, '2026-10-04')).toBe('2027-03-15')
  })

  it('returns null once the recurrence has ended', () => {
    expect(getNextRecurringOccurrence({ ...monthlyRent, recurrenceUntil: '2026-10-10' }, '2026-10-21')).toBeNull()
  })
})

describe('getMonthlyEquivalentTwd', () => {
  it('keeps monthly amounts and spreads yearly ones over 12 months', () => {
    expect(getMonthlyEquivalentTwd(monthlyRent)).toBe(18000)
    expect(getMonthlyEquivalentTwd({ ...monthlyRent, recurrenceType: 'YEARLY', amountTwd: 12000 })).toBe(1000)
    expect(getMonthlyEquivalentTwd({ ...monthlyRent, recurrenceType: 'YEARLY', amountTwd: 1000 })).toBe(83)
  })
})

describe('sumUpcomingRecurringTwd', () => {
  const entries = [
    { ...monthlyRent, id: 1, budgetId: 7 },
    { ...monthlyRent, id: 2, budgetId: 8, amountTwd: 500 },
    { ...monthlyRent, id: 3, budgetId: 7, amountTwd: 300, monthlyDay: 2 },
    { ...monthlyRent, id: 4, budgetId: 7, amountTwd: 999, deletedAt: '2026-09-01' },
    { id: 5, entryType: 'ONE_TIME', budgetId: 7, amountTwd: 50, occurredAt: '2026-10-25' },
  ]

  it('sums recurring charges after today up to the cycle end for one budget', () => {
    expect(
      sumUpcomingRecurringTwd(entries, {
        budgetId: 7,
        today: '2026-10-04',
        cycleStart: '2026-10-01',
        cycleEnd: '2026-10-31',
      }),
    ).toBe(18000)
  })

  it('counts nothing once the cycle is over', () => {
    expect(
      sumUpcomingRecurringTwd(entries, {
        budgetId: 7,
        today: '2026-11-04',
        cycleStart: '2026-10-01',
        cycleEnd: '2026-10-31',
      }),
    ).toBe(0)
  })

  it('counts the whole cycle when it has not started yet', () => {
    expect(
      sumUpcomingRecurringTwd(entries, {
        budgetId: 7,
        today: '2026-09-15',
        cycleStart: '2026-10-01',
        cycleEnd: '2026-10-31',
      }),
    ).toBe(18300)
  })
})
