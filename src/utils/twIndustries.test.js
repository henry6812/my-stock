import { describe, it, expect } from 'vitest'
import { CONSTRUCTION_INDUSTRY, TW_INDUSTRY_CODES, industryName } from './twIndustries.js'

describe('industryName', () => {
  it('names known codes', () => {
    expect(industryName('24')).toBe('半導體')
    expect(industryName(CONSTRUCTION_INDUSTRY)).toBe('建材營造')
  })

  it('reads unknown or missing codes as 其他', () => {
    expect(industryName('99')).toBe('其他')
    expect(industryName(null)).toBe('其他')
  })

  it('lists codes in order', () => {
    expect(TW_INDUSTRY_CODES[0]).toBe('01')
    expect(TW_INDUSTRY_CODES).toHaveLength(33)
    expect([...TW_INDUSTRY_CODES].sort()).toEqual(TW_INDUSTRY_CODES)
  })
})
