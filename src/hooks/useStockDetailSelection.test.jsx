import { describe, it, expect } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import useStockDetailSelection from './useStockDetailSelection'

const rows = [
  { id: 1, market: 'TW', symbol: '2330', holder: 'Po', shares: 100 },
  { id: 2, market: 'TW', symbol: '0050', holder: 'Po', shares: 10 },
]

const setup = (initialRows = rows) =>
  renderHook(({ list }) => useStockDetailSelection(list), { initialProps: { list: initialRows } })

describe('useStockDetailSelection', () => {
  it('opens a holding and a form over it', () => {
    const { result } = setup()
    act(() => result.current.openStockDetail(1))
    act(() => result.current.setHoldingAction('buy'))
    expect(result.current.stockDetail).toBe(rows[0])
    expect(result.current.holdingAction).toBe('buy')
  })

  it('never carries a form over to the next holding opened', () => {
    const { result } = setup()
    act(() => result.current.openStockDetail(1))
    act(() => result.current.setHoldingAction('buy'))
    act(() => result.current.openStockDetail(2))
    expect(result.current.holdingAction).toBeNull()
  })

  it('drops the selection and its form when the holding disappears', () => {
    const { result, rerender } = setup()
    act(() => result.current.openStockDetail(1))
    act(() => result.current.setHoldingAction('buy'))
    rerender({ list: [rows[1]] })
    expect(result.current.stockDetail).toBeNull()
    expect(result.current.holdingAction).toBeNull()
    // Re-adding the same stock reuses the removed row's id; it must not
    // reopen the sheet by itself.
    rerender({ list: rows })
    expect(result.current.stockDetail).toBeNull()
  })

  it('closes the sheet and its form together', () => {
    const { result } = setup()
    act(() => result.current.openStockDetail(1))
    act(() => result.current.setHoldingAction('sell'))
    act(() => result.current.closeStockDetail())
    expect(result.current.stockDetail).toBeNull()
    expect(result.current.holdingAction).toBeNull()
  })
})
