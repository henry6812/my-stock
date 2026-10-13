import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'

vi.mock('../services/portfolioService', () => ({
  getWatchlistView: vi.fn(),
  refreshWatchlistPrices: vi.fn(),
}))

import { getWatchlistView, refreshWatchlistPrices } from '../services/portfolioService'
import { CLOUD_SYNC_UPDATED_EVENT } from '../services/firebase/cloudSyncService'
import { buildWatchlistView } from '../utils/watchlist'
import useWatchlist from './useWatchlist'

const fresh = new Date().toISOString()
const row = (id, priceUpdatedAt = fresh) => ({
  id,
  remoteKey: `TW_${id}`,
  market: 'TW',
  symbol: String(id),
  name: `S${id}`,
  latestPrice: 10,
  previousClose: 9,
  currency: 'TWD',
  priceUpdatedAt,
  createdAt: `2026-10-13T0${id}:00:00.000Z`,
  updatedAt: fresh,
  deletedAt: null,
})

beforeEach(() => {
  vi.mocked(getWatchlistView).mockReset()
  vi.mocked(refreshWatchlistPrices).mockReset()
  vi.mocked(refreshWatchlistPrices).mockResolvedValue({ updatedCount: 1, targetCount: 1, failed: [] })
})

describe('useWatchlist', () => {
  it('loads the view when enabled and reloads on cloud updates', async () => {
    vi.mocked(getWatchlistView).mockResolvedValue(buildWatchlistView([row(1)]))
    const { result } = renderHook(() => useWatchlist({ enabled: true, autoRefresh: false }))
    await waitFor(() => expect(result.current.loaded).toBe(true))
    expect(result.current.view.rows).toHaveLength(1)

    vi.mocked(getWatchlistView).mockResolvedValue(buildWatchlistView([row(1), row(2)]))
    act(() => {
      window.dispatchEvent(new Event(CLOUD_SYNC_UPDATED_EVENT))
    })
    await waitFor(() => expect(result.current.view.rows).toHaveLength(2))
  })

  it('does not load while disabled', () => {
    renderHook(() => useWatchlist({ enabled: false, autoRefresh: false }))
    expect(getWatchlistView).not.toHaveBeenCalled()
  })

  it('auto-refreshes once per entry when prices are stale', async () => {
    vi.mocked(getWatchlistView).mockResolvedValue(buildWatchlistView([row(1, null)]))
    const { result, rerender } = renderHook((props) => useWatchlist(props), {
      initialProps: { enabled: true, autoRefresh: true },
    })
    await waitFor(() => expect(refreshWatchlistPrices).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(result.current.refreshing).toBe(false))

    rerender({ enabled: true, autoRefresh: true })
    expect(refreshWatchlistPrices).toHaveBeenCalledTimes(1)

    rerender({ enabled: true, autoRefresh: false })
    rerender({ enabled: true, autoRefresh: true })
    await waitFor(() => expect(refreshWatchlistPrices).toHaveBeenCalledTimes(2))
  })

  it('does not auto-refresh fresh prices', async () => {
    vi.mocked(getWatchlistView).mockResolvedValue(buildWatchlistView([row(1)]))
    const { result } = renderHook(() => useWatchlist({ enabled: true, autoRefresh: true }))
    await waitFor(() => expect(result.current.loaded).toBe(true))
    expect(refreshWatchlistPrices).not.toHaveBeenCalled()
  })

  it('marks a failed refresh and rethrows', async () => {
    vi.mocked(getWatchlistView).mockResolvedValue(buildWatchlistView([row(1)]))
    vi.mocked(refreshWatchlistPrices).mockRejectedValue(new Error('全部 1 檔報價都抓取失敗：x'))
    const { result } = renderHook(() => useWatchlist({ enabled: true, autoRefresh: false }))
    await waitFor(() => expect(result.current.loaded).toBe(true))
    await act(async () => {
      await expect(result.current.refresh()).rejects.toThrow('全部 1 檔')
    })
    expect(result.current.refreshFailed).toBe(true)
    expect(result.current.refreshing).toBe(false)
  })

  it('closes the selected item once it leaves the list', async () => {
    vi.mocked(getWatchlistView).mockResolvedValue(buildWatchlistView([row(1)]))
    const { result } = renderHook(() => useWatchlist({ enabled: true, autoRefresh: false }))
    await waitFor(() => expect(result.current.loaded).toBe(true))
    act(() => result.current.openItem(1))
    expect(result.current.selectedItem?.id).toBe(1)

    vi.mocked(getWatchlistView).mockResolvedValue(buildWatchlistView([]))
    await act(async () => {
      await result.current.reload()
    })
    expect(result.current.selectedItem).toBeNull()
  })
})
