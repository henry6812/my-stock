import { describe, it, expect } from 'vitest'
import {
  DEFAULT_SCREEN_SETTINGS,
  computeFlags,
  describeRowMeta,
  formatDistance,
  formatQuotesDate,
  hasCustomValuation,
  industrySummary,
  normalizeScreenSettings,
  screenStocks,
  toOverride,
} from './stockScreen.js'
import { EMPTY_VALUATION_SETTINGS } from './valuation.js'

// EPS 10 × P/E 10 / 15 / 20 → 便宜價 100、合理價 150、昂貴價 200.
const row = (overrides = {}) => ({
  code: '1234',
  name: '測試',
  industry: '24',
  statement: 'general',
  eps: { ttm: 10, ttmAfterNext: 12, thisYear: 12, nextYear: 14 },
  bands: { cheap: 10, fair: 15, expensive: 20, sampleSize: 60 },
  nonOpRatio: 0.05,
  profitQuarters: 8,
  epsGrowth: 1.2,
  coreEps: 10,
  shareRatio: 1,
  fallbackClose: 95,
  fallbackMonth: '2026-08',
  ...overrides,
})
const settings = DEFAULT_SCREEN_SETTINGS
const run = (rows, extra = {}) =>
  screenStocks({ rows, quotes: {}, settings, basis: 'ttm', overrides: {}, owned: new Set(), watched: new Set(), ...extra })
const quote = (price, tradeValue = 50_000_000) => ({ price, tradeValue })

describe('screenStocks', () => {
  it('groups below 便宜價 and 合理偏低, cheapest first, and drops the rest', () => {
    const rows = [row({ code: 'A' }), row({ code: 'B' }), row({ code: 'C' }), row({ code: 'D' })]
    const quotes = { A: quote(90), B: quote(60), C: quote(120), D: quote(160) }
    const result = run(rows, { quotes })
    expect(result.below.map((item) => item.code)).toEqual(['B', 'A'])
    expect(result.fairLow.map((item) => item.code)).toEqual(['C'])
    expect(result.below[1]).toMatchObject({ price: 90, priceSource: 'daily', distanceToFair: -0.4, zone: 'below' })
    expect(result.counts).toEqual({ listed: 3, flagged: 0 })
  })

  it('uses the chosen basis', () => {
    const result = run([row({ eps: { ttm: 10, ttmAfterNext: null, thisYear: 5, nextYear: null } })], {
      quotes: { 1234: quote(90) },
      basis: 'thisYear',
    })
    expect(result.counts.listed).toBe(0) // 合理價 75 < 90
  })

  it('skips losses and missing EPS', () => {
    const result = run([row({ eps: { ttm: -1 } }), row({ code: 'X', eps: { ttm: null } })], {
      quotes: { 1234: quote(90), X: quote(90) },
    })
    expect(result.counts).toEqual({ listed: 0, flagged: 0 })
  })

  it('falls back to the month-end close without a daily quote, and then ignores turnover', () => {
    const result = run([row()], {
      settings: normalizeScreenSettings({ flags: { lowTurnover: { enabled: true, minTradeValue: 1e12 } } }),
    })
    expect(result.below[0]).toMatchObject({ price: 95, priceSource: 'month-end', fallbackMonth: '2026-08', flags: [] })
  })

  it('filters by industry', () => {
    const rows = [row({ code: 'A', industry: '24' }), row({ code: 'B', industry: '14' })]
    const quotes = { A: quote(90), B: quote(90) }
    const result = run(rows, { quotes, settings: normalizeScreenSettings({ industries: ['24'] }) })
    expect([...result.below, ...result.flagged].map((item) => item.code)).toEqual(['A'])
  })

  it('moves flagged stocks aside unless they are held or watched', () => {
    const rows = [row({ code: 'A', nonOpRatio: 0.5 }), row({ code: 'B', nonOpRatio: 0.5 }), row({ code: 'C', nonOpRatio: 0.5 })]
    const quotes = { A: quote(90), B: quote(90), C: quote(90) }
    const result = run(rows, { quotes, owned: new Set(['B']), watched: new Set(['C']) })
    expect(result.flagged.map((item) => item.code)).toEqual(['A'])
    expect(result.below.map((item) => [item.code, item.owned, item.watched, item.flags])).toEqual([
      ['B', true, false, ['nonOperating']],
      ['C', false, true, ['nonOperating']],
    ])
  })

  it('uses an override for its basis and marks it custom', () => {
    const overrides = { 1234: { ttm: { eps: 10, bands: { cheap: 5, fair: 6, expensive: 7 }, custom: true } } }
    const result = run([row()], { quotes: { 1234: quote(90) }, overrides })
    expect(result.counts.listed).toBe(0) // 合理價 60 < 90
    const cheap = run([row()], { quotes: { 1234: quote(40) }, overrides })
    expect(cheap.below[0]).toMatchObject({ custom: true, prices: { cheap: 50, fair: 60, expensive: 70 } })
    // The override is for TTM only: 今年 still uses the row's EPS 12 (便宜價 120).
    const otherBasis = run([row()], { quotes: { 1234: quote(90) }, overrides, basis: 'thisYear' })
    expect(otherBasis.below[0]).toMatchObject({ custom: false, prices: { cheap: 120 } })
  })
})

