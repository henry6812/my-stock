import { describe, it, expect } from 'vitest'
import { getHoldingActionTitle } from './holdingActions'

describe('getHoldingActionTitle', () => {
  it('names the stock and holder the form acts on', () => {
    expect(getHoldingActionTitle('buy', { companyName: '瑞鼎', symbol: '3592', holderName: 'Po' })).toBe('買進 · 瑞鼎（Po）')
  })

  it('falls back to the symbol and skips a missing holder', () => {
    expect(getHoldingActionTitle('sell', { symbol: 'AAPL' })).toBe('賣出 · AAPL')
  })

  it('is empty without an action', () => {
    expect(getHoldingActionTitle(null, { symbol: 'AAPL' })).toBe('')
  })
})
