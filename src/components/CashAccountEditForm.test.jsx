import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import CashAccountEditForm from './CashAccountEditForm'

const account = {
  id: 7,
  bankCode: '812',
  bankName: '台新',
  accountAlias: '日常',
  holder: 'Po',
  balanceTwd: 30000,
}

const goals = [
  { id: 1, name: '緊急預備金', iconKey: 'emergency', kind: 'open', targetTwd: 300000, currentTwd: 250000, isArchived: false },
  { id: 2, name: '舊旅遊', iconKey: 'travel', kind: 'open', targetTwd: 60000, currentTwd: 10000, isArchived: true },
]

const renderForm = (props = {}) => {
  const onSubmit = vi.fn()
  render(
    <>
      <CashAccountEditForm
        formId="edit"
        account={account}
        linkedGoals={goals}
        holderOptions={[{ label: 'Po', value: 'Po' }]}
        onSubmit={onSubmit}
        {...props}
      />
      <button type="submit" form="edit">儲存</button>
    </>,
  )
  return onSubmit
}

describe('CashAccountEditForm', () => {
  it('shows the bank read-only and the goals counting the account', () => {
    renderForm()
    expect(screen.getByText('台新 (812)')).toBeInTheDocument()
    const list = screen.getByRole('list', { name: '計入這個帳戶的儲蓄目標' })
    expect(list).toHaveTextContent('緊急預備金')
    expect(list).toHaveTextContent('已封存')
  })

  it('says so when no goal counts the account', () => {
    renderForm({ linkedGoals: [] })
    expect(screen.getByText('沒有儲蓄目標計入這個帳戶')).toBeInTheDocument()
  })

  it('submits the trimmed alias with holder and balance', async () => {
    const onSubmit = renderForm()
    fireEvent.change(screen.getByLabelText('帳戶別名'), { target: { value: ' 薪轉戶 ' } })
    fireEvent.click(screen.getByRole('button', { name: '儲存' }))
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ accountAlias: '薪轉戶', holder: 'Po', balanceTwd: 30000 }),
    )
  })

  it('refuses a blank alias', async () => {
    const onSubmit = renderForm()
    fireEvent.change(screen.getByLabelText('帳戶別名'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: '儲存' }))
    expect(await screen.findByText('請輸入帳戶別名')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
