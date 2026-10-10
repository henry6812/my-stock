import { describe, it, expect } from 'vitest'
import {
  GOAL_KIND,
  averageMonthlyExpense,
  buildSavingsGoalRows,
  computeGoalProgress,
  getGoalFacts,
  getGoalIconKey,
  getGoalNote,
  getGoalTargetLabel,
  getNextGoalSortOrder,
  normalizeGoalIcon,
  normalizeSavingsGoalInput,
  planGoalAccountRelink,
  resolveGoalIcon,
  getGoalsUsingCashAccount,
} from './savingsGoals'

const TODAY = '2026-10-10'

describe('goal icons', () => {
  it('maps names to icons by keyword, falling back to savings', () => {
    expect(getGoalIconKey('緊急預備金')).toBe('emergency')
    expect(getGoalIconKey('買車')).toBe('car')
    expect(getGoalIconKey('日本旅遊')).toBe('travel')
    expect(getGoalIconKey('換手機')).toBe('phone')
    expect(getGoalIconKey('買房頭期款')).toBe('home')
    expect(getGoalIconKey('結婚基金')).toBe('wedding')
    expect(getGoalIconKey('小孩教育')).toBe('education')
    expect(getGoalIconKey('新筆電')).toBe('computer')
    expect(getGoalIconKey('3c 升級')).toBe('computer')
    expect(getGoalIconKey('醫療備用')).toBe('medical')
    expect(getGoalIconKey('隨便存')).toBe('savings')
    expect(getGoalIconKey('')).toBe('savings')
  })

  it('prefers a stored icon, ignoring unknown keys', () => {
    expect(resolveGoalIcon({ icon: 'car', name: '日本旅遊' })).toBe('car')
    expect(resolveGoalIcon({ icon: 'nope', name: '日本旅遊' })).toBe('travel')
    expect(normalizeGoalIcon('nope')).toBeNull()
    expect(normalizeGoalIcon('home')).toBe('home')
  })
})

describe('averageMonthlyExpense', () => {
  const month = (m, expenseTwd, isCurrent = false) => ({ month: m, expenseTwd, isCurrent })

  it('averages the complete months, leaving out the current one', () => {
    const rows = [month('2026-08', 30000), month('2026-09', 50000), month('2026-10', 999999, true)]
    expect(averageMonthlyExpense(rows)).toEqual({ averageTwd: 40000, monthsUsed: 2 })
  })

  it('uses only the latest 12 complete months', () => {
    const rows = [month('2025-09', 1000000)]
    for (let m = 10; m <= 12; m += 1) rows.push(month(`2025-${m}`, 12000))
    for (let m = 1; m <= 9; m += 1) rows.push(month(`2026-0${m}`, 12000))
    rows.push(month('2026-10', 0, true))
    expect(averageMonthlyExpense(rows)).toEqual({ averageTwd: 12000, monthsUsed: 12 })
  })

  it('counts a month with no expenses as 0', () => {
    expect(averageMonthlyExpense([month('2026-08', 20000), month('2026-09', 0)])).toEqual({ averageTwd: 10000, monthsUsed: 2 })
  })

  it('leaves out a first month that started mid-month', () => {
    const rows = [month('2026-07', 5000), month('2026-08', 30000), month('2026-09', 50000), month('2026-10', 1, true)]
    expect(averageMonthlyExpense(rows, { firstExpenseDate: '2026-07-25' })).toEqual({ averageTwd: 40000, monthsUsed: 2 })
    expect(averageMonthlyExpense(rows, { firstExpenseDate: '2026-07-01' })).toEqual({ averageTwd: 28333, monthsUsed: 3 })
    expect(averageMonthlyExpense([month('2026-09', 500), month('2026-10', 1, true)], { firstExpenseDate: '2026-09-20' })).toEqual({ averageTwd: null, monthsUsed: 0 })
  })

  it('reports no average without a complete month', () => {
    expect(averageMonthlyExpense([month('2026-10', 5000, true)])).toEqual({ averageTwd: null, monthsUsed: 0 })
    expect(averageMonthlyExpense([])).toEqual({ averageTwd: null, monthsUsed: 0 })
  })
})

