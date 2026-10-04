import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ExpenseTemplateForm from './ExpenseTemplateForm'

const categoryOptions = [
  { label: '餐飲', value: 10 },
  { label: '交通', value: 11 },
]
const payerOptions = [
  { label: '小明', value: '小明' },
  { label: '共同帳戶', value: '共同帳戶' },
]
const budgetOptions = [{ label: '旅遊', value: 20 }]
const historySuggestions = [
  {
    name: '早餐',
    categoryId: 10,
    payer: '小明',
    expenseKind: '個人',
    budgetId: 20,
    amountTwd: 85,
  },
]

const renderForm = (props = {}) => {
  const onSubmit = vi.fn().mockResolvedValue(undefined)
  render(
    <>
      <ExpenseTemplateForm
        formId="template-form"
        onSubmit={onSubmit}
        categoryOptions={categoryOptions}
        payerOptions={payerOptions}
        budgetOptions={budgetOptions}
        historySuggestions={historySuggestions}
        {...props}
      />
      <button type="submit" form="template-form">
        送出
      </button>
    </>,
  )
  return { user: userEvent.setup(), onSubmit }
}

describe('<ExpenseTemplateForm />', () => {
  it('submits a name-only template with empty optional fields as null', async () => {
    const { user, onSubmit } = renderForm()
    await user.type(screen.getByLabelText('名稱'), '加油')
    await user.click(screen.getByRole('button', { name: '送出' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit).toHaveBeenCalledWith({
      name: '加油',
      amountTwd: null,
      categoryId: null,
      payer: null,
      expenseKind: null,
      budgetId: null,
    })
  })

  it('ignores a second submit while the first is still saving', async () => {
    const onSubmit = vi.fn(() => new Promise(() => {}))
    const { user } = renderForm({ onSubmit })
    await user.type(screen.getByLabelText('名稱'), '加油')
    await user.click(screen.getByRole('button', { name: '送出' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    await user.type(screen.getByLabelText('名稱'), '{Enter}')
    await user.click(screen.getByRole('button', { name: '送出' }))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('requires a name', async () => {
    const { user, onSubmit } = renderForm()
    await user.click(screen.getByRole('button', { name: '送出' }))
    expect(await screen.findByText('請輸入名稱')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('prefills from an existing template when editing', async () => {
    const { user, onSubmit } = renderForm({
      initialValues: {
        name: '停車',
        amountTwd: 60,
        categoryId: 11,
        payer: null,
        expenseKind: null,
        budgetId: null,
      },
    })
    expect(screen.getByLabelText('名稱')).toHaveValue('停車')
    expect(screen.getByLabelText('固定金額')).toHaveValue('60')
    await user.click(screen.getByRole('button', { name: '送出' }))
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ name: '停車', amountTwd: 60, categoryId: 11 }),
      ),
    )
  })

  it('offers 從歷史帶入 only for new templates', () => {
    renderForm({ initialValues: { name: '停車' } })
    expect(screen.queryByLabelText('從歷史帶入')).not.toBeInTheDocument()
  })

  it('從歷史帶入 fills everything except the amount', async () => {
    const { user, onSubmit } = renderForm()
    await user.click(screen.getByLabelText('從歷史帶入'))
    await user.click(await screen.findByTitle('早餐'))
    expect(screen.getByLabelText('名稱')).toHaveValue('早餐')
    expect(screen.getByLabelText('固定金額')).toHaveValue('')
    await user.click(screen.getByRole('button', { name: '送出' }))
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        name: '早餐',
        amountTwd: null,
        categoryId: 10,
        payer: '小明',
        expenseKind: '個人',
        budgetId: 20,
      }),
    )
  })

  it('從歷史帶入 skips options that no longer exist', async () => {
    const { user, onSubmit } = renderForm({
      historySuggestions: [
        { name: '舊項目', categoryId: 99, payer: '離職的人', expenseKind: null, budgetId: 98 },
      ],
    })
    await user.click(screen.getByLabelText('從歷史帶入'))
    await user.click(await screen.findByTitle('舊項目'))
    await user.click(screen.getByRole('button', { name: '送出' }))
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ name: '舊項目', categoryId: null, payer: null, budgetId: null }),
      ),
    )
  })
})
