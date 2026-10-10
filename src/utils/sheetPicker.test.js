import { describe, it, expect, vi, afterEach } from 'vitest'
import { makeRoomForPicker } from './sheetPicker'

const mount = (html) => {
  document.body.innerHTML = html
  const input = document.querySelector('input')
  input.scrollIntoView = vi.fn()
  input.focus()
  return input
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('makeRoomForPicker', () => {
  it('scrolls a picker inside a bottom sheet to the top of the sheet when it opens', () => {
    const input = mount('<div class="form-bottom-sheet"><div class="ant-drawer-body"><input /></div></div>')
    makeRoomForPicker(true)
    expect(input.scrollIntoView).toHaveBeenCalledWith({ block: 'start' })
  })

  it('does nothing when closing', () => {
    const input = mount('<div class="form-bottom-sheet"><div class="ant-drawer-body"><input /></div></div>')
    makeRoomForPicker(false)
    expect(input.scrollIntoView).not.toHaveBeenCalled()
  })

  it('leaves pickers outside a bottom sheet alone', () => {
    const input = mount('<div><input /></div>')
    makeRoomForPicker(true)
    expect(input.scrollIntoView).not.toHaveBeenCalled()
  })
})
