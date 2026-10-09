import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import dayjs from 'dayjs'
import MobileIncomeSettings from './MobileIncomeSettings'

const overrides = [
  { month: '2026-03', incomeTwd: 126640 },
  { month: '2026-08', incomeTwd: 200000 },
]

const renderList = (props = {}) => {
  const handlers = {
    onSaveDefault: vi.fn().mockResolvedValue(true),
    onSaveOverride: vi.fn().mockResolvedValue(true),
    onRemoveOverride: vi.fn(),
  }
  render(
    <MobileIncomeSettings
      defaultMonthlyIncomeTwd={180000}
      overrides={overrides}
      {...handlers}
      {...props}
    />,
  )
  return { user: userEvent.setup(), ...handlers }
}

const sheet = () => document.querySelector('.income-sheet')
// A closed sheet is destroyed (destroyOnHidden) or no longer open.
const isSheetOpen = () => Boolean(sheet()?.closest('.ant-drawer-open'))
const amountInput = () => within(sheet()).getByLabelText('收入金額')
const save = (user) => user.click(within(sheet()).getByRole('button', { name: /儲\s*存/ }))

describe('<MobileIncomeSettings />', () => {
  it('lists the monthly income first, then the months with their own, newest first', () => {
    renderList()
    const rows = screen.getAllByRole('button', { name: /，編輯$/ })
    expect(rows.map((row) => row.getAttribute('aria-label'))).toEqual([
      '每月收入 $180,000，編輯',
      '2026 年 8 月收入 $200,000，編輯',
      '2026 年 3 月收入 $126,640，編輯',
    ])
  })

  it('shows an unset monthly income as such', () => {
    renderList({ defaultMonthlyIncomeTwd: null, overrides: [] })
    expect(screen.getByRole('button', { name: '每月收入 未設定，編輯' })).toBeInTheDocument()
  })

  it('edits the monthly income in a sheet and closes it once saved', async () => {
    const { user, onSaveDefault } = renderList()
    await user.click(screen.getByRole('button', { name: '每月收入 $180,000，編輯' }))
    expect(amountInput()).toHaveValue('180000')
    expect(amountInput()).toHaveAttribute('inputmode', 'numeric')
    await user.clear(amountInput())
    await user.type(amountInput(), '190000')
    await save(user)
    expect(onSaveDefault).toHaveBeenCalledWith(190000)
    await waitFor(() => expect(isSheetOpen()).toBe(false))
  })

  it('saves a cleared monthly income as unset', async () => {
    const { user, onSaveDefault } = renderList()
    await user.click(screen.getByRole('button', { name: '每月收入 $180,000，編輯' }))
    await user.clear(amountInput())
    await save(user)
    expect(onSaveDefault).toHaveBeenCalledWith(null)
  })

  it('keeps the sheet open when the save fails', async () => {
    const { user } = renderList({ onSaveDefault: vi.fn().mockResolvedValue(false) })
    await user.click(screen.getByRole('button', { name: '每月收入 $180,000，編輯' }))
    await save(user)
    expect(isSheetOpen()).toBe(true)
  })

  it('adds a month for the current month by default', async () => {
    const { user, onSaveOverride } = renderList()
    await user.click(screen.getByRole('button', { name: '新增月份收入' }))
    expect(within(sheet()).getByText('新增月份收入')).toBeInTheDocument()
    await user.type(amountInput(), '150000')
    await save(user)
    expect(onSaveOverride).toHaveBeenCalledWith({
      month: dayjs().format('YYYY-MM'),
      incomeTwd: 150000,
    })
  })

  it('edits an existing month without letting its month change', async () => {
    const { user, onSaveOverride } = renderList()
    await user.click(screen.getByRole('button', { name: '2026 年 3 月收入 $126,640，編輯' }))
    expect(within(sheet()).getByText('編輯月份收入')).toBeInTheDocument()
    expect(sheet().querySelector('.ant-picker')).toHaveClass('ant-picker-disabled')
    expect(amountInput()).toHaveValue('126640')
    await user.clear(amountInput())
    await user.type(amountInput(), '130000')
    await save(user)
    expect(onSaveOverride).toHaveBeenCalledWith({ month: '2026-03', incomeTwd: 130000 })
  })

  it('offers 刪除 behind a month row, not behind the monthly income', () => {
    renderList()
    expect(screen.getByRole('button', { name: '刪除 2026 年 3 月' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^刪除 每月收入/ })).not.toBeInTheDocument()
  })

  it('hands the month to onRemoveOverride', async () => {
    const { user, onRemoveOverride } = renderList()
    await user.click(screen.getByRole('button', { name: '刪除 2026 年 3 月' }))
    expect(onRemoveOverride).toHaveBeenCalledWith('2026-03')
  })

  it('disables adding while writes are disabled', () => {
    renderList({ disabled: true })
    expect(screen.getByRole('button', { name: '新增月份收入' })).toBeDisabled()
  })
})