describe('computeFlags', () => {
  const context = { price: 90, tradeValue: 50_000_000, fair: 15 }
  const flags = settings.flags
  const only = (key, overrides, extra = {}) =>
    computeFlags(row(overrides), { ...context, ...extra }, flags).includes(key)

  it('業外占比高 above the limit or unknown, general companies only', () => {
    expect(only('nonOperating', { nonOpRatio: 0.3 })).toBe(false)
    expect(only('nonOperating', { nonOpRatio: 0.31 })).toBe(true)
    expect(only('nonOperating', { nonOpRatio: null })).toBe(true)
    expect(only('nonOperating', { nonOpRatio: 0.9, statement: 'financial' })).toBe(false)
  })

  it('獲利不穩 below the minimum', () => {
    expect(only('unstableProfit', { profitQuarters: 7 })).toBe(false)
    expect(only('unstableProfit', { profitQuarters: 6 })).toBe(true)
  })

  it('EPS 暴增 above the limit or unknown (turnaround)', () => {
    expect(only('epsSpike', { epsGrowth: 2 })).toBe(false)
    expect(only('epsSpike', { epsGrowth: 2.01 })).toBe(true)
    expect(only('epsSpike', { epsGrowth: null })).toBe(true)
  })

  it('本業不便宜 when the price is at or above core EPS × fair P/E', () => {
    expect(only('coreNotCheap', { coreEps: 6.1 })).toBe(false) // 91.5 > 90
    expect(only('coreNotCheap', { coreEps: 6 })).toBe(true) // 90
    expect(only('coreNotCheap', { coreEps: -1 })).toBe(true)
    expect(only('coreNotCheap', { coreEps: null })).toBe(false)
    expect(only('coreNotCheap', { coreEps: 1, statement: 'financial' })).toBe(false)
  })

  it('本益比樣本少 below the minimum', () => {
    expect(only('fewPeSamples', { bands: { cheap: 10, fair: 15, expensive: 20, sampleSize: 36 } })).toBe(false)
    expect(only('fewPeSamples', { bands: { cheap: 10, fair: 15, expensive: 20, sampleSize: 35 } })).toBe(true)
  })

  it('股本變動 beyond the deviation, not at it', () => {
    expect(only('shareChange', { shareRatio: 1.3 })).toBe(false)
    expect(only('shareChange', { shareRatio: 0.7 })).toBe(false)
    expect(only('shareChange', { shareRatio: 1.31 })).toBe(true)
    expect(only('shareChange', { shareRatio: null })).toBe(false)
  })

  it('營建業 by industry', () => {
    expect(only('construction', { industry: '14' })).toBe(true)
    expect(only('construction', { industry: null })).toBe(false)
  })

  it('成交量低 only with a known trade value', () => {
    expect(only('lowTurnover', {}, { tradeValue: 10_000_000 })).toBe(false)
    expect(only('lowTurnover', {}, { tradeValue: 9_999_999 })).toBe(true)
    expect(only('lowTurnover', {}, { tradeValue: undefined })).toBe(false)
  })

  it('skips disabled flags', () => {
    const off = normalizeScreenSettings({ flags: { nonOperating: { enabled: false } } }).flags
    expect(computeFlags(row({ nonOpRatio: 0.9 }), context, off)).toEqual([])
  })
})

