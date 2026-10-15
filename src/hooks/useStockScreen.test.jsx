import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'

vi.mock('../services/portfolioService', () => ({
  getScreenSettings: vi.fn(),
  saveScreenSettings: vi.fn(),
  getValuationSettings: vi.fn(),
  listValuationOverrideSymbols: vi.fn(),
}))
vi.mock('../services/priceProviders/twseDailyProvider', () => ({ getTwseDailyQuotes: vi.fn() }))
vi.mock('../services/fundamentalsProviders', () => ({ loadStockFundamentals: vi.fn() }))

import {
  getScreenSettings,
  getValuationSettings,
  listValuationOverrideSymbols,
  saveScreenSettings,
} from '../services/portfolioService'
import { getTwseDailyQuotes } from '../services/priceProviders/twseDailyProvider'
import { loadStockFundamentals } from '../services/fundamentalsProviders'
import { DEFAULT_SCREEN_SETTINGS } from '../utils/stockScreen'
import { EMPTY_VALUATION_SETTINGS } from '../utils/valuation'
import { TW_FUNDAMENTALS } from '../utils/incomeModel.fixture'
import useStockScreen from './useStockScreen'

const ROW = {
  code: '1234',
  name: '測試',
  industry: '24',
  statement: 'general',
  eps: { ttm: 10, ttmAfterNext: null, thisYear: null, nextYear: null },
  bands: { cheap: 10, fair: 15, expensive: 20, sampleSize: 60 },
  nonOpRatio: 0.05,
  profitQuarters: 8,
  epsGrowth: 1.2,
  coreEps: 10,
  shareRatio: 1,
  fallbackClose: 95,
  fallbackMonth: '2026-08',
}
const jsonResponse = (body) => ({
  ok: true,
  status: 200,
  headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => body,
})
const htmlResponse = () => ({
  ok: true,
  status: 200,
  headers: new Headers({ 'content-type': 'text/html' }),
  json: async () => ({}),
})
const props = { enabled: true, active: true, canWrite: true, owned: new Set(), watched: new Set() }

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ rows: [ROW] })))
  vi.mocked(getScreenSettings).mockReset().mockResolvedValue(DEFAULT_SCREEN_SETTINGS)
  vi.mocked(saveScreenSettings).mockReset().mockImplementation(async (next) => next)
  vi.mocked(listValuationOverrideSymbols).mockReset().mockResolvedValue([])
  vi.mocked(getValuationSettings).mockReset().mockResolvedValue(EMPTY_VALUATION_SETTINGS)
  vi.mocked(getTwseDailyQuotes)
    .mockReset()
    .mockResolvedValue({ date: '20261014', quotes: { 1234: { price: 90, tradeValue: 5e7 } } })
  vi.mocked(loadStockFundamentals).mockReset().mockResolvedValue(TW_FUNDAMENTALS)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useStockScreen', () => {
  it('screens the rows with the daily quotes', async () => {
    const { result } = renderHook(() => useStockScreen(props))
    await waitFor(() => expect(result.current.result?.below[0]?.priceSource).toBe('daily'))
    expect(result.current.status).toBe('ready')
    expect(result.current.quotesDate).toBe('20261014')
    expect(result.current.result.below[0]).toMatchObject({ code: '1234', price: 90 })
  })

  it('reports a missing screen.json (dev server answers with HTML)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => htmlResponse()))
    const { result } = renderHook(() => useStockScreen(props))
    await waitFor(() => expect(result.current.status).toBe('missing'))
    expect(result.current.result).toBeNull()
  })

  it('falls back to month-end prices when the quotes fail', async () => {
    vi.mocked(getTwseDailyQuotes).mockRejectedValue(new Error('down'))
    const { result } = renderHook(() => useStockScreen(props))
    await waitFor(() => expect(result.current.quotesFailed).toBe(true))
    expect(result.current.result.below[0]).toMatchObject({ price: 95, priceSource: 'month-end' })
  })

  it('fetches quotes once per interval while active', async () => {
    const { result, rerender } = renderHook((p) => useStockScreen(p), { initialProps: props })
    await waitFor(() => expect(result.current.quotesDate).toBe('20261014'))
    rerender({ ...props, active: false })
    rerender({ ...props, active: true })
    expect(getTwseDailyQuotes).toHaveBeenCalledTimes(1)
  })

  it('applies a stock’s own valuation settings', async () => {
    vi.mocked(listValuationOverrideSymbols).mockResolvedValue(['1234'])
    vi.mocked(getValuationSettings).mockResolvedValue({ ...EMPTY_VALUATION_SETTINGS, peCheap: 1, peFair: 2, peExpensive: 3 })
    const { result } = renderHook(() => useStockScreen(props))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    // TTM EPS 10.72 × P/E 2 = 合理價 21.44 < 90 → no longer listed.
    await waitFor(() => expect(result.current.result?.counts.listed).toBe(0))
  })

  it('keeps an industry choice locally when it cannot write', async () => {
    const { result } = renderHook(() => useStockScreen({ ...props, canWrite: false }))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    act(() => result.current.setIndustries(['14']))
    expect(result.current.settings.industries).toEqual(['14'])
    expect(result.current.result.counts.listed).toBe(0)
    expect(saveScreenSettings).not.toHaveBeenCalled()
  })

  it('does nothing while disabled', () => {
    renderHook(() => useStockScreen({ ...props, enabled: false }))
    expect(fetch).not.toHaveBeenCalled()
    expect(getTwseDailyQuotes).not.toHaveBeenCalled()
  })
})
