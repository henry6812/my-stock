import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MobileHolderSettings from './MobileHolderSettings'

const renderList = (props = {}) => {
  const handlers = {
    onAdd: vi.fn().mockResolvedValue(true),
    onRename: vi.fn().mockResolvedValue(true),
    onRemove: vi.fn(),
  }
  render(<MobileHolderSettings holders={['Po', 'Wei']} {...handlers} {...props} />)
  return { user: userEvent.setup(), ...handlers }
}

const sheet = () => document.querySelector('.holder-sheet')
const isSheetOpen = () => Boolean(sheet()?.closest('.ant-drawer-open'))
const nameInput = () => within(sheet()).getByLabelText('持有人名稱')
const submit = (name) => within(sheet()).getByRole('button', { name })

describe('<MobileHolderSettings />', () => {
  it('lists each holder as a row to rename', () => {
    renderList()
    expect(
      screen.getAllByRole('button', { name: /，改名$/ }).map((row) => row.getAttribute('aria-label')),
    ).toEqual(['Po，改名', 'Wei，改名'])
  })

  it('renames a holder in a sheet and closes it once saved', async () => {
    const { user, onRename } = renderList()
    await user.click(screen.getByRole('button', { name: 'Po，改名' }))
    expect(nameInput()).toHaveValue('Po')
    expect(submit(/儲\s*存/)).toBeDisabled()
    await user.clear(nameInput())
    await user.type(nameInput(), ' Paul ')
    await user.click(submit(/儲\s*存/))
    expect(onRename).toHaveBeenCalledWith('Po', 'Paul')
    await waitFor(() => expect(isSheetOpen()).toBe(false))
  })

  it('adds a holder from the title button', async () => {
    const { user, onAdd } = renderList()
    await user.click(screen.getByRole('button', { name: '新增持有人' }))
    expect(submit(/新\s*增/)).toBeDisabled()
    await user.type(nameInput(), '澄澄')
    await user.click(submit(/新\s*增/))
    expect(onAdd).toHaveBeenCalledWith('澄澄')
  })

  it('keeps the sheet open when saving fails', async () => {
    const { user } = renderList({ onAdd: vi.fn().mockResolvedValue(false) })
    await user.click(screen.getByRole('button', { name: '新增持有人' }))
    await user.type(nameInput(), 'Po')
    await user.click(submit(/新\s*增/))
    expect(isSheetOpen()).toBe(true)
  })

  it('offers no 移除 when only one holder is left', () => {
    renderList({ holders: ['Po'] })
    expect(screen.queryByRole('button', { name: '移除 Po' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '改名 Po', hidden: true })).toBeInTheDocument()
  })
})
