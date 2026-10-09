import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import SavingsTower from './SavingsTower'

const mockMotion = (reduce) =>
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    matches: reduce && query.includes('reduce'),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))

// Column is 136 units tall, so 1% of income is 1.36 units; each block gives
// up 1 unit on every side it shares with another block (a 2-unit gap).
const heightOf = (container, selector) =>
  Number(container.querySelector(selector)?.getAttribute('height') ?? 0)

describe('SavingsTower', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('reveals the income caption only while a part is selected', () => {
    mockMotion(true)
    const props = { incomeTwd: 85_000, recurringTwd: 32_000, oneTimeTwd: 21_500, hasIncome: true, playKey: 1 }
    const { container, rerender } = render(<SavingsTower {...props} />)
    expect(screen.getByText('收入 8.5 萬')).toBeInTheDocument()
    expect(container.querySelector('.savings-tower')).not.toHaveClass('savings-tower--revealed')
    rerender(<SavingsTower {...props} selectedKind="saved" />)
    expect(container.querySelector('.savings-tower')).toHaveClass('savings-tower--revealed')
    expect(screen.queryByText(/^存下/)).toBeNull()
  })

  it('draws one smooth column with no background, bricks or ground line', () => {
    mockMotion(true)
    const { container } = render(<SavingsTower incomeTwd={100_000} recurringTwd={25_000} oneTimeTwd={13_000} hasIncome playKey={1} />)
    expect(container.querySelector('.savings-tower-body')).toBeNull()
    expect(container.querySelectorAll('[data-kind="saved"] rect')).toHaveLength(1)
    expect(heightOf(container, '.savings-tower-saved')).toBeCloseTo(136 * 0.62 - 1)
    expect(container.querySelector('line')).toBeNull()
  })

  it('never uses gradients', () => {
    mockMotion(true)
    const { container } = render(<SavingsTower incomeTwd={85_000} recurringTwd={32_000} oneTimeTwd={0} hasIncome playKey={1} />)
    expect(container.querySelector('linearGradient')).toBeNull()
  })

  it('draws each part as its own rounded block with a gap between', () => {
    mockMotion(true)
    const { container } = render(
      <SavingsTower incomeTwd={100_000} recurringTwd={25_000} oneTimeTwd={13_000} hasIncome playKey={1} />,
    )
    const recurring = container.querySelector('.savings-tower-spent--recurring')
    const oneTime = container.querySelector('.savings-tower-spent--oneTime')
    const saved = container.querySelector('.savings-tower-saved')
    ;[recurring, oneTime, saved].forEach((rect) => expect(Number(rect.getAttribute('rx'))).toBeGreaterThan(0))
    const bottomOf = (rect) => Number(rect.getAttribute('y')) + Number(rect.getAttribute('height'))
    expect(Number(oneTime.getAttribute('y')) - bottomOf(recurring)).toBeCloseTo(2)
    expect(Number(saved.getAttribute('y')) - bottomOf(oneTime)).toBeCloseTo(2)
  })

  it('tints the removed part of the column by expense kind', () => {
    mockMotion(true)
    const { container } = render(
      <SavingsTower incomeTwd={100_000} recurringTwd={25_000} oneTimeTwd={13_000} hasIncome playKey={1} />,
    )
    expect(container.querySelectorAll('.savings-tower-spent--recurring')).toHaveLength(1)
    expect(heightOf(container, '.savings-tower-spent--recurring')).toBeCloseTo(136 * 0.25 - 1)
    expect(heightOf(container, '.savings-tower-spent--oneTime')).toBeCloseTo(136 * 0.13 - 2)
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

  it('empties the column and marks its foot red when overspent, without a text label', () => {
    mockMotion(true)
    const { container } = render(
      <SavingsTower incomeTwd={85_000} recurringTwd={32_000} oneTimeTwd={61_000} hasIncome playKey={1} />,
    )
    expect(container.querySelector('.savings-tower-overdrawn')).not.toBeNull()
    expect(container.querySelector('.savings-tower-saved')).toBeNull()
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
    expect(heightOf(container, '.savings-tower-spent--recurring')).toBeCloseTo(136 * 0.3 - 1)
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
    expect(heightOf(container, '.savings-tower-spent--recurring')).toBeCloseTo(136 * 0.5 - 1)
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
    // One new row removed (row index 6 cracks into 3 pieces) → 3 shards.
    expect(container.querySelectorAll('.savings-tower-shard').length - before).toBe(3)
    expect(heightOf(container, '.savings-tower-spent--oneTime')).toBeCloseTo(136 * 0.1 - 2)
  })
})
