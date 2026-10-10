import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import SavingsGoalCard from './SavingsGoalCard'

const goal = {
  id: 1,
  name: '日本旅遊',
  iconKey: 'travel',
  kind: 'deadline',
  targetTwd: 150000,
  targetMonths: null,
  deadline: '2027-03-31',
  cashAccountKeys: ['a'],
  isArchived: false,
  currentTwd: 86000,
  status: 'behind',
  progressRatio: 0.5733,
  shortfallTwd: 64000,
  monthlyNeededTwd: 12800,
}

describe('<SavingsGoalCard />', () => {
  it('shows the amount, target, note and status', () => {
    const { container } = render(<SavingsGoalCard goal={goal} onOpen={vi.fn()} />)
    expect(screen.getByText('日本旅遊')).toBeInTheDocument()
    expect(screen.getByText('$86,000')).toBeInTheDocument()
    expect(screen.getByText('目標 $150,000')).toBeInTheDocument()
    expect(screen.getByText('2027/03 前・每月需再存 $12,800')).toBeInTheDocument()
    expect(screen.getByText('落後')).toHaveClass('goal-status--warn')
    expect(container.querySelector('.goal-cup-fill')).toHaveStyle({ height: '57%' })
  })

  it('opens the goal on click', () => {
    const onOpen = vi.fn()
    render(<SavingsGoalCard goal={goal} onOpen={onOpen} />)
    fireEvent.click(screen.getByRole('button', { name: '查看儲蓄目標：日本旅遊' }))
    expect(onOpen).toHaveBeenCalledWith(goal)
  })

  it('drops the status pill and greys out when archived', () => {
    const { container } = render(<SavingsGoalCard goal={{ ...goal, isArchived: true }} onOpen={vi.fn()} />)
    expect(screen.queryByText('落後')).toBeNull()
    expect(container.querySelector('.savings-goal-card')).toHaveClass('savings-goal-card--archived')
    expect(container.querySelector('.goal-cup-fill')).toHaveClass('goal-cup-fill--muted')
  })

  it('shows an empty cup when an ongoing goal has no spending history', () => {
    const { container } = render(
      <SavingsGoalCard
        goal={{ ...goal, kind: 'ongoing', targetTwd: null, targetMonths: 6, status: 'insufficient-data', progressRatio: 0, shortfallTwd: null }}
        onOpen={vi.fn()}
      />,
    )
    expect(screen.getByText('支出資料不足')).toHaveClass('goal-status--muted')
    expect(screen.getByText('目標 6 個月支出')).toBeInTheDocument()
    expect(container.querySelector('.goal-cup-fill')).toHaveStyle({ height: '0%' })
  })
})
