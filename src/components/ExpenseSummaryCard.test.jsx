import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import ExpenseSummaryCard from './ExpenseSummaryCard'

const summaries = [
  { month: '2026-08', expenseTwd: 50_000, incomeTwd: 100_000, isCurrent: false },
  { month: '2026-09', expenseTwd: 60_000, incomeTwd: null, isCurrent: false },
  { month: '2026-10', expenseTwd: 47_363, incomeTwd: 180_000, isCurrent: true },
]
const monthProgress = {
  numerator: 47_363,
  denominator: 180_000,
  hasIncome: true,
  recurringNumerator: 33_620,
  oneTimeNumerator: 13_743,
}

const renderCard = (props = {}) =>
  render(
    <ExpenseSummaryCard
      mode="month"
      activeMonth="2026-10"
      monthlySummaries={summaries}
      monthProgress={monthProgress}
      upcomingTwd={19_084}
      playKey={1}
      onSelectMonth={vi.fn()}
      onToggleMode={vi.fn()}
      onSetupIncome={vi.fn()}
      {...props}
    />,
  )

const text = (container) => ({
  label: container.querySelector('.expense-card-label').textContent,
  num: container.querySelector('.expense-card-num').textContent,
  chip: container.querySelector('.expense-card-chip').textContent,
})

describe('ExpenseSummaryCard', () => {
  beforeEach(() => {
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
      matches: query.includes('reduce'),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('summarises the month: spending and the share saved', () => {
    const { container } = renderCard()
    expect(text(container)).toEqual({ label: '2026 年 10 月', num: '$47,363', chip: '存下 73.7%' })
  })

  it('shows a tapped part of the tower, then goes back', () => {
    const { container } = renderCard()
    fireEvent.click(container.querySelector('[data-kind="recurring"]'))
    expect(text(container)).toEqual({ label: '定期', num: '$33,620', chip: '佔收入 18.7%' })
    fireEvent.click(container.querySelector('[data-kind="pending"]'))
    expect(text(container)).toEqual({ label: '待扣', num: '$19,084', chip: '本月尚未扣款・未計入' })
    fireEvent.click(container.querySelector('[data-kind="saved"]'))
    expect(text(container)).toEqual({ label: '存下', num: '$113,553', chip: '扣除待扣後・佔收入 63.1%' })
    fireEvent.click(container.querySelector('[data-kind="saved"]'))
    expect(text(container).label).toBe('2026 年 10 月')
  })

  it('forgets the tapped part when the month changes', () => {
    const { container, rerender } = renderCard()
    fireEvent.click(container.querySelector('[data-kind="recurring"]'))
    rerender(
      <ExpenseSummaryCard mode="month" activeMonth="2026-09" monthlySummaries={summaries}
        monthProgress={monthProgress} upcomingTwd={0} playKey={2} />,
    )
    expect(text(container).label).toBe('2026 年 9 月')
  })

  it('flags overspending in red', () => {
    const { container } = renderCard({
      monthProgress: { ...monthProgress, numerator: 200_000, recurringNumerator: 120_000, oneTimeNumerator: 80_000 },
      upcomingTwd: 0,
    })
    const chip = container.querySelector('.expense-card-chip')
    expect(chip.textContent).toBe('超支 $20,000')
    expect(chip).toHaveClass('expense-card-chip--over')
  })

  it('turns the chip into an income setup button without income', () => {
    const onSetupIncome = vi.fn()
    const { container } = renderCard({
      monthProgress: { ...monthProgress, hasIncome: false, denominator: null },
      onSetupIncome,
    })
    fireEvent.click(container.querySelector('button.expense-card-chip'))
    expect(onSetupIncome).toHaveBeenCalledTimes(1)
  })

  it('summarises 累計 as money saved since the first month', () => {
    const { container } = renderCard({ mode: 'cumulative' })
    // 50,000 − 60,000 (no income in Sept) + 132,637.
    expect(text(container)).toEqual({ label: '累計存下・2026/08 起', num: '$122,637', chip: '期間支出 $157,363' })
  })

  it('shows a tapped month in 累計', () => {
    const { container } = renderCard({ mode: 'cumulative' })
    fireEvent.click(container.querySelector('[data-month="2026-10"]'))
    expect(text(container)).toEqual({ label: '2026 年 10 月・進行中', num: '$132,637', chip: '存下該月收入 73.7%' })
    fireEvent.click(container.querySelector('[data-month="2026-10"]'))
    expect(text(container).label).toBe('累計存下・2026/08 起')
  })

  it('counts a month without income as all spending, with no layer to tap', () => {
    const rows = [
      { month: '2026-09', expenseTwd: 0, incomeTwd: 100_000, isCurrent: false },
      { month: '2026-10', expenseTwd: 60_000, incomeTwd: null, isCurrent: true },
    ]
    const { container } = renderCard({ mode: 'cumulative', monthlySummaries: rows })
    expect(text(container).num).toBe('$40,000')
    expect(container.querySelector('[data-month="2026-10"]')).toBeNull()
    // The tap shows September's own surplus, not what is left of its layer.
    fireEvent.click(container.querySelector('[data-month="2026-09"]'))
    expect(text(container)).toEqual({ label: '2026 年 9 月', num: '$100,000', chip: '存下該月收入 100.0%' })
  })

  it('shows a negative total with a minus sign', () => {
    const { container } = renderCard({
      mode: 'cumulative',
      monthlySummaries: [{ month: '2026-10', expenseTwd: 5_000, incomeTwd: null, isCurrent: true }],
    })
    expect(text(container).num).toBe('−$5,000')
  })

  it('lists months after the current one as future bars', () => {
    const onSelectMonth = vi.fn()
    renderCard({ monthOptions: ['2026-08', '2026-09', '2026-10', '2026-11'], onSelectMonth })
    fireEvent.click(screen.getByRole('button', { name: '2026 年 11 月，尚未到來' }))
    expect(onSelectMonth).toHaveBeenCalledWith('2026-11')
  })

  it('sends bar taps and the 累計 pill to the app', () => {
    const onSelectMonth = vi.fn()
    const onToggleMode = vi.fn()
    renderCard({ mode: 'cumulative', onSelectMonth, onToggleMode })
    fireEvent.click(screen.getByRole('button', { name: /2026 年 8 月/ }))
    expect(onSelectMonth).toHaveBeenCalledWith('2026-08')
    fireEvent.click(screen.getByRole('button', { name: '累計' }))
    expect(onToggleMode).toHaveBeenCalledTimes(1)
  })
})
