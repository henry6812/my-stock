import { describe, expect, it } from 'vitest'
import {
  CATEGORY_ICON_OPTIONS,
  getCategoryIconKey,
  normalizeCategoryIcon,
  resolveCategoryIconKey,
} from './categoryIcons'

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

describe('normalizeCategoryIcon', () => {
  it('keeps pickable keys only', () => {
    expect(normalizeCategoryIcon('coffee')).toBe('coffee')
    expect(normalizeCategoryIcon('none')).toBeNull()
    expect(normalizeCategoryIcon('rocket')).toBeNull()
    expect(normalizeCategoryIcon(undefined)).toBeNull()
  })

  it('offers 18 icons', () => {
    expect(CATEGORY_ICON_OPTIONS).toHaveLength(18)
  })
})

describe('resolveCategoryIconKey', () => {
  it('prefers the stored icon', () => {
    expect(resolveCategoryIconKey({ name: '外食', icon: 'coffee' })).toBe('coffee')
  })

  it('falls back to the name when no valid icon is stored', () => {
    expect(resolveCategoryIconKey({ name: '外食', icon: null })).toBe('dining')
    expect(resolveCategoryIconKey({ name: '外食', icon: 'rocket' })).toBe('dining')
  })

  it('shows no-category rows as none even with an icon', () => {
    expect(resolveCategoryIconKey({ name: '未指定', icon: 'coffee' })).toBe('none')
  })
})
