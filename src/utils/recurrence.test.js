import { describe, it, expect } from 'vitest'
import dayjs from 'dayjs'
import { describeRecurrenceStart } from './recurrence'

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
