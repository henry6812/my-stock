import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SavingsGoalForm from './SavingsGoalForm'

const accountOptions = [
  { key: 'k1', bankName: '台新', accountAlias: '日常', holder: 'Po', balanceTwd: 30000 },
  { key: 'k2', bankName: '國泰', accountAlias: '備用', holder: null, balanceTwd: 5000 },
]

const renderForm = (props = {}) => {
  const onSubmit = vi.fn().mockResolvedValue(undefined)
  render(
    <>
      <SavingsGoalForm
        formId="goal-form"
        onSubmit={onSubmit}
        accountOptions={accountOptions}
        averageMonthlyExpenseTwd={50000}
        today="2026-10-10"
        {...props}
      />
      <button type="submit" form="goal-form">送出</button>
    </>,
  )
  return onSubmit
}

describe('<SavingsGoalForm />', () => {
  it('creates an open goal with the picked accounts', async () => {
    const user = userEvent.setup()
    const onSubmit = renderForm()
    await user.type(screen.getByLabelText('名稱'), '買車')
    await user.click(screen.getByText('無期限'))
    await user.type(screen.getByLabelText('目標金額'), '500000')
    await user.click(screen.getByRole('checkbox', { name: /台新・日常/ }))
    await user.click(screen.getByRole('button', { name: '送出' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit).toHaveBeenCalledWith({
      name: '買車',
      icon: null,
      kind: 'open',
      targetTwd: 500000,
      targetMonths: null,
      deadline: null,
      cashAccountKeys: ['k1'],
    })
  })

  it('previews the icon from the name', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.type(screen.getByLabelText('名稱'), '換手機')
    expect(screen.getByRole('button', { name: '手機' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('asks for months on an ongoing goal and previews the target', async () => {
    const user = userEvent.setup()
    const onSubmit = renderForm()
    await user.type(screen.getByLabelText('名稱'), '緊急預備金')
    await user.click(screen.getByText('常態'))
    expect(screen.queryByLabelText('目標金額')).toBeNull()
    expect(screen.getByText('≈ $300,000（平均月支出 $50,000）')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '送出' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ kind: 'ongoing', targetMonths: 6, targetTwd: null })
  })

  it('requires a deadline for a deadline goal', async () => {
    const user = userEvent.setup()
    const onSubmit = renderForm()
    await user.type(screen.getByLabelText('名稱'), '日本旅遊')
    await user.type(screen.getByLabelText('目標金額'), '150000')
    await user.click(screen.getByRole('button', { name: '送出' }))
    expect(await screen.findByText('請選擇到期日')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('saves an overdue goal without changing its deadline', async () => {
    const user = userEvent.setup()
    const onSubmit = renderForm({
      initialValues: {
        id: 1, name: '舊目標', icon: 'travel', kind: 'deadline', targetTwd: 1000, targetMonths: null,
        deadline: '2026-05-01', cashAccountKeys: ['k2', 'gone'],
      },
    })
    await user.click(screen.getByRole('button', { name: '送出' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      name: '舊目標', icon: 'travel', kind: 'deadline', deadline: '2026-05-01', cashAccountKeys: ['k2', 'gone'],
    })
  })

  it('keeps links to deleted accounts until they are unticked', async () => {
    const user = userEvent.setup()
    const initialValues = {
      id: 1, name: '存錢', icon: null, kind: 'open', targetTwd: 1000, targetMonths: null,
      deadline: null, cashAccountKeys: ['k1', 'gone'],
    }
    const onSubmit = renderForm({ initialValues })
    const deleted = screen.getByRole('checkbox', { name: /已刪除的帳戶（1）/ })
    expect(deleted).toBeChecked()
    await user.click(screen.getByRole('button', { name: '送出' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0][0].cashAccountKeys).toEqual(['k1', 'gone'])
    await user.click(deleted)
    await user.click(screen.getByRole('button', { name: '送出' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2))
    expect(onSubmit.mock.calls[1][0].cashAccountKeys).toEqual(['k1'])
  })
})
