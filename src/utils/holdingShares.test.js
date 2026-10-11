import { describe, it, expect } from 'vitest'
import {
  HOLDING_SHARES_MODE,
  applyBuy,
  applyCalibration,
  applySell,
  findExistingHolding,
  getAverageCost,
  getHoldingCurrency,
  getUnrealized,
  normalizeHoldingSymbol,
  normalizeTotalCost,
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

describe('normalizeTotalCost', () => {
  it('keeps finite non-negative numbers, rounded to 4 places', () => {
    expect(normalizeTotalCost(50000)).toBe(50000)
    expect(normalizeTotalCost('123.456789')).toBe(123.4568)
    expect(normalizeTotalCost(0)).toBe(0)
  })

  it('treats missing or invalid values as unset', () => {
    expect(normalizeTotalCost(null)).toBeNull()
    expect(normalizeTotalCost(undefined)).toBeNull()
    expect(normalizeTotalCost('')).toBeNull()
    expect(normalizeTotalCost(-1)).toBeNull()
    expect(normalizeTotalCost('abc')).toBeNull()
    expect(normalizeTotalCost(Infinity)).toBeNull()
  })
})

describe('applyBuy', () => {
  it('adds shares and cost; the average is weighted', () => {
    const next = applyBuy({ shares: 100, totalCost: 50000 }, { shares: 50, price: 560 })
    expect(next).toEqual({ shares: 150, totalCost: 78000 })
    expect(getAverageCost(next)).toBe(520)
  })

  it('keeps an unset cost unset: the earlier shares cost is unknown', () => {
    expect(applyBuy({ shares: 100, totalCost: null }, { shares: 50, price: 560 })).toEqual({
      shares: 150,
      totalCost: null,
    })
  })

  it('avoids float drift on fractional shares', () => {
    expect(applyBuy({ shares: 0.1, totalCost: 1 }, { shares: 0.2, price: 3 })).toEqual({
      shares: 0.3,
      totalCost: 1.6,
    })
  })
})

describe('applySell', () => {
  it('scales the cost down so the average stays the same', () => {
    const next = applySell({ shares: 150, totalCost: 78000 }, 30)
    expect(next).toEqual({ shares: 120, totalCost: 62400, soldAll: false })
    expect(getAverageCost(next)).toBe(520)
  })

  it('flags selling everything', () => {
    expect(applySell({ shares: 100, totalCost: 50000 }, 100)).toEqual({
      shares: 0,
      totalCost: 0,
      soldAll: true,
    })
  })

  it('keeps an unset cost unset', () => {
    expect(applySell({ shares: 100, totalCost: null }, 40)).toEqual({
      shares: 60,
      totalCost: null,
      soldAll: false,
    })
  })

  it('avoids float drift on fractional shares', () => {
    expect(applySell({ shares: 0.3, totalCost: 3 }, 0.1).shares).toBe(0.2)
  })
})

describe('applyCalibration', () => {
  it('sets shares and cost from the average cost', () => {
    expect(applyCalibration({ shares: 1000, averageCost: 512.5 })).toEqual({
      shares: 1000,
      totalCost: 512500,
    })
  })

  it('allows a zero cost (e.g. stock dividends)', () => {
    expect(applyCalibration({ shares: 50, averageCost: 0 })).toEqual({ shares: 50, totalCost: 0 })
  })

  it('clears the cost when the average is left empty', () => {
    expect(applyCalibration({ shares: 1000, averageCost: null })).toEqual({
      shares: 1000,
      totalCost: null,
    })
  })
})

describe('getAverageCost', () => {
  it('is null without a cost or shares', () => {
    expect(getAverageCost({ shares: 100, totalCost: null })).toBeNull()
    expect(getAverageCost({ shares: 0, totalCost: 100 })).toBeNull()
  })
})

describe('getUnrealized', () => {
  it('compares market value with the cost', () => {
    expect(getUnrealized({ shares: 100, totalCost: 50000, latestPrice: 520 })).toEqual({
      amount: 2000,
      pct: 0.04,
    })
    expect(getUnrealized({ shares: 100, totalCost: 50000, latestPrice: 480 })).toEqual({
      amount: -2000,
      pct: -0.04,
    })
  })

  it('has no percentage when the cost is zero', () => {
    expect(getUnrealized({ shares: 50, totalCost: 0, latestPrice: 10 })).toEqual({
      amount: 500,
      pct: null,
    })
  })

  it('is null without a cost or a price', () => {
    expect(getUnrealized({ shares: 100, totalCost: null, latestPrice: 520 })).toBeNull()
    expect(getUnrealized({ shares: 100, totalCost: 50000, latestPrice: undefined })).toBeNull()
  })
})

describe('getHoldingCurrency', () => {
  it('prefers the quoted currency, else follows the market', () => {
    expect(getHoldingCurrency({ market: 'US', latestCurrency: 'USD' })).toBe('USD')
    expect(getHoldingCurrency({ market: 'US' })).toBe('USD')
    expect(getHoldingCurrency({ market: 'TW' })).toBe('TWD')
  })
})
