import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import useBodyScrollLock from './useBodyScrollLock'

describe('useBodyScrollLock', () => {
  beforeEach(() => {
    document.body.removeAttribute('style')
    Object.defineProperty(window, 'scrollY', { value: 420, configurable: true })
    window.scrollTo = vi.fn()
  })

  it('pins the body at the current scroll position while active', () => {
    renderHook(() => useBodyScrollLock(true))
    expect(document.body.style.position).toBe('fixed')
    expect(document.body.style.top).toBe('-420px')
    expect(document.body.style.width).toBe('100%')
  })

  it('restores the body and the scroll position when released', () => {
    document.body.style.position = 'relative'
    const { rerender } = renderHook(({ active }) => useBodyScrollLock(active), {
      initialProps: { active: true },
    })
    rerender({ active: false })
    expect(document.body.style.position).toBe('relative')
    expect(document.body.style.top).toBe('')
    expect(window.scrollTo).toHaveBeenCalledWith(0, 420)
  })

  it('does nothing while inactive', () => {
    renderHook(() => useBodyScrollLock(false))
    expect(document.body.style.position).toBe('')
    expect(window.scrollTo).not.toHaveBeenCalled()
  })

  it('releases on unmount', () => {
    const { unmount } = renderHook(() => useBodyScrollLock(true))
    unmount()
    expect(document.body.style.position).toBe('')
    expect(window.scrollTo).toHaveBeenCalledWith(0, 420)
  })

  it('keeps the page pinned until the last of several sheets closes', () => {
    document.body.style.position = 'relative'
    const outer = renderHook(({ active }) => useBodyScrollLock(active), {
      initialProps: { active: true },
    })
    const inner = renderHook(({ active }) => useBodyScrollLock(active), {
      initialProps: { active: true },
    })
    // The outer sheet closes first (e.g. the budget detail under an edit form).
    outer.rerender({ active: false })
    expect(document.body.style.position).toBe('fixed')
    expect(document.body.style.top).toBe('-420px')
    expect(window.scrollTo).not.toHaveBeenCalled()
    inner.rerender({ active: false })
    expect(document.body.style.position).toBe('relative')
    expect(window.scrollTo).toHaveBeenCalledWith(0, 420)
  })
})
