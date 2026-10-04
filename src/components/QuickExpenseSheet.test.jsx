import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import dayjs from 'dayjs'
import QuickExpenseSheet from './QuickExpenseSheet'

const categories = [
  { id: 'c-food', name: '餐飲' },
  { id: 'c-traffic', name: '交通' },
  { id: 'c-home', name: '家用' },
]

// History-based suggestions: only used for the name autocomplete.
const nameSuggestions = [
  {
    name: '早餐',
    categoryId: 'c-food',
    payer: '小明',
    expenseKind: '個人',
    budgetId: 'b-1',
    amountTwd: 85,
    count: 5,
    lastUsedAt: '2026-10-01|',
  },
  {
    name: '加油',
    categoryId: 'c-traffic',
    payer: null,
    expenseKind: null,
    budgetId: null,
    amountTwd: 1200,
    count: 3,
    lastUsedAt: '2026-09-28|',
  },
  {
    name: '午餐',
    categoryId: 'c-food',
    payer: null,
    expenseKind: null,
    budgetId: null,
    amountTwd: 120,
    count: 2,
    lastUsedAt: '2026-09-20|',
  },
]

// User-managed 常用支出, already ordered.
const templates = [
  {
    id: 1,
    name: '早餐',
    categoryId: 'c-food',
    payer: '小明',
    expenseKind: '個人',
    budgetId: 'b-1',
    amountTwd: null,
  },
  {
    id: 2,
    name: '加油',
    categoryId: 'c-traffic',
    payer: null,
    expenseKind: null,
    budgetId: null,
    amountTwd: null,
  },
  {
    id: 3,
    name: '停車',
    categoryId: 'c-traffic',
    payer: null,
    expenseKind: null,
    budgetId: null,
    amountTwd: 60,
  },
]

const KEY_LABELS = { '+': '加', '-': '減', backspace: '刪除', clear: '清除' }

const renderSheet = (props = {}) => {
  const handlers = {
    onClose: vi.fn(),
    onSubmit: vi.fn().mockResolvedValue(undefined),
    onOpenFullForm: vi.fn(),
  }
  render(
    <QuickExpenseSheet
      open
      templates={templates}
      nameSuggestions={nameSuggestions}
      quickCategories={categories.slice(0, 2)}
      allCategories={categories}
      defaults={{ payer: '共同帳戶', expenseKind: '家庭' }}
      {...handlers}
      {...props}
    />,
  )
  return { user: userEvent.setup(), ...handlers, ...props }
}

const press = async (user, keys) => {
  for (const key of keys) {
    await user.click(screen.getByRole('button', { name: KEY_LABELS[key] ?? key }))
  }
}

const saveButton = () => screen.getByRole('button', { name: '存' })

