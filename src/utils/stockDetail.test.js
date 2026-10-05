import { describe, it, expect } from 'vitest'
import { buildStockDetailHolding, formatSignedPercent, isInteractiveTarget } from './stockDetail'

describe('formatSignedPercent', () => {
  it('formats with sign and one decimal', () => {
    expect(formatSignedPercent(-0.0423)).toBe('−4.2%')
    expect(formatSignedPercent(0.1)).toBe('+10.0%')
    expect(formatSignedPercent(null)).toBe('--')
  })
})

describe('buildStockDetailHolding', () => {
  const rows = [
    { id: 1, market: 'TW', symbol: '2330', holder: 'Po', shares: 1000, latestValueTwd: 1085000 },
    { id: 2, market: 'TW', symbol: '2330', holder: 'Mia', shares: 500, latestValueTwd: 542500 },
    { id: 3, market: 'US', symbol: '2330', holder: 'Po', shares: 1, latestValueTwd: 100 },
  ]

  it('sums shares and value across holders of the same stock', () => {
    expect(buildStockDetailHolding(rows, 2)).toMatchObject({ id: 2, totalShares: 1500, totalValueTwd: 1627500 })
  })

  it('returns null for an unknown id', () => {
    expect(buildStockDetailHolding(rows, 99)).toBeNull()
  })

  it('leaves the total value undefined when no row has a price', () => {
    expect(buildStockDetailHolding([{ id: 1, market: 'TW', symbol: '1101', shares: 10 }], 1).totalValueTwd).toBeUndefined()
  })
})

describe('isInteractiveTarget', () => {
  it('detects buttons, inputs and selects inside a row', () => {
    document.body.innerHTML = `
      <table><tr><td id="cell">x</td><td><button id="btn"><span id="icon">i</span></button></td>
      <td><div class="ant-select"><span id="sel">s</span></div></td><td><input id="in" /></td></tr></table>`
    expect(isInteractiveTarget(document.getElementById('cell'))).toBe(false)
    expect(isInteractiveTarget(document.getElementById('icon'))).toBe(true)
    expect(isInteractiveTarget(document.getElementById('sel'))).toBe(true)
    expect(isInteractiveTarget(document.getElementById('in'))).toBe(true)
    expect(isInteractiveTarget(null)).toBe(false)
  })

  it('ignores the row itself when dnd-kit marks it role="button"', () => {
    document.body.innerHTML = `
      <table><tr id="row" role="button" aria-roledescription="sortable"><td id="cell">x</td>
      <td><button id="btn">e</button></td></tr></table>`
    const row = document.getElementById('row')
    expect(isInteractiveTarget(document.getElementById('cell'), row)).toBe(false)
    expect(isInteractiveTarget(document.getElementById('btn'), row)).toBe(true)
  })
})
