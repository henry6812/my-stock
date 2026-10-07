import { describe, expect, it } from 'vitest'
import {
  OVERSPEND_DEPTH_CAP,
  TOWER_ROWS,
  diffTowerChunks,
  formatTowerWan,
  getRowRemovedFractions,
  getTowerLayout,
} from './savingsTower'

const strip = (chunks) => chunks.map(({ rowIndex, offset, take, kind }) => [rowIndex, offset, take, kind])

describe('getTowerLayout', () => {
  it('removes recurring first, then one-time, from the top down', () => {
    const t = getTowerLayout({ incomeTwd: 100_000, recurringTwd: 25_000, oneTimeTwd: 13_000 })
    expect(t.hasIncome).toBe(true)
    expect(t.rows).toBe(TOWER_ROWS)
    expect(strip(t.chunks)).toEqual([
      [9, 0, 1, 'recurring'],
      [8, 0, 1, 'recurring'],
      [7, 0, 0.5, 'recurring'],
      [7, 0.5, 0.5, 'oneTime'],
      [6, 0, 0.8, 'oneTime'],
    ])
    expect(t.spentTwd).toBe(38_000)
    expect(t.savedTwd).toBe(62_000)
    expect(t.savedRatio).toBeCloseTo(0.62)
    expect(t.overspendTwd).toBe(0)
    expect(t.overspendDepthRatio).toBe(0)
  })

  it('keeps the whole tower when nothing is spent', () => {
    const t = getTowerLayout({ incomeTwd: 85_000, recurringTwd: 0, oneTimeTwd: 0 })
    expect(t.chunks).toEqual([])
    expect(t.savedTwd).toBe(85_000)
    expect(t.savedRatio).toBe(1)
  })

  it('empties the tower exactly when spending equals income', () => {
    const t = getTowerLayout({ incomeTwd: 100_000, recurringTwd: 40_000, oneTimeTwd: 60_000 })
    const removed = getRowRemovedFractions(t.chunks, t.rows)
    expect(removed.every((f) => f === 1)).toBe(true)
    expect(t.savedTwd).toBe(0)
    expect(t.overspendTwd).toBe(0)
  })

  it('reports overspend with a capped pit depth', () => {
    const big = getTowerLayout({ incomeTwd: 100_000, recurringTwd: 32_000, oneTimeTwd: 98_000 })
    expect(big.overspendTwd).toBe(30_000)
    expect(big.overspendDepthRatio).toBe(OVERSPEND_DEPTH_CAP)
    expect(getRowRemovedFractions(big.chunks, big.rows).every((f) => f === 1)).toBe(true)
    const small = getTowerLayout({ incomeTwd: 100_000, recurringTwd: 50_000, oneTimeTwd: 55_000 })
    expect(small.overspendTwd).toBe(5_000)
    expect(small.overspendDepthRatio).toBeCloseTo(0.05)
  })

  it('has no tower without income', () => {
    const t = getTowerLayout({ incomeTwd: 0, recurringTwd: 12_000, oneTimeTwd: 3_000 })
    expect(t.hasIncome).toBe(false)
    expect(t.chunks).toEqual([])
    expect(t.spentTwd).toBe(15_000)
    expect(t.savedTwd).toBe(0)
  })

  it('sanitises non-numeric and negative inputs', () => {
    const t = getTowerLayout({ incomeTwd: '85000', recurringTwd: Number.NaN, oneTimeTwd: -5 })
    expect(t.hasIncome).toBe(true)
    expect(t.incomeTwd).toBe(85_000)
    expect(t.spentTwd).toBe(0)
    expect(t.chunks).toEqual([])
    expect(getTowerLayout({ incomeTwd: undefined, recurringTwd: null, oneTimeTwd: 'x' }).hasIncome).toBe(false)
  })

  it('splits awkward fractions without float drift', () => {
    const t = getTowerLayout({ incomeTwd: 85_000, recurringTwd: 32_000, oneTimeTwd: 21_500 })
    const total = t.chunks.reduce((sum, c) => sum + c.take, 0)
    expect(total).toBeCloseTo((53_500 / 85_000) * 10, 5)
    t.chunks.forEach((c) => {
      expect(c.take).toBeGreaterThan(0)
      expect(c.offset + c.take).toBeLessThanOrEqual(1 + 1e-9)
    })
  })
})

describe('getRowRemovedFractions', () => {
  it('sums the chunk takes per row', () => {
    const t = getTowerLayout({ incomeTwd: 100_000, recurringTwd: 25_000, oneTimeTwd: 13_000 })
    expect(getRowRemovedFractions(t.chunks, t.rows)).toEqual([0, 0, 0, 0, 0, 0, 0.8, 1, 1, 1])
  })
})

describe('diffTowerChunks', () => {
  const before = getTowerLayout({ incomeTwd: 100_000, recurringTwd: 25_000, oneTimeTwd: 13_000 })
  const after = getTowerLayout({ incomeTwd: 100_000, recurringTwd: 25_000, oneTimeTwd: 20_000 })

  it('lists newly removed chunks when an expense is added', () => {
    const { added, restored } = diffTowerChunks(before, after)
    expect(strip(added)).toEqual([
      [6, 0, 1, 'oneTime'],
      [5, 0, 0.5, 'oneTime'],
    ])
    expect(strip(restored)).toEqual([[6, 0, 0.8, 'oneTime']])
  })

  it('lists restored chunks when an expense is removed', () => {
    const { added, restored } = diffTowerChunks(after, before)
    expect(strip(added)).toEqual([[6, 0, 0.8, 'oneTime']])
    expect(strip(restored)).toEqual([
      [6, 0, 1, 'oneTime'],
      [5, 0, 0.5, 'oneTime'],
    ])
  })

  it('is empty when nothing changed', () => {
    expect(diffTowerChunks(before, before)).toEqual({ added: [], restored: [] })
  })

  it('tolerates a missing previous layout', () => {
    expect(diffTowerChunks(null, before).added).toHaveLength(before.chunks.length)
  })
})

describe('formatTowerWan', () => {
  it('shows 萬 with one decimal', () => {
    expect(formatTowerWan(31_500)).toBe('3.2 萬')
    expect(formatTowerWan(85_000)).toBe('8.5 萬')
    expect(formatTowerWan(0)).toBe('0.0 萬')
  })
})