describe('computeGoalProgress — deadline', () => {
  // 2026-01-01 → 2027-01-01 is 365 days; 2026-10-10 is day 282.
  const goal = {
    kind: GOAL_KIND.DEADLINE,
    targetTwd: 120000,
    startTwd: 0,
    startDate: '2026-01-01',
    deadline: '2027-01-01',
    today: TODAY,
  }

  it('is on track at or above the straight line from start to target', () => {
    const result = computeGoalProgress({ ...goal, currentTwd: 93000 })
    expect(result.expectedTwd).toBe(92712)
    expect(result.status).toBe('on-track')
    expect(result.daysLeft).toBe(83)
    expect(result.shortfallTwd).toBe(27000)
    // 83 days → 3 months left.
    expect(result.monthlyNeededTwd).toBe(9000)
    expect(result.progressRatio).toBeCloseTo(0.775)
  })

  it('is behind below the line', () => {
    expect(computeGoalProgress({ ...goal, currentTwd: 50000 }).status).toBe('behind')
  })

  it('measures the line from the starting amount', () => {
    const result = computeGoalProgress({ ...goal, startTwd: 60000, currentTwd: 100000 })
    expect(result.expectedTwd).toBe(106356)
    expect(result.status).toBe('behind')
  })

  it('is achieved once the target is reached, even after the deadline', () => {
    expect(computeGoalProgress({ ...goal, currentTwd: 120000 }).status).toBe('achieved')
    expect(computeGoalProgress({ ...goal, currentTwd: 130000, today: '2027-03-01' })).toMatchObject({
      status: 'achieved',
      progressRatio: 1,
      shortfallTwd: 0,
      monthlyNeededTwd: null,
    })
  })

  it('is overdue the day after the deadline, not on it', () => {
    expect(computeGoalProgress({ ...goal, currentTwd: 10, today: '2027-01-01' }).status).toBe('behind')
    expect(computeGoalProgress({ ...goal, currentTwd: 10, today: '2027-01-02' })).toMatchObject({
      status: 'overdue',
      daysLeft: 0,
      monthlyNeededTwd: null,
    })
  })

  it('needs the whole shortfall in the last month', () => {
    const result = computeGoalProgress({ ...goal, currentTwd: 100000, today: '2026-12-20' })
    expect(result.daysLeft).toBe(12)
    expect(result.monthlyNeededTwd).toBe(20000)
  })

  it('expects nothing yet before the start date', () => {
    const result = computeGoalProgress({ ...goal, currentTwd: 0, today: '2025-12-31' })
    expect(result.expectedTwd).toBe(0)
    expect(result.status).toBe('on-track')
  })
})

describe('computeGoalProgress — open and ongoing', () => {
  it('open goals are in progress until reached', () => {
    expect(computeGoalProgress({ kind: GOAL_KIND.OPEN, targetTwd: 50000, currentTwd: 20000, today: TODAY })).toMatchObject({
      status: 'in-progress',
      shortfallTwd: 30000,
      expectedTwd: null,
      monthlyNeededTwd: null,
    })
    expect(computeGoalProgress({ kind: GOAL_KIND.OPEN, targetTwd: 50000, currentTwd: 50000, today: TODAY }).status).toBe('achieved')
  })

  it('ongoing goals are sufficient or below', () => {
    expect(computeGoalProgress({ kind: GOAL_KIND.ONGOING, targetTwd: 300000, currentTwd: 310000, today: TODAY }).status).toBe('sufficient')
    expect(computeGoalProgress({ kind: GOAL_KIND.ONGOING, targetTwd: 300000, currentTwd: 200000, today: TODAY })).toMatchObject({
      status: 'below',
      shortfallTwd: 100000,
    })
  })

  it('has no status without a target', () => {
    expect(computeGoalProgress({ kind: GOAL_KIND.ONGOING, targetTwd: null, currentTwd: 5000, today: TODAY })).toEqual({
      status: 'insufficient-data',
      progressRatio: 0,
      shortfallTwd: null,
      expectedTwd: null,
      monthlyNeededTwd: null,
      daysLeft: null,
    })
  })
})

