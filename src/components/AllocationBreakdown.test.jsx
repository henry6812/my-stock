import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import AllocationBreakdown from './AllocationBreakdown'
import { allocationShares, describeAllocation } from '../utils/allocation'

const items = [
  { key: 'STOCK', name: '股票', value: 880_000, color: '#2B7F74' },
  { key: 'CASH', name: '現金', value: 90_000, color: '#A7B2AE' },
  { key: 'BOND', name: '債券', value: 30_000, color: '#C08A2B' },
]

describe('allocation helpers', () => {
  it('turns values into shares of the total', () => {
    expect(allocationShares(items).map((i) => i.share)).toEqual([0.88, 0.09, 0.03])
    expect(allocationShares([{ key: 'x', name: 'x', value: 0 }])).toEqual([])
  })

  it('headlines the largest slices', () => {
    expect(describeAllocation(items)).toBe('股票 88% · 現金 9%')
    expect(describeAllocation([])).toBe('')
  })
})

describe('<AllocationBreakdown />', () => {
  it('lists every slice with its share and amount', () => {
    render(<AllocationBreakdown items={items} />)
    const rows = screen.getAllByRole('listitem')
    expect(rows.map((r) => r.textContent)).toEqual([
      '股票88.0%$880,000',
      '現金9.0%$90,000',
      '債券3.0%$30,000',
    ])
  })

  it('shows the empty text without data', () => {
    render(<AllocationBreakdown items={[]} emptyText="尚無資料" />)
    expect(screen.getByText('尚無資料')).toBeInTheDocument()
  })
})
