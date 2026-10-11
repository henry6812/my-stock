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
  holder: 'Po',
  holderName: 'Po',
  shares: 2000,
  latestValueTwd: 2170000,
  totalCost: null,
}

const reload = vi.fn()

beforeEach(() => {
  reload.mockReset()
  useValuationSettings.mockReturnValue({ settings: EMPTY_VALUATION_SETTINGS, save: vi.fn() })
})

const renderSheet = (props = {}) =>
  render(<StockDetailSheet open holding={holding} isMobile disabled={false} onClose={() => {}} onAction={vi.fn()} {...props} />)

describe('StockDetailSheet', () => {
  it('renders header, valuation, charts and source when data is ready', () => {
    useStockFundamentals.mockReturnValue({ status: 'ready', data: fundamentals, reload })
    renderSheet()
    expect(screen.getByText('台積電')).toBeInTheDocument()
    expect(screen.getByText('2330')).toBeInTheDocument()
    expect(screen.getByText('Po 的持股')).toBeInTheDocument()
    expect(screen.getByText('$2,170,000')).toBeInTheDocument()
    expect(screen.getByText('2,000 股')).toBeInTheDocument()
    expect(screen.getByText('$1,085.00')).toBeInTheDocument()
    expect(screen.getByText('+1.2%')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '管理這筆持股' })).toBeInTheDocument()
    expect(screen.getByLabelText('估價')).toBeInTheDocument()
    expect(screen.getByText(/比合理價(高|低)/)).toBeInTheDocument()
    expect(screen.getByText('EPS 趨勢')).toBeInTheDocument()
    expect(screen.getByText('本益比走勢')).toBeInTheDocument()
    expect(screen.getByText(/資料來源：TWSE/)).toBeInTheDocument()
  })

  it('switches to the forward estimate', () => {
    useStockFundamentals.mockReturnValue({ status: 'ready', data: fundamentals, reload })
    renderSheet()
    fireEvent.click(screen.getByText('今年預估'))
    expect(screen.getByText(/比合理價(高|低)/)).toBeInTheDocument()
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

  it('shows the average cost and unrealized gain when the cost is set', () => {
    useStockFundamentals.mockReturnValue({ status: 'ready', data: fundamentals, reload })
    renderSheet({ holding: { ...holding, totalCost: 1000000 } })
    expect(screen.getByText('均價').nextSibling).toHaveTextContent('$500.00')
    expect(screen.getByText('成本').nextSibling).toHaveTextContent('$1,000,000')
    expect(screen.getByText('未實現 +$1,170,000（+117.0%）')).toBeInTheDocument()
  })

  it('offers to set the cost when it is missing', () => {
    useStockFundamentals.mockReturnValue({ status: 'ready', data: fundamentals, reload })
    const onAction = vi.fn()
    renderSheet({ onAction })
    expect(screen.getByText('還沒設定成本')).toBeInTheDocument()
    expect(screen.queryByText('均價')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '設定成本' }))
    expect(onAction).toHaveBeenCalledWith('calibrate')
  })

  it('routes every holding action through onAction', () => {
    useStockFundamentals.mockReturnValue({ status: 'loading', reload })
    const onAction = vi.fn()
    renderSheet({ onAction })
    for (const [name, action] of [
      [/買\s*進/, 'buy'],
      [/賣\s*出/, 'sell'],
      ['編輯分類與持有人', 'edit'],
      ['校正股數與成本', 'calibrate'],
      ['移除持股', 'remove'],
    ]) {
      fireEvent.click(screen.getByRole('button', { name }))
      expect(onAction).toHaveBeenLastCalledWith(action)
    }
  })

  it('makes 買進 the primary action and 賣出 the secondary one', () => {
    useStockFundamentals.mockReturnValue({ status: 'loading', reload })
    renderSheet()
    expect(screen.getByRole('button', { name: /買\s*進/ })).toHaveClass('ant-btn-primary')
    expect(screen.getByRole('button', { name: /賣\s*出/ })).not.toHaveClass('ant-btn-primary')
  })

  it('disables the actions while writing is not allowed', () => {
    useStockFundamentals.mockReturnValue({ status: 'loading', reload })
    renderSheet({ disabled: true })
    expect(screen.getByRole('button', { name: /買\s*進/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: '移除持股' })).toBeDisabled()
  })

  it('renders nothing without a holding', () => {
    useStockFundamentals.mockReturnValue({ status: 'idle', reload })
    const { container } = renderSheet({ holding: null })
    expect(container).toBeEmptyDOMElement()
  })
})
