import { useCallback, useEffect, useState } from 'react'
import { CLOUD_SYNC_UPDATED_EVENT } from '../services/firebase/cloudSyncService'
import { getValuationSettings, saveValuationSettings } from '../services/portfolioService'
import { EMPTY_VALUATION_SETTINGS } from '../utils/valuation'

// Reloads on cloud sync so an override saved on another device shows up.
export default function useValuationSettings(market, symbol) {
  const key = market && symbol ? `${market}_${symbol}` : null
  const [state, setState] = useState({ key: null, settings: EMPTY_VALUATION_SETTINGS })

  useEffect(() => {
    if (!key) return undefined
    let cancelled = false
    const load = () => {
      getValuationSettings({ market, symbol }).then((settings) => {
        if (!cancelled) setState({ key, settings })
      })
    }
    load()
    window.addEventListener(CLOUD_SYNC_UPDATED_EVENT, load)
    return () => {
      cancelled = true
      window.removeEventListener(CLOUD_SYNC_UPDATED_EVENT, load)
    }
  }, [key, market, symbol])

  const save = useCallback(
    async (patch) => {
      const settings = await saveValuationSettings({ market, symbol, patch })
      setState({ key, settings })
      return settings
    },
    [key, market, symbol],
  )

  return { settings: state.key === key ? state.settings : EMPTY_VALUATION_SETTINGS, save }
}
