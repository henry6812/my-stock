import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import WatchlistSection from './WatchlistSection'
import { buildWatchlistView } from '../../utils/watchlist'

const item = (overrides) => ({
  id: 1,
  remoteKey: 'TW_2330',
  market: 'TW',
  symbol: '2330',
  name: '台積電',
  latestPrice: 1010,
  previousClose: 1000,
  currency: 'TWD',
  priceUpdatedAt: '2026-10-13T06:00:00.000Z',
  createdAt: '2026-10-13T05:00:00.000Z',
  deletedAt: null,
  ...overrides,
})

const view = buildWatchlistView([
  item({}),
  item({ id: 2, market: 'US', symbol: 'NVDA', remoteKey: 'US_NVDA', name: 'NVIDIA', currency: 'USD', latestPrice: 120, previousClose: 125 }),
])

const renderSection = (props = {}) =>
  render(
    <WatchlistSection
      view={view}
      isMobile
      disabled={false}
      refreshing={false}
      refreshFailed={false}
      onRefresh={vi.fn()}
      onOpen={vi.fn()}
      onRemove={vi.fn()}
      {...props}
    />,
  )

describe('WatchlistSection', () => {
  it('lists watched stocks grouped by market', () => {
    renderSection()
    expect(screen.getByText('觀察清單')).toBeInTheDocument()
    expect(screen.getByText('台股')).toBeInTheDocument()
    expect(screen.getByText('美股')).toBeInTheDocument()
    expect(screen.getByText('台積電')).toBeInTheDocument()
    expect(screen.getByText('+1.0%')).toBeInTheDocument()
    expect(screen.getByText('−4.0%')).toBeInTheDocument()
  })

  it('opens a stock when its row is tapped', () => {
    const onOpen = vi.fn()
    renderSection({ onOpen })
    fireEvent.click(screen.getByRole('button', { name: '台積電 2330，查看個股' }))
    expect(onOpen).toHaveBeenCalledWith(1)
  })

  it('shows the empty state', () => {
    renderSection({ view: buildWatchlistView([]) })
    expect(screen.getByText('還沒有觀察的股票')).toBeInTheDocument()
  })

  it('shows 更新失敗 after a failed refresh', () => {
    renderSection({ refreshFailed: true })
    expect(screen.getByText('更新失敗')).toBeInTheDocument()
  })

  it('refreshes from the header button', () => {
    const onRefresh = vi.fn()
    renderSection({ onRefresh })
    fireEvent.click(screen.getByRole('button', { name: '更新觀察清單報價' }))
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('removes from the row on desktop without opening it', () => {
    const onOpen = vi.fn()
    const onRemove = vi.fn()
    renderSection({ isMobile: false, onOpen, onRemove })
    fireEvent.click(screen.getByRole('button', { name: '刪除 台積電' }))
    expect(onRemove).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }))
    expect(onOpen).not.toHaveBeenCalled()
  })
})
