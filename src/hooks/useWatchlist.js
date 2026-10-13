import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CLOUD_SYNC_UPDATED_EVENT } from '../services/firebase/cloudSyncService'
import { getWatchlistView, refreshWatchlistPrices } from '../services/portfolioService'
import { shouldAutoRefreshWatchlist } from '../utils/watchlist'

const EMPTY_VIEW = { rows: [], groups: [], lastUpdatedAt: null }

// The 研究 tab's watchlist: the view (reloaded on cloud sync, so another
// device's changes show up), refreshing its quotes, and the stock open in
// the sheet. Entering the tab refreshes once when a price is stale.
export default function useWatchlist({ enabled, autoRefresh }) {
  const [state, setState] = useState({ view: EMPTY_VIEW, loaded: false })
  const [refreshing, setRefreshing] = useState(false)
  const [refreshFailed, setRefreshFailed] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const autoAttemptedRef = useRef(false)

  const reload = useCallback(async () => {
    const view = await getWatchlistView()
    setState({ view, loaded: true })
  }, [])

  useEffect(() => {
    if (!enabled) return undefined
    let cancelled = false
    const load = () => {
      getWatchlistView().then((view) => {
        if (!cancelled) setState({ view, loaded: true })
      })
    }
    load()
    window.addEventListener(CLOUD_SYNC_UPDATED_EVENT, load)
    return () => {
      cancelled = true
      window.removeEventListener(CLOUD_SYNC_UPDATED_EVENT, load)
    }
  }, [enabled])

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const result = await refreshWatchlistPrices()
      setRefreshFailed(false)
      await reload()
      return result
    } catch (error) {
      setRefreshFailed(true)
      throw error
    } finally {
      setRefreshing(false)
    }
  }, [reload])

  useEffect(() => {
    if (!autoRefresh) {
      autoAttemptedRef.current = false
      return
    }
    if (!state.loaded || autoAttemptedRef.current) return
    autoAttemptedRef.current = true
    if (!shouldAutoRefreshWatchlist(state.view.rows, Date.now())) return
    // Failures only mark the timestamp (refreshFailed); no toast.
    refresh().catch((error) => console.warn('[watchlist] auto refresh failed', error))
  }, [autoRefresh, state, refresh])

  const selectedItem = useMemo(
    () => (selectedId === null ? null : state.view.rows.find((row) => row.id === selectedId) ?? null),
    [selectedId, state.view.rows],
  )
  if (selectedId !== null && state.loaded && selectedItem === null) {
    setSelectedId(null)
  }

  const openItem = useCallback((id) => setSelectedId(id), [])
  const closeItem = useCallback(() => setSelectedId(null), [])

  return {
    view: state.view,
    loaded: state.loaded,
    reload,
    refreshing,
    refreshFailed,
    refresh,
    selectedItem,
    openItem,
    closeItem,
  }
}