describe('normalizeSavingsGoalInput', () => {
  const ctx = { today: TODAY, previousDeadline: null }

  it('keeps only the fields of the chosen kind', () => {
    expect(
      normalizeSavingsGoalInput(
        { name: ' 日本旅遊 ', icon: 'travel', kind: 'deadline', targetTwd: '150000.4', targetMonths: 6, deadline: '2027-03-31', cashAccountKeys: ['a', 'a', ' ', 'b'] },
        ctx,
      ),
    ).toEqual({ name: '日本旅遊', icon: 'travel', kind: 'deadline', targetTwd: 150000, targetMonths: null, deadline: '2027-03-31', cashAccountKeys: ['a', 'b'] })
    expect(normalizeSavingsGoalInput({ name: '存錢', kind: 'open', targetTwd: 1000, deadline: '2027-01-01' }, ctx)).toEqual({
      name: '存錢', icon: null, kind: 'open', targetTwd: 1000, targetMonths: null, deadline: null, cashAccountKeys: [],
    })
    expect(normalizeSavingsGoalInput({ name: '預備金', kind: 'ongoing', targetMonths: 6, targetTwd: 5 }, ctx)).toEqual({
      name: '預備金', icon: null, kind: 'ongoing', targetTwd: null, targetMonths: 6, deadline: null, cashAccountKeys: [],
    })
  })

  it('rejects invalid input', () => {
    expect(() => normalizeSavingsGoalInput({ name: '  ', kind: 'open', targetTwd: 1 }, ctx)).toThrow('Goal name is required')
    expect(() => normalizeSavingsGoalInput({ name: 'x', kind: 'weird', targetTwd: 1 }, ctx)).toThrow('Invalid goal kind')
    expect(() => normalizeSavingsGoalInput({ name: 'x', kind: 'open', targetTwd: 0 }, ctx)).toThrow('Goal target must be a positive number')
    expect(() => normalizeSavingsGoalInput({ name: 'x', kind: 'ongoing', targetMonths: 25 }, ctx)).toThrow('Goal months must be 1-24')
    expect(() => normalizeSavingsGoalInput({ name: 'x', kind: 'ongoing', targetMonths: 2.5 }, ctx)).toThrow('Goal months must be 1-24')
    expect(() => normalizeSavingsGoalInput({ name: 'x', kind: 'deadline', targetTwd: 1 }, ctx)).toThrow('Goal deadline is required')
    expect(() => normalizeSavingsGoalInput({ name: 'x', kind: 'deadline', targetTwd: 1, deadline: TODAY }, ctx)).toThrow('Goal deadline must be after today')
  })

  it('lets an overdue goal keep its deadline', () => {
    expect(
      normalizeSavingsGoalInput(
        { name: 'x', kind: 'deadline', targetTwd: 1, deadline: '2026-05-01' },
        { today: TODAY, previousDeadline: '2026-05-01' },
      ).deadline,
    ).toBe('2026-05-01')
    expect(() =>
      normalizeSavingsGoalInput(
        { name: 'x', kind: 'deadline', targetTwd: 1, deadline: '2026-06-01' },
        { today: TODAY, previousDeadline: '2026-05-01' },
      ),
    ).toThrow('Goal deadline must be after today')
  })
})

describe('getNextGoalSortOrder / planGoalAccountRelink', () => {
  it('puts a new goal after the live ones', () => {
    expect(getNextGoalSortOrder([])).toBe(1)
    expect(getNextGoalSortOrder([{ sortOrder: 3 }, { sortOrder: 9, deletedAt: '2026-01-01' }])).toBe(4)
  })

  it('points goals at the renamed account key, once each', () => {
    const goals = [
      { id: 1, cashAccountKeys: ['old', 'other'] },
      { id: 2, cashAccountKeys: ['other'] },
      { id: 3, cashAccountKeys: ['old', 'new'] },
    ]
    expect(planGoalAccountRelink(goals, { old: 'new' })).toEqual([
      { goal: goals[0], cashAccountKeys: ['new', 'other'] },
      { goal: goals[2], cashAccountKeys: ['new'] },
    ])
    expect(planGoalAccountRelink(goals, {})).toEqual([])
  })
})

