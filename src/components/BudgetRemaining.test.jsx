import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import BudgetRemaining from './BudgetRemaining'

const renderLevel = (status) =>
  render(<BudgetRemaining status={status} />).container.firstChild

describe('<BudgetRemaining />', () => {
  it('marks over and near-limit budgets with an icon, not colour alone', () => {
    const over = renderLevel({ level: 'over', overTwd: 500 })
    expect(over).toHaveTextContent('超支 $500')
    expect(over.querySelector('svg')).not.toBeNull()

    const warn = renderLevel({ level: 'warn', remainingTwd: 100 })
    expect(warn).toHaveTextContent('剩餘 $100')
    expect(warn.querySelector('svg')).not.toBeNull()
  })

  it('shows a budget with room left without an icon', () => {
    const ok = renderLevel({ level: 'ok', remainingTwd: 28000 })
    expect(ok).toHaveTextContent('剩餘 $28,000')
    expect(ok.querySelector('svg')).toBeNull()
  })
})
