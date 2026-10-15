import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

vi.mock('../hooks/useStockFundamentals', () => ({ default: vi.fn() }))
vi.mock('../hooks/useValuationSettings', () => ({ default: vi.fn() }))

import useStockFundamentals from '../hooks/useStockFundamentals'
import useValuationSettings from '../hooks/useValuationSettings'
import WatchlistDetailSheet from './WatchlistDetailSheet'
import { EMPTY_VALUATION_SETTINGS } from '../utils/valuation'
import { TW_FUNDAMENTALS } from '../utils/incomeModel.fixture'

const item = {
  id: 7,
  remoteKey: 'TW_2330',
  market: 'TW',
  symbol: '2330',
  name: '台積電',
  latestPrice: 1010,
  previousClose: 1000,
  currency: 'TWD',
  priceUpdatedAt: '2026-10-13T06:00:00.000Z',
  createdAt: '2026-10-13T05:00:00.000Z',
  change: 10,
  changePct: 0.01,
}

beforeEach(() => {
  useValuationSettings.mockReturnValue({ settings: EMPTY_VALUATION_SETTINGS, save: vi.fn() })
  useStockFundamentals.mockReturnValue({ status: 'ready', data: TW_FUNDAMENTALS, reload: vi.fn() })
})

const renderSheet = (props = {}) =>
  render(
    <WatchlistDetailSheet open item={item} isMobile disabled={false} onClose={() => {}} onRemove={vi.fn()} {...props} />,
  )

describe('WatchlistDetailSheet', () => {
  it('shows the quote and the research, without any holding content', () => {
    renderSheet()
    expect(screen.getByText('台積電')).toBeInTheDocument()
    expect(screen.getByText('$1,010.00')).toBeInTheDocument()
    expect(screen.getByText('+$10.00（+1.0%）')).toBeInTheDocument()
    expect(screen.getByText(/資料來源：TWSE/)).toBeInTheDocument()
    expect(screen.queryByText(/的持股/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '買進' })).not.toBeInTheDocument()
    expect(screen.queryByText('管理這筆持股')).not.toBeInTheDocument()
  })

  it('says when there is no quote yet', () => {
    renderSheet({ item: { ...item, latestPrice: null, change: null, changePct: null, priceUpdatedAt: null } })
    expect(screen.getByText('尚未取得報價')).toBeInTheDocument()
    expect(screen.getByText('—')).toHaveClass('watchlist-quote-price')
    expect(screen.queryByText('--')).not.toBeInTheDocument()
  })

  it('asks to remove from the watchlist', () => {
    const onRemove = vi.fn()
    renderSheet({ onRemove })
    fireEvent.click(screen.getByRole('button', { name: '從觀察清單移除' }))
    expect(onRemove).toHaveBeenCalledTimes(1)
  })

  it('disables removing when writes are disabled', () => {
    renderSheet({ disabled: true })
    expect(screen.getByRole('button', { name: '從觀察清單移除' })).toBeDisabled()
  })

  it('offers to add a stock that is not watched yet', () => {
    const onAdd = vi.fn()
    renderSheet({
      item: { ...item, id: undefined, priceUpdatedAt: null, change: null, changePct: null, quoteNote: '10/14 收盤' },
      inWatchlist: false,
      onAdd,
    })
    expect(screen.getByText('10/14 收盤')).toBeInTheDocument()
    expect(screen.queryByText('從觀察清單移除')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '加入觀察清單' }))
    expect(onAdd).toHaveBeenCalled()
  })

  it('opens at the basis it is given', () => {
    renderSheet({ initialBasis: 'thisYear' })
    expect(screen.getByRole('radio', { name: '今年' })).toBeChecked()
  })

  it('renders nothing without an item', () => {
    const { container } = renderSheet({ item: null })
    expect(container).toBeEmptyDOMElement()
  })
})
