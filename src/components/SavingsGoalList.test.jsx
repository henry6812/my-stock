import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import SavingsGoalList from './SavingsGoalList'

const row = (id, name, extra = {}) => ({
  id,
  name,
  iconKey: 'savings',
  kind: 'open',
  targetTwd: 1000,
  targetMonths: null,
  deadline: null,
  cashAccountKeys: ['a'],
  isArchived: false,
  currentTwd: 500,
  status: 'in-progress',
  progressRatio: 0.5,
  shortfallTwd: 500,
  ...extra,
})

describe('<SavingsGoalList />', () => {
  it('lists open goals in order and hides archived ones until expanded', () => {
    render(
      <SavingsGoalList
        goals={[row(1, '買車'), row(2, '舊目標', { isArchived: true }), row(3, '出國')]}
        onOpen={vi.fn()}
        onCreate={vi.fn()}
      />,
    )
    const names = screen.getAllByRole('button', { name: /^查看儲蓄目標/ }).map((el) => el.getAttribute('aria-label'))
    expect(names).toEqual(['查看儲蓄目標：買車', '查看儲蓄目標：出國'])
    fireEvent.click(screen.getByRole('button', { name: '已封存（1）' }))
    expect(screen.getByRole('button', { name: '查看儲蓄目標：舊目標' })).toBeInTheDocument()
  })

  it('adds a goal from the title button', () => {
    const onCreate = vi.fn()
    render(<SavingsGoalList goals={[row(1, '買車')]} onOpen={vi.fn()} onCreate={onCreate} />)
    fireEvent.click(screen.getByRole('button', { name: '新增儲蓄目標' }))
    expect(onCreate).toHaveBeenCalled()
  })

  it('shows an empty state with an add button when nothing is open', () => {
    const onCreate = vi.fn()
    render(<SavingsGoalList goals={[row(2, '舊目標', { isArchived: true })]} onOpen={vi.fn()} onCreate={onCreate} />)
    expect(screen.getByText('還沒有儲蓄目標')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /新增目標/ }))
    expect(onCreate).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '已封存（1）' })).toBeInTheDocument()
  })

  it('disables adding when writes are off', () => {
    render(<SavingsGoalList goals={[]} onOpen={vi.fn()} onCreate={vi.fn()} disabled />)
    expect(screen.getByRole('button', { name: '新增儲蓄目標' })).toBeDisabled()
  })
})
