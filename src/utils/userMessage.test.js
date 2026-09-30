import { describe, it, expect, vi } from 'vitest'
import { toUserMessage } from './userMessage'

describe('toUserMessage', () => {
  it('maps Firebase error codes', () => {
    const error = Object.assign(new Error('Firebase: Error (auth/popup-blocked).'), {
      code: 'auth/popup-blocked',
    })
    expect(toUserMessage(error, 'Google 登入失敗')).toContain('封鎖')
  })

  it('maps raw Firestore messages passed as strings', () => {
    expect(toUserMessage('Missing or insufficient permissions.')).toContain('沒有權限')
  })

  it('maps service validation errors', () => {
    expect(toUserMessage(new Error('Shares must be a positive number'))).toBe('股數必須大於 0')
    expect(toUserMessage(new Error('orderedIds does not match holdings length'))).toContain('重新整理')
  })

  it('names the symbol when a quote is missing', () => {
    expect(toUserMessage(new Error('No TPEX quote found for symbol: 9999'))).toContain('9999')
    expect(
      toUserMessage(new Error('No Taiwan quote found for symbol: invalid symbol')),
    ).not.toContain('invalid')
  })

  it('keeps messages that are already zh-TW', () => {
    expect(toUserMessage(new Error('請選擇持有人'))).toBe('請選擇持有人')
  })

  it('falls back for unknown English errors', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(toUserMessage(new Error('Something weird'), '更新價格失敗')).toBe('更新價格失敗')
    expect(toUserMessage(undefined, '更新價格失敗')).toBe('更新價格失敗')
    warn.mockRestore()
  })
})
