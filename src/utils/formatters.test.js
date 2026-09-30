import { describe, it, expect } from 'vitest'
import { formatAxisTwd, formatDate, formatPrice, formatRelativeTime } from './formatters'

describe('formatPrice', () => {
  it('uses the same "$" as TWD totals and US$ for USD', () => {
    expect(formatPrice(25.67, 'TWD')).toBe('$25.67')
    expect(formatPrice(513.07, 'USD')).toBe('US$513.07')
  })
})

describe('formatDate', () => {
  it('formats as YYYY/MM/DD', () => {
    expect(formatDate('2026-09-30')).toBe('2026/09/30')
    expect(formatDate(null)).toBe('--')
  })
})

describe('formatAxisTwd', () => {
  it('always uses 萬', () => {
    expect(formatAxisTwd(0)).toBe('0')
    expect(formatAxisTwd(5000)).toBe('0.5萬')
    expect(formatAxisTwd(13_337_811)).toBe('1334萬')
  })
})

describe('formatRelativeTime', () => {
  const now = new Date('2026-09-30T12:00:00Z').getTime()
  it('uses zh-TW units', () => {
    expect(formatRelativeTime('2026-09-30T11:55:00Z', now)).toBe('5 分鐘前')
    expect(formatRelativeTime('2026-09-30T09:00:00Z', now)).toBe('3 小時前')
    expect(formatRelativeTime('2026-09-28T12:00:00Z', now)).toBe('2 天前')
    expect(formatRelativeTime(null, now)).toBe('尚未更新')
  })
})
