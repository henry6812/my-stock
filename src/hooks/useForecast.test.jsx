import { describe, it, expect } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import useForecast from './useForecast'
import { FORECAST_INCOMPLETE_TEXT } from '../utils/forecast'

const input = {
  rows: [{ market: 'TW', latestValueTwd: 3_000_000, totalCost: 2_000_000 }],
  cashRows: [{ balanceTwd: 1_000_000 }],
  defaultMonthlyIncomeTwd: 100_000,
  averageMonthlyExpense: { averageTwd: 60_000, monthsUsed: 12 },
  settings: null,
  currentMonth: '2026-10',
}

describe('useForecast', () => {
  it('builds the base forecast from the loaded data', () => {
    const { result } = renderHook(() => useForecast(input))
    expect(result.current.start.stockTwd).toBe(3_000_000)
    expect(result.current.auto).toEqual({
      monthlyIncomeTwd: 100_000,
      monthlyExpenseTwd: 60_000,
      expenseMonthsUsed: 12,
      investRatio: 0.75,
    })
    expect(result.current.base.series).toHaveLength(30 * 12 + 1)
    expect(result.current.base.thresholdTwd).toBeCloseTo(18_000_000, 6)
    expect(result.current.summary).toMatch(/^照目前步調，\d{4} 年可財務自由/)
    expect(result.current.whatIf).toBeNull()
    expect(result.current.diffText).toBeNull()
  })

  it('has no forecast until income and expense are known', () => {
    const { result } = renderHook(() =>
      useForecast({ ...input, defaultMonthlyIncomeTwd: null }),
    )
    expect(result.current.base).toBeNull()
    expect(result.current.summary).toBe(FORECAST_INCOMPLETE_TEXT)
  })

  it('runs a what-if line while a knob is moved, and resets it', () => {
    const { result } = renderHook(() => useForecast(input))
    act(() => result.current.setKnobs({ ...result.current.knobs, expenseDeltaTwd: -10_000 }))
    expect(result.current.whatIf).not.toBeNull()
    expect(result.current.whatIf.thresholdTwd).toBeCloseTo(15_000_000, 6)
    expect(result.current.diffText).toMatch(/^財務自由提早/)
    act(() => result.current.resetKnobs())
    expect(result.current.whatIf).toBeNull()
  })

  it('views another horizon without changing the settings', () => {
    const { result } = renderHook(() => useForecast(input))
    act(() => result.current.setHorizonYears(10))
    expect(result.current.horizonYears).toBe(10)
    expect(result.current.base.series).toHaveLength(121)
    expect(result.current.assumptions.horizonYears).toBe(30)
  })
})