describe('buildSavingsGoalRows', () => {
  const account = (key, balanceTwd, extra = {}) => ({ key, bankName: '台新', accountAlias: key, holder: 'Po', balanceTwd, deletedAt: null, ...extra })
  const goal = (id, extra) => ({
    id,
    remoteKey: `goal_${id}`,
    name: `目標${id}`,
    icon: null,
    kind: 'open',
    targetTwd: 100000,
    targetMonths: null,
    deadline: null,
    startTwd: 0,
    startDate: '2026-01-01',
    cashAccountKeys: [],
    sortOrder: id,
    archivedAt: null,
    deletedAt: null,
    ...extra,
  })
  const summaries = [
    { month: '2026-08', expenseTwd: 40000, isCurrent: false },
    { month: '2026-09', expenseTwd: 60000, isCurrent: false },
    { month: '2026-10', expenseTwd: 1000, isCurrent: true },
  ]

  it('adds up linked balances; a shared account counts in full for each goal', () => {
    const rows = buildSavingsGoalRows({
      goals: [goal(1, { cashAccountKeys: ['a', 'b'] }), goal(2, { cashAccountKeys: ['b'] })],
      cashAccounts: [account('a', 30000), account('b', 20000)],
      monthlySummaries: summaries,
      today: TODAY,
    })
    expect(rows.map((row) => row.currentTwd)).toEqual([50000, 20000])
    expect(rows[0].accounts.find((item) => item.key === 'b').sharedWith).toEqual(['目標2'])
    expect(rows[0].accounts.find((item) => item.key === 'a').sharedWith).toEqual([])
    expect(rows[1].accounts[0].sharedWith).toEqual(['目標1'])
  })

  it('does not list archived or deleted goals as sharing an account', () => {
    const rows = buildSavingsGoalRows({
      goals: [
        goal(1, { cashAccountKeys: ['a'] }),
        goal(2, { cashAccountKeys: ['a'], archivedAt: '2026-10-01T00:00:00.000Z' }),
        goal(3, { cashAccountKeys: ['a'], deletedAt: '2026-10-01T00:00:00.000Z' }),
      ],
      cashAccounts: [account('a', 1)],
      monthlySummaries: [],
      today: TODAY,
    })
    expect(rows.map((row) => row.id)).toEqual([1, 2])
    expect(rows[0].accounts[0].sharedWith).toEqual([])
    expect(rows[1]).toMatchObject({ isArchived: true })
  })

  it('skips deleted or unknown accounts and counts them', () => {
    const [row] = buildSavingsGoalRows({
      goals: [goal(1, { cashAccountKeys: ['a', 'gone', 'unknown'] })],
      cashAccounts: [account('a', 30000), account('gone', 99999, { deletedAt: '2026-10-01T00:00:00.000Z' })],
      monthlySummaries: [],
      today: TODAY,
    })
    expect(row.currentTwd).toBe(30000)
    expect(row.accounts.map((item) => item.key)).toEqual(['a'])
    expect(row.missingAccountCount).toBe(2)
  })

  it('sizes an ongoing goal from average monthly spending', () => {
    const [row] = buildSavingsGoalRows({
      goals: [goal(1, { kind: 'ongoing', targetTwd: null, targetMonths: 6, cashAccountKeys: ['a'] })],
      cashAccounts: [account('a', 250000)],
      monthlySummaries: summaries,
      today: TODAY,
    })
    expect(row).toMatchObject({
      targetTwd: 300000,
      averageMonthlyExpenseTwd: 50000,
      monthsUsed: 2,
      status: 'below',
      shortfallTwd: 50000,
    })
  })

  it('sizes an ongoing goal from complete months only', () => {
    const [row] = buildSavingsGoalRows({
      goals: [goal(1, { kind: 'ongoing', targetTwd: null, targetMonths: 6 })],
      cashAccounts: [],
      monthlySummaries: summaries,
      firstExpenseDate: '2026-08-15',
      today: TODAY,
    })
    expect(row).toMatchObject({ targetTwd: 360000, averageMonthlyExpenseTwd: 60000, monthsUsed: 1 })
  })

  it('has no ongoing target without spending history', () => {
    const [row] = buildSavingsGoalRows({
      goals: [goal(1, { kind: 'ongoing', targetTwd: null, targetMonths: 6 })],
      cashAccounts: [],
      monthlySummaries: [{ month: '2026-10', expenseTwd: 500, isCurrent: true }],
      today: TODAY,
    })
    expect(row).toMatchObject({ targetTwd: null, status: 'insufficient-data', currentTwd: 0, progressRatio: 0 })
  })

  it('orders by sortOrder and resolves the icon', () => {
    const rows = buildSavingsGoalRows({
      goals: [goal(1, { sortOrder: 5, name: '買車' }), goal(2, { sortOrder: 2, icon: 'home' })],
      cashAccounts: [],
      monthlySummaries: [],
      today: TODAY,
    })
    expect(rows.map((row) => [row.id, row.iconKey])).toEqual([[2, 'home'], [1, 'car']])
  })
})

