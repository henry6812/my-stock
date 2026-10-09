import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import ExpenseMonthBars from './ExpenseMonthBars'

// n months of data starting at `start` (YYYY-MM); the last one is current.
const months = (n, start = '2026-01') =>
  Array.from({ length: n }, (_, i) => {
    const [y, m] = start.split('-').map(Number)
    const date = new Date(y, m - 1 + i, 1)
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    return { month, expenseTwd: 1000 * (i + 1), incomeTwd: 20_000, isCurrent: i === n - 1 }
  })

const bars = () => [...document.querySelectorAll('.expense-month-bar')]
const labels = () => bars().map((b) => b.querySelector('.expense-month-bar-label').textContent)

describe('ExpenseMonthBars', () => {
  it('always shows the 12 months of the year, Jan to Dec', () => {
    render(<ExpenseMonthBars summaries={months(10)} mode="month" activeMonth="2026-10" />)
    expect(labels()).toEqual(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'])
    expect(bars()[9]).toHaveAccessibleName('2026 年 10 月，存下 50.0%')
    expect(bars()[9]).toHaveAttribute('data-current', 'true')
  })

  it('disables months still to come and months before the first record', () => {
    const onSelectMonth = vi.fn()
    render(<ExpenseMonthBars summaries={months(3, '2026-03')} mode="month" activeMonth="2026-05" onSelectMonth={onSelectMonth} />)
    const disabled = bars().filter((b) => b.disabled).map((b) => b.querySelector('.expense-month-bar-label').textContent)
    expect(disabled).toEqual(['Jan', 'Feb', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'])
    expect(bars()[10]).toHaveClass('expense-month-bar--empty')
    expect(bars()[10]).toHaveAccessibleName('2026 年 11 月，沒有資料')
    fireEvent.click(bars()[10])
    expect(onSelectMonth).not.toHaveBeenCalled()
  })

  it('marks the active month in month mode', () => {
    render(<ExpenseMonthBars summaries={months(3)} mode="month" activeMonth="2026-02" />)
    expect(bars()[1]).toHaveAttribute('aria-pressed', 'true')
    expect(bars()[1]).toHaveClass('is-on')
    expect(bars()[0]).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: '累計' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('highlights the picked month in cumulative mode without pressing it', () => {
    const { container } = render(
      <ExpenseMonthBars summaries={months(3)} mode="cumulative" activeMonth="2026-02" highlightMonth="2026-01" />,
    )
    expect(container.firstChild).toHaveClass('expense-month-bars--cumulative')
    expect(bars()[0]).toHaveClass('is-on')
    expect(bars()[1]).not.toHaveClass('is-on')
    expect(bars().every((b) => b.getAttribute('aria-pressed') !== 'true')).toBe(true)
    expect(screen.getByRole('button', { name: '累計' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('puts the 累計 toggle under the bars, not among them', () => {
    const { container } = render(<ExpenseMonthBars summaries={months(3)} mode="month" activeMonth="2026-02" />)
    const all = screen.getByRole('button', { name: '累計' })
    expect(container.querySelector('.expense-month-bars-foot')).toContainElement(all)
    expect(bars()).not.toContain(all)
  })

  it('reports taps', () => {
    const onSelectMonth = vi.fn()
    const onToggleCumulative = vi.fn()
    render(
      <ExpenseMonthBars summaries={months(3)} mode="month" activeMonth="2026-03"
        onSelectMonth={onSelectMonth} onToggleCumulative={onToggleCumulative} />,
    )
    fireEvent.click(bars()[0])
    expect(onSelectMonth).toHaveBeenCalledWith('2026-01')
    fireEvent.click(screen.getByRole('button', { name: '累計' }))
    expect(onToggleCumulative).toHaveBeenCalledTimes(1)
  })

  it('draws every month at the same height, filled from the bottom by what was saved', () => {
    const summaries = [
      { month: '2026-01', expenseTwd: 5_000, incomeTwd: 20_000 },
      { month: '2026-02', expenseTwd: 0, incomeTwd: 20_000 },
      { month: '2026-03', expenseTwd: 15_000, incomeTwd: 20_000, isCurrent: true },
    ]
    render(<ExpenseMonthBars summaries={summaries} mode="month" activeMonth="2026-03" />)
    const heights = bars().map((b) => b.querySelector('.expense-month-bar-fill').style.height)
    expect(new Set(heights).size).toBe(1)
    const saved = bars().slice(0, 3).map((b) => b.querySelector('.expense-month-bar-saved').style.height)
    expect(saved).toEqual(['75%', '100%', '25%'])
    expect(bars()[0]).not.toBeDisabled()
  })

  it('leaves an overspent month empty with a red foot, and a month without income empty', () => {
    const summaries = [
      { month: '2026-01', expenseTwd: 25_000, incomeTwd: 20_000 },
      { month: '2026-02', expenseTwd: 3_000, incomeTwd: null, isCurrent: true },
    ]
    render(<ExpenseMonthBars summaries={summaries} mode="month" activeMonth="2026-02" />)
    expect(bars()[0]).toHaveClass('is-over')
    expect(bars()[0].querySelector('.expense-month-bar-saved')).toBeNull()
    expect(bars()[0]).toHaveAccessibleName('2026 年 1 月，超支 $5,000')
    expect(bars()[1]).not.toHaveClass('is-over')
    expect(bars()[1].querySelector('.expense-month-bar-saved')).toBeNull()
    expect(bars()[1]).toHaveAccessibleName('2026 年 2 月，支出 $3,000')
  })

  it('has no year switch with only one year of data', () => {
    render(<ExpenseMonthBars summaries={months(10)} mode="month" activeMonth="2026-10" />)
    expect(screen.queryByRole('group', { name: '切換年份' })).toBeNull()
  })

  it('browses other years without picking a month', () => {
    const onSelectMonth = vi.fn()
    // 2025-11 … 2026-10
    render(<ExpenseMonthBars summaries={months(12, '2025-11')} mode="month" activeMonth="2026-10" onSelectMonth={onSelectMonth} />)
    const group = screen.getByRole('group', { name: '切換年份' })
    expect(group).toHaveTextContent('2026')
    expect(screen.getByRole('button', { name: '下一年' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: '上一年' }))
    expect(group).toHaveTextContent('2025')
    expect(screen.getByRole('button', { name: '上一年' })).toBeDisabled()
    expect(onSelectMonth).not.toHaveBeenCalled()
    // Only Nov and Dec 2025 have data.
    expect(bars().filter((b) => !b.disabled)).toHaveLength(2)
    fireEvent.click(bars()[10])
    expect(onSelectMonth).toHaveBeenCalledWith('2025-11')
  })

  it('shows the year of the selected month', () => {
    render(<ExpenseMonthBars summaries={months(12, '2025-11')} mode="month" activeMonth="2025-12" />)
    expect(screen.getByRole('group', { name: '切換年份' })).toHaveTextContent('2025')
    expect(bars()[11]).toHaveClass('is-on')
  })
})