describe('<QuickExpenseSheet />', () => {
  it('evaluates the keypad expression and submits it with the category name', async () => {
    const { user, onSubmit } = renderSheet()
    await user.click(screen.getByRole('button', { name: '餐飲' }))
    await press(user, ['1', '2', '0', '+', '8', '5'])

    expect(screen.getByLabelText('金額')).toHaveTextContent('$205')
    expect(screen.getByLabelText('算式')).toHaveTextContent('120+85')

    await user.click(saveButton())
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit).toHaveBeenCalledWith({
      name: '餐飲',
      amountTwd: 205,
      occurredAt: dayjs().format('YYYY-MM-DD'),
      entryType: 'ONE_TIME',
      categoryId: 'c-food',
      payer: '共同帳戶',
      expenseKind: '家庭',
      budgetId: null,
    })
  })

  it('picking a suggestion fills name, category and extras but clears the amount', async () => {
    const { user, onSubmit } = renderSheet()
    await press(user, ['5'])
    await user.click(screen.getByRole('button', { name: '常用 早餐' }))

    expect(screen.getByLabelText('名稱')).toHaveValue('早餐')
    expect(screen.getByRole('button', { name: '餐飲' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '常用 早餐' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('金額')).toHaveTextContent('$0')

    await press(user, ['9', '0'])
    await user.click(saveButton())
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: '早餐',
        amountTwd: 90,
        categoryId: 'c-food',
        payer: '小明',
        expenseKind: '個人',
        budgetId: 'b-1',
      }),
    )
  })

  it('changing category clears a suggestion-filled name and its extras', async () => {
    const { user, onSubmit } = renderSheet()
    await user.click(screen.getByRole('button', { name: '常用 早餐' }))
    await user.click(screen.getByRole('button', { name: '交通' }))

    expect(screen.getByLabelText('名稱')).toHaveValue('')
    expect(screen.getByRole('button', { name: '常用 早餐' })).toHaveAttribute('aria-pressed', 'false')

    await press(user, ['5', '0'])
    await user.click(saveButton())
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: '交通',
        categoryId: 'c-traffic',
        payer: '共同帳戶',
        expenseKind: '家庭',
        budgetId: null,
      }),
    )
  })

  it('keeps a hand-typed name when the category changes', async () => {
    const { user } = renderSheet()
    await user.click(screen.getByRole('button', { name: '餐飲' }))
    await user.type(screen.getByLabelText('名稱'), '午餐')
    await user.keyboard('{Enter}')
    await user.click(screen.getByRole('button', { name: '交通' }))
    expect(screen.getByLabelText('名稱')).toHaveValue('午餐')
  })

  it('a suggestion without a payer or kind keeps the defaults', async () => {
    const { user, onSubmit } = renderSheet()
    await user.click(screen.getByRole('button', { name: '常用 加油' }))
    await press(user, ['5', '0'])
    await user.click(saveButton())
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: '加油',
        payer: '共同帳戶',
        expenseKind: '家庭',
        budgetId: null,
      }),
    )
  })

  it('marks a non-positive result as invalid', async () => {
    const { user } = renderSheet()
    await press(user, ['5'])
    expect(screen.getByLabelText('金額')).not.toHaveAttribute('aria-invalid', 'true')
    await press(user, ['-', '1', '0'])
    expect(screen.getByLabelText('金額')).toHaveAttribute('aria-invalid', 'true')
  })

  it('a template with a fixed amount fills the keypad', async () => {
    const { user, onSubmit } = renderSheet()
    await press(user, ['9'])
    await user.click(screen.getByRole('button', { name: '常用 停車' }))
    expect(screen.getByLabelText('金額')).toHaveTextContent('$60')
    await user.click(saveButton())
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: '停車', amountTwd: 60, categoryId: 'c-traffic' }),
    )
  })

  it('hides the 常用 row when there are no templates', () => {
    renderSheet({ templates: [] })
    expect(screen.queryByRole('group', { name: '常用' })).not.toBeInTheDocument()
  })

  it('name autocomplete draws on history, not templates', async () => {
    const { user } = renderSheet({ templates: [] })
    await user.type(screen.getByLabelText('名稱'), '午')
    await user.click(screen.getByRole('button', { name: '午餐' }))
    expect(screen.getByLabelText('名稱')).toHaveValue('午餐')
    expect(screen.getByRole('button', { name: '餐飲' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('金額')).toHaveTextContent('$0')
  })

  it('blocks save without an amount', async () => {
    const { user, onSubmit } = renderSheet()
    await user.click(screen.getByRole('button', { name: '餐飲' }))
    expect(saveButton()).toHaveAttribute('aria-disabled', 'true')
    await user.click(saveButton())
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('blocks save when the result is not positive', async () => {
    const { user, onSubmit } = renderSheet()
    await user.click(screen.getByRole('button', { name: '餐飲' }))
    await press(user, ['5', '-', '1', '0'])
    expect(saveButton()).toHaveAttribute('aria-disabled', 'true')
    await user.click(saveButton())
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('blocks save with neither a category nor a name', async () => {
    const { user, onSubmit } = renderSheet()
    await press(user, ['5', '0'])
    expect(saveButton()).toHaveAttribute('aria-disabled', 'true')
    await user.click(saveButton())
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('allows a name without a category', async () => {
    const { user, onSubmit } = renderSheet()
    await user.type(screen.getByLabelText('名稱'), '雜支')
    await user.keyboard('{Enter}')
    await press(user, ['3', '0'])
    await user.click(saveButton())
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: '雜支', categoryId: null, amountTwd: 30 }),
    )
  })

  it('submits only once on a double tap', async () => {
    const onSubmit = vi.fn(() => new Promise(() => {}))
    const { user } = renderSheet({ onSubmit })
    await user.click(screen.getByRole('button', { name: '餐飲' }))
    await press(user, ['8'])
    await user.click(saveButton())
    await user.click(saveButton())
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('does not submit again after a successful save', async () => {
    const { user, onSubmit } = renderSheet()
    await user.click(screen.getByRole('button', { name: '餐飲' }))
    await press(user, ['8'])
    await user.click(saveButton())
    await user.click(saveButton())
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('完整表單 is inert while saving', async () => {
    const { user, onOpenFullForm } = renderSheet({ loading: true })
    await user.click(screen.getByRole('button', { name: '完整表單' }))
    expect(onOpenFullForm).not.toHaveBeenCalled()
  })

  it('stays usable after a failed submit', async () => {
    const onSubmit = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined)
    const { user } = renderSheet({ onSubmit })
    await user.click(screen.getByRole('button', { name: '餐飲' }))
    await press(user, ['8'])
    await user.click(saveButton())
    expect(screen.getByLabelText('金額')).toHaveTextContent('$8')
    await user.click(saveButton())
    expect(onSubmit).toHaveBeenCalledTimes(2)
  })

  it('hides the keypad while the name is focused', async () => {
    const { user } = renderSheet()
    await user.click(screen.getByLabelText('名稱'))
    expect(screen.queryByRole('button', { name: '存' })).not.toBeInTheDocument()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('button', { name: '存' })).toBeInTheDocument()
  })

  it('name autocomplete chip applies the suggestion and restores the keypad', async () => {
    const { user } = renderSheet()
    await user.type(screen.getByLabelText('名稱'), '早')
    await user.click(screen.getByRole('button', { name: '早餐' }))
    expect(screen.getByLabelText('名稱')).toHaveValue('早餐')
    expect(screen.getByRole('button', { name: '餐飲' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '存' })).toBeInTheDocument()
  })

  it('date chips switch the date', async () => {
    const { user, onSubmit } = renderSheet()
    await user.click(screen.getByRole('button', { name: '昨天' }))
    expect(screen.getByRole('button', { name: '昨天' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: '餐飲' }))
    await press(user, ['1'])
    await user.click(saveButton())
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        occurredAt: dayjs().subtract(1, 'day').format('YYYY-MM-DD'),
      }),
    )
  })

  it('更多 opens the full category list', async () => {
    const { user } = renderSheet()
    await user.click(screen.getByRole('button', { name: '更多' }))
    await user.click(screen.getByRole('button', { name: '家用' }))
    expect(screen.getByText('家用', { selector: '.quick-expense-category-label' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '存' })).toBeInTheDocument()
  })

  it('完整表單 hands the draft over', async () => {
    const { user, onOpenFullForm } = renderSheet()
    await user.click(screen.getByRole('button', { name: '常用 加油' }))
    await press(user, ['1', '2', '0', '0'])
    await user.click(screen.getByRole('button', { name: '完整表單' }))
    expect(onOpenFullForm).toHaveBeenCalledWith({
      name: '加油',
      amountTwd: 1200,
      occurredAt: dayjs().format('YYYY-MM-DD'),
      categoryId: 'c-traffic',
      payer: '共同帳戶',
      expenseKind: '家庭',
      budgetId: undefined,
    })
  })

  it('locks the save key while disabled', async () => {
    const { user, onSubmit } = renderSheet({ disabled: true })
    await user.click(screen.getByRole('button', { name: '餐飲' }))
    await user.click(saveButton())
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