describe('goal text', () => {
  const base = {
    kind: 'deadline',
    targetTwd: 150000,
    targetMonths: null,
    deadline: '2027-03-31',
    cashAccountKeys: ['a'],
    status: 'behind',
    shortfallTwd: 64000,
    expectedTwd: 90000,
    monthlyNeededTwd: 12800,
    daysLeft: 172,
    averageMonthlyExpenseTwd: null,
    monthsUsed: null,
  }

  it('labels the target, with months for ongoing goals', () => {
    expect(getGoalTargetLabel(base)).toBe('目標 $150,000')
    expect(getGoalTargetLabel({ ...base, kind: 'ongoing', targetTwd: 540000, targetMonths: 6 })).toBe('目標 $540,000（6 個月）')
    expect(getGoalTargetLabel({ ...base, kind: 'ongoing', targetTwd: null, targetMonths: 6 })).toBe('目標 6 個月支出')
  })

  it('writes the card note per kind and status', () => {
    // The card shows what is left in total; the monthly figure is in the
    // detail (on its own it read as the total still to save).
    expect(getGoalNote(base)).toBe('還差 $64,000・2027/03 前')
    expect(getGoalNote({ ...base, status: 'overdue' })).toBe('還差 $64,000・2027/03 前')
    expect(getGoalNote({ ...base, status: 'achieved', shortfallTwd: 0 })).toBe('2027/03 前')
    expect(getGoalNote({ ...base, kind: 'open', status: 'in-progress', shortfallTwd: 3000 })).toBe('還差 $3,000')
    expect(getGoalNote({ ...base, kind: 'open', status: 'achieved' })).toBeNull()
    expect(getGoalNote({ ...base, kind: 'ongoing', status: 'below', shortfallTwd: 5000 })).toBe('還差 $5,000')
    expect(getGoalNote({ ...base, cashAccountKeys: [] })).toBe('尚未選擇帳戶')
  })

  it('lists detail facts per kind', () => {
    expect(getGoalFacts(base)).toEqual([
      { label: '到期日', value: '2027/03/31' },
      { label: '剩餘', value: '172 天' },
      { label: '還差', value: '$64,000' },
      { label: '應有進度', value: '$90,000' },
      { label: '每月需再存', value: '$12,800' },
    ])
    expect(getGoalFacts({ ...base, status: 'overdue' })).toEqual([
      { label: '到期日', value: '2027/03/31' },
      { label: '還差', value: '$64,000' },
    ])
    expect(getGoalFacts({ ...base, status: 'achieved', shortfallTwd: 0 })).toEqual([{ label: '到期日', value: '2027/03/31' }])
    expect(getGoalFacts({ ...base, kind: 'open', status: 'in-progress', shortfallTwd: 3000 })).toEqual([{ label: '還差', value: '$3,000' }])
    expect(
      getGoalFacts({ ...base, kind: 'ongoing', status: 'below', targetTwd: 300000, targetMonths: 6, averageMonthlyExpenseTwd: 50000, monthsUsed: 2, shortfallTwd: 10 }),
    ).toEqual([
      { label: '計算方式', value: '平均月支出 $50,000 × 6 個月 = $300,000' },
      { label: '依據', value: '近 2 個完整月的支出' },
      { label: '還差', value: '$10' },
    ])
    expect(getGoalFacts({ ...base, kind: 'ongoing', status: 'insufficient-data', targetTwd: null, targetMonths: 6 })).toEqual([
      { label: '計算方式', value: '還沒有完整月份的支出資料' },
    ])
  })
})

describe('getGoalsUsingCashAccount', () => {
  const rows = [
    { id: 1, name: '舊目標', cashAccountKeys: ['a'], isArchived: true },
    { id: 2, name: '旅遊', cashAccountKeys: ['b'], isArchived: false },
    { id: 3, name: '緊急', cashAccountKeys: ['b', 'a'], isArchived: false },
  ]

  it('lists open goals counting the account, then archived ones', () => {
    expect(getGoalsUsingCashAccount(rows, 'a').map((goal) => goal.id)).toEqual([3, 1])
    expect(getGoalsUsingCashAccount(rows, 'b').map((goal) => goal.id)).toEqual([2, 3])
  })

  it('returns nothing without a key or a match', () => {
    expect(getGoalsUsingCashAccount(rows, 'z')).toEqual([])
    expect(getGoalsUsingCashAccount(rows, undefined)).toEqual([])
  })
})
