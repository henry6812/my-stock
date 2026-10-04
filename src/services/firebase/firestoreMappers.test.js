import { describe, it, expect } from 'vitest'
import {
  buildExpenseTemplateKey,
  expenseTemplateToRemote,
  remoteToExpenseTemplate,
} from './firestoreMappers'

const template = {
  id: 7,
  remoteKey: 'template_abc',
  name: '停車',
  amountTwd: 60,
  categoryId: 3,
  categoryRemoteKey: 'category_x',
  budgetId: 4,
  budgetRemoteKey: 'budget_y',
  payer: '小明',
  expenseKind: '個人',
  sortOrder: 2,
  createdAt: '2026-10-04T00:00:00.000Z',
  updatedAt: '2026-10-04T01:00:00.000Z',
  deletedAt: null,
}

describe('buildExpenseTemplateKey', () => {
  it('uses the remote key, falling back to the local id', () => {
    expect(buildExpenseTemplateKey(template)).toBe('template_abc')
    expect(buildExpenseTemplateKey({ id: 9 })).toBe('template_9')
  })
})

describe('expenseTemplateToRemote', () => {
  it('stores association remote keys, not local ids', () => {
    expect(expenseTemplateToRemote(template)).toEqual({
      remoteKey: 'template_abc',
      name: '停車',
      amountTwd: 60,
      categoryRemoteKey: 'category_x',
      budgetRemoteKey: 'budget_y',
      payer: '小明',
      expenseKind: '個人',
      sortOrder: 2,
      createdAt: '2026-10-04T00:00:00.000Z',
      updatedAt: '2026-10-04T01:00:00.000Z',
      deletedAt: null,
      clientUpdatedAt: '2026-10-04T01:00:00.000Z',
    })
  })

  it('writes null for an unset amount', () => {
    expect(expenseTemplateToRemote({ ...template, amountTwd: null }).amountTwd).toBeNull()
    expect(expenseTemplateToRemote({ ...template, amountTwd: undefined }).amountTwd).toBeNull()
  })
})

describe('remoteToExpenseTemplate', () => {
  it('round-trips the remote shape', () => {
    const remote = expenseTemplateToRemote(template)
    expect(remoteToExpenseTemplate(remote)).toEqual({
      remoteKey: 'template_abc',
      name: '停車',
      amountTwd: 60,
      categoryRemoteKey: 'category_x',
      budgetRemoteKey: 'budget_y',
      payer: '小明',
      expenseKind: '個人',
      sortOrder: 2,
      createdAt: '2026-10-04T00:00:00.000Z',
      updatedAt: '2026-10-04T01:00:00.000Z',
      deletedAt: null,
    })
  })

  it('normalizes missing or invalid fields', () => {
    const result = remoteToExpenseTemplate({
      remoteKey: 'template_z',
      name: '咖啡',
      amountTwd: 'abc',
      clientUpdatedAt: '2026-10-04T02:00:00.000Z',
    })
    expect(result.amountTwd).toBeNull()
    expect(result.sortOrder).toBe(0)
    expect(result.categoryRemoteKey).toBeNull()
    expect(result.budgetRemoteKey).toBeNull()
    expect(result.payer).toBeNull()
    expect(result.updatedAt).toBe('2026-10-04T02:00:00.000Z')
  })
})
