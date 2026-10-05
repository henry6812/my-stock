import { useCallback, useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { loadStockFundamentals } from '../services/fundamentalsProviders'

// Results are tagged with the request key, so a response for a previous
// symbol (or attempt) is never shown and no state is set synchronously in
// the effect.
export default function useStockFundamentals(market, symbol) {
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState({ key: null })
  const key = market && symbol ? `${market}:${symbol}:${attempt}` : null

  useEffect(() => {
    if (!key) return undefined
    let cancelled = false
    loadStockFundamentals(market, symbol, { todayIso: dayjs().format('YYYY-MM-DD') })
      .then((data) => {
        if (!cancelled) setResult({ key, status: data ? 'ready' : 'unsupported', data })
      })
      .catch((error) => {
        if (!cancelled) setResult({ key, status: 'error', error })
      })
    return () => {
      cancelled = true
    }
  }, [key, market, symbol])

  const reload = useCallback(() => setAttempt((value) => value + 1), [])

  if (!key) return { status: 'idle', reload }
  if (result.key !== key) return { status: 'loading', reload }
  return { status: result.status, data: result.data, error: result.error, reload }
}
