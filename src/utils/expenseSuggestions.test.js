import { describe, it, expect } from 'vitest'
import {
  buildExpenseNameSuggestions,
  filterNameSuggestions,
  pickQuickCategories,
  rankCategoriesByUsage,
} from './expenseSuggestions'

const entry = (overrides) => ({
  name: '早餐',
  amountTwd: 80,
  occurredAt: '2026-09-01',
  updatedAt: 1,
  categoryId: 'food',
  ...overrides,
})

describe('buildExpenseNameSuggestions', () => {
  it('groups by trimmed name and uses the latest entry as template', () => {
    const result = buildExpenseNameSuggestions([
      entry({ amountTwd: 60, occurredAt: '2026-09-01' }),
      entry({ name: ' 早餐 ', amountTwd: 90, occurredAt: '2026-09-20', payer: 'A' }),
      entry({ amountTwd: 70, occurredAt: '2026-09-10' }),
    ])
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ name: '早餐', count: 3, amountTwd: 90, payer: 'A' })
  })

  it('sorts by count then recency, skipping deleted and blank names', () => {
    const result = buildExpenseNameSuggestions([
      entry({ name: '加油', occurredAt: '2026-09-02' }),
      entry({ name: '停車', occurredAt: '2026-09-05' }),
      entry({ name: '加油', occurredAt: '2026-09-03' }),
      entry({ name: '計程車', deletedAt: 5 }),
      entry({ name: '   ' }),
      entry({ name: '午餐', occurredAt: '2026-09-04' }),
    ])
    expect(result.map((s) => s.name)).toEqual(['加油', '停車', '午餐'])
  })

  it('respects the limit', () => {
    const entries = ['a', 'b', 'c'].map((name) => entry({ name }))
    expect(buildExpenseNameSuggestions(entries, { limit: 2 })).toHaveLength(2)
  })
})

describe('rankCategoriesByUsage', () => {
  const categories = [{ id: 'food' }, { id: 'car' }, { id: 'fun' }, { id: 'old', deletedAt: 1 }]

  it('puts used categories first by count, unused keep original order', () => {
    const order = rankCategoriesByUsage(
      [
        entry({ categoryId: 'car' }),
        entry({ categoryId: 'car' }),
        entry({ categoryId: 'fun' }),
        entry({ categoryId: 'old' }),
      ],
      categories,
    )
    expect(order).toEqual(['car', 'fun', 'food'])
  })

  it('breaks count ties by most recent use', () => {
    const order = rankCategoriesByUsage(
      [
        entry({ categoryId: 'food', occurredAt: '2026-09-01' }),
        entry({ categoryId: 'fun', occurredAt: '2026-09-09' }),
      ],
      categories,
    )
    expect(order).toEqual(['fun', 'food', 'car'])
  })
})

describe('filterNameSuggestions', () => {
  const suggestions = ['午餐便當', 'Lunch', '早餐', '晚餐'].map((name) => ({ name }))

  it('returns the head of the list for an empty query', () => {
    expect(filterNameSuggestions(suggestions, '', { limit: 2 }).map((s) => s.name)).toEqual([
      '午餐便當',
      'Lunch',
    ])
  })

  it('ranks prefix matches before substring matches', () => {
    expect(filterNameSuggestions(suggestions, '餐').map((s) => s.name)).toEqual([
      '午餐便當',
      '早餐',
      '晚餐',
    ])
    expect(filterNameSuggestions(suggestions, '早').map((s) => s.name)).toEqual(['早餐'])
  })

  it('matches case-insensitively', () => {
    expect(filterNameSuggestions(suggestions, 'lun').map((s) => s.name)).toEqual(['Lunch'])
  })
})

describe('pickQuickCategories', () => {
  const categories = [
    { id: 'a', name: 'A' },
    { id: 'b', name: 'B', isQuickPick: true },
    { id: 'c', name: 'C' },
    { id: 'd', name: 'D', isQuickPick: true },
  ]

  it('returns only quick-pick categories, in usage order', () => {
    expect(pickQuickCategories(categories, ['d', 'a', 'b']).map((c) => c.id)).toEqual(['d', 'b'])
  })

  it('falls back to the most-used categories when none are marked', () => {
    const plain = categories.map(({ id, name }) => ({ id, name }))
    expect(
      pickQuickCategories(plain, ['c', 'a'], { fallbackLimit: 3 }).map((c) => c.id),
    ).toEqual(['c', 'a', 'b'])
  })
})
