import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

vi.mock('../hooks/useStockFundamentals', () => ({ default: vi.fn() }))
vi.mock('../hooks/useValuationSettings', () => ({ default: vi.fn() }))

import useStockFundamentals from '../hooks/useStockFundamentals'
import useValuationSettings from '../hooks/useValuationSettings'
import StockDetailSheet from './StockDetailSheet'
import { cumulativeToSingles, EMPTY_VALUATION_SETTINGS } from '../utils/valuation'

const cumulative = {
  '2025Q1': { eps: 13.94 },
  '2025Q2': { eps: 29.31 },
  '2025Q3': { eps: 46.36 },
  '2025Q4': { eps: 66.25 },
  '2026Q1': { eps: 16.0 },
  '2026Q2': { eps: 35.17 },
}

const fundamentals = {
  market: 'TW',
  singles: cumulativeToSingles(cumulative),
  cumulative,
  surprises: [],
  upcoming: [],
  peSeries: [10, 12, 14, 15, 16, 18, 20, 22].map((pe, i) => ({ label: `2026-0${i + 1}`, pe })),
  nextEarnings: { date: '2026-11-14', label: 'Q3 財報法定截止日' },
  updatedAt: '2026-10-05T12:03:11Z',
}

const holding = {
  id: 1,
  market: 'TW',
  symbol: '2330',
  companyName: '台積電',
  assetTag: 'STOCK',
  latestPrice: 1085,
  priceChangePct: 1.2,
  latestCurrency: 'TWD',
  totalShares: 2000,
  totalValueTwd: 2170000,
}

const reload = vi.fn()

beforeEach(() => {
  reload.mockReset()
  useValuationSettings.mockReturnValue({ settings: EMPTY_VALUATION_SETTINGS, save: vi.fn() })
})

const renderSheet = (props = {}) =>
  render(<StockDetailSheet open holding={holding} isMobile disabled={false} onClose={() => {}} {...props} />)

describe('StockDetailSheet', () => {
  it('renders header, valuation, charts and source when data is ready', () => {
    useStockFundamentals.mockReturnValue({ status: 'ready', data: fundamentals, reload })
    renderSheet()
    expect(screen.getByText('台積電')).toBeInTheDocument()
    expect(screen.getByText('2330')).toBeInTheDocument()
    expect(screen.getByText(/持有 2,000 股/)).toBeInTheDocument()
    expect(screen.getByLabelText('估價')).toBeInTheDocument()
    expect(screen.getByText(/目前.+距合理價/)).toBeInTheDocument()
    expect(screen.getByText('EPS 趨勢')).toBeInTheDocument()
    expect(screen.getByText('本益比走勢')).toBeInTheDocument()
    expect(screen.getByText(/資料來源：TWSE/)).toBeInTheDocument()
  })

  it('switches to the forward estimate', () => {
    useStockFundamentals.mockReturnValue({ status: 'ready', data: fundamentals, reload })
    renderSheet()
    fireEvent.click(screen.getByText('今年預估'))
    expect(screen.getByText(/目前.+距合理價/)).toBeInTheDocument()
  })

  it('shows a skeleton while loading', () => {
    useStockFundamentals.mockReturnValue({ status: 'loading', reload })
    const { baseElement } = renderSheet()
    expect(baseElement.querySelector('.ant-skeleton')).not.toBeNull()
  })

  it('shows the error with a retry button', () => {
    useStockFundamentals.mockReturnValue({ status: 'error', error: new Error('Finnhub API error: 401'), reload })
    renderSheet()
    expect(screen.getByText('Finnhub API error: 401')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /重\s*試/ }))
    expect(reload).toHaveBeenCalled()
  })

  it('explains unsupported TW stocks', () => {
    useStockFundamentals.mockReturnValue({ status: 'unsupported', reload })
    renderSheet()
    expect(screen.getByText('目前僅支援上市股票，查無這檔的 EPS 資料')).toBeInTheDocument()
  })

  it('skips valuation for non-stock holdings', () => {
    useStockFundamentals.mockReturnValue({ status: 'ready', data: fundamentals, reload })
    renderSheet({ holding: { ...holding, assetTag: 'ETF' } })
    expect(screen.queryByLabelText('估價')).not.toBeInTheDocument()
    expect(screen.queryByText('本益比走勢')).not.toBeInTheDocument()
    expect(screen.getByText('EPS 趨勢')).toBeInTheDocument()
  })

  it('renders nothing without a holding', () => {
    useStockFundamentals.mockReturnValue({ status: 'idle', reload })
    const { container } = renderSheet({ holding: null })
    expect(container).toBeEmptyDOMElement()
  })
})
