import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import SavingsGrowthTower from './SavingsGrowthTower'

const mockMotion = (reduce) =>
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    matches: reduce && query.includes('reduce'),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))

const m = (month, incomeTwd, expenseTwd, isCurrent = false) => ({ month, incomeTwd, expenseTwd, isCurrent })
const three = [m('2026-08', 100_000, 50_000), m('2026-09', 100_000, 60_000), m('2026-10', 180_000, 47_363, true)]
const layers = (container) => [...container.querySelectorAll('.growth-tower-layer')].map((n) => n.dataset.month)

describe('SavingsGrowthTower', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('draws one layer per positive month, marking the current one', () => {
    mockMotion(true)
    const { container } = render(<SavingsGrowthTower summaries={three} playKey={1} />)
    expect(layers(container)).toEqual(['2026-08', '2026-09', '2026-10'])
    expect(container.querySelector('[data-month="2026-10"]')).toHaveClass('growth-tower-layer--current')
    expect(container.querySelector('linearGradient')).toBeNull()
  })

  it('reports the clicked month and dims the others when one is selected', () => {
    mockMotion(true)
    const onSelectMonth = vi.fn()
    const { container, rerender } = render(<SavingsGrowthTower summaries={three} playKey={1} onSelectMonth={onSelectMonth} />)
    fireEvent.click(container.querySelector('[data-month="2026-09"]'))
    expect(onSelectMonth).toHaveBeenLastCalledWith('2026-09')
    fireEvent.click(container.querySelector('svg'))
    expect(onSelectMonth).toHaveBeenLastCalledWith(null)

    rerender(<SavingsGrowthTower summaries={three} playKey={1} selectedMonth="2026-09" onSelectMonth={onSelectMonth} />)
    expect(container.querySelector('[data-month="2026-08"]')).toHaveClass('is-dim')
    expect(container.querySelector('[data-month="2026-09"]')).not.toHaveClass('is-dim')
  })

  it('leaves a ghost where an overspent month chipped the tower', () => {
    mockMotion(true)
    const { container } = render(
      <SavingsGrowthTower summaries={[m('2026-08', 100, 40), m('2026-09', 100, 70), m('2026-10', 100, 150)]} playKey={1} />,
    )
    expect(layers(container)).toEqual(['2026-08'])
    expect(container.querySelectorAll('.growth-tower-ghost rect').length).toBeGreaterThan(0)
  })

  it('stacks month by month, shattering overspent months, then settles', () => {
    mockMotion(false)
    vi.useFakeTimers()
    const { container } = render(
      <SavingsGrowthTower summaries={[m('2026-08', 100, 40), m('2026-09', 100, 70), m('2026-10', 100, 150)]} playKey={1} />,
    )
    expect(container.querySelector('.growth-tower')).toHaveAttribute('data-phase', 'build')
    expect(layers(container)).toEqual([])
    act(() => {
      vi.advanceTimersByTime(5_000)
    })
    expect(container.querySelector('.growth-tower')).toHaveAttribute('data-phase', 'done')
    expect(layers(container)).toEqual(['2026-08'])
    // Two removed segments × 4 pieces (jsdom never fires animationend).
    expect(container.querySelectorAll('.growth-tower-shard')).toHaveLength(8)
  })

  it('shows the latest data when it changes mid-animation', () => {
    mockMotion(false)
    vi.useFakeTimers()
    const { container, rerender } = render(<SavingsGrowthTower summaries={three.slice(0, 2)} playKey={1} />)
    act(() => {
      vi.advanceTimersByTime(100)
    })
    rerender(<SavingsGrowthTower summaries={three} playKey={1} />)
    act(() => {
      vi.advanceTimersByTime(5_000)
    })
    expect(layers(container)).toEqual(['2026-08', '2026-09', '2026-10'])
  })

  it('offers income setup when no month has income', () => {
    mockMotion(true)
    const onSetupIncome = vi.fn()
    render(<SavingsGrowthTower summaries={[m('2026-10', null, 100)]} playKey={1} onSetupIncome={onSetupIncome} />)
    fireEvent.click(screen.getByRole('button', { name: '設定收入' }))
    expect(onSetupIncome).toHaveBeenCalledTimes(1)
  })
})
