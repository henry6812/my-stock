import { describe, it, expect } from 'vitest'
import {
  buildExpenseTemplateKey,
  buildSavingsGoalKey,
  savingsGoalToRemote,
  remoteToSavingsGoal,
  expenseTemplateToRemote,
  remoteToExpenseTemplate,
  appConfigToRemote,
  remoteToAppConfig,
  expenseCategoryToRemote,
  remoteToExpenseCategory,
  holdingToRemote,
  remoteToHolding,
  buildWatchlistKey,
  watchlistItemToRemote,
  remoteToWatchlistItem,
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
describe('valuation settings in app_config', () => {
  const record = {
    key: 'valuation:TW_2330',
    valuation: { peCheap: 12, peFair: null, peExpensive: 20, growthRate: 0.1, forwardEps: null },
    updatedAt: '2026-10-05T00:00:00.000Z',
  }

  it('round-trips the valuation object', () => {
    const remote = appConfigToRemote(record)
    expect(remote.valuation).toEqual(record.valuation)
    expect(remoteToAppConfig(remote).valuation).toEqual(record.valuation)
  })

  it('omits valuation for other config docs', () => {
    expect(appConfigToRemote({ key: 'income_settings', updatedAt: 'x' })).not.toHaveProperty('valuation')
    expect(remoteToAppConfig({ key: 'income_settings' }).valuation).toBeUndefined()
  })
})

describe('expense category icon', () => {
  const category = {
    remoteKey: 'category_a',
    name: '外食',
    icon: 'coffee',
    isQuickPick: true,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-02T00:00:00.000Z',
    deletedAt: null,
  }

  it('round-trips a picked icon', () => {
    const remote = expenseCategoryToRemote(category)
    expect(remote.icon).toBe('coffee')
    expect(remoteToExpenseCategory(remote).icon).toBe('coffee')
  })

  it('stores null for no icon or an unknown one', () => {
    expect(expenseCategoryToRemote({ ...category, icon: undefined }).icon).toBeNull()
    expect(remoteToExpenseCategory({ ...category, icon: 'rocket' }).icon).toBeNull()
    expect(remoteToExpenseCategory({ name: '舊分類' }).icon).toBeNull()
  })
})

const baseGoal = {
  id: 7,
  remoteKey: 'goal_abc',
  name: '日本旅遊',
  icon: 'travel',
  kind: 'deadline',
  targetTwd: 150000,
  targetMonths: null,
  deadline: '2027-03-31',
  startTwd: 20000,
  startDate: '2026-10-10',
  cashAccountKeys: ['812_台新_日常_Po'],
  sortOrder: 2,
  archivedAt: null,
  createdAt: '2026-10-10T00:00:00.000Z',
  updatedAt: '2026-10-10T00:00:00.000Z',
  deletedAt: null,
}

describe('savings goal mappers', () => {
  it('keys the doc by remote key, falling back to the local id', () => {
    expect(buildSavingsGoalKey(baseGoal)).toBe('goal_abc')
    expect(buildSavingsGoalKey({ id: 3 })).toBe('goal_3')
  })

  it('round-trips the remote shape without the local id', () => {
    const remote = savingsGoalToRemote(baseGoal)
    expect(remote).not.toHaveProperty('id')
    expect(remote.clientUpdatedAt).toBe(baseGoal.updatedAt)
    const { id, ...rest } = baseGoal
    void id
    expect(remoteToSavingsGoal(remote)).toEqual(rest)
  })

  it('normalizes missing or invalid fields', () => {
    expect(remoteToSavingsGoal({ remoteKey: 'goal_x', name: 'x', kind: 'weird', icon: 'nope', cashAccountKeys: ['a', 3, ''], targetTwd: '12' })).toMatchObject({
      kind: 'open',
      icon: null,
      cashAccountKeys: ['a'],
      targetTwd: 12,
      targetMonths: null,
      startTwd: 0,
      sortOrder: 0,
      archivedAt: null,
      deletedAt: null,
    })
  })
})

describe('holding totalCost', () => {
  const holding = {
    symbol: '2330',
    market: 'TW',
    assetTag: 'STOCK',
    holder: 'Po',
    shares: 100,
    totalCost: 50000,
    companyName: '台積電',
    sortOrder: 1,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    deletedAt: null,
  }

  it('round-trips through the remote shape', () => {
    expect(remoteToHolding(holdingToRemote(holding)).totalCost).toBe(50000)
  })

  it('stores an unset cost as null', () => {
    expect(holdingToRemote({ ...holding, totalCost: undefined }).totalCost).toBeNull()
  })

  it('reads a missing or invalid remote cost as unset', () => {
    const remote = holdingToRemote(holding)
    expect(remoteToHolding({ ...remote, totalCost: undefined }).totalCost).toBeNull()
    expect(remoteToHolding({ ...remote, totalCost: -5 }).totalCost).toBeNull()
    expect(remoteToHolding({ ...remote, totalCost: '62400' }).totalCost).toBe(62400)
  })
})

describe('watchlist mappers', () => {
  const item = {
    id: 3,
    remoteKey: 'TW_2330',
    market: 'TW',
    symbol: '2330',
    name: '台積電',
    latestPrice: 1000,
    previousClose: 990,
    currency: 'TWD',
    priceUpdatedAt: '2026-10-13T06:00:00.000Z',
    createdAt: '2026-10-13T05:00:00.000Z',
    updatedAt: '2026-10-13T06:00:00.000Z',
    deletedAt: null,
    syncState: 'pending',
  }

  it('keys the doc by market and symbol', () => {
    expect(buildWatchlistKey(item)).toBe('TW_2330')
    expect(buildWatchlistKey({ market: 'US', symbol: 'NVDA' })).toBe('US_NVDA')
  })

  it('round-trips the fields without local-only ones', () => {
    const remote = watchlistItemToRemote(item)
    expect(remote).not.toHaveProperty('id')
    expect(remote).not.toHaveProperty('syncState')
    expect(remote.clientUpdatedAt).toBe(item.updatedAt)
    const { id: _id, syncState: _syncState, ...fields } = item
    expect(remoteToWatchlistItem(remote)).toEqual(fields)
  })

  it('keeps a missing price as null', () => {
    const remote = watchlistItemToRemote({ ...item, latestPrice: null, previousClose: undefined, priceUpdatedAt: null })
    const local = remoteToWatchlistItem(remote)
    expect(local.latestPrice).toBeNull()
    expect(local.previousClose).toBeNull()
    expect(local.priceUpdatedAt).toBeNull()
  })

  it('defaults the currency from the market', () => {
    expect(remoteToWatchlistItem({ market: 'US', symbol: 'NVDA' }).currency).toBe('USD')
    expect(remoteToWatchlistItem({ market: 'TW', symbol: '2330' }).currency).toBe('TWD')
  })
})

describe('app_config screen settings', () => {
  it('round-trips the screen map', () => {
    const screen = { version: 1, industries: ['24'], flags: { nonOperating: { enabled: true, max: 0.3 } } }
    const remote = appConfigToRemote({ key: 'stock_screen:settings', screen, updatedAt: '2026-10-15T00:00:00.000Z' })
    expect(remote.screen).toEqual(screen)
    expect(remoteToAppConfig(remote).screen).toEqual(screen)
    expect(appConfigToRemote({ key: 'x', updatedAt: 't' })).not.toHaveProperty('screen')
  })
})
