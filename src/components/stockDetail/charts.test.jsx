import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import EpsTrendChart from './EpsTrendChart'
import { buildEpsChartData } from '../../utils/stockDetail'
import PeHistoryChart from './PeHistoryChart'

const singles = [
  { year: 2024, quarter: 1, eps: 1 },
  { year: 2024, quarter: 2, eps: 2 },
  { year: 2024, quarter: 3, eps: 3 },
  { year: 2024, quarter: 4, eps: 4 },
  { year: 2025, quarter: 1, eps: 5 },
  { year: 2025, quarter: 2, eps: 6 },
  { year: 2025, quarter: 3, eps: 7 },
  { year: 2025, quarter: 4, eps: 8 },
  { year: 2026, quarter: 1, eps: 9 },
]

describe('buildEpsChartData', () => {
  it('keeps the latest 8 quarters with last year’s quarter and estimates', () => {
    const data = buildEpsChartData({
      singles,
      surprises: [{ year: 2026, quarter: 1, estimate: 8.5, surprisePercent: 5.9 }],
    })
    expect(data).toHaveLength(8)
    expect(data[0]).toEqual({ label: '24Q2', eps: 2, lastYearEps: null, estimate: null, surprisePercent: null })
    expect(data.at(-1)).toEqual({ label: '26Q1', eps: 9, lastYearEps: 5, estimate: 8.5, surprisePercent: 5.9 })
  })
})

describe('chart components', () => {
  it('shows the next earnings line', () => {
    render(
      <EpsTrendChart
        fundamentals={{ singles, surprises: [], nextEarnings: { date: '2026-11-14', label: 'Q3 財報法定截止日' } }}
      />,
    )
    expect(screen.getByText('Q3 財報法定截止日：2026-11-14')).toBeInTheDocument()
  })

  it('shows an empty state without EPS data', () => {
    render(<EpsTrendChart fundamentals={{ singles: [], surprises: [], nextEarnings: null }} />)
    expect(screen.getByText('尚無 EPS 資料')).toBeInTheDocument()
  })

  it('shows an empty state with fewer than two P/E points', () => {
    render(<PeHistoryChart peSeries={[{ label: '2026-09', pe: 28 }]} bands={{}} />)
    expect(screen.getByText('尚無歷史本益比資料')).toBeInTheDocument()
  })
})
