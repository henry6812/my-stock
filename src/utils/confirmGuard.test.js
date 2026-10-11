import { describe, it, expect, vi } from 'vitest'
import { guardConfirm } from './confirmGuard'

describe('guardConfirm', () => {
  it('ignores a second request while the first dialog is open', () => {
    const open = vi.fn()
    const confirm = guardConfirm(open)
    expect(confirm({ title: 'a', onOk: vi.fn() })).toBe(true)
    expect(confirm({ title: 'b', onOk: vi.fn() })).toBe(false)
    expect(open).toHaveBeenCalledTimes(1)
  })

  it('allows a new dialog once the first is confirmed', async () => {
    const open = vi.fn()
    const onOk = vi.fn(async () => 'done')
    const confirm = guardConfirm(open)
    confirm({ title: 'a', onOk })
    await expect(open.mock.calls[0][0].onOk()).resolves.toBe('done')
    expect(onOk).toHaveBeenCalled()
    expect(confirm({ title: 'b', onOk: vi.fn() })).toBe(true)
  })

  it('allows a new dialog once the first is cancelled', () => {
    const open = vi.fn()
    const onCancel = vi.fn()
    const confirm = guardConfirm(open)
    confirm({ title: 'a', onOk: vi.fn(), onCancel })
    open.mock.calls[0][0].onCancel()
    expect(onCancel).toHaveBeenCalled()
    expect(confirm({ title: 'b', onOk: vi.fn() })).toBe(true)
  })

  it('releases even when the confirmed action fails', async () => {
    const open = vi.fn()
    const confirm = guardConfirm(open)
    confirm({ title: 'a', onOk: async () => { throw new Error('boom') } })
    await expect(open.mock.calls[0][0].onOk()).rejects.toThrow('boom')
    expect(confirm({ title: 'b', onOk: vi.fn() })).toBe(true)
  })
})
