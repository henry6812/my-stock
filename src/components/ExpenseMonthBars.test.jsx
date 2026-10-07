import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import ExpenseMonthBars from './ExpenseMonthBars'

const months = (n) =>
  Array.from({ length: n }, (_, i) => {
    const date = new Date(2025, 9 + i, 1)
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    return { month, expenseTwd: 1000 * (i + 1), incomeTwd: 5000, isCurrent: i === n - 1 }
  })

const bars = () => screen.getAllByRole('button').filter((b) => b.classList.contains('expense-month-bar'))

describe('ExpenseMonthBars', () => {
  it('keeps every month reachable, scrolling once there are more than 12', () => {
    const { container } = render(<ExpenseMonthBars summaries={months(14)} mode="month" activeMonth="2026-11" />)
    expect(bars()).toHaveLength(14)
    expect(bars()[0]).toHaveAccessibleName('2025 年 10 月，支出 $1,000')
    expect(bars()[13]).toHaveAccessibleName('2026 年 11 月，支出 $14,000')
    expect(container.querySelector('.expense-month-bars-track')).toHaveClass('expense-month-bars-track--scroll')
  })

  it('does not scroll with 12 months or fewer', () => {
    const { container } = render(<ExpenseMonthBars summaries={months(12)} mode="month" activeMonth="2026-09" />)
    expect(container.querySelector('.expense-month-bars-track')).not.toHaveClass('expense-month-bars-track--scroll')
  })

  it('offers future months as empty bars that can still be picked', () => {
    const onSelectMonth = vi.fn()
    render(
      <ExpenseMonthBars summaries={months(2)} futureMonths={['2025-12']} mode="month" activeMonth="2025-12"
        onSelectMonth={onSelectMonth} />,
    )
    const future = bars()[2]
    expect(future).toHaveClass('expense-month-bar--future')
    expect(future).toHaveAccessibleName('2025 年 12 月，尚未到來')
    expect(future).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(future)
    expect(onSelectMonth).toHaveBeenCalledWith('2025-12')
  })

  it('marks the active month in month mode', () => {
    render(<ExpenseMonthBars summaries={months(3)} mode="month" activeMonth="2025-11" />)
    expect(bars()[1]).toHaveAttribute('aria-pressed', 'true')
    expect(bars()[1]).toHaveClass('is-on')
    expect(bars()[0]).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: '累計' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('highlights the picked month in cumulative mode without pressing it', () => {
    const { container } = render(
      <ExpenseMonthBars summaries={months(3)} mode="cumulative" activeMonth="2025-11" highlightMonth="2025-10" />,
    )
    expect(container.firstChild).toHaveClass('expense-month-bars--cumulative')
    expect(bars()[0]).toHaveClass('is-on')
    expect(bars()[1]).not.toHaveClass('is-on')
    expect(bars().every((b) => b.getAttribute('aria-pressed') === 'false')).toBe(true)
    expect(screen.getByRole('button', { name: '累計' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('reports taps', () => {
    const onSelectMonth = vi.fn()
    const onToggleCumulative = vi.fn()
    render(
      <ExpenseMonthBars summaries={months(3)} mode="month" activeMonth="2025-12"
        onSelectMonth={onSelectMonth} onToggleCumulative={onToggleCumulative} />,
    )
    fireEvent.click(bars()[0])
    expect(onSelectMonth).toHaveBeenCalledWith('2025-10')
    fireEvent.click(screen.getByRole('button', { name: '累計' }))
    expect(onToggleCumulative).toHaveBeenCalledTimes(1)
  })

  it('keeps bars tappable when every month spent nothing', () => {
    const zero = months(2).map((s) => ({ ...s, expenseTwd: 0 }))
    render(<ExpenseMonthBars summaries={zero} mode="month" activeMonth="2025-10" />)
    expect(bars().map((b) => b.style.height)).toEqual(['12px', '12px'])
  })

  it('has no text besides the 累計 pill', () => {
    const { container } = render(<ExpenseMonthBars summaries={months(3)} mode="month" activeMonth="2025-10" />)
    expect(container.textContent).toBe('累計')
  })
})
