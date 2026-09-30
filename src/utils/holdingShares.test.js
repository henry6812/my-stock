import { describe, it, expect } from 'vitest'
import {
  HOLDING_SHARES_MODE,
  findExistingHolding,
  normalizeHoldingSymbol,
  resolveNextShares,
} from './holdingShares'

describe('normalizeHoldingSymbol', () => {
  it('uppercases, trims and strips .TW for TW', () => {
    expect(normalizeHoldingSymbol(' 2330.tw ', 'TW')).toBe('2330')
    expect(normalizeHoldingSymbol(' aapl ', 'US')).toBe('AAPL')
  })
})

describe('findExistingHolding', () => {
  const holdings = [
    { symbol: '2330', market: 'TW', holder: 'Po', shares: 1000 },
    { symbol: 'AAPL', market: 'US', holder: 'Po', shares: 5 },
  ]

  it('matches on normalized symbol + market + holder', () => {
    expect(
      findExistingHolding(holdings, { symbol: '2330.tw', market: 'TW', holder: 'Po' }),
    ).toBe(holdings[0])
  })

  it('does not match a different holder or market', () => {
    expect(findExistingHolding(holdings, { symbol: '2330', market: 'TW', holder: 'Amy' })).toBeNull()
    expect(findExistingHolding(holdings, { symbol: 'AAPL', market: 'TW', holder: 'Po' })).toBeNull()
  })

  it('returns null while the form is incomplete', () => {
    expect(findExistingHolding(holdings, { symbol: '', market: 'TW', holder: 'Po' })).toBeNull()
  })
})

describe('resolveNextShares', () => {
  it('adds to existing shares by default', () => {
    expect(resolveNextShares({ existingShares: 1000, inputShares: 500 })).toBe(1500)
  })

  it('replaces when asked', () => {
    expect(
      resolveNextShares({
        existingShares: 1000,
        inputShares: 500,
        mode: HOLDING_SHARES_MODE.REPLACE,
      }),
    ).toBe(500)
  })

  it('avoids float drift on fractional shares', () => {
    expect(resolveNextShares({ existingShares: 0.1, inputShares: 0.2 })).toBe(0.3)
  })
})
