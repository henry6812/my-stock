import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Wallet } from 'iconoir-react'
import EmptyState from './EmptyState'

describe('EmptyState', () => {
  it('shows the icon tile, the text and the action', () => {
    const { container } = render(
      <EmptyState icon={Wallet} description="目前沒有預算">
        <button type="button">新增預算</button>
      </EmptyState>,
    )
    expect(container.querySelector('.empty-state-icon svg')).not.toBeNull()
    expect(screen.getByText('目前沒有預算')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '新增預算' })).toBeInTheDocument()
  })

  it('leaves out the icon and the action when not given', () => {
    const { container } = render(<EmptyState description="尚無資料" />)
    expect(container.querySelector('.empty-state-icon')).toBeNull()
    expect(container.querySelector('.empty-state-action')).toBeNull()
  })
})
