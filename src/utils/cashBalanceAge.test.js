import { describe, it, expect } from 'vitest'
import { getStaleBalanceLabel, isCashBalanceStale } from './cashBalanceAge'

const now = '2026-10-10T04:00:00.000Z'

describe('isCashBalanceStale', () => {
  it('flags a balance last updated more than a month ago', () => {
    expect(isCashBalanceStale('2026-09-09T04:00:00.000Z', now)).toBe(true)
    expect(isCashBalanceStale('2026-03-01T00:00:00.000Z', now)).toBe(true)
  })

  it('leaves balances from within the month alone', () => {
    expect(isCashBalanceStale('2026-09-10T04:00:00.000Z', now)).toBe(false)
    expect(isCashBalanceStale('2026-10-09T00:00:00.000Z', now)).toBe(false)
  })

  it('never flags a missing or broken timestamp', () => {
    expect(isCashBalanceStale(null, now)).toBe(false)
    expect(isCashBalanceStale('not a date', now)).toBe(false)
  })
})

describe('getStaleBalanceLabel', () => {
  it('says how many days the balance has gone without an update', () => {
    expect(getStaleBalanceLabel('2026-09-05T04:00:00.000Z', now)).toBe('35 天沒更新餘額')
  })
})
