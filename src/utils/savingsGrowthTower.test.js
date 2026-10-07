import { describe, expect, it } from 'vitest'
import { getGrowthTowerLayout, getMonthSurplus, getStepDelay } from './savingsGrowthTower'

const m = (month, incomeTwd, expenseTwd, isCurrent = false) => ({ month, incomeTwd, expenseTwd, isCurrent })
const spans = (layers) => layers.map((l) => [l.month, l.bottom, l.top])

describe('getMonthSurplus', () => {
  it('treats a missing income as zero', () => {
    expect(getMonthSurplus(m('2026-01', null, 50))).toBe(-50)
    expect(getMonthSurplus(m('2026-01', 100, 40))).toBe(60)
  })
})

describe('getGrowthTowerLayout', () => {
  it('stacks each positive month on top of the last', () => {
    const t = getGrowthTowerLayout([m('2026-01', 100, 40), m('2026-02', 100, 70, true)])
    expect(spans(t.layers)).toEqual([['2026-01', 0, 60], ['2026-02', 60, 90]])
    expect(t.layers[1].isCurrent).toBe(true)
    expect(t.peakTwd).toBe(90)
    expect(t.totalSavedTwd).toBe(90)
    expect(t.totalSpentTwd).toBe(110)
    expect(t.steps.map((s) => s.type)).toEqual(['add', 'add'])
  })

  it('chips an overspent month off the top, across layers', () => {
    const t = getGrowthTowerLayout([m('2026-01', 100, 40), m('2026-02', 100, 70), m('2026-03', 100, 150)])
    expect(spans(t.layers)).toEqual([['2026-01', 0, 40]])
    expect(t.steps[2].type).toBe('chip')
    expect(t.steps[2].removed.map((r) => [r.month, r.bottom, r.top])).toEqual([
      ['2026-02', 60, 90],
      ['2026-01', 40, 60],
    ])
    expect(t.peakTwd).toBe(90)
    expect(t.totalSavedTwd).toBe(40)
  })

  it('stops chipping at the ground', () => {
    const t = getGrowthTowerLayout([m('2026-01', 100, 90), m('2026-02', null, 50)])
    expect(t.layers).toEqual([])
    expect(t.steps[1].removed.map((r) => [r.bottom, r.top])).toEqual([[0, 10]])
    expect(t.totalSavedTwd).toBe(-40)
    expect(t.peakTwd).toBe(10)
  })

  it('keeps earlier steps unchanged when later steps chip', () => {
    const t = getGrowthTowerLayout([m('2026-01', 100, 40), m('2026-02', 0, 30)])
    expect(spans(t.steps[0].stack)).toEqual([['2026-01', 0, 60]])
    expect(spans(t.steps[1].stack)).toEqual([['2026-01', 0, 30]])
  })

  it('records a break-even month as a no-op step', () => {
    const t = getGrowthTowerLayout([m('2026-01', 100, 100)])
    expect(t.steps.map((s) => s.type)).toEqual(['none'])
    expect(t.layers).toEqual([])
  })

  it('knows when no month has income', () => {
    expect(getGrowthTowerLayout([m('2026-01', null, 10)]).hasIncome).toBe(false)
    expect(getGrowthTowerLayout([]).hasIncome).toBe(false)
    expect(getGrowthTowerLayout([m('2026-01', 5, 10)]).hasIncome).toBe(true)
  })
})

describe('getStepDelay', () => {
  it('keeps long histories within about three seconds', () => {
    expect(getStepDelay(3)).toBe(260)
    expect(getStepDelay(30)).toBe(100)
  })
})
