import { describe, it, expect } from 'vitest'
import { describeEpsFactor, describePeFactor } from './valuationEquation'
import { buildValuationModel, EMPTY_VALUATION_SETTINGS } from './valuation'
import { TW_FUNDAMENTALS } from './incomeModel.fixture'

const build = (basis, { settings = EMPTY_VALUATION_SETTINGS, fundamentals = TW_FUNDAMENTALS } = {}) =>
  buildValuationModel({ fundamentals, settings, price: 50, basis, todayIso: '2026-10-11' })

const factorOf = (basis, options) => describeEpsFactor(build(basis, options).chosen, basis)

describe('describeEpsFactor', () => {
  it('counts published and projected quarters for each TW basis', () => {
    expect(factorOf('ttm')).toEqual({
      kind: 'quarters',
      actual: 4,
      projected: 0,
      caption: '全為實際・不受假設影響',
      adjustable: false,
    })
    expect(factorOf('ttmAfterNext')).toMatchObject({ actual: 3, projected: 1, caption: '3 季實際・1 季推估', adjustable: true })
    expect(factorOf('thisYear')).toMatchObject({ actual: 2, projected: 2, caption: '2 季實際・2 季推估' })
    expect(factorOf('nextYear')).toMatchObject({ actual: 0, projected: 4, caption: '4 季推估' })
  })

  it('names a custom forward EPS instead of quarters', () => {
    const settings = { ...EMPTY_VALUATION_SETTINGS, forwardEps: 20 }
    expect(factorOf('nextYear', { settings })).toEqual({ kind: 'custom', caption: '直接指定 EPS', adjustable: true })
    expect(factorOf('ttmAfterNext', { settings }).kind).toBe('quarters')
  })

  it('gives the reason when there is no EPS', () => {
    const financial = { ...TW_FUNDAMENTALS, company: { ...TW_FUNDAMENTALS.company, statement: 'financial' } }
    expect(factorOf('thisYear', { fundamentals: financial })).toEqual({
      kind: 'unavailable',
      caption: '金融股不適用損益表推估',
      adjustable: true,
    })
    expect(describeEpsFactor(null, 'ttm')).toEqual({ kind: 'unavailable', caption: '資料不足，無法計算', adjustable: false })
  })

  it('calls US consensus quarters 預估', () => {
    const us = { ...TW_FUNDAMENTALS, market: 'US', company: undefined, upcoming: [{ date: '2026-11-01', epsEstimate: 3 }] }
    expect(factorOf('forward', { fundamentals: us })).toMatchObject({
      actual: 3,
      projected: 1,
      caption: '3 季實際・1 季預估',
      adjustable: true,
    })
  })
})

describe('describePeFactor', () => {
  it('shows the bands in use and where they come from', () => {
    const auto = { cheap: 7.71, fair: 11.56, expensive: 14.16, overridden: { cheap: false, fair: false, expensive: false } }
    expect(describePeFactor(auto)).toEqual({ value: '7.71／11.56／14.16', caption: '歷史區間' })
    expect(describePeFactor({ ...auto, overridden: { ...auto.overridden, fair: true } }).caption).toBe('自訂')
    expect(describePeFactor({ cheap: null, fair: 12, expensive: null, overridden: {} })).toEqual({
      value: '--',
      caption: '尚未設定',
    })
  })
})
