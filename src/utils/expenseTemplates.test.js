import { describe, it, expect } from 'vitest'
import {
  buildTemplateRows,
  getNextTemplateSortOrder,
  normalizeTemplateInput,
  planTemplateReorder,
} from './expenseTemplates'

describe('normalizeTemplateInput', () => {
  it('trims the name and keeps optional fields', () => {
    expect(
      normalizeTemplateInput({
        name: '  停車 ',
        amountTwd: 60,
        payer: '小明',
        expenseKind: '個人',
      }),
    ).toEqual({ name: '停車', amountTwd: 60, payer: '小明', expenseKind: '個人' })
  })

  it('requires a name', () => {
    expect(() => normalizeTemplateInput({ name: '   ' })).toThrow('Template name is required')
  })

  it('treats empty, zero, negative or non-numeric amounts as not fixed', () => {
    for (const amountTwd of [undefined, null, '', 0, -5, 'abc']) {
      expect(normalizeTemplateInput({ name: '加油', amountTwd }).amountTwd).toBeNull()
    }
  })

  it('rounds a fractional amount to a whole number', () => {
    expect(normalizeTemplateInput({ name: '咖啡', amountTwd: 65.4 }).amountTwd).toBe(65)
  })

  it('nulls blank payer and kind', () => {
    const result = normalizeTemplateInput({ name: '咖啡', payer: '', expenseKind: undefined })
    expect(result.payer).toBeNull()
    expect(result.expenseKind).toBeNull()
  })
})

describe('getNextTemplateSortOrder', () => {
  it('appends after the largest live sort order', () => {
    expect(getNextTemplateSortOrder([])).toBe(1)
    expect(
      getNextTemplateSortOrder([
        { sortOrder: 3 },
        { sortOrder: 7, deletedAt: '2026-10-01T00:00:00.000Z' },
        { sortOrder: 5 },
      ]),
    ).toBe(6)
  })
})

describe('planTemplateReorder', () => {
  const templates = [
    { id: 1, sortOrder: 1 },
    { id: 2, sortOrder: 2 },
    { id: 3, sortOrder: 3 },
  ]

  it('returns only the templates whose position changed', () => {
    expect(planTemplateReorder(templates, [1, 3, 2])).toEqual([
      { id: 3, sortOrder: 2 },
      { id: 2, sortOrder: 3 },
    ])
  })

  it('returns nothing when the order is unchanged', () => {
    expect(planTemplateReorder(templates, [1, 2, 3])).toEqual([])
  })

  it('renumbers duplicate sort orders left by concurrent edits', () => {
    const tied = [
      { id: 1, sortOrder: 1 },
      { id: 2, sortOrder: 1 },
    ]
    expect(planTemplateReorder(tied, [1, 2])).toEqual([{ id: 2, sortOrder: 2 }])
  })

  it('ignores ids that are not templates', () => {
    expect(planTemplateReorder(templates, [99, 2, 1, 3])).toEqual([
      { id: 2, sortOrder: 1 },
      { id: 1, sortOrder: 2 },
    ])
  })
})

describe('buildTemplateRows', () => {
  const categories = [{ id: 10, remoteKey: 'category_food' }]
  const budgets = [{ id: 20, remoteKey: 'budget_trip' }]
  const base = {
    name: '早餐',
    amountTwd: null,
    payer: null,
    expenseKind: null,
    categoryRemoteKey: null,
    budgetRemoteKey: null,
    deletedAt: null,
  }

  it('sorts by sortOrder, then createdAt, and skips deleted templates', () => {
    const rows = buildTemplateRows(
      [
        { ...base, id: 1, name: 'B', sortOrder: 2, createdAt: '2026-10-01' },
        { ...base, id: 2, name: 'A2', sortOrder: 1, createdAt: '2026-10-03' },
        { ...base, id: 3, name: 'A1', sortOrder: 1, createdAt: '2026-10-02' },
        { ...base, id: 4, name: 'gone', sortOrder: 0, deletedAt: '2026-10-04' },
      ],
      { categories, budgets },
    )
    expect(rows.map((row) => row.name)).toEqual(['A1', 'A2', 'B'])
  })

  it('resolves category and budget remote keys to local ids', () => {
    const [row] = buildTemplateRows(
      [
        {
          ...base,
          id: 1,
          sortOrder: 1,
          amountTwd: 60,
          payer: '小明',
          expenseKind: '個人',
          categoryRemoteKey: 'category_food',
          budgetRemoteKey: 'budget_trip',
        },
      ],
      { categories, budgets },
    )
    expect(row).toEqual({
      id: 1,
      name: '早餐',
      amountTwd: 60,
      categoryId: 10,
      budgetId: 20,
      payer: '小明',
      expenseKind: '個人',
      sortOrder: 1,
    })
  })

  it('leaves links to missing categories or budgets empty', () => {
    const [row] = buildTemplateRows(
      [{ ...base, id: 1, sortOrder: 1, categoryRemoteKey: 'category_gone', budgetRemoteKey: 'budget_gone' }],
      { categories, budgets },
    )
    expect(row.categoryId).toBeNull()
    expect(row.budgetId).toBeNull()
  })
})
