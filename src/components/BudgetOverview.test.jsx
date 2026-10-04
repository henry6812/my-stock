import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BudgetOverview from './BudgetOverview'

const budget = (overrides) => ({
  id: 1,
  name: '日常生活',
  budgetMode: 'RESIDENT',
  spentTwd: 12000,
  upcomingTwd: 8000,
  availableTwd: 40000,
  cycleStart: '2026-10-01',
  cycleEnd: '2026-10-31',
  ...overrides,
})

const budgets = [
  budget({ id: 1 }),
  budget({ id: 2, name: '吃喝玩樂', spentTwd: 5500, upcomingTwd: 0, availableTwd: 5000 }),
  budget({ id: 3, name: '職涯進修', spentTwd: 900, upcomingTwd: 0, availableTwd: 1000, budgetMode: 'SPECIAL' }),
]

const renderOverview = (props = {}) => {
  const handlers = {
    onOpen: vi.fn(),
    getActions: vi.fn((item) => [{ key: 'edit', label: `編輯 ${item.name}`, text: '編輯', onClick: vi.fn() }]),
  }
  render(<BudgetOverview budgets={budgets} today="2026-10-04" {...handlers} {...props} />)
  return { user: userEvent.setup(), ...handlers }
}

const rows = () => screen.getAllByRole('button', { name: /查看預算/ })

describe('<BudgetOverview />', () => {
  it('lists the most urgent budgets first', () => {
    renderOverview()
    expect(rows().map((row) => row.getAttribute('aria-label'))).toEqual([
      '查看預算：吃喝玩樂',
      '查看預算：職涯進修',
      '查看預算：日常生活',
    ])
  })

  it('leads with the amount left, or over', () => {
    renderOverview()
    const [over, warn, ok] = rows()
    expect(over).toHaveTextContent('超支 $500')
    expect(warn).toHaveTextContent('剩餘 $100')
    expect(ok).toHaveTextContent('剩餘 $28,000')
  })

  it('summarises usage and a daily allowance on one line', () => {
    renderOverview()
    const ok = rows()[2]
    // Upcoming charges show as the bar's lighter segment, not as text.
    expect(ok).toHaveTextContent('已用 30% · $12,000 / $40,000 · 每天可花 $1,000')
    expect(ok).not.toHaveTextContent('含預計')
    expect(rows()[0]).not.toHaveTextContent('每天可花')
  })

  it('draws charged and upcoming segments and a time marker', () => {
    renderOverview()
    const bar = rows()[2].querySelector('.budget-bar')
    expect(bar.querySelector('.budget-bar-charged').style.width).toBe('10%')
    expect(bar.querySelector('.budget-bar-upcoming').style.width).toBe('20%')
    expect(bar.querySelector('.budget-bar-pace').style.left).toBe(`${(3 / 31) * 100}%`)
  })

  it('tags special budgets', () => {
    renderOverview()
    expect(within(rows()[1]).getByText('特別預算')).toBeInTheDocument()
  })

  it('opens a budget on tap', async () => {
    const { user, onOpen } = renderOverview()
    await user.click(rows()[2])
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }))
  })

  it('reveals the budget\'s actions on swipe', () => {
    renderOverview()
    const surface = rows()[0].closest('.swipe-actions-content')
    fireEvent.pointerDown(surface, { clientX: 300, clientY: 20, pointerId: 1 })
    fireEvent.pointerMove(surface, { clientX: 260, clientY: 20, pointerId: 1 })
    fireEvent.pointerMove(surface, { clientX: 150, clientY: 20, pointerId: 1 })
    fireEvent.pointerUp(surface, { clientX: 150, clientY: 20, pointerId: 1 })
    expect(screen.getByRole('button', { name: '編輯 吃喝玩樂' })).toBeInTheDocument()
  })
})
