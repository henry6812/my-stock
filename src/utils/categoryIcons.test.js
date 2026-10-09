import { describe, expect, it } from 'vitest'
import { getCategoryIconKey } from './categoryIcons'

describe('getCategoryIconKey', () => {
  it.each([
    ['寶寶用品', 'baby'],
    ['外食', 'dining'],
    ['娛樂', 'entertainment'],
    ['家庭雜支', 'household'],
    ['買菜', 'groceries'],
    ['房屋', 'housing'],
    ['職涯投資', 'learning'],
    ['交通費', 'transport'],
    ['健康', 'health'],
    ['衣服', 'clothing'],
    ['咖啡', 'coffee'],
    ['水電瓦斯', 'utilities'],
  ])('maps %s → %s', (name, key) => {
    expect(getCategoryIconKey(name)).toBe(key)
  })

  it('falls back to other for an unknown name', () => {
    expect(getCategoryIconKey('寵物')).toBe('other')
  })

  it('treats empty and 未指定 as no category', () => {
    expect(getCategoryIconKey('')).toBe('none')
    expect(getCategoryIconKey(null)).toBe('none')
    expect(getCategoryIconKey('未指定')).toBe('none')
  })
})
