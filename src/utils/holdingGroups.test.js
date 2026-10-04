import { describe, it, expect } from 'vitest'
import { groupHoldingsByHolder } from './holdingGroups'

const holding = (id, holder, latestValueTwd) => ({ id, holder, latestValueTwd })

describe('groupHoldingsByHolder', () => {
  it('groups in holder-option order with counts and value totals', () => {
    const groups = groupHoldingsByHolder(
      [holding(1, 'Wei', 100), holding(2, 'Po', 50), holding(3, 'Wei', 25)],
      ['Po', 'Wei'],
    )
    expect(groups).toEqual([
      { key: 'Po', label: 'Po', count: 1, totalTwd: 50, rows: [holding(2, 'Po', 50)] },
      { key: 'Wei', label: 'Wei', count: 2, totalTwd: 125, rows: [holding(1, 'Wei', 100), holding(3, 'Wei', 25)] },
    ])
  })

  it('puts holdings without a known holder last, under 未設定', () => {
    const groups = groupHoldingsByHolder(
      [holding(1, null, 10), holding(2, 'Po', 5), holding(3, '離職的人', 7)],
      ['Po', 'Wei'],
    )
    expect(groups.map((group) => [group.label, group.count, group.totalTwd])).toEqual([
      ['Po', 1, 5],
      ['未設定', 2, 17],
    ])
  })

  it('skips holders with no holdings and ignores missing values in totals', () => {
    const groups = groupHoldingsByHolder([holding(1, 'Wei', undefined)], ['Po', 'Wei'])
    expect(groups).toEqual([
      { key: 'Wei', label: 'Wei', count: 1, totalTwd: 0, rows: [holding(1, 'Wei', undefined)] },
    ])
  })
})
