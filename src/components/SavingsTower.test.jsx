import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import SavingsTower from './SavingsTower'

const mockMotion = (reduce) =>
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    matches: reduce && query.includes('reduce'),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))

describe('SavingsTower', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('shows income and what was saved', () => {
    mockMotion(true)
    render(<SavingsTower incomeTwd={85_000} recurringTwd={32_000} oneTimeTwd={21_500} hasIncome playKey={1} />)
    expect(screen.getByText('收入 8.5 萬')).toBeInTheDocument()
    expect(screen.getByText('存下 3.2 萬')).toBeInTheDocument()
  })

  it('leaves a tinted ghost of each removed chunk, by expense kind', () => {
    mockMotion(true)
    const { container } = render(
      <SavingsTower incomeTwd={100_000} recurringTwd={25_000} oneTimeTwd={13_000} hasIncome playKey={1} />,
    )
    // Chunks: rows 9, 8, 7(top half) recurring; 7(bottom half), 6 one-time.
    const recurringRows = new Set(
      [...container.querySelectorAll('.savings-tower-spent--recurring')].map((n) => n.dataset.row),
    )
    const oneTimeRows = new Set(
      [...container.querySelectorAll('.savings-tower-spent--oneTime')].map((n) => n.dataset.row),
    )
    expect([...recurringRows].sort()).toEqual(['7', '8', '9'])
    expect([...oneTimeRows].sort()).toEqual(['6', '7'])
  })

  it('puts the saved label inside the tower when nearly everything is saved', () => {
    mockMotion(true)
    render(<SavingsTower incomeTwd={85_000} recurringTwd={5_000} oneTimeTwd={0} hasIncome playKey={1} />)
    expect(screen.getByText('存下 8.0 萬')).toHaveClass('savings-tower-saved--inside')
  })

  it('digs a pit and labels the overspend', () => {
    mockMotion(true)
    const { container } = render(
      <SavingsTower incomeTwd={85_000} recurringTwd={32_000} oneTimeTwd={61_000} hasIncome playKey={1} />,
    )
    expect(screen.getByText('−0.8 萬')).toBeInTheDocument()
    expect(container.querySelector('.savings-tower-pit')).not.toBeNull()
    expect(screen.queryByText(/^存下/)).toBeNull()
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
    // Entrance starts with the full gold tower and no shards yet.
    expect(container.querySelectorAll('.savings-tower-shard')).toHaveLength(0)
    expect(screen.queryByText(/^存下/)).toBeNull()
    act(() => {
      vi.advanceTimersByTime(5_000)
    })
    expect(screen.getByText('存下 7.0 萬')).toBeInTheDocument()
  })

  it('chips away the data that arrives during the build phase', () => {
    mockMotion(false)
    vi.useFakeTimers()
    const { rerender } = render(
      <SavingsTower incomeTwd={100_000} recurringTwd={30_000} oneTimeTwd={0} hasIncome playKey={1} />,
    )
    rerender(<SavingsTower incomeTwd={100_000} recurringTwd={30_000} oneTimeTwd={0} hasIncome playKey={2} />)
    // New month's numbers land while the tower is still being built.
    rerender(<SavingsTower incomeTwd={100_000} recurringTwd={50_000} oneTimeTwd={0} hasIncome playKey={2} />)
    act(() => {
      vi.advanceTimersByTime(5_000)
    })
    expect(screen.getByText('存下 5.0 萬')).toBeInTheDocument()
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
    // One new row removed (row index 6) → one shard per brick in that row (even row = 2 bricks).
    expect(container.querySelectorAll('.savings-tower-shard').length - before).toBe(2)
    expect(screen.getByText('存下 6.0 萬')).toBeInTheDocument()
  })
})