describe('normalizeScreenSettings', () => {
  it('returns the defaults for nothing stored', () => {
    expect(normalizeScreenSettings(null)).toEqual(DEFAULT_SCREEN_SETTINGS)
  })

  it('keeps valid values, repairs the rest', () => {
    const next = normalizeScreenSettings({
      industries: ['24', 24, '24', '14'],
      flags: {
        nonOperating: { enabled: false, max: 0.5 },
        epsSpike: { enabled: 'yes', maxGrowth: -1 },
        lowTurnover: { minTradeValue: 'abc' },
        unknown: { enabled: true },
      },
    })
    expect(next.industries).toEqual(['24', '14'])
    expect(next.flags.nonOperating).toEqual({ enabled: false, max: 0.5 })
    expect(next.flags.epsSpike).toEqual({ enabled: true, maxGrowth: 2 })
    expect(next.flags.lowTurnover).toEqual({ enabled: true, minTradeValue: 10_000_000 })
    expect(next.flags).not.toHaveProperty('unknown')
  })
})

describe('overrides', () => {
  const model = (eps, fair) => ({ chosen: { eps }, bands: { cheap: fair - 2, fair, expensive: fair + 2 } })

  it('detects settings that change something', () => {
    expect(hasCustomValuation(EMPTY_VALUATION_SETTINGS)).toBe(false)
    expect(hasCustomValuation({ ...EMPTY_VALUATION_SETTINGS, peFair: 18 })).toBe(true)
    expect(
      hasCustomValuation({ ...EMPTY_VALUATION_SETTINGS, model: { global: { revenueYoy: 0.1 }, quarters: {} } }),
    ).toBe(true)
    expect(
      hasCustomValuation({ ...EMPTY_VALUATION_SETTINGS, model: { global: {}, quarters: { '2026Q3': { taxRate: 0.2 } } } }),
    ).toBe(true)
  })

  it('is custom only when the basis result differs from the automatic one', () => {
    expect(toOverride(model(10, 15), model(10, 15))).toEqual({
      eps: 10,
      bands: { cheap: 13, fair: 15, expensive: 17 },
      custom: false,
    })
    expect(toOverride(model(12, 15), model(10, 15)).custom).toBe(true)
    expect(toOverride(model(10, 18), model(10, 15)).custom).toBe(true)
    expect(toOverride(model(undefined, 15), model(undefined, 15)).eps).toBeNull()
  })
})

describe('display helpers', () => {
  it('formats the distance to 合理價', () => {
    expect(formatDistance(-0.324)).toBe('距合理價 −32%')
    expect(formatDistance(0)).toBe('距合理價 0%')
  })

  it('lists a row’s marks', () => {
    expect(
      describeRowMeta({ owned: true, watched: true, custom: true, priceSource: 'month-end', fallbackMonth: '2026-08', flags: ['nonOperating', 'construction'] }),
    ).toEqual(['持有', '觀察', '自訂', '8 月底價', '業外占比高', '營建業'])
    expect(describeRowMeta({ owned: false, watched: false, custom: false, priceSource: 'daily', flags: [] })).toEqual([])
  })

  it('formats the quotes date and the industry choice', () => {
    expect(formatQuotesDate('20261014')).toBe('10/14')
    expect(formatQuotesDate(null)).toBeNull()
    expect(industrySummary([])).toBe('全部產業')
    expect(industrySummary(['24'])).toBe('半導體')
    expect(industrySummary(['24', '28'])).toBe('半導體 等 2 類')
  })
})
