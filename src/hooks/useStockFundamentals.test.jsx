import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'

vi.mock('../services/fundamentalsProviders', () => ({ loadStockFundamentals: vi.fn() }))

import { loadStockFundamentals } from '../services/fundamentalsProviders'
import useStockFundamentals from './useStockFundamentals'

beforeEach(() => {
  loadStockFundamentals.mockReset()
})

describe('useStockFundamentals', () => {
  it('is idle without a symbol', () => {
    const { result } = renderHook(() => useStockFundamentals(null, null))
    expect(result.current.status).toBe('idle')
    expect(loadStockFundamentals).not.toHaveBeenCalled()
  })

  it('goes loading → ready', async () => {
    loadStockFundamentals.mockResolvedValue({ market: 'US' })
    const { result } = renderHook(() => useStockFundamentals('US', 'AAPL'))
    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.data).toEqual({ market: 'US' })
  })

  it('reports unsupported for null data', async () => {
    loadStockFundamentals.mockResolvedValue(null)
    const { result } = renderHook(() => useStockFundamentals('TW', '6488'))
    await waitFor(() => expect(result.current.status).toBe('unsupported'))
  })

  it('reports errors and retries on reload', async () => {
    loadStockFundamentals.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({ market: 'US' })
    const { result } = renderHook(() => useStockFundamentals('US', 'AAPL'))
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.error.message).toBe('boom')
    act(() => result.current.reload())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(loadStockFundamentals).toHaveBeenCalledTimes(2)
  })

  it('ignores a stale response after the symbol changes', async () => {
    let resolveFirst
    loadStockFundamentals
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve }))
      .mockResolvedValueOnce({ market: 'US', symbol: 'MSFT' })
    const { result, rerender } = renderHook(({ symbol }) => useStockFundamentals('US', symbol), {
      initialProps: { symbol: 'AAPL' },
    })
    rerender({ symbol: 'MSFT' })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    resolveFirst({ market: 'US', symbol: 'AAPL' })
    await Promise.resolve()
    expect(result.current.data.symbol).toBe('MSFT')
  })
})
