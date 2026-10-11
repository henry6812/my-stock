import { describe, it, expect } from 'vitest'
import {
  diffSettings,
  formatAssumption,
  formatShares,
  formatYi,
  fromInput,
  setGlobalValue,
  setQuarterValue,
  snapshotOf,
  toInput,
} from './incomeAssumptionForm'
import { EMPTY_VALUATION_SETTINGS } from './valuation'

describe('input conversion', () => {
  it('shows ratios as percent and thousand NTD as 億', () => {
    expect(toInput('grossMargin', 0.5345)).toBe(53.45)
    expect(fromInput('grossMargin', 53.45)).toBeCloseTo(0.5345, 10)
    expect(toInput('nonOperating', 12_050_000)).toBe(120.5)
    expect(fromInput('nonOperating', -120.5)).toBe(-12_050_000)
    expect(fromInput('revenueYoy', -5)).toBeCloseTo(-0.05, 10)
    expect(toInput('taxRate', null)).toBeNull()
    expect(fromInput('taxRate', null)).toBeNull()
  })

  it('formats placeholders and amounts', () => {
    expect(formatAssumption('grossMargin', 0.5346)).toBe('53.5')
    expect(formatAssumption('nonOperating', 12_050_000)).toBe('120.5')
    expect(formatAssumption('taxRate', null)).toBe('--')
    expect(formatYi(601_200_000)).toBe('6,012 億')
    expect(formatShares(25_930_000)).toBe('259.3 億股')
  })
})

describe('draft editing', () => {
  it('sets and clears global and per-quarter values without touching the original', () => {
    const withGlobal = setGlobalValue(EMPTY_VALUATION_SETTINGS, 'grossMargin', 0.55)
    expect(withGlobal.model.global.grossMargin).toBe(0.55)
    expect(EMPTY_VALUATION_SETTINGS.model.global.grossMargin).toBeNull()

    const withQuarter = setQuarterValue(withGlobal, '2026Q4', 'taxRate', 0.18)
    expect(withQuarter.model.quarters).toEqual({ '2026Q4': { taxRate: 0.18 } })
    expect(setQuarterValue(withQuarter, '2026Q4', 'taxRate', null).model.quarters).toEqual({})
  })
})

describe('diffSettings', () => {
  it('returns only the changed leaves, null for cleared ones', () => {
    const settings = {
      ...EMPTY_VALUATION_SETTINGS,
      peFair: 18,
      model: { global: { ...EMPTY_VALUATION_SETTINGS.model.global, taxRate: 0.2 }, quarters: { '2026Q4': { grossMargin: 0.5 } } },
    }
    let draft = { ...settings, peFair: 20, forwardEps: null }
    draft = setGlobalValue(draft, 'taxRate', null)
    draft = setGlobalValue(draft, 'revenueYoy', -0.05)
    draft = setQuarterValue(draft, '2026Q4', 'grossMargin', null)
    draft = setQuarterValue(draft, '2027Q1', 'opexRatio', 0.1)
    expect(diffSettings(settings, draft)).toEqual({
      peFair: 20,
      model: {
        global: { taxRate: null, revenueYoy: -0.05 },
        quarters: { '2026Q4': { grossMargin: null }, '2027Q1': { opexRatio: 0.1 } },
      },
    })
    expect(diffSettings(settings, settings)).toEqual({})
  })
})

describe('snapshotOf', () => {
  it('keeps what the comparison needs from the next quarter', () => {
    const next = {
      key: '2026Q3', eps: 3.4, revenue: 1350,
      assumptions: { grossMargin: { value: 0.5, source: 'auto' }, opexRatio: { value: 0.2, source: 'global' } },
    }
    expect(snapshotOf(next)).toEqual({ quarter: '2026Q3', eps: 3.4, revenue: 1350, grossMargin: 0.5, opexRatio: 0.2 })
  })
})
