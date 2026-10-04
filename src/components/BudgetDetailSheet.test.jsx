import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import BudgetDetailSheet from './BudgetDetailSheet'

const budget = {
  id: 1,
  name: '日常生活',
  budgetMode: 'RESIDENT',
  spentTwd: 18150,
  upcomingTwd: 18000,
  availableTwd: 40000,
  carryInTwd: 2000,
  hasCarryInApplied: true,
  cycleStart: '2026-10-01',
  cycleEnd: '2026-10-31',
  cycleExpenses: [
    { id: 1, name: '房租', amountTwd: 18000, occurredAt: '2026-10-20', isRecurringOccurrence: true, isUpcoming: true, categoryName: '房屋', payerName: 'Po' },
    { id: 2, name: '午餐', amountTwd: 150, occurredAt: '2026-10-03', isRecurringOccurrence: false, isUpcoming: false, categoryName: '外食', payerName: 'Po' },
  ],
}

const renderSheet = (props = {}) =>
  render(
    <BudgetDetailSheet
      open
      budget={budget}
      today="2026-10-04"
      onClose={vi.fn()}
      getActions={() => []}
      {...props}
    />,
  )

describe('<BudgetDetailSheet />', () => {
  it('summarises the cycle', () => {
    renderSheet()
    expect(screen.getByText('日常生活')).toBeInTheDocument()
    const summary = screen.getByTestId('budget-detail-summary')
    expect(summary).toHaveTextContent('剩餘 $21,850')
    expect(summary).toHaveTextContent('2026/10/01 ~ 2026/10/31')
    expect(summary).toHaveTextContent('帶入 $2,000')
    expect(summary).toHaveTextContent('每天可花 $780')
  })

  it('lists the cycle\'s charged expenses expanded, upcoming ones under 本期預計', () => {
    renderSheet()
    expect(screen.getByText('午餐')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /本期預計 1 筆/ })).toBeInTheDocument()
  })

  it('says so when the cycle has no expenses', () => {
    renderSheet({ budget: { ...budget, cycleExpenses: [] } })
    expect(screen.getByText('本期還沒有支出')).toBeInTheDocument()
  })
})
