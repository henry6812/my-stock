import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dayjs from 'dayjs'
import { CLOUD_SYNC_UPDATED_EVENT } from '../services/firebase/cloudSyncService'
import { loadStockFundamentals } from '../services/fundamentalsProviders'
import {
  getScreenSettings,
  getValuationSettings,
  listValuationOverrideSymbols,
  saveScreenSettings,
} from '../services/portfolioService'
import { getTwseDailyQuotes } from '../services/priceProviders/twseDailyProvider'
import {
  DEFAULT_SCREEN_SETTINGS,
  hasCustomValuation,
  normalizeScreenSettings,
  screenStocks,
  toOverride,
} from '../utils/stockScreen'
import { buildValuationModel } from '../utils/valuation'

export const SCREEN_QUOTES_INTERVAL_MS = 10 * 60 * 1000

// GitHub Pages answers a missing file with 404; the Vite dev server answers
// with index.html, so anything that is not JSON also means "not built".
const loadScreenFile = async () => {
  const response = await fetch(`${import.meta.env.BASE_URL}data/tw/screen.json`)
  const isJson = (response.headers.get('content-type') ?? '').includes('json')
  if (response.status === 404 || (response.ok && !isJson)) return null
  if (!response.ok) throw new Error(`無法載入篩選資料（HTTP ${response.status}）`)
  return response.json()
}

// The stocks whose detail-sheet settings change this basis: their own
// eps / bands, keyed by code then basis.
const loadOverrides = async (codes, basis) => {
  const todayIso = dayjs().format('YYYY-MM-DD')
  const overrides = {}
  for (const symbol of await listValuationOverrideSymbols('TW')) {
    if (!codes.has(symbol)) continue
    try {
      const settings = await getValuationSettings({ market: 'TW', symbol })
      if (!hasCustomValuation(settings)) continue
      const fundamentals = await loadStockFundamentals('TW', symbol, { todayIso })
      if (!fundamentals) continue
      const build = (nextSettings) =>
        buildValuationModel({ fundamentals, settings: nextSettings, price: null, basis, todayIso })
      overrides[symbol] = { [basis]: toOverride(build(settings), build(null)) }
    } catch (error) {
      console.warn(`[stockScreen] override ${symbol} failed`, error)
    }
  }
  return overrides
}

// 研究 › 低估候選: screen.json, today's TWSE closes (once per interval while
// the tab is active), the thresholds (reloaded on cloud sync) and the
// user's per-stock valuation settings, screened for the chosen basis.
export default function useStockScreen({ enabled, active, canWrite, owned, watched }) {
  const [file, setFile] = useState({ status: 'idle', rows: [] })
  const [quotes, setQuotes] = useState({ quotes: {}, date: null, failed: false })
  const [settings, setSettings] = useState(DEFAULT_SCREEN_SETTINGS)
  const [basis, setBasis] = useState('ttm')
  const [overrides, setOverrides] = useState({})
  const [syncVersion, setSyncVersion] = useState(0)
  const lastQuotesAtRef = useRef(0)

  useEffect(() => {
    if (!enabled) return undefined
    let cancelled = false
    loadScreenFile()
      .then((screen) => {
        if (cancelled) return
        setFile(screen ? { status: 'ready', rows: screen.rows ?? [] } : { status: 'missing', rows: [] })
      })
      .catch((error) => {
        console.warn('[stockScreen] screen.json failed', error)
        if (!cancelled) setFile({ status: 'error', rows: [] })
      })
    return () => {
      cancelled = true
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) return undefined
    let cancelled = false
    // Reloading the settings also re-reads the valuation overrides, which
    // sync the same way.
    const load = () => {
      getScreenSettings().then((next) => {
        if (cancelled) return
        setSettings(next)
        setSyncVersion((version) => version + 1)
      })
    }
    load()
    window.addEventListener(CLOUD_SYNC_UPDATED_EVENT, load)
    return () => {
      cancelled = true
      window.removeEventListener(CLOUD_SYNC_UPDATED_EVENT, load)
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled || !active || file.status !== 'ready') return
    if (Date.now() - lastQuotesAtRef.current < SCREEN_QUOTES_INTERVAL_MS) return
    lastQuotesAtRef.current = Date.now()
    getTwseDailyQuotes()
      .then(({ date, quotes: next }) => setQuotes({ quotes: next, date, failed: false }))
      .catch((error) => {
        console.warn('[stockScreen] quotes failed', error)
        setQuotes((current) => ({ ...current, failed: true }))
      })
  }, [enabled, active, file.status])

  useEffect(() => {
    if (file.status !== 'ready') return undefined
    let cancelled = false
    loadOverrides(new Set(file.rows.map((row) => row.code)), basis).then((next) => {
      if (!cancelled) setOverrides(next)
    })
    return () => {
      cancelled = true
    }
  }, [file, basis, syncVersion])

  const saveSettings = useCallback(async (next) => {
    const saved = await saveScreenSettings(next)
    setSettings(saved)
    return saved
  }, [])

  // Applies at once; saved (and synced) only when signed in.
  const setIndustries = useCallback(
    (industries) => {
      const next = normalizeScreenSettings({ ...settings, industries })
      setSettings(next)
      if (canWrite) {
        saveScreenSettings(next).catch((error) => console.warn('[stockScreen] save industries failed', error))
      }
    },
    [settings, canWrite],
  )

  const result = useMemo(
    () =>
      file.status === 'ready'
        ? screenStocks({ rows: file.rows, quotes: quotes.quotes, settings, basis, overrides, owned, watched })
        : null,
    [file, quotes.quotes, settings, basis, overrides, owned, watched],
  )

  return {
    status: file.status,
    basis,
    setBasis,
    settings,
    saveSettings,
    setIndustries,
    result,
    quotesDate: quotes.date,
    quotesFailed: quotes.failed,
  }
}
