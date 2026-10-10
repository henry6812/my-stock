import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import SavingsGoalDetailSheet from './SavingsGoalDetailSheet'

const goal = {
  id: 1,
  name: '緊急預備金',
  iconKey: 'emergency',
  kind: 'ongoing',
  targetTwd: 300000,
  targetMonths: 6,
  deadline: null,
  cashAccountKeys: ['a', 'b', 'gone'],
  isArchived: false,
  currentTwd: 250000,
  status: 'below',
  progressRatio: 0.8333,
  shortfallTwd: 50000,
  averageMonthlyExpenseTwd: 50000,
  monthsUsed: 12,
  missingAccountCount: 1,
  accounts: [
    { key: 'a', bankName: '台新', accountAlias: '日常', holder: 'Po', balanceTwd: 200000, sharedWith: ['買車'] },
    { key: 'b', bankName: '國泰', accountAlias: '備用', holder: null, balanceTwd: 50000, sharedWith: [] },
  ],
}

const renderSheet = (props = {}) => {
  const handlers = { onClose: vi.fn(), onEdit: vi.fn(), onToggleArchive: vi.fn(), onDelete: vi.fn() }
  render(<SavingsGoalDetailSheet open goal={goal} isMobile {...handlers} {...props} />)
  return handlers
}

describe('<SavingsGoalDetailSheet />', () => {
  it('summarises the goal and how its target is worked out', () => {
    renderSheet()
    const head = screen.getByTestId('savings-goal-detail-head')
    expect(head).toHaveTextContent('$250,000')
    expect(head).toHaveTextContent('目標 $300,000（6 個月）')
    expect(head).toHaveTextContent('低於目標')
    expect(screen.getByText('平均月支出 $50,000 × 6 個月 = $300,000')).toBeInTheDocument()
    expect(screen.getByText('近 12 個完整月的支出')).toBeInTheDocument()
  })

  it('lists the linked accounts, other goals sharing them, and deleted links', () => {
    renderSheet()
    expect(screen.getByText('台新・日常')).toBeInTheDocument()
    expect(screen.getByText('$200,000')).toBeInTheDocument()
    expect(screen.getByText('也計入：買車')).toBeInTheDocument()
    expect(screen.getByText('國泰・備用')).toBeInTheDocument()
    expect(screen.getByText('未設定')).toBeInTheDocument()
    expect(screen.getByText('1 個帳戶已刪除')).toBeInTheDocument()
  })

  it('says so when no account is linked', () => {
    renderSheet({ goal: { ...goal, accounts: [], cashAccountKeys: [], missingAccountCount: 0 } })
    expect(screen.getByText('尚未選擇帳戶')).toBeInTheDocument()
  })

  it('edits, archives and deletes', () => {
    const handlers = renderSheet()
    fireEvent.click(screen.getByRole('button', { name: /編輯/ }))
    expect(handlers.onEdit).toHaveBeenCalledWith(goal)
    fireEvent.click(screen.getByRole('button', { name: /^封\s?存$/ }))
    expect(handlers.onToggleArchive).toHaveBeenCalledWith(goal)
    fireEvent.click(screen.getByRole('button', { name: /^刪\s?除$/ }))
    expect(handlers.onDelete).toHaveBeenCalledWith(goal)
  })

  it('offers 取消封存 for an archived goal and hides its status', () => {
    renderSheet({ goal: { ...goal, isArchived: true } })
    expect(screen.getByRole('button', { name: '取消封存' })).toBeInTheDocument()
    expect(screen.queryByText('低於目標')).toBeNull()
  })

  it('renders nothing without a goal', () => {
    const { container } = render(<SavingsGoalDetailSheet open={false} goal={null} isMobile />)
    expect(container).toBeEmptyDOMElement()
  })
})
