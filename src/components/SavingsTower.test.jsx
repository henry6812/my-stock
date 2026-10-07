import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import SavingsTower from './SavingsTower'

const mockMotion = (reduce) =>
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    matches: reduce && query.includes('reduce'),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))

const rowsOf = (container, selector) =>
  [...new Set([...container.querySelectorAll(selector)].map((n) => n.dataset.row))].sort()

describe('SavingsTower', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('shows the income caption and no saved label', () => {
    mockMotion(true)
    render(<SavingsTower incomeTwd={85_000} recurringTwd={32_000} oneTimeTwd={21_500} hasIncome playKey={1} />)
    expect(screen.getByText('收入 8.5 萬')).toBeInTheDocument()
    expect(screen.queryByText(/^存下/)).toBeNull()
  })

  it('never uses gradients', () => {
    mockMotion(true)
    const { container } = render(<SavingsTower incomeTwd={85_000} recurringTwd={32_000} oneTimeTwd={0} hasIncome playKey={1} />)
    expect(container.querySelector('linearGradient')).toBeNull()
  })

  it('leaves a tinted ghost of each removed chunk, by expense kind', () => {
    mockMotion(true)
    const { container } = render(
      <SavingsTower incomeTwd={100_000} recurringTwd={25_000} oneTimeTwd={13_000} hasIncome playKey={1} />,
    )
    expect(rowsOf(container, '.savings-tower-spent--recurring')).toEqual(['7', '8', '9'])
    expect(rowsOf(container, '.savings-tower-spent--oneTime')).toEqual(['6', '7'])
  })

  it('draws only what has been charged, not upcoming charges', () => {
    mockMotion(true)
    const { container } = render(
      <SavingsTower incomeTwd={100_000} recurringTwd={25_000} oneTimeTwd={13_000} upcomingTwd={10_000} hasIncome playKey={1} />,
    )
    expect(container.querySelector('[data-kind="pending"]')).toBeNull()
    expect(container.querySelector('pattern')).toBeNull()
  })

  it('reports the clicked part and dims the others when one is selected', () => {
    mockMotion(true)
    const onSelectKind = vi.fn()
    const { container, rerender } = render(
      <SavingsTower incomeTwd={100_000} recurringTwd={25_000} oneTimeTwd={13_000} hasIncome playKey={1} onSelectKind={onSelectKind} />,
    )
    fireEvent.click(container.querySelector('[data-kind="recurring"]'))
    expect(onSelectKind).toHaveBeenLastCalledWith('recurring')
    fireEvent.click(container.querySelector('svg'))
    expect(onSelectKind).toHaveBeenLastCalledWith(null)

    rerender(
      <SavingsTower incomeTwd={100_000} recurringTwd={25_000} oneTimeTwd={13_000} hasIncome playKey={1} selectedKind="recurring" onSelectKind={onSelectKind} />,
    )
    expect(container.querySelector('[data-kind="saved"]')).toHaveClass('is-dim')
    expect(container.querySelector('[data-kind="recurring"]')).not.toHaveClass('is-dim')
  })

  it('digs a pit when overspent, without a text label', () => {
    mockMotion(true)
    const { container } = render(
      <SavingsTower incomeTwd={85_000} recurringTwd={32_000} oneTimeTwd={61_000} hasIncome playKey={1} />,
    )
    expect(container.querySelector('.savings-tower-pit')).not.toBeNull()
    expect(screen.queryByText(/^−/)).toBeNull()
  })

  it('offers income setup when there is no income', () => {
    mockMotion(true)
    const onSetupIncome = vi.fn()
    render(<SavingsTower incomeTwd={0} recurringTwd={3_000} oneTimeTwd={0} hasIncome={false} playKey={1} onSetupIncome={onSetupIncome} />)
    fireEvent.click(screen.getByRole('button', { name: '設定收入' }))
    expect(onSetupIncome).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(/^收入/)).toBeNull()
  })

  it('replays the entrance when income arrives after mount', () => {
    mockMotion(false)
    vi.useFakeTimers()
    const { container, rerender } = render(
      <SavingsTower incomeTwd={0} recurringTwd={0} oneTimeTwd={0} hasIncome={false} playKey={1} />,
    )
    rerender(<SavingsTower incomeTwd={100_000} recurringTwd={30_000} oneTimeTwd={0} hasIncome playKey={1} />)
    expect(container.querySelector('.savings-tower')).toHaveAttribute('data-phase', 'build')
    expect(container.querySelectorAll('.savings-tower-shard')).toHaveLength(0)
    act(() => {
      vi.advanceTimersByTime(5_000)
    })
    expect(container.querySelector('.savings-tower')).toHaveAttribute('data-phase', 'done')
    expect(rowsOf(container, '.savings-tower-spent--recurring')).toEqual(['7', '8', '9'])
  })

  it('chips away the data that arrives during the build phase', () => {
    mockMotion(false)
    vi.useFakeTimers()
    const { container, rerender } = render(
      <SavingsTower incomeTwd={100_000} recurringTwd={30_000} oneTimeTwd={0} hasIncome playKey={1} />,
    )
    rerender(<SavingsTower incomeTwd={100_000} recurringTwd={30_000} oneTimeTwd={0} hasIncome playKey={2} />)
    rerender(<SavingsTower incomeTwd={100_000} recurringTwd={50_000} oneTimeTwd={0} hasIncome playKey={2} />)
    act(() => {
      vi.advanceTimersByTime(5_000)
    })
    expect(rowsOf(container, '.savings-tower-spent--recurring')).toEqual(['5', '6', '7', '8', '9'])
  })

  it('drops only the new chunks when an expense is added', () => {
    mockMotion(false)
    vi.useFakeTimers()
    const { container, rerender } = render(
      <SavingsTower incomeTwd={100_000} recurringTwd={30_000} oneTimeTwd={0} hasIncome playKey={1} />,
    )
    act(() => {
      vi.advanceTimersByTime(5_000)
    })
    // jsdom never fires animationend, so finished entrance shards stay in the DOM.
    const before = container.querySelectorAll('.savings-tower-shard').length
    rerender(<SavingsTower incomeTwd={100_000} recurringTwd={30_000} oneTimeTwd={10_000} hasIncome playKey={1} />)
    // One new row removed (row index 6, even row = 2 bricks) → 2 shards.
    expect(container.querySelectorAll('.savings-tower-shard').length - before).toBe(2)
    expect(rowsOf(container, '.savings-tower-spent--oneTime')).toEqual(['6'])
  })
})
