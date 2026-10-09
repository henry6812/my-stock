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

  it('draws each month as its own rounded block with a gap between, no background and no ghosts', () => {
    mockMotion(true)
    const { container } = render(<SavingsGrowthTower summaries={three} playKey={1} />)
    expect(container.querySelector('.savings-tower-body')).toBeNull()
    const rects = [...container.querySelectorAll('.growth-tower-layer rect')]
    expect(rects).toHaveLength(3)
    rects.forEach((rect) => expect(Number(rect.getAttribute('rx'))).toBeGreaterThan(0))
    // Layers are listed bottom-up; the next one sits 2 units above.
    const [aug, sep] = rects
    expect(Number(aug.getAttribute('y')) - (Number(sep.getAttribute('y')) + Number(sep.getAttribute('height')))).toBeCloseTo(2)
    const chipped = render(
      <SavingsGrowthTower summaries={[m('2026-08', 100, 40), m('2026-09', 100, 70), m('2026-10', 100, 150)]} playKey={1} />,
    )
    expect(layers(chipped.container)).toEqual(['2026-08'])
    expect(chipped.container.querySelectorAll('[stroke-dasharray], .growth-tower-ghost')).toHaveLength(0)
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
    // Removed segments of month index 1 (4 pieces) and 0 (3 pieces); jsdom
    // never fires animationend, so they all stay in the DOM.
    expect(container.querySelectorAll('.growth-tower-shard')).toHaveLength(7)
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
