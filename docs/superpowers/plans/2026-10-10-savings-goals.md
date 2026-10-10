# 儲蓄目標 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在支出分析頁新增「儲蓄目標」：多個目標、各自圖示，進度由綁定的現金帳戶餘額自動計算，可看細節、編輯、封存、刪除。

**Architecture:** 新的 `savings_goals` 表走跟 `expense_templates` 一樣的路徑（本地 `PersistedInMemoryTable` + Firestore `users/{uid}/savings_goals`，以 `remoteKey` 當 doc id）。目標用現金帳戶的 cloud key（`buildCashAccountKey`）連結帳戶，因為本地 id 各裝置不同。所有計算在純函式 `src/utils/savingsGoals.js`，`getExpenseDashboardView` 把算好的 rows 交給 UI；UI 是四個新元件，`App.jsx` 只負責 state 與接線。

**Tech Stack:** React 19、Ant Design 6、`iconoir-react`、`dayjs`、Vitest + `@testing-library/react`。

**Spec:** `docs/superpowers/specs/2026-10-10-savings-goals-design.md`

## Global Constraints

- 所有指令都在 `my-stock/` 下執行。測試：`npx vitest run <path>`；lint：`npx eslint <path>`。
- UI 文案繁體中文（台灣）；金額一律 TWD，用 `formatTwd`（`src/utils/formatters.js`，輸出如 `$21,850`）。
- CSS 顏色、字級、圓角、間距只用 token（`var(--c-*)`、`var(--fs-*)`、`var(--radius-*)`、`var(--space-*)`、`var(--icon-*)`）；只有邊框粗細可以寫 px（沿用既有 `1px` / `2px`）。不寫死 hex。
- 新 token（使用者 2026-10-10 同意）：`warn-soft` `#F6EBD3`、`down-soft` `#F7DEDF`。同時寫進 `src/index.css`、`src/theme/tokens.js`、`DESIGN.md` frontmatter。
- 不用 lint disable 註解。
- 寫入需登入：每個 mutating service 開頭呼叫 `ensureCloudWritable()`，再用 `mirrorToCloud`（先寫 Firestore 再套用本地）。
- 支出頁的 display 大數字只有摘要卡的總支出；目標卡金額用 `--fs-title`。目標卡的容器圖是靜態的，不加動畫。
- 目標類型字串：`'deadline'`、`'open'`、`'ongoing'`。常態型月數 1–24，表單預設 6。
- Commit message 結尾加：`Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`

## Review Focus

1. **編輯一個已逾期的有期限目標（不改到期日）必須能儲存** — 到期日只在「新設或被改動」時才要求晚於今天。Task 1（`normalizeSavingsGoalInput` 的 `previousDeadline`）與 Task 8（表單 validator）各有測試。
2. **改了現金帳戶的持有人（或持有人改名）後，目標仍追蹤同一個帳戶** — 帳戶 cloud key 會變，目標要跟著改指向。Task 3 有測試。
3. **在 A 裝置建立的目標同步到 B 裝置後仍連到正確帳戶** — 連結存 cloud key、不存本地 id；mapper round-trip 與 view 都以 key 解析。Task 2、Task 3 有測試。
4. **同一個帳戶被兩個目標使用** — 兩邊都計入全額；「也計入」只列其他**未封存**的目標，不列自己。Task 1 有測試。
5. **綁定的帳戶被刪除** — 目前金額扣掉它、顯示「N 個帳戶已刪除」，不會 NaN；同銀行同別名同持有人重建後自動接回（key 相同）。Task 1 有測試。

---

## File Structure

| 檔案 | 責任 |
|---|---|
| `src/utils/savingsGoals.js`（新） | 常數、圖示關鍵字、輸入正規化、進度與狀態計算、rows 組裝、顯示文字 |
| `src/db/database.js` | 新表 `savings_goals` |
| `src/services/portfolioConstants.js` | `CLOUD_COLLECTION.SAVINGS_GOALS` |
| `src/services/firebase/firestoreMappers.js` | `buildSavingsGoalKey`、`savingsGoalToRemote`、`remoteToSavingsGoal` |
| `src/services/firebase/cloudSyncService.js` | 新 collection 的寫入、套用、刪除、訂閱 |
| `src/services/portfolioService.js` | `upsertSavingsGoal`、`setSavingsGoalArchived`、`removeSavingsGoal`、cash key relink、view、備份 |
| `src/components/goalIconComponents.js`（新） | 目標圖示 key → iconoir 元件 |
| `src/components/GoalIcon.jsx`（新） | 圓形圖示 tile |
| `src/components/CategoryIconPicker.jsx` | 可接收圖示清單 |
| `src/components/SavingsGoalCard.jsx`（新） | 卡片 + `GoalCup` + `GoalStatusPill` |
| `src/components/SavingsGoalList.jsx`（新） | 區塊標題、卡片堆疊、已封存、空狀態 |
| `src/components/SavingsGoalDetailSheet.jsx`（新） | 詳細頁 |
| `src/components/SavingsGoalForm.jsx`（新） | 新增／編輯表單 |
| `src/App.css`、`src/index.css`、`src/theme/tokens.js` | 樣式與 token |
| `src/App.jsx` | state 與接線 |
| `DESIGN.md` | 規範更新 |

---

### Task 1: 純邏輯 `src/utils/savingsGoals.js`

**Files:**
- Create: `src/utils/savingsGoals.js`
- Test: `src/utils/savingsGoals.test.js`

**Interfaces:**
- Consumes: `formatTwd` from `src/utils/formatters.js`；`dayjs`。
- Produces:
  - `GOAL_KIND = { DEADLINE: 'deadline', OPEN: 'open', ONGOING: 'ongoing' }`、`GOAL_KINDS: string[]`
  - `ONGOING_MONTHS_MIN = 1`、`ONGOING_MONTHS_MAX = 24`、`ONGOING_MONTHS_DEFAULT = 6`
  - `GOAL_ICON_OPTIONS: {key,label}[]`（10 個）、`GOAL_ICON_KEYS: string[]`
  - `getGoalIconKey(name: string) => string`、`normalizeGoalIcon(value) => string|null`、`resolveGoalIcon({icon,name}) => string`
  - `GOAL_STATUS_META: Record<status, {label, tone: 'teal'|'warn'|'down'|'muted'}>`
  - `averageMonthlyExpense(monthlySummaries) => { averageTwd: number|null, monthsUsed: number }`
  - `computeGoalProgress({kind,targetTwd,startTwd,startDate,deadline,currentTwd,today}) => { status, progressRatio, shortfallTwd, expectedTwd, monthlyNeededTwd, daysLeft }`
  - `normalizeSavingsGoalInput(input, { today, previousDeadline }) => { name, icon, kind, targetTwd, targetMonths, deadline, cashAccountKeys }`（不合法時 throw）
  - `getNextGoalSortOrder(goals) => number`
  - `planGoalAccountRelink(goals, keyMap) => { goal, cashAccountKeys }[]`
  - `buildSavingsGoalRows({ goals, cashAccounts, monthlySummaries, today }) => GoalRow[]`，其中 `cashAccounts` 為 `{ key, bankName, accountAlias, holder, balanceTwd, deletedAt }[]`
  - `GoalRow` = `{ id, remoteKey, name, icon, iconKey, kind, targetTwd, targetMonths, deadline, startTwd, startDate, cashAccountKeys, sortOrder, archivedAt, isArchived, currentTwd, accounts: {key,bankName,accountAlias,holder,balanceTwd,sharedWith: string[]}[], missingAccountCount, averageMonthlyExpenseTwd, monthsUsed, status, progressRatio, shortfallTwd, expectedTwd, monthlyNeededTwd, daysLeft }`
  - `getGoalTargetLabel(row) => string`、`getGoalNote(row) => string|null`、`getGoalFacts(row) => {label,value}[]`

- [ ] **Step 1: Write the failing tests**

建立 `src/utils/savingsGoals.test.js`：

```js
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
    expect(getGoalNote(base)).toBe('2027/03 前・每月需再存 $12,800')
    expect(getGoalNote({ ...base, status: 'achieved' })).toBe('2027/03 前')
    expect(getGoalNote({ ...base, kind: 'open', status: 'in-progress', shortfallTwd: 3000 })).toBe('還差 $3,000')
    expect(getGoalNote({ ...base, kind: 'open', status: 'achieved' })).toBeNull()
    expect(getGoalNote({ ...base, kind: 'ongoing', status: 'below', shortfallTwd: 5000 })).toBe('還差 $5,000')
    expect(getGoalNote({ ...base, cashAccountKeys: [] })).toBe('尚未選擇帳戶')
  })

  it('lists detail facts per kind', () => {
    expect(getGoalFacts(base)).toEqual([
      { label: '到期日', value: '2027/03/31' },
      { label: '剩餘', value: '172 天' },
      { label: '應有進度', value: '$90,000' },
      { label: '每月需再存', value: '$12,800' },
    ])
    expect(getGoalFacts({ ...base, status: 'overdue' })).toEqual([{ label: '到期日', value: '2027/03/31' }])
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/utils/savingsGoals.test.js`
Expected: FAIL — `Failed to resolve import "./savingsGoals"`.

- [ ] **Step 3: Write the implementation**

建立 `src/utils/savingsGoals.js`：

```js
// 儲蓄目標: pure helpers. A goal's amount is the sum of the cash accounts it
// links (by cloud key — local ids differ per device); an account may count
// toward several goals in full. portfolioService builds the rows, the UI only
// renders them. Spec: docs/superpowers/specs/2026-10-10-savings-goals-design.md
import dayjs from "dayjs";
import { formatTwd } from "./formatters";

export const GOAL_KIND = {
  DEADLINE: "deadline",
  OPEN: "open",
  ONGOING: "ongoing",
};
export const GOAL_KINDS = Object.values(GOAL_KIND);

export const ONGOING_MONTHS_MIN = 1;
export const ONGOING_MONTHS_MAX = 24;
export const ONGOING_MONTHS_DEFAULT = 6;

// Picker order + accessible names; components/goalIconComponents.js maps the
// keys to iconoir icons.
export const GOAL_ICON_OPTIONS = [
  { key: "savings", label: "存錢" },
  { key: "emergency", label: "緊急預備金" },
  { key: "car", label: "買車" },
  { key: "travel", label: "旅遊" },
  { key: "phone", label: "手機" },
  { key: "home", label: "買房" },
  { key: "wedding", label: "結婚" },
  { key: "education", label: "教育" },
  { key: "computer", label: "電腦" },
  { key: "medical", label: "醫療" },
];
export const GOAL_ICON_KEYS = GOAL_ICON_OPTIONS.map((item) => item.key);

// First rule whose keyword appears in the name wins; no match → savings.
const ICON_RULES = [
  ["emergency", ["預備金", "緊急"]],
  ["car", ["車"]],
  ["travel", ["旅", "出國", "機票"]],
  ["phone", ["手機"]],
  ["home", ["房", "頭期"]],
  ["wedding", ["婚"]],
  ["education", ["教育", "學"]],
  ["computer", ["電腦", "筆電", "3C"]],
  ["medical", ["醫療", "醫"]],
];

export const getGoalIconKey = (name) => {
  const text = String(name ?? "").toUpperCase();
  const rule = ICON_RULES.find(([, keywords]) =>
    keywords.some((keyword) => text.includes(keyword)),
  );
  return rule ? rule[0] : "savings";
};

export const normalizeGoalIcon = (value) =>
  GOAL_ICON_KEYS.includes(value) ? value : null;

export const resolveGoalIcon = ({ icon, name }) =>
  normalizeGoalIcon(icon) ?? getGoalIconKey(name);

export const GOAL_STATUS_META = {
  achieved: { label: "已達成", tone: "teal" },
  overdue: { label: "已逾期", tone: "down" },
  "on-track": { label: "進度正常", tone: "teal" },
  behind: { label: "落後", tone: "warn" },
  "in-progress": { label: "進行中", tone: "teal" },
  sufficient: { label: "足夠", tone: "teal" },
  below: { label: "低於目標", tone: "warn" },
  "insufficient-data": { label: "支出資料不足", tone: "muted" },
};

// Latest 12 complete months (the current month is still running); a month
// with no expenses counts as 0. `monthlySummaries` is buildMonthlySummaries'
// output: ascending, ending at the current month.
export const averageMonthlyExpense = (monthlySummaries = []) => {
  const complete = monthlySummaries.filter((row) => !row.isCurrent).slice(-12);
  if (complete.length === 0) {
    return { averageTwd: null, monthsUsed: 0 };
  }
  const total = complete.reduce(
    (sum, row) => sum + (Number(row.expenseTwd) || 0),
    0,
  );
  return {
    averageTwd: Math.round(total / complete.length),
    monthsUsed: complete.length,
  };
};

export const computeGoalProgress = ({
  kind,
  targetTwd,
  startTwd,
  startDate,
  deadline,
  currentTwd,
  today,
}) => {
  const target = Number(targetTwd);
  if (!(target > 0)) {
    return {
      status: "insufficient-data",
      progressRatio: 0,
      shortfallTwd: null,
      expectedTwd: null,
      monthlyNeededTwd: null,
      daysLeft: null,
    };
  }
  const current = Number(currentTwd) || 0;
  const shortfallTwd = Math.max(0, target - current);
  const base = {
    progressRatio: Math.min(1, Math.max(0, current / target)),
    shortfallTwd,
    expectedTwd: null,
    monthlyNeededTwd: null,
    daysLeft: null,
  };
  if (kind === GOAL_KIND.ONGOING) {
    return { ...base, status: shortfallTwd === 0 ? "sufficient" : "below" };
  }
  if (kind !== GOAL_KIND.DEADLINE) {
    return { ...base, status: shortfallTwd === 0 ? "achieved" : "in-progress" };
  }

  const day = dayjs(today);
  const end = dayjs(deadline);
  const daysLeft = Math.max(0, end.diff(day, "day"));
  if (shortfallTwd === 0) {
    return { ...base, status: "achieved", daysLeft };
  }
  if (day.isAfter(end, "day")) {
    return { ...base, status: "overdue", daysLeft: 0 };
  }
  const start = Number(startTwd) || 0;
  const totalDays = end.diff(dayjs(startDate), "day");
  const elapsed = Math.min(
    totalDays,
    Math.max(0, day.diff(dayjs(startDate), "day")),
  );
  const expectedTwd =
    totalDays > 0
      ? Math.round(start + ((target - start) * elapsed) / totalDays)
      : target;
  const monthsLeft = Math.max(1, Math.ceil(daysLeft / 30));
  return {
    ...base,
    status: current >= expectedTwd ? "on-track" : "behind",
    expectedTwd,
    monthlyNeededTwd: Math.ceil(shortfallTwd / monthsLeft),
    daysLeft,
  };
};

// Throws dev-facing messages; the form validates the same rules in zh-TW.
// A deadline must be after today unless it is the goal's existing one, so an
// overdue goal can still be edited.
export const normalizeSavingsGoalInput = (
  input,
  { today, previousDeadline = null } = {},
) => {
  const name = String(input?.name ?? "").trim();
  if (!name) throw new Error("Goal name is required");
  const kind = GOAL_KINDS.includes(input?.kind) ? input.kind : null;
  if (!kind) throw new Error("Invalid goal kind");
  const cashAccountKeys = [
    ...new Set(
      (Array.isArray(input?.cashAccountKeys) ? input.cashAccountKeys : [])
        .map((key) => String(key ?? "").trim())
        .filter(Boolean),
    ),
  ];
  const result = {
    name,
    icon: normalizeGoalIcon(input?.icon),
    kind,
    targetTwd: null,
    targetMonths: null,
    deadline: null,
    cashAccountKeys,
  };

  if (kind === GOAL_KIND.ONGOING) {
    const months = Number(input?.targetMonths);
    if (
      !Number.isInteger(months) ||
      months < ONGOING_MONTHS_MIN ||
      months > ONGOING_MONTHS_MAX
    ) {
      throw new Error("Goal months must be 1-24");
    }
    return { ...result, targetMonths: months };
  }

  const target = Number(input?.targetTwd);
  if (!Number.isFinite(target) || target <= 0) {
    throw new Error("Goal target must be a positive number");
  }
  result.targetTwd = Math.round(target);
  if (kind === GOAL_KIND.DEADLINE) {
    const parsed = dayjs(input?.deadline);
    if (!input?.deadline || !parsed.isValid()) {
      throw new Error("Goal deadline is required");
    }
    const deadline = parsed.format("YYYY-MM-DD");
    if (deadline !== previousDeadline && deadline <= today) {
      throw new Error("Goal deadline must be after today");
    }
    result.deadline = deadline;
  }
  return result;
};

export const getNextGoalSortOrder = (goals) =>
  (goals || [])
    .filter((goal) => !goal?.deletedAt)
    .reduce((max, goal) => Math.max(max, Number(goal.sortOrder) || 0), 0) + 1;

// keyMap: { oldCashAccountKey: newCashAccountKey }. Returns only the goals
// whose links change.
export const planGoalAccountRelink = (goals, keyMap) => {
  const plan = [];
  for (const goal of goals || []) {
    const keys = goal.cashAccountKeys || [];
    if (!keys.some((key) => key in keyMap)) continue;
    plan.push({
      goal,
      cashAccountKeys: [...new Set(keys.map((key) => keyMap[key] ?? key))],
    });
  }
  return plan;
};

export const buildSavingsGoalRows = ({
  goals = [],
  cashAccounts = [],
  monthlySummaries = [],
  today,
}) => {
  const average = averageMonthlyExpense(monthlySummaries);
  const liveGoals = goals.filter((goal) => !goal.deletedAt);
  const accountByKey = new Map(
    cashAccounts
      .filter((account) => !account.deletedAt)
      .map((account) => [account.key, account]),
  );
  const openGoalsByKey = new Map();
  for (const goal of liveGoals) {
    if (goal.archivedAt) continue;
    for (const key of goal.cashAccountKeys || []) {
      const list = openGoalsByKey.get(key) ?? [];
      list.push(goal);
      openGoalsByKey.set(key, list);
    }
  }

  return [...liveGoals]
    .sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0))
    .map((goal) => {
      const keys = goal.cashAccountKeys || [];
      const accounts = keys
        .filter((key) => accountByKey.has(key))
        .map((key) => ({
          ...accountByKey.get(key),
          sharedWith: (openGoalsByKey.get(key) ?? [])
            .filter((other) => other.id !== goal.id)
            .map((other) => other.name),
        }));
      const currentTwd = accounts.reduce(
        (sum, account) => sum + (Number(account.balanceTwd) || 0),
        0,
      );
      const isOngoing = goal.kind === GOAL_KIND.ONGOING;
      const targetTwd = isOngoing
        ? average.averageTwd === null
          ? null
          : Math.round(average.averageTwd * goal.targetMonths)
        : goal.targetTwd;
      return {
        id: goal.id,
        remoteKey: goal.remoteKey,
        name: goal.name,
        icon: goal.icon ?? null,
        iconKey: resolveGoalIcon(goal),
        kind: goal.kind,
        targetTwd,
        targetMonths: goal.targetMonths ?? null,
        deadline: goal.deadline ?? null,
        startTwd: goal.startTwd,
        startDate: goal.startDate,
        cashAccountKeys: keys,
        sortOrder: goal.sortOrder,
        archivedAt: goal.archivedAt ?? null,
        isArchived: Boolean(goal.archivedAt),
        currentTwd,
        accounts,
        missingAccountCount: keys.length - accounts.length,
        averageMonthlyExpenseTwd: isOngoing ? average.averageTwd : null,
        monthsUsed: isOngoing ? average.monthsUsed : null,
        ...computeGoalProgress({ ...goal, targetTwd, currentTwd, today }),
      };
    });
};

export const getGoalTargetLabel = (goal) => {
  if (goal.kind === GOAL_KIND.ONGOING) {
    return goal.targetTwd === null
      ? `目標 ${goal.targetMonths} 個月支出`
      : `目標 ${formatTwd(goal.targetTwd)}（${goal.targetMonths} 個月）`;
  }
  return `目標 ${formatTwd(goal.targetTwd)}`;
};

const isPacing = (status) => status === "on-track" || status === "behind";

export const getGoalNote = (goal) => {
  if (!goal.cashAccountKeys?.length) return "尚未選擇帳戶";
  if (goal.kind === GOAL_KIND.DEADLINE) {
    const due = `${dayjs(goal.deadline).format("YYYY/MM")} 前`;
    return isPacing(goal.status)
      ? `${due}・每月需再存 ${formatTwd(goal.monthlyNeededTwd)}`
      : due;
  }
  if (goal.status === "in-progress" || goal.status === "below") {
    return `還差 ${formatTwd(goal.shortfallTwd)}`;
  }
  return null;
};

export const getGoalFacts = (goal) => {
  const facts = [];
  if (goal.kind === GOAL_KIND.DEADLINE) {
    facts.push({ label: "到期日", value: dayjs(goal.deadline).format("YYYY/MM/DD") });
    if (isPacing(goal.status)) {
      facts.push(
        { label: "剩餘", value: `${goal.daysLeft} 天` },
        { label: "應有進度", value: formatTwd(goal.expectedTwd) },
        { label: "每月需再存", value: formatTwd(goal.monthlyNeededTwd) },
      );
    }
    return facts;
  }
  if (goal.kind === GOAL_KIND.ONGOING) {
    if (goal.averageMonthlyExpenseTwd === null || goal.targetTwd === null) {
      return [{ label: "計算方式", value: "還沒有完整月份的支出資料" }];
    }
    facts.push(
      {
        label: "計算方式",
        value: `平均月支出 ${formatTwd(goal.averageMonthlyExpenseTwd)} × ${goal.targetMonths} 個月 = ${formatTwd(goal.targetTwd)}`,
      },
      { label: "依據", value: `近 ${goal.monthsUsed} 個完整月的支出` },
    );
  }
  if (goal.shortfallTwd > 0) {
    facts.push({ label: "還差", value: formatTwd(goal.shortfallTwd) });
  }
  return facts;
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/utils/savingsGoals.test.js`
Expected: PASS（全部）。若 `expectedTwd` 的數字差 1，先用 `node -e` 手算 `dayjs` diff 確認是測試的日數算錯，修測試的期望值並在註解寫明日數，不要改公式。

- [ ] **Step 5: Lint & commit**

```bash
npx eslint src/utils/savingsGoals.js src/utils/savingsGoals.test.js
git add src/utils/savingsGoals.js src/utils/savingsGoals.test.js
git commit -m "Work out savings goal progress from linked account balances

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 資料層 — 本地表、mapper、雲端同步

**Files:**
- Modify: `src/db/database.js`（`TABLE_STORAGE_KEYS` 與 `StockDatabase` constructor）
- Modify: `src/services/portfolioConstants.js`（`CLOUD_COLLECTION`）
- Modify: `src/services/firebase/firestoreMappers.js`
- Modify: `src/services/firebase/cloudSyncService.js`
- Test: `src/services/firebase/firestoreMappers.test.js`、`src/services/firebase/cloudSyncService.test.js`

**Interfaces:**
- Consumes: `GOAL_KINDS`、`normalizeGoalIcon` from Task 1。
- Produces: `db.savings_goals`；`CLOUD_COLLECTION.SAVINGS_GOALS = "savings_goals"`；`buildSavingsGoalKey(goal) => string`；`savingsGoalToRemote(goal)`；`remoteToSavingsGoal(data)`；`applyCollectionRecordLocally({ collectionName: 'savings_goals', record })` 與 `removeCollectionDocLocally` 支援新 collection。

- [ ] **Step 1: Write the failing mapper tests**

在 `src/services/firebase/firestoreMappers.test.js` 的 import 加入 `buildSavingsGoalKey, savingsGoalToRemote, remoteToSavingsGoal`，檔尾加：

```js
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
```

- [ ] **Step 2: Write the failing sync tests**

在 `src/services/firebase/cloudSyncService.test.js` 檔尾加：

```js
describe('applyCollectionRecordLocally (savings_goals)', () => {
  const goal = {
    remoteKey: 'goal_abc',
    name: '日本旅遊',
    icon: 'travel',
    kind: 'open',
    targetTwd: 150000,
    targetMonths: null,
    deadline: null,
    startTwd: 0,
    startDate: '2026-10-10',
    cashAccountKeys: ['k1', 'k2'],
    sortOrder: 1,
    archivedAt: null,
    createdAt: '2026-10-10T00:00:00.000Z',
    updatedAt: '2026-10-10T00:00:00.000Z',
    deletedAt: null,
  }

  beforeEach(async () => {
    await db.savings_goals.clear()
  })

  it('adds a goal with its account keys', async () => {
    await applyCollectionRecordLocally({ collectionName: 'savings_goals', record: goal })
    const [row] = await db.savings_goals.toArray()
    expect(row).toMatchObject({ ...goal, syncState: 'synced' })
    expect(Number.isInteger(row.id)).toBe(true)
  })

  it('updates only when the remote copy is newer', async () => {
    await applyCollectionRecordLocally({ collectionName: 'savings_goals', record: goal })
    await applyCollectionRecordLocally({
      collectionName: 'savings_goals',
      record: { ...goal, name: '舊的', updatedAt: '2026-10-09T00:00:00.000Z' },
    })
    await applyCollectionRecordLocally({
      collectionName: 'savings_goals',
      record: { ...goal, archivedAt: '2026-10-11T00:00:00.000Z', updatedAt: '2026-10-11T00:00:00.000Z' },
    })
    const rows = await db.savings_goals.toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ name: '日本旅遊', archivedAt: '2026-10-11T00:00:00.000Z' })
  })

  it('removes the local row when the remote doc is deleted', async () => {
    await applyCollectionRecordLocally({ collectionName: 'savings_goals', record: goal })
    await removeCollectionDocLocally({ collectionName: 'savings_goals', docId: 'goal_abc', snapshotData: goal })
    expect(await db.savings_goals.toArray()).toEqual([])
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/services/firebase/firestoreMappers.test.js src/services/firebase/cloudSyncService.test.js`
Expected: FAIL — `buildSavingsGoalKey is not a function` / `Cannot read properties of undefined (reading 'clear')`。

- [ ] **Step 4: Add the local table and constant**

`src/db/database.js` — `TABLE_STORAGE_KEYS` 尾端加一行：

```js
  expenseTemplates: 'my-stock:expense_templates',
  savingsGoals: 'my-stock:savings_goals',
}
```

constructor 的 `this.expense_templates = ...` 之後加：

```js
    this.savings_goals = new PersistedInMemoryTable({
      primaryKey: 'id',
      autoIncrement: true,
      storageKey: TABLE_STORAGE_KEYS.savingsGoals,
    })
```

`src/services/portfolioConstants.js` 的 `CLOUD_COLLECTION` 在 `EXPENSE_TEMPLATES` 下加 `SAVINGS_GOALS: "savings_goals",`。

- [ ] **Step 5: Add the mappers**

`src/services/firebase/firestoreMappers.js`：import 區加

```js
import { GOAL_KINDS, normalizeGoalIcon } from '../../utils/savingsGoals'
```

`buildExpenseTemplateKey` 之後加：

```js
export const buildSavingsGoalKey = (goal) => (
  goal.remoteKey || `goal_${goal.id}`
)
```

`budgetToRemote` 之後加（`toPositiveAmountOrNull` 已在本檔定義）：

```js
const toStringList = (value) => (
  Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item) : []
)

// Cash accounts are linked by their cloud key (buildCashAccountKey): local
// ids differ per device.
export const savingsGoalToRemote = (goal) => ({
  remoteKey: goal.remoteKey || null,
  name: goal.name,
  icon: goal.icon ?? null,
  kind: goal.kind,
  targetTwd: toPositiveAmountOrNull(goal.targetTwd),
  targetMonths: toPositiveAmountOrNull(goal.targetMonths),
  deadline: goal.deadline ?? null,
  startTwd: Number(goal.startTwd) || 0,
  startDate: goal.startDate ?? null,
  cashAccountKeys: toStringList(goal.cashAccountKeys),
  sortOrder: Number(goal.sortOrder) || 0,
  archivedAt: goal.archivedAt ?? null,
  createdAt: goal.createdAt ?? null,
  updatedAt: goal.updatedAt,
  deletedAt: goal.deletedAt ?? null,
  clientUpdatedAt: goal.updatedAt,
})
```

`remoteToBudget` 之後加：

```js
export const remoteToSavingsGoal = (data) => ({
  remoteKey: data.remoteKey ?? null,
  name: data.name,
  icon: normalizeGoalIcon(data.icon),
  kind: GOAL_KINDS.includes(data.kind) ? data.kind : 'open',
  targetTwd: toPositiveAmountOrNull(data.targetTwd),
  targetMonths: toPositiveAmountOrNull(data.targetMonths),
  deadline: data.deadline ?? null,
  startTwd: Number(data.startTwd) || 0,
  startDate: data.startDate ?? null,
  cashAccountKeys: toStringList(data.cashAccountKeys),
  sortOrder: Number(data.sortOrder) || 0,
  archivedAt: toIso(data.archivedAt),
  createdAt: toIso(data.createdAt) ?? data.createdAt ?? null,
  updatedAt: toIso(data.updatedAt) ?? data.clientUpdatedAt ?? null,
  deletedAt: toIso(data.deletedAt),
})
```

- [ ] **Step 6: Wire the collection into cloudSyncService**

`src/services/firebase/cloudSyncService.js`，每處都放在對應的 `EXPENSE_TEMPLATES` / `expense_templates` 旁邊（`grep -n "EXPENSE_TEMPLATES\|expense_templates" src/services/firebase/cloudSyncService.js` 會列出全部 9 處，每處都要有對應的 savings goals）：

1. mapper import 加 `buildSavingsGoalKey`、`savingsGoalToRemote`、`remoteToSavingsGoal`。
2. `COLLECTIONS` 加 `SAVINGS_GOALS: 'savings_goals',`。
3. `clearLocalCloudBackedData`：transaction 參數加 `db.savings_goals,`，callback 內加 `await db.savings_goals.clear()`。
4. `buildMutationPayload`，`EXPENSE_TEMPLATES` 分支之後：

```js
  if (collectionName === COLLECTIONS.SAVINGS_GOALS) {
    return { docId: buildSavingsGoalKey(record), payload: savingsGoalToRemote(record) }
  }
```

5. `applyRemoteExpenseTemplate` 之後新增：

```js
const applyRemoteSavingsGoal = async (remote) => {
  if (!remote.remoteKey || !remote.name) return
  const local = await db.savings_goals.where('remoteKey').equals(remote.remoteKey).first()
  const nowIso = getNowIso()
  const { remoteKey, createdAt, updatedAt, ...fields } = remote
  if (!local) {
    await db.savings_goals.add({
      remoteKey,
      ...fields,
      createdAt: createdAt || nowIso,
      updatedAt: updatedAt || nowIso,
      syncState: SYNC_SYNCED,
    })
    return
  }
  if (!isRemoteNewer(local.updatedAt, updatedAt)) return
  await db.savings_goals.update(local.id, {
    ...fields,
    createdAt: createdAt || local.createdAt,
    updatedAt: updatedAt || local.updatedAt,
    syncState: SYNC_SYNCED,
  })
}
```

6. `applyCollectionRecordLocally`，`EXPENSE_TEMPLATES` 分支之後：

```js
  } else if (collectionName === COLLECTIONS.SAVINGS_GOALS) {
    await applyRemoteSavingsGoal(remoteToSavingsGoal(payload))
```

7. `removeCollectionDocLocally`，`EXPENSE_TEMPLATES` 分支之後：

```js
  } else if (collectionName === COLLECTIONS.SAVINGS_GOALS) {
    const remoteKey = snapshotData ? remoteToSavingsGoal(snapshotData).remoteKey : docId
    if (!remoteKey) return
    const goal = await db.savings_goals.where('remoteKey').equals(remoteKey).first()
    if (goal) {
      await db.savings_goals.delete(goal.id)
    }
```

8. `applyRealtimeSnapshot`，`EXPENSE_TEMPLATES` 的 `if` 區塊之後：

```js
    if (collectionName === COLLECTIONS.SAVINGS_GOALS) {
      await applyRemoteSavingsGoal(remoteToSavingsGoal(data))
      continue
    }
```

9. `startRealtimeSync`：`firstSnapshotTracker.pending` 的 Set 加 `COLLECTIONS.SAVINGS_GOALS,`；第二批 `Promise.allSettled` 加 `subscribeCollection(COLLECTIONS.SAVINGS_GOALS),`。

Firestore rules（`users/{userId}/{document=**}`）已涵蓋新 collection，不需改。

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run src/services/firebase`
Expected: PASS（含既有測試）。

- [ ] **Step 8: Lint & commit**

```bash
npx eslint src/db/database.js src/services/portfolioConstants.js src/services/firebase
git add src/db/database.js src/services/portfolioConstants.js src/services/firebase
git commit -m "Sync savings goals through their own Firestore collection

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Service — 寫入、relink、view、備份

**Files:**
- Modify: `src/services/portfolioService.js`
- Test: `src/services/portfolioService.savingsGoals.test.js`（新）

**Interfaces:**
- Consumes: Task 1 的 `normalizeSavingsGoalInput`、`getNextGoalSortOrder`、`planGoalAccountRelink`、`buildSavingsGoalRows`、`GOAL_KIND`；Task 2 的 `db.savings_goals`、`CLOUD_COLLECTION.SAVINGS_GOALS`。
- Produces:
  - `upsertSavingsGoal({ id?, name, icon, kind, targetTwd, targetMonths, deadline, cashAccountKeys }) => Promise<{ id: number, created: boolean }>`
  - `setSavingsGoalArchived({ id, archived: boolean }) => Promise<void>`
  - `removeSavingsGoal({ id }) => Promise<void>`
  - `getExpenseDashboardView()` 回傳新增 `savingsGoals: GoalRow[]` 與 `savingsGoalAccountOptions: { key, bankName, accountAlias, holder, balanceTwd }[]`
  - `exportBackupData()` 回傳新增 `savingsGoals`

- [ ] **Step 1: Write the failing tests**

建立 `src/services/portfolioService.savingsGoals.test.js`：

```js
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('./firebase/cloudSyncService', async (importOriginal) => ({
  ...(await importOriginal()),
  assertCloudWriteReady: vi.fn(),
  writeCollectionRecord: vi.fn(),
  deleteCollectionDoc: vi.fn(),
  registerMigratedDocKey: vi.fn(),
}))

import { db } from '../db/database'
import { buildCashAccountKey } from './firebase/firestoreMappers'
import {
  exportBackupData,
  getExpenseDashboardView,
  removeSavingsGoal,
  setSavingsGoalArchived,
  updateCashAccountHolder,
  upsertSavingsGoal,
} from './portfolioService'

// Writes apply locally only when newer, so each call gets its own second.
let clock = Date.parse('2026-10-10T02:00:00.000Z')
const tick = () => {
  clock += 1000
  vi.setSystemTime(clock)
}

const addCash = async (accountAlias, balanceTwd, holder = 'Po') => {
  const record = {
    bankCode: '812',
    bankName: '台新',
    accountAlias,
    holder,
    balanceTwd,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
  }
  const id = await db.cash_accounts.add(record)
  return { id, key: buildCashAccountKey(record) }
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  tick()
  await db.savings_goals.clear()
  await db.cash_accounts.clear()
  await db.cash_balance_snapshots.clear()
  await db.expense_entries.clear()
  await db.app_config.clear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('upsertSavingsGoal', () => {
  it('creates a goal starting from the linked balances today', async () => {
    const a = await addCash('日常', 30000)
    const b = await addCash('旅遊', 20000)
    const { id, created } = await upsertSavingsGoal({
      name: '日本旅遊', icon: null, kind: 'deadline', targetTwd: 150000, deadline: '2027-03-31', cashAccountKeys: [a.key, b.key],
    })
    expect(created).toBe(true)
    const goal = await db.savings_goals.get(id)
    expect(goal).toMatchObject({
      name: '日本旅遊',
      kind: 'deadline',
      targetTwd: 150000,
      deadline: '2027-03-31',
      startTwd: 50000,
      startDate: '2026-10-10',
      cashAccountKeys: [a.key, b.key],
      sortOrder: 1,
      archivedAt: null,
      deletedAt: null,
    })
    expect(goal.remoteKey).toMatch(/^goal_/)
  })

  it('keeps the start when editing, but restarts it when a goal gains a deadline', async () => {
    const a = await addCash('日常', 30000)
    const { id } = await upsertSavingsGoal({ name: '存錢', kind: 'open', targetTwd: 100000, cashAccountKeys: [a.key] })
    await db.cash_accounts.update(a.id, { balanceTwd: 45000 })

    tick()
    await upsertSavingsGoal({ id, name: '存更多', kind: 'open', targetTwd: 200000, cashAccountKeys: [a.key] })
    expect(await db.savings_goals.get(id)).toMatchObject({ name: '存更多', targetTwd: 200000, startTwd: 30000 })

    tick()
    await upsertSavingsGoal({ id, name: '存更多', kind: 'deadline', targetTwd: 200000, deadline: '2027-01-01', cashAccountKeys: [a.key] })
    expect(await db.savings_goals.get(id)).toMatchObject({ kind: 'deadline', startTwd: 45000, startDate: '2026-10-10' })
  })

  it('lets an overdue goal be edited without moving its deadline', async () => {
    const goalId = await db.savings_goals.add({
      remoteKey: 'goal_old', name: '舊目標', icon: null, kind: 'deadline', targetTwd: 1000, targetMonths: null,
      deadline: '2026-05-01', startTwd: 0, startDate: '2026-01-01', cashAccountKeys: [], sortOrder: 1,
      archivedAt: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', deletedAt: null,
    })
    await upsertSavingsGoal({ id: goalId, name: '舊目標改名', kind: 'deadline', targetTwd: 1000, deadline: '2026-05-01', cashAccountKeys: [] })
    expect((await db.savings_goals.get(goalId)).name).toBe('舊目標改名')
  })
})

describe('archive and remove', () => {
  it('archives, unarchives and soft-deletes', async () => {
    const { id } = await upsertSavingsGoal({ name: '買車', kind: 'open', targetTwd: 500000, cashAccountKeys: [] })
    tick()
    await setSavingsGoalArchived({ id, archived: true })
    expect((await db.savings_goals.get(id)).archivedAt).toBe(new Date(clock).toISOString())
    tick()
    await setSavingsGoalArchived({ id, archived: false })
    expect((await db.savings_goals.get(id)).archivedAt).toBeNull()
    tick()
    await removeSavingsGoal({ id })
    expect((await db.savings_goals.get(id)).deletedAt).toBe(new Date(clock).toISOString())
    await expect(removeSavingsGoal({ id })).rejects.toThrow('Savings goal not found')
  })
})

describe('cash account key changes', () => {
  it('keeps tracking an account after its holder changes', async () => {
    // No holder_options config → the defaults (Po, Wei) apply.
    const a = await addCash('日常', 30000, 'Po')
    const { id } = await upsertSavingsGoal({ name: '存錢', kind: 'open', targetTwd: 100000, cashAccountKeys: [a.key, 'other'] })
    tick()
    await updateCashAccountHolder({ id: a.id, holder: 'Wei' })
    const newKey = buildCashAccountKey({ ...(await db.cash_accounts.get(a.id)) })
    expect(newKey).not.toBe(a.key)
    expect((await db.savings_goals.get(id)).cashAccountKeys).toEqual([newKey, 'other'])
  })
})

describe('getExpenseDashboardView — savings goals', () => {
  it('returns goal rows resolved by account key, and the account options', async () => {
    const a = await addCash('日常', 30000)
    const gone = await addCash('舊帳戶', 5000)
    await db.cash_accounts.update(gone.id, { deletedAt: '2026-10-01T00:00:00.000Z' })
    await upsertSavingsGoal({ name: '日本旅遊', kind: 'open', targetTwd: 60000, cashAccountKeys: [a.key, gone.key] })

    const view = await getExpenseDashboardView({})
    expect(view.savingsGoals).toHaveLength(1)
    expect(view.savingsGoals[0]).toMatchObject({
      name: '日本旅遊',
      iconKey: 'travel',
      currentTwd: 30000,
      missingAccountCount: 1,
      status: 'in-progress',
      progressRatio: 0.5,
    })
    expect(view.savingsGoalAccountOptions).toEqual([
      { key: a.key, bankName: '台新', accountAlias: '日常', holder: 'Po', balanceTwd: 30000 },
    ])
  })

  it('leaves deleted goals out of the view and the backup', async () => {
    const { id } = await upsertSavingsGoal({ name: 'x', kind: 'open', targetTwd: 1, cashAccountKeys: [] })
    await upsertSavingsGoal({ name: 'y', kind: 'open', targetTwd: 1, cashAccountKeys: [] })
    tick()
    await removeSavingsGoal({ id })
    expect((await getExpenseDashboardView({})).savingsGoals.map((row) => row.name)).toEqual(['y'])
    expect((await exportBackupData()).savingsGoals.map((row) => row.name)).toEqual(['y'])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/services/portfolioService.savingsGoals.test.js`
Expected: FAIL — `upsertSavingsGoal is not a function`（或 import 為 undefined）。

- [ ] **Step 3: Implement the service**

`src/services/portfolioService.js`：

(a) import 區，在 `buildMonthlySummaries` import 之後加：

```js
import {
  GOAL_KIND,
  buildSavingsGoalRows,
  getNextGoalSortOrder,
  normalizeSavingsGoalInput,
  planGoalAccountRelink,
} from "../utils/savingsGoals";
```

(b) 在 `migrateCashAccountCloudKeyIfNeeded` **之前**加 relink helper：

```js
// Goals link cash accounts by cloud key; when an account's key changes
// (holder edit or holder rename) point its goals at the new key.
const relinkSavingsGoalCashAccounts = async (keyMap) => {
  if (Object.keys(keyMap).length === 0) return;
  const goals = (await db.savings_goals.toArray()).filter(
    (item) => !isDeleted(item),
  );
  const nowIso = getNowIso();
  for (const { goal, cashAccountKeys } of planGoalAccountRelink(goals, keyMap)) {
    await mirrorToCloud(CLOUD_COLLECTION.SAVINGS_GOALS, {
      ...goal,
      cashAccountKeys,
      updatedAt: nowIso,
      syncState: SYNC_PENDING,
    });
  }
};
```

(c) `migrateCashAccountCloudKeyIfNeeded` 內，`if (previousDocKey === nextDocKey) { return; }` 之後加一行：

```js
  await relinkSavingsGoalCashAccounts({ [previousDocKey]: nextDocKey });
```

(d) `saveHolderOptions` 的現金帳戶迴圈（`const cashAccounts = await getActiveCashAccounts(); for (const cashAccount of cashAccounts) {`）：迴圈前加 `const cashKeyMap = {};`，在 `changedCashAccounts.push(nextCashAccount);` 之後加：

```js
    cashKeyMap[buildCashAccountKey(cashAccount)] =
      buildCashAccountKey(nextCashAccount);
```

迴圈結束後（`const expenseEntries = await getActiveExpenseEntries();` 之前）加：

```js
  await relinkSavingsGoalCashAccounts(cashKeyMap);
```

（這裡只補目標的連結；持有人改名時舊的 cash doc 沒被刪是既有行為，不在本計畫範圍。）

(e) 在 `reorderExpenseTemplates` 之後新增三個 export：

```js
const sumCashBalancesByKey = async (keys) => {
  const wanted = new Set(keys);
  return (await getActiveCashAccounts())
    .filter((item) => wanted.has(buildCashAccountKey(item)))
    .reduce(
      (sum, item) =>
        sum +
        parseNumericLike(item.balanceTwd, {
          fallback: 0,
          context: "sumCashBalancesByKey.balanceTwd",
        }),
      0,
    );
};

const getLiveSavingsGoal = async (id) => {
  const parsedId = Number(id);
  const existing =
    Number.isInteger(parsedId) && parsedId > 0
      ? await db.savings_goals.get(parsedId)
      : null;
  if (!existing || isDeleted(existing)) {
    throw new Error("Savings goal not found");
  }
  return existing;
};

// 儲蓄目標. startTwd / startDate are set when the goal is created and when it
// becomes a deadline goal, never on other edits, so progress doesn't reset.
export const upsertSavingsGoal = async ({ id, ...input }) => {
  ensureCloudWritable();
  const today = getNowDate();
  const nowIso = getNowIso();
  const existing =
    id === undefined || id === null ? null : await getLiveSavingsGoal(id);
  const normalized = normalizeSavingsGoalInput(input, {
    today,
    previousDeadline: existing?.deadline ?? null,
  });
  const restart =
    !existing ||
    (normalized.kind === GOAL_KIND.DEADLINE &&
      existing.kind !== GOAL_KIND.DEADLINE);
  const start = restart
    ? {
        startTwd: await sumCashBalancesByKey(normalized.cashAccountKeys),
        startDate: today,
      }
    : {};

  if (existing) {
    await mirrorToCloud(CLOUD_COLLECTION.SAVINGS_GOALS, {
      ...existing,
      ...normalized,
      ...start,
      updatedAt: nowIso,
      syncState: SYNC_PENDING,
    });
    return { id: existing.id, created: false };
  }

  const remoteKey = makeRemoteKey("goal");
  await mirrorToCloud(CLOUD_COLLECTION.SAVINGS_GOALS, {
    remoteKey,
    ...normalized,
    ...start,
    sortOrder: getNextGoalSortOrder(await db.savings_goals.toArray()),
    archivedAt: null,
    createdAt: nowIso,
    updatedAt: nowIso,
    deletedAt: null,
    syncState: SYNC_PENDING,
  });
  const inserted = await db.savings_goals
    .where("remoteKey")
    .equals(remoteKey)
    .first();
  return { id: requireLocalId(inserted, "儲蓄目標"), created: true };
};

export const setSavingsGoalArchived = async ({ id, archived }) => {
  ensureCloudWritable();
  const existing = await getLiveSavingsGoal(id);
  const nowIso = getNowIso();
  await mirrorToCloud(CLOUD_COLLECTION.SAVINGS_GOALS, {
    ...existing,
    archivedAt: archived ? nowIso : null,
    updatedAt: nowIso,
    syncState: SYNC_PENDING,
  });
};

export const removeSavingsGoal = async ({ id }) => {
  ensureCloudWritable();
  const existing = await getLiveSavingsGoal(id);
  const nowIso = getNowIso();
  await mirrorToCloud(CLOUD_COLLECTION.SAVINGS_GOALS, {
    ...existing,
    deletedAt: nowIso,
    updatedAt: nowIso,
    syncState: SYNC_PENDING,
  });
};
```

(f) `getExpenseDashboardView`：在 `const monthlySummaries = buildMonthlySummaries({...});` 之後加：

```js
  // Deleted accounts stay in so a goal can tell a removed link from none.
  const goalCashAccounts = (await db.cash_accounts.toArray()).map((item) => ({
    key: buildCashAccountKey(item),
    bankName: item.bankName,
    accountAlias: item.accountAlias,
    holder: item.holder ?? null,
    balanceTwd: parseNumericLike(item.balanceTwd, {
      fallback: 0,
      context: "getExpenseDashboardView.goalCashAccounts.balanceTwd",
    }),
    deletedAt: item.deletedAt ?? null,
  }));
```

並在 return 物件的 `monthlySummaries,` 之後加：

```js
    savingsGoals: buildSavingsGoalRows({
      goals: await db.savings_goals.toArray(),
      cashAccounts: goalCashAccounts,
      monthlySummaries,
      today,
    }),
    savingsGoalAccountOptions: goalCashAccounts
      .filter((item) => !item.deletedAt)
      .map(({ deletedAt, ...item }) => {
        void deletedAt;
        return item;
      }),
```

（`today` 是該函式中已存在的 `const today = getNowDate();`。）

(g) `exportBackupData`：解構陣列在 `expenseTemplates,` 之後加 `savingsGoals,`，`Promise.all` 陣列在 `readActive(db.expense_templates),` 之後加 `readActive(db.savings_goals),`，回傳物件在 `expenseTemplates,` 之後加 `savingsGoals,`。

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/services`
Expected: PASS（含既有的 dashboard / valuation / snapshots 測試）。

- [ ] **Step 5: Lint & commit**

```bash
npx eslint src/services/portfolioService.js src/services/portfolioService.savingsGoals.test.js
git add src/services/portfolioService.js src/services/portfolioService.savingsGoals.test.js
git commit -m "Add savings goal writes and serve goal rows with the expense view

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 目標圖示與 `CategoryIconPicker` 泛用化

**Files:**
- Create: `src/components/goalIconComponents.js`
- Create: `src/components/GoalIcon.jsx`
- Modify: `src/components/CategoryIconPicker.jsx`
- Modify: `src/App.css`（`.goal-icon`）
- Test: `src/components/CategoryIconPicker.test.jsx`、`src/components/GoalIcon.test.jsx`（新）

**Interfaces:**
- Consumes: Task 1 的 `GOAL_ICON_OPTIONS`、`getGoalIconKey`。
- Produces: `GOAL_ICON_COMPONENTS: Record<key, IconComponent>`；`<GoalIcon iconKey size? />`（`size="lg"` 給詳細頁）；`<CategoryIconPicker options? components? resolveByName? groupLabel? />`，不傳時行為不變。

- [ ] **Step 1: Write the failing tests**

`src/components/CategoryIconPicker.test.jsx` 的 `describe` 內加：

```js
  it('can offer another icon set, picked from the name its own way', async () => {
    const { GOAL_ICON_OPTIONS, getGoalIconKey } = await import('../utils/savingsGoals')
    const { GOAL_ICON_COMPONENTS } = await import('./goalIconComponents')
    const onChange = vi.fn()
    render(
      <CategoryIconPicker
        name="買車"
        value={null}
        onChange={onChange}
        options={GOAL_ICON_OPTIONS}
        components={GOAL_ICON_COMPONENTS}
        resolveByName={getGoalIconKey}
        groupLabel="目標圖示"
      />,
    )
    const group = screen.getByRole('group', { name: '目標圖示' })
    expect(group.querySelectorAll('button')).toHaveLength(10)
    expect(screen.getByRole('button', { name: '買車' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: '緊急預備金' }))
    expect(onChange).toHaveBeenCalledWith('emergency')
  })
```

建立 `src/components/GoalIcon.test.jsx`：

```js
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import GoalIcon from './GoalIcon'
import { GOAL_ICON_KEYS } from '../utils/savingsGoals'
import { GOAL_ICON_COMPONENTS } from './goalIconComponents'

describe('<GoalIcon />', () => {
  it('has a component for every goal icon key', () => {
    expect(Object.keys(GOAL_ICON_COMPONENTS).sort()).toEqual([...GOAL_ICON_KEYS].sort())
  })

  it('renders the tile, falling back to savings for an unknown key', () => {
    const { container } = render(<GoalIcon iconKey="nope" />)
    const tile = container.querySelector('.goal-icon')
    expect(tile).toHaveAttribute('data-goal-icon', 'savings')
    expect(tile.querySelector('svg')).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/CategoryIconPicker.test.jsx src/components/GoalIcon.test.jsx`
Expected: FAIL — 找不到 `./goalIconComponents` / `./GoalIcon`。

- [ ] **Step 3: Implement**

`src/components/goalIconComponents.js`：

```js
// Savings goal icon key (utils/savingsGoals.js) → iconoir component. Kept apart
// from the 18 category icons so the category picker stays short.
import {
  Airplane,
  Car,
  GraduationCap,
  Healthcare,
  Home,
  Laptop,
  PiggyBank,
  Rings,
  SmartphoneDevice,
  Umbrella,
} from "iconoir-react";

export const GOAL_ICON_COMPONENTS = {
  savings: PiggyBank,
  emergency: Umbrella,
  car: Car,
  travel: Airplane,
  phone: SmartphoneDevice,
  home: Home,
  wedding: Rings,
  education: GraduationCap,
  computer: Laptop,
  medical: Healthcare,
};
```

`src/components/GoalIcon.jsx`：

```jsx
// A savings goal's icon in a round neutral tile (decoration: the goal's name
// is always written next to it).
import { GOAL_ICON_COMPONENTS } from "./goalIconComponents";

export default function GoalIcon({ iconKey, size = "md" }) {
  const key = GOAL_ICON_COMPONENTS[iconKey] ? iconKey : "savings";
  const Icon = GOAL_ICON_COMPONENTS[key];
  return (
    <span
      className={`goal-icon goal-icon--${size}`}
      data-goal-icon={key}
      aria-hidden="true"
    >
      <Icon />
    </span>
  );
}
```

`src/components/CategoryIconPicker.jsx` 改為：

```jsx
// Icon grid in a form (antd Form control: value / onChange). Category icons by
// default; savings goals pass their own options / components / name rule.
// value null means "pick from the name": the icon the name maps to shows as
// selected, and choosing an icon stores it. 改回依名稱 clears the choice.
import { Button } from "antd";
import { CATEGORY_ICON_OPTIONS, getCategoryIconKey } from "../utils/categoryIcons";
import { CATEGORY_ICON_COMPONENTS } from "./categoryIconComponents";

const categoryIconByName = (name) => {
  const key = getCategoryIconKey(name);
  return key === "none" ? "other" : key;
};

export default function CategoryIconPicker({
  value = null,
  onChange,
  name = "",
  disabled = false,
  options = CATEGORY_ICON_OPTIONS,
  components = CATEGORY_ICON_COMPONENTS,
  resolveByName = categoryIconByName,
  groupLabel = "分類圖示",
}) {
  const selected = value ?? resolveByName(name);
  return (
    <div className="category-icon-picker">
      <div className="category-icon-picker-grid" role="group" aria-label={groupLabel}>
        {options.map(({ key, label }) => {
          const Icon = components[key];
          const checked = key === selected;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={checked}
              aria-label={label}
              title={label}
              disabled={disabled}
              className={`category-icon-option${checked ? " category-icon-option--selected" : ""}`}
              onClick={() => onChange?.(key)}
            >
              <Icon />
            </button>
          );
        })}
      </div>
      <div className="category-icon-picker-hint">
        {value ? (
          <Button type="link" size="small" disabled={disabled} onClick={() => onChange?.(null)}>
            改回依名稱自動選擇
          </Button>
        ) : (
          <span>依名稱自動選擇，點圖示可自訂</span>
        )}
      </div>
    </div>
  );
}
```

`src/App.css`，在 `.category-icon--none { ... }` 規則之後加：

```css
/* Savings goal icon tile (GoalIcon): quiet neutral tile, ink icon. */
.goal-icon {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: var(--icon-tile);
  height: var(--icon-tile);
  border-radius: var(--radius-pill);
  background: var(--c-neutral-fill);
  color: var(--c-ink);
}

.goal-icon svg[data-icon] {
  font-size: var(--icon-md);
}

.goal-icon--lg {
  width: calc(var(--icon-tile) + var(--space-3));
  height: calc(var(--icon-tile) + var(--space-3));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/CategoryIconPicker.test.jsx src/components/GoalIcon.test.jsx`
Expected: PASS（含原本 5 個 picker 測試）。

- [ ] **Step 5: Lint & commit**

```bash
npx eslint src/components/goalIconComponents.js src/components/GoalIcon.jsx src/components/GoalIcon.test.jsx src/components/CategoryIconPicker.jsx src/components/CategoryIconPicker.test.jsx
git add src/components/goalIconComponents.js src/components/GoalIcon.jsx src/components/GoalIcon.test.jsx src/components/CategoryIconPicker.jsx src/components/CategoryIconPicker.test.jsx src/App.css
git commit -m "Add the ten savings goal icons and let the icon picker take any set

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: 目標卡 `SavingsGoalCard` 與新 token

**Files:**
- Create: `src/components/SavingsGoalCard.jsx`
- Modify: `src/index.css`（`:root` token）、`src/theme/tokens.js`（`COLORS`）、`src/App.css`
- Test: `src/components/SavingsGoalCard.test.jsx`（新）

**Interfaces:**
- Consumes: Task 1 的 `GOAL_STATUS_META`、`getGoalTargetLabel`、`getGoalNote`；Task 4 的 `GoalIcon`。
- Produces: default `SavingsGoalCard({ goal: GoalRow, onOpen })`；named `GoalCup({ ratio, tone, size })`、`GoalStatusPill({ status })`。

- [ ] **Step 1: Write the failing test**

建立 `src/components/SavingsGoalCard.test.jsx`：

```js
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import SavingsGoalCard from './SavingsGoalCard'

const goal = {
  id: 1,
  name: '日本旅遊',
  iconKey: 'travel',
  kind: 'deadline',
  targetTwd: 150000,
  targetMonths: null,
  deadline: '2027-03-31',
  cashAccountKeys: ['a'],
  isArchived: false,
  currentTwd: 86000,
  status: 'behind',
  progressRatio: 0.5733,
  shortfallTwd: 64000,
  monthlyNeededTwd: 12800,
}

describe('<SavingsGoalCard />', () => {
  it('shows the amount, target, note and status', () => {
    const { container } = render(<SavingsGoalCard goal={goal} onOpen={vi.fn()} />)
    expect(screen.getByText('日本旅遊')).toBeInTheDocument()
    expect(screen.getByText('$86,000')).toBeInTheDocument()
    expect(screen.getByText('目標 $150,000')).toBeInTheDocument()
    expect(screen.getByText('2027/03 前・每月需再存 $12,800')).toBeInTheDocument()
    expect(screen.getByText('落後')).toHaveClass('goal-status--warn')
    expect(container.querySelector('.goal-cup-fill')).toHaveStyle({ height: '57%' })
  })

  it('opens the goal on click', () => {
    const onOpen = vi.fn()
    render(<SavingsGoalCard goal={goal} onOpen={onOpen} />)
    fireEvent.click(screen.getByRole('button', { name: '查看儲蓄目標：日本旅遊' }))
    expect(onOpen).toHaveBeenCalledWith(goal)
  })

  it('drops the status pill and greys out when archived', () => {
    const { container } = render(<SavingsGoalCard goal={{ ...goal, isArchived: true }} onOpen={vi.fn()} />)
    expect(screen.queryByText('落後')).toBeNull()
    expect(container.querySelector('.savings-goal-card')).toHaveClass('savings-goal-card--archived')
    expect(container.querySelector('.goal-cup-fill')).toHaveClass('goal-cup-fill--muted')
  })

  it('shows an empty cup when an ongoing goal has no spending history', () => {
    const { container } = render(
      <SavingsGoalCard
        goal={{ ...goal, kind: 'ongoing', targetTwd: null, targetMonths: 6, status: 'insufficient-data', progressRatio: 0, shortfallTwd: null }}
        onOpen={vi.fn()}
      />,
    )
    expect(screen.getByText('支出資料不足')).toHaveClass('goal-status--muted')
    expect(screen.getByText('目標 6 個月支出')).toBeInTheDocument()
    expect(container.querySelector('.goal-cup-fill')).toHaveStyle({ height: '0%' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/SavingsGoalCard.test.jsx`
Expected: FAIL — 找不到 `./SavingsGoalCard`。

- [ ] **Step 3: Add the tokens**

`src/index.css` 的 `:root`，在 `--c-warn-ink: #a36100;` 之後加：

```css
  --c-warn-soft: #f6ebd3;
  --c-down-soft: #f7dedf;
```

`src/theme/tokens.js` 的 `COLORS`，在 `warnInk` 之後加：

```js
  // Soft fills behind warn / down text: the savings goal status pill and cup.
  warnSoft: "#F6EBD3",
  downSoft: "#F7DEDF",
```

（`DESIGN.md` 在 Task 9 一起更新。）

- [ ] **Step 4: Implement the card**

建立 `src/components/SavingsGoalCard.jsx`：

```jsx
import { formatTwd } from "../utils/formatters";
import {
  GOAL_STATUS_META,
  getGoalNote,
  getGoalTargetLabel,
} from "../utils/savingsGoals";
import GoalIcon from "./GoalIcon";

// One savings goal: icon, name, amount saved, target and a one-line note on
// the left; status pill and a static cup filled to the progress on the right.
// The cup never animates — the expense tab's one moving thing is the tower.

export function GoalCup({ ratio = 0, tone = "teal", size = "md" }) {
  const pct = Math.round(Math.min(1, Math.max(0, Number(ratio) || 0)) * 100);
  return (
    <div className={`goal-cup goal-cup--${size} goal-cup--${tone}`} aria-hidden="true">
      <div
        className={`goal-cup-fill goal-cup-fill--${tone}`}
        style={{ height: `${pct}%` }}
      />
    </div>
  );
}

export function GoalStatusPill({ status }) {
  const meta = GOAL_STATUS_META[status];
  if (!meta) return null;
  return (
    <span className={`goal-status goal-status--${meta.tone}`}>{meta.label}</span>
  );
}

export default function SavingsGoalCard({ goal, onOpen }) {
  const tone = goal.isArchived
    ? "muted"
    : (GOAL_STATUS_META[goal.status]?.tone ?? "teal");
  const note = getGoalNote(goal);
  return (
    <button
      type="button"
      className={`savings-goal-card${goal.isArchived ? " savings-goal-card--archived" : ""}`}
      aria-label={`查看儲蓄目標：${goal.name}`}
      onClick={() => onOpen?.(goal)}
    >
      <span className="savings-goal-card-info">
        <GoalIcon iconKey={goal.iconKey} />
        <span className="savings-goal-card-name">{goal.name}</span>
        <span className="savings-goal-card-amount">{formatTwd(goal.currentTwd)}</span>
        <span className="savings-goal-card-meta">{getGoalTargetLabel(goal)}</span>
        {note && <span className="savings-goal-card-meta">{note}</span>}
      </span>
      <span className="savings-goal-card-side">
        {!goal.isArchived && <GoalStatusPill status={goal.status} />}
        <GoalCup ratio={goal.progressRatio} tone={tone} />
      </span>
    </button>
  );
}
```

`src/App.css` 在 Task 4 加的 `.goal-icon--lg` 之後加：

```css
/* Savings goal card (SavingsGoalCard): framed like the budget list. */
.savings-goal-card {
  display: flex;
  justify-content: space-between;
  align-items: stretch;
  gap: var(--space-4);
  width: 100%;
  padding: var(--space-row-y) var(--space-row-x);
  border: 1px solid var(--c-line);
  border-radius: var(--radius-lg);
  background: var(--c-surface);
  text-align: left;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.savings-goal-card-info {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-1);
  min-width: 0;
}

.savings-goal-card-info .goal-icon {
  margin-bottom: var(--space-2);
}

.savings-goal-card-name {
  font-size: var(--fs-body);
  color: var(--c-muted);
}

.savings-goal-card-amount {
  font-size: var(--fs-title);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--c-ink);
}

.savings-goal-card-meta {
  font-size: var(--fs-caption);
  font-variant-numeric: tabular-nums;
  color: var(--c-muted);
}

.savings-goal-card--archived .savings-goal-card-amount {
  color: var(--c-muted);
}

.savings-goal-card-side {
  display: flex;
  flex: none;
  flex-direction: column;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-3);
}

/* Status pill: soft fill + matching ink. */
.goal-status {
  display: inline-flex;
  align-items: center;
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-pill);
  font-size: var(--fs-caption);
  font-weight: 500;
  white-space: nowrap;
}

.goal-status--teal {
  background: var(--c-teal-soft);
  color: var(--c-teal-ink);
}

.goal-status--warn {
  background: var(--c-warn-soft);
  color: var(--c-warn-ink);
}

.goal-status--down {
  background: var(--c-down-soft);
  color: var(--c-down);
}

.goal-status--muted {
  background: var(--c-neutral-fill);
  color: var(--c-muted);
}

/* Cup: outlined in the status colour, filled from the bottom with its soft
   tint. Static on purpose. */
.goal-cup {
  position: relative;
  width: var(--space-10);
  height: calc(var(--space-10) * 1.5);
  border: 2px solid var(--c-teal);
  border-radius: var(--radius-sm) var(--radius-sm) var(--radius-lg) var(--radius-lg);
  background: var(--c-surface);
  overflow: hidden;
}

.goal-cup--lg {
  width: calc(var(--space-10) * 2);
  height: calc(var(--space-10) * 2.5);
}

.goal-cup--warn {
  border-color: var(--c-warn);
}

.goal-cup--down {
  border-color: var(--c-down);
}

.goal-cup--muted {
  border-color: var(--c-line-strong);
}

.goal-cup-fill {
  position: absolute;
  inset: auto 0 0;
  background: var(--c-teal-soft);
}

.goal-cup-fill--warn {
  background: var(--c-warn-soft);
}

.goal-cup-fill--down {
  background: var(--c-down-soft);
}

.goal-cup-fill--muted {
  background: var(--c-track);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/components/SavingsGoalCard.test.jsx`
Expected: PASS。

- [ ] **Step 6: Lint & commit**

```bash
npx eslint src/components/SavingsGoalCard.jsx src/components/SavingsGoalCard.test.jsx src/theme/tokens.js
git add src/components/SavingsGoalCard.jsx src/components/SavingsGoalCard.test.jsx src/index.css src/theme/tokens.js src/App.css
git commit -m "Draw a savings goal as a card with a status pill and a filled cup

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: 區塊列表 `SavingsGoalList`

**Files:**
- Create: `src/components/SavingsGoalList.jsx`
- Modify: `src/App.css`
- Test: `src/components/SavingsGoalList.test.jsx`（新）

**Interfaces:**
- Consumes: Task 5 的 `SavingsGoalCard`；既有 `EmptyState`、`Collapsible`（`src/components/Collapsible.jsx`，props `{ open, children }`，沒有 Web Animations API 時直接顯示／隱藏，所以 jsdom 測試不受影響）。
- Produces: default `SavingsGoalList({ goals: GoalRow[], onOpen, onCreate, disabled })`。

- [ ] **Step 1: Write the failing test**

建立 `src/components/SavingsGoalList.test.jsx`：

```js
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import SavingsGoalList from './SavingsGoalList'

const row = (id, name, extra = {}) => ({
  id,
  name,
  iconKey: 'savings',
  kind: 'open',
  targetTwd: 1000,
  targetMonths: null,
  deadline: null,
  cashAccountKeys: ['a'],
  isArchived: false,
  currentTwd: 500,
  status: 'in-progress',
  progressRatio: 0.5,
  shortfallTwd: 500,
  ...extra,
})

describe('<SavingsGoalList />', () => {
  it('lists open goals in order and hides archived ones until expanded', () => {
    render(
      <SavingsGoalList
        goals={[row(1, '買車'), row(2, '舊目標', { isArchived: true }), row(3, '出國')]}
        onOpen={vi.fn()}
        onCreate={vi.fn()}
      />,
    )
    const names = screen.getAllByRole('button', { name: /^查看儲蓄目標/ }).map((el) => el.getAttribute('aria-label'))
    expect(names).toEqual(['查看儲蓄目標：買車', '查看儲蓄目標：出國'])
    fireEvent.click(screen.getByRole('button', { name: '已封存（1）' }))
    expect(screen.getByRole('button', { name: '查看儲蓄目標：舊目標' })).toBeInTheDocument()
  })

  it('adds a goal from the title button', () => {
    const onCreate = vi.fn()
    render(<SavingsGoalList goals={[row(1, '買車')]} onOpen={vi.fn()} onCreate={onCreate} />)
    fireEvent.click(screen.getByRole('button', { name: '新增儲蓄目標' }))
    expect(onCreate).toHaveBeenCalled()
  })

  it('shows an empty state with an add button when nothing is open', () => {
    const onCreate = vi.fn()
    render(<SavingsGoalList goals={[row(2, '舊目標', { isArchived: true })]} onOpen={vi.fn()} onCreate={onCreate} />)
    expect(screen.getByText('還沒有儲蓄目標')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /新增目標/ }))
    expect(onCreate).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '已封存（1）' })).toBeInTheDocument()
  })

  it('disables adding when writes are off', () => {
    render(<SavingsGoalList goals={[]} onOpen={vi.fn()} onCreate={vi.fn()} disabled />)
    expect(screen.getByRole('button', { name: '新增儲蓄目標' })).toBeDisabled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/SavingsGoalList.test.jsx`
Expected: FAIL — 找不到 `./SavingsGoalList`。

- [ ] **Step 3: Implement**

建立 `src/components/SavingsGoalList.jsx`：

```jsx
import { useState } from "react";
import { Button, Typography } from "antd";
import { NavArrowDown, NavArrowRight, PiggyBank, Plus } from "iconoir-react";
import Collapsible from "./Collapsible";
import EmptyState from "./EmptyState";
import SavingsGoalCard from "./SavingsGoalCard";

const { Text } = Typography;

// 支出頁「儲蓄目標」: open goals stacked full width (rows arrive sorted by
// sortOrder); archived ones fold away at the bottom.

export default function SavingsGoalList({ goals = [], onOpen, onCreate, disabled = false }) {
  const [showArchived, setShowArchived] = useState(false);
  const open = goals.filter((goal) => !goal.isArchived);
  const archived = goals.filter((goal) => goal.isArchived);

  return (
    <section className="savings-goals-section">
      <div className="savings-goals-head">
        <Text strong className="savings-goals-title">
          儲蓄目標
        </Text>
        <Button
          type="text"
          size="small"
          className="title-add-btn"
          icon={<Plus />}
          aria-label="新增儲蓄目標"
          disabled={disabled}
          onClick={() => onCreate?.()}
        />
      </div>
      {open.length === 0 ? (
        <EmptyState icon={PiggyBank} description="還沒有儲蓄目標">
          <Button icon={<Plus />} disabled={disabled} onClick={() => onCreate?.()}>
            新增目標
          </Button>
        </EmptyState>
      ) : (
        <div className="savings-goal-list">
          {open.map((goal) => (
            <SavingsGoalCard key={goal.id} goal={goal} onOpen={onOpen} />
          ))}
        </div>
      )}
      {archived.length > 0 && (
        <div className="savings-goals-archived">
          <button
            type="button"
            className="savings-goals-archived-toggle"
            aria-expanded={showArchived}
            onClick={() => setShowArchived((value) => !value)}
          >
            {showArchived ? <NavArrowDown aria-hidden="true" /> : <NavArrowRight aria-hidden="true" />}
            <span>{`已封存（${archived.length}）`}</span>
          </button>
          <Collapsible open={showArchived}>
            <div className="savings-goal-list">
              {archived.map((goal) => (
                <SavingsGoalCard key={goal.id} goal={goal} onOpen={onOpen} />
              ))}
            </div>
          </Collapsible>
        </div>
      )}
    </section>
  );
}
```

`src/App.css`：

1. 把 `.savings-goals-title` 加進共用標題樣式的 selector 列表（`.mobile-list-title, .active-budgets-title, .analysis-title, .active-recurring-title {` 那條）。
2. 在 Task 5 的 cup 樣式之後加：

```css
/* 支出頁 儲蓄目標 section (SavingsGoalList). */
.savings-goals-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding-bottom: var(--space-section-head);
}

.savings-goal-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.savings-goals-archived {
  margin-top: var(--space-4);
}

.savings-goals-archived-toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  min-height: 44px;
  margin-bottom: var(--space-2);
  padding: 0;
  border: 0;
  background: transparent;
  font: inherit;
  font-size: var(--fs-body);
  color: var(--c-muted);
  cursor: pointer;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/SavingsGoalList.test.jsx`
Expected: PASS。

- [ ] **Step 5: Lint & commit**

```bash
npx eslint src/components/SavingsGoalList.jsx src/components/SavingsGoalList.test.jsx
git add src/components/SavingsGoalList.jsx src/components/SavingsGoalList.test.jsx src/App.css
git commit -m "List savings goals with archived ones folded at the bottom

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: 詳細頁 `SavingsGoalDetailSheet`

**Files:**
- Create: `src/components/SavingsGoalDetailSheet.jsx`
- Modify: `src/App.css`
- Test: `src/components/SavingsGoalDetailSheet.test.jsx`（新）

**Interfaces:**
- Consumes: Task 1 的 `getGoalFacts`、`getGoalTargetLabel`；Task 4 的 `GoalIcon`；Task 5 的 `GoalCup`、`GoalStatusPill`；`useBodyScrollLock`。
- Produces: default `SavingsGoalDetailSheet({ open, goal: GoalRow|null, isMobile, onClose, onEdit, onToggleArchive, onDelete, disabled })`。

- [ ] **Step 1: Write the failing test**

建立 `src/components/SavingsGoalDetailSheet.test.jsx`：

```js
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import SavingsGoalDetailSheet from './SavingsGoalDetailSheet'

const goal = {
  id: 1,
  name: '緊急預備金',
  iconKey: 'emergency',
  kind: 'ongoing',
  targetTwd: 300000,
  targetMonths: 6,
  deadline: null,
  cashAccountKeys: ['a', 'b', 'gone'],
  isArchived: false,
  currentTwd: 250000,
  status: 'below',
  progressRatio: 0.8333,
  shortfallTwd: 50000,
  averageMonthlyExpenseTwd: 50000,
  monthsUsed: 12,
  missingAccountCount: 1,
  accounts: [
    { key: 'a', bankName: '台新', accountAlias: '日常', holder: 'Po', balanceTwd: 200000, sharedWith: ['買車'] },
    { key: 'b', bankName: '國泰', accountAlias: '備用', holder: null, balanceTwd: 50000, sharedWith: [] },
  ],
}

const renderSheet = (props = {}) => {
  const handlers = { onClose: vi.fn(), onEdit: vi.fn(), onToggleArchive: vi.fn(), onDelete: vi.fn() }
  render(<SavingsGoalDetailSheet open goal={goal} isMobile {...handlers} {...props} />)
  return handlers
}

describe('<SavingsGoalDetailSheet />', () => {
  it('summarises the goal and how its target is worked out', () => {
    renderSheet()
    const head = screen.getByTestId('savings-goal-detail-head')
    expect(head).toHaveTextContent('$250,000')
    expect(head).toHaveTextContent('目標 $300,000（6 個月）')
    expect(head).toHaveTextContent('低於目標')
    expect(screen.getByText('平均月支出 $50,000 × 6 個月 = $300,000')).toBeInTheDocument()
    expect(screen.getByText('近 12 個完整月的支出')).toBeInTheDocument()
  })

  it('lists the linked accounts, other goals sharing them, and deleted links', () => {
    renderSheet()
    expect(screen.getByText('台新・日常')).toBeInTheDocument()
    expect(screen.getByText('$200,000')).toBeInTheDocument()
    expect(screen.getByText('也計入：買車')).toBeInTheDocument()
    expect(screen.getByText('國泰・備用')).toBeInTheDocument()
    expect(screen.getByText('未設定')).toBeInTheDocument()
    expect(screen.getByText('1 個帳戶已刪除')).toBeInTheDocument()
  })

  it('says so when no account is linked', () => {
    renderSheet({ goal: { ...goal, accounts: [], cashAccountKeys: [], missingAccountCount: 0 } })
    expect(screen.getByText('尚未選擇帳戶')).toBeInTheDocument()
  })

  it('edits, archives and deletes', () => {
    const handlers = renderSheet()
    fireEvent.click(screen.getByRole('button', { name: /編輯/ }))
    expect(handlers.onEdit).toHaveBeenCalledWith(goal)
    fireEvent.click(screen.getByRole('button', { name: '封存' }))
    expect(handlers.onToggleArchive).toHaveBeenCalledWith(goal)
    fireEvent.click(screen.getByRole('button', { name: '刪除' }))
    expect(handlers.onDelete).toHaveBeenCalledWith(goal)
  })

  it('offers 取消封存 for an archived goal and hides its status', () => {
    renderSheet({ goal: { ...goal, isArchived: true } })
    expect(screen.getByRole('button', { name: '取消封存' })).toBeInTheDocument()
    expect(screen.queryByText('低於目標')).toBeNull()
  })

  it('renders nothing without a goal', () => {
    const { container } = render(<SavingsGoalDetailSheet open={false} goal={null} isMobile />)
    expect(container).toBeEmptyDOMElement()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/SavingsGoalDetailSheet.test.jsx`
Expected: FAIL — 找不到 `./SavingsGoalDetailSheet`。

- [ ] **Step 3: Implement**

建立 `src/components/SavingsGoalDetailSheet.jsx`：

```jsx
import { Button, Drawer } from "antd";
import { EditPencil } from "iconoir-react";
import useBodyScrollLock from "../hooks/useBodyScrollLock";
import { formatTwd } from "../utils/formatters";
import {
  GOAL_STATUS_META,
  getGoalFacts,
  getGoalTargetLabel,
} from "../utils/savingsGoals";
import GoalIcon from "./GoalIcon";
import { GoalCup, GoalStatusPill } from "./SavingsGoalCard";

// A savings goal's detail: the head (amount, target, status, cup), how the
// target or pace is worked out, the linked accounts, then archive / delete.
// Bottom sheet on mobile, side drawer on desktop.

export default function SavingsGoalDetailSheet({
  open,
  goal,
  isMobile,
  onClose,
  onEdit,
  onToggleArchive,
  onDelete,
  disabled = false,
}) {
  useBodyScrollLock(Boolean(open && goal && isMobile));
  if (!goal) return null;
  const tone = goal.isArchived
    ? "muted"
    : (GOAL_STATUS_META[goal.status]?.tone ?? "teal");
  const facts = getGoalFacts(goal);

  return (
    <Drawer
      placement={isMobile ? "bottom" : "right"}
      size={isMobile ? "90vh" : 420}
      title={goal.name}
      open={open}
      onClose={onClose}
      destroyOnHidden
      className={`savings-goal-sheet${isMobile ? " form-bottom-sheet" : ""}`}
      extra={
        <Button
          type="text"
          icon={<EditPencil />}
          disabled={disabled}
          onClick={() => onEdit?.(goal)}
        >
          編輯
        </Button>
      }
    >
      <div className="savings-goal-detail-head" data-testid="savings-goal-detail-head">
        <div className="savings-goal-detail-info">
          <GoalIcon iconKey={goal.iconKey} size="lg" />
          {!goal.isArchived && <GoalStatusPill status={goal.status} />}
          <span className="savings-goal-detail-amount">{formatTwd(goal.currentTwd)}</span>
          <span className="savings-goal-card-meta">{getGoalTargetLabel(goal)}</span>
        </div>
        <GoalCup ratio={goal.progressRatio} tone={tone} size="lg" />
      </div>

      {facts.length > 0 && (
        <dl className="savings-goal-facts">
          {facts.map((fact) => (
            <div key={fact.label} className="savings-goal-fact">
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <h3 className="savings-goal-detail-subtitle">帳戶</h3>
      {goal.accounts.length === 0 && goal.missingAccountCount === 0 ? (
        <p className="savings-goal-detail-empty">尚未選擇帳戶</p>
      ) : (
        <ul className="savings-goal-accounts">
          {goal.accounts.map((account) => (
            <li key={account.key} className="savings-goal-account">
              <div className="savings-goal-account-top">
                <span className="savings-goal-account-name">
                  {`${account.bankName}・${account.accountAlias}`}
                </span>
                <span className="savings-goal-account-balance">
                  {formatTwd(account.balanceTwd)}
                </span>
              </div>
              <span className="savings-goal-card-meta">{account.holder ?? "未設定"}</span>
              {account.sharedWith.length > 0 && (
                <span className="savings-goal-card-meta">
                  {`也計入：${account.sharedWith.join("、")}`}
                </span>
              )}
            </li>
          ))}
          {goal.missingAccountCount > 0 && (
            <li className="savings-goal-account savings-goal-card-meta">
              {`${goal.missingAccountCount} 個帳戶已刪除`}
            </li>
          )}
        </ul>
      )}

      <div className="savings-goal-detail-actions">
        <Button block disabled={disabled} onClick={() => onToggleArchive?.(goal)}>
          {goal.isArchived ? "取消封存" : "封存"}
        </Button>
        <Button block danger disabled={disabled} onClick={() => onDelete?.(goal)}>
          刪除
        </Button>
      </div>
    </Drawer>
  );
}
```

`src/App.css` 在 Task 6 的樣式之後加：

```css
/* Savings goal detail (SavingsGoalDetailSheet). */
.savings-goal-detail-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: var(--space-4);
  margin-bottom: var(--space-6);
}

.savings-goal-detail-info {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-2);
  min-width: 0;
}

.savings-goal-detail-amount {
  font-size: var(--fs-hero);
  font-weight: 700;
  line-height: 1.15;
  font-variant-numeric: tabular-nums;
  color: var(--c-ink);
}

.savings-goal-facts {
  margin: 0 0 var(--space-6);
  border-top: 1px solid var(--c-line);
}

.savings-goal-fact {
  display: flex;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-3) 0;
  border-bottom: 1px solid var(--c-line);
  font-size: var(--fs-body);
}

.savings-goal-fact dt {
  color: var(--c-muted);
}

.savings-goal-fact dd {
  margin: 0;
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: var(--c-ink);
}

.savings-goal-detail-subtitle {
  margin: 0 0 var(--space-section-head);
  font-size: var(--fs-subhead);
  font-weight: 600;
  color: var(--c-ink);
}

.savings-goal-detail-empty {
  margin: 0 0 var(--space-6);
  font-size: var(--fs-body);
  color: var(--c-muted);
}

.savings-goal-accounts {
  margin: 0 0 var(--space-6);
  padding: 0;
  list-style: none;
  border: 1px solid var(--c-line);
  border-radius: var(--radius-lg);
}

.savings-goal-account {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-row-y) var(--space-row-x);
}

.savings-goal-account + .savings-goal-account {
  border-top: 1px solid var(--c-line);
}

.savings-goal-account-top {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
}

.savings-goal-account-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
  color: var(--c-ink);
}

.savings-goal-account-balance {
  flex: none;
  font-variant-numeric: tabular-nums;
  color: var(--c-ink);
}

.savings-goal-detail-actions {
  display: flex;
  gap: var(--space-3);
}
```

注意：詳細頁的金額用 `--fs-hero`（sheet 內的大數字，不是頁面 display）。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/SavingsGoalDetailSheet.test.jsx`
Expected: PASS。若 antd Drawer 在 jsdom 沒把內容 render 出來（`open` 但找不到文字），參考 `BudgetDetailSheet.test.jsx` 的寫法——它同樣用 `Drawer`，能直接 `getByText`。

- [ ] **Step 5: Lint & commit**

```bash
npx eslint src/components/SavingsGoalDetailSheet.jsx src/components/SavingsGoalDetailSheet.test.jsx
git add src/components/SavingsGoalDetailSheet.jsx src/components/SavingsGoalDetailSheet.test.jsx src/App.css
git commit -m "Open a savings goal to see its pace, accounts and actions

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: 表單 `SavingsGoalForm`

**Files:**
- Create: `src/components/SavingsGoalForm.jsx`
- Modify: `src/App.css`
- Test: `src/components/SavingsGoalForm.test.jsx`（新）

**Interfaces:**
- Consumes: Task 1 的 `GOAL_KIND`、`GOAL_ICON_OPTIONS`、`getGoalIconKey`、`ONGOING_MONTHS_*`；Task 4 的 `GOAL_ICON_COMPONENTS`、泛用 `CategoryIconPicker`。
- Produces: default `SavingsGoalForm({ formId, onSubmit, initialValues: GoalRow|null, accountOptions, averageMonthlyExpenseTwd, today, popupContainer, disabled })`；`onSubmit` 收到 `{ name, icon, kind, targetTwd, targetMonths, deadline: 'YYYY-MM-DD'|null, cashAccountKeys }`。

- [ ] **Step 1: Write the failing test**

建立 `src/components/SavingsGoalForm.test.jsx`：

```js
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SavingsGoalForm from './SavingsGoalForm'

const accountOptions = [
  { key: 'k1', bankName: '台新', accountAlias: '日常', holder: 'Po', balanceTwd: 30000 },
  { key: 'k2', bankName: '國泰', accountAlias: '備用', holder: null, balanceTwd: 5000 },
]

const renderForm = (props = {}) => {
  const onSubmit = vi.fn().mockResolvedValue(undefined)
  render(
    <>
      <SavingsGoalForm
        formId="goal-form"
        onSubmit={onSubmit}
        accountOptions={accountOptions}
        averageMonthlyExpenseTwd={50000}
        today="2026-10-10"
        {...props}
      />
      <button type="submit" form="goal-form">送出</button>
    </>,
  )
  return onSubmit
}

describe('<SavingsGoalForm />', () => {
  it('creates an open goal with the picked accounts', async () => {
    const user = userEvent.setup()
    const onSubmit = renderForm()
    await user.type(screen.getByLabelText('名稱'), '買車')
    await user.click(screen.getByText('無期限'))
    await user.type(screen.getByLabelText('目標金額'), '500000')
    await user.click(screen.getByRole('checkbox', { name: /台新・日常/ }))
    await user.click(screen.getByRole('button', { name: '送出' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit).toHaveBeenCalledWith({
      name: '買車',
      icon: null,
      kind: 'open',
      targetTwd: 500000,
      targetMonths: null,
      deadline: null,
      cashAccountKeys: ['k1'],
    })
  })

  it('previews the icon from the name', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.type(screen.getByLabelText('名稱'), '換手機')
    expect(screen.getByRole('button', { name: '手機' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('asks for months on an ongoing goal and previews the target', async () => {
    const user = userEvent.setup()
    const onSubmit = renderForm()
    await user.type(screen.getByLabelText('名稱'), '緊急預備金')
    await user.click(screen.getByText('常態'))
    expect(screen.queryByLabelText('目標金額')).toBeNull()
    expect(screen.getByText('≈ $300,000（平均月支出 $50,000）')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '送出' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ kind: 'ongoing', targetMonths: 6, targetTwd: null })
  })

  it('requires a deadline for a deadline goal', async () => {
    const user = userEvent.setup()
    const onSubmit = renderForm()
    await user.type(screen.getByLabelText('名稱'), '日本旅遊')
    await user.type(screen.getByLabelText('目標金額'), '150000')
    await user.click(screen.getByRole('button', { name: '送出' }))
    expect(await screen.findByText('請選擇到期日')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('saves an overdue goal without changing its deadline', async () => {
    const user = userEvent.setup()
    const onSubmit = renderForm({
      initialValues: {
        id: 1, name: '舊目標', icon: 'travel', kind: 'deadline', targetTwd: 1000, targetMonths: null,
        deadline: '2026-05-01', cashAccountKeys: ['k2', 'gone'],
      },
    })
    await user.click(screen.getByRole('button', { name: '送出' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      name: '舊目標', icon: 'travel', kind: 'deadline', deadline: '2026-05-01', cashAccountKeys: ['k2', 'gone'],
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/SavingsGoalForm.test.jsx`
Expected: FAIL — 找不到 `./SavingsGoalForm`。

- [ ] **Step 3: Implement**

建立 `src/components/SavingsGoalForm.jsx`：

```jsx
import { useRef } from "react";
import { Checkbox, DatePicker, Form, Input, InputNumber, Segmented } from "antd";
import dayjs from "dayjs";
import CategoryIconPicker from "./CategoryIconPicker";
import { GOAL_ICON_COMPONENTS } from "./goalIconComponents";
import { formatTwd } from "../utils/formatters";
import {
  GOAL_ICON_OPTIONS,
  GOAL_KIND,
  ONGOING_MONTHS_DEFAULT,
  ONGOING_MONTHS_MAX,
  ONGOING_MONTHS_MIN,
  getGoalIconKey,
} from "../utils/savingsGoals";

// Add / edit one savings goal. Owns its antd Form; the parent submits it
// through `formId` (sheet footer or modal OK) and remounts it per open.
// Links the parent no longer lists (a deleted account) are kept on save.

const KIND_OPTIONS = [
  { label: "有期限", value: GOAL_KIND.DEADLINE },
  { label: "無期限", value: GOAL_KIND.OPEN },
  { label: "常態", value: GOAL_KIND.ONGOING },
];

export default function SavingsGoalForm({
  formId,
  onSubmit,
  initialValues = null,
  accountOptions = [],
  averageMonthlyExpenseTwd = null,
  today,
  popupContainer,
  disabled = false,
}) {
  const [form] = Form.useForm();
  const submittingRef = useRef(false);
  const name = Form.useWatch("name", form) ?? "";
  const kind = Form.useWatch("kind", form) ?? initialValues?.kind ?? GOAL_KIND.DEADLINE;
  const months = Form.useWatch("targetMonths", form);
  const previousDeadline = initialValues?.deadline ?? null;
  const listedKeys = new Set(accountOptions.map((item) => item.key));
  const unlistedKeys = (initialValues?.cashAccountKeys ?? []).filter(
    (key) => !listedKeys.has(key),
  );

  const handleFinish = async (values) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      await onSubmit({
        name: values.name,
        icon: values.icon ?? null,
        kind: values.kind,
        targetTwd: values.kind === GOAL_KIND.ONGOING ? null : values.targetTwd,
        targetMonths: values.kind === GOAL_KIND.ONGOING ? values.targetMonths : null,
        deadline:
          values.kind === GOAL_KIND.DEADLINE && values.deadline
            ? values.deadline.format("YYYY-MM-DD")
            : null,
        cashAccountKeys: [...(values.cashAccountKeys ?? []), ...unlistedKeys],
      });
    } finally {
      submittingRef.current = false;
    }
  };

  const ongoingPreview =
    averageMonthlyExpenseTwd === null
      ? "還沒有完整月份的支出資料，暫時無法計算"
      : `≈ ${formatTwd(averageMonthlyExpenseTwd * (Number(months) || 0))}（平均月支出 ${formatTwd(averageMonthlyExpenseTwd)}）`;

  return (
    <Form
      id={formId}
      form={form}
      name="savings_goal_form"
      layout="vertical"
      disabled={disabled}
      autoComplete="off"
      initialValues={{
        name: initialValues?.name ?? "",
        icon: initialValues?.icon ?? null,
        kind: initialValues?.kind ?? GOAL_KIND.DEADLINE,
        targetTwd: initialValues?.kind === GOAL_KIND.ONGOING ? undefined : (initialValues?.targetTwd ?? undefined),
        targetMonths: initialValues?.targetMonths ?? ONGOING_MONTHS_DEFAULT,
        deadline: initialValues?.deadline ? dayjs(initialValues.deadline) : undefined,
        cashAccountKeys: (initialValues?.cashAccountKeys ?? []).filter((key) => listedKeys.has(key)),
      }}
      onFinish={handleFinish}
    >
      <Form.Item
        label="名稱"
        name="name"
        rules={[{ required: true, whitespace: true, message: "請輸入名稱" }]}
      >
        <Input />
      </Form.Item>
      <Form.Item label="圖示" name="icon">
        <CategoryIconPicker
          name={name}
          options={GOAL_ICON_OPTIONS}
          components={GOAL_ICON_COMPONENTS}
          resolveByName={getGoalIconKey}
          groupLabel="目標圖示"
          disabled={disabled}
        />
      </Form.Item>
      <Form.Item label="類型" name="kind">
        <Segmented block options={KIND_OPTIONS} />
      </Form.Item>
      {kind !== GOAL_KIND.ONGOING && (
        <Form.Item
          label="目標金額"
          name="targetTwd"
          rules={[{ required: true, message: "請輸入目標金額" }]}
        >
          <InputNumber
            min={1}
            precision={0}
            inputMode="numeric"
            prefix="$"
            style={{ width: "100%" }}
          />
        </Form.Item>
      )}
      {kind === GOAL_KIND.DEADLINE && (
        <Form.Item
          label="到期日"
          name="deadline"
          rules={[
            { required: true, message: "請選擇到期日" },
            {
              validator: (_, value) => {
                if (!value) return Promise.resolve();
                const date = value.format("YYYY-MM-DD");
                return date === previousDeadline || date > today
                  ? Promise.resolve()
                  : Promise.reject(new Error("到期日須晚於今天"));
              },
            },
          ]}
        >
          <DatePicker
            style={{ width: "100%" }}
            inputReadOnly
            getPopupContainer={popupContainer}
          />
        </Form.Item>
      )}
      {kind === GOAL_KIND.ONGOING && (
        <Form.Item
          label="幾個月的支出"
          name="targetMonths"
          extra={ongoingPreview}
          rules={[{ required: true, message: "請輸入月數" }]}
        >
          <InputNumber
            min={ONGOING_MONTHS_MIN}
            max={ONGOING_MONTHS_MAX}
            precision={0}
            inputMode="numeric"
            suffix="個月"
            style={{ width: "100%" }}
          />
        </Form.Item>
      )}
      <Form.Item
        label="計入的銀行帳戶"
        name="cashAccountKeys"
        extra={accountOptions.length === 0 ? "還沒有銀行帳戶，可先儲存再到資產頁新增" : undefined}
      >
        <Checkbox.Group className="savings-goal-account-options">
          {accountOptions.map((account) => (
            <Checkbox key={account.key} value={account.key}>
              <span className="savings-goal-account-option">
                <span>{`${account.bankName}・${account.accountAlias}`}</span>
                <span className="savings-goal-card-meta">
                  {`${account.holder ?? "未設定"}・${formatTwd(account.balanceTwd)}`}
                </span>
              </span>
            </Checkbox>
          ))}
        </Checkbox.Group>
      </Form.Item>
    </Form>
  );
}
```

`src/App.css` 在 Task 7 的樣式之後加：

```css
/* SavingsGoalForm account checklist: one account per line. */
.savings-goal-account-options {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.savings-goal-account-option {
  display: inline-flex;
  flex-direction: column;
  gap: var(--space-1);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/SavingsGoalForm.test.jsx`
Expected: PASS。若 `getByLabelText('目標金額')` 找不到 InputNumber，確認 antd 的 `Form.Item` 有把 `label` 的 `htmlFor` 接到 input id（`ExpenseTemplateForm.test.jsx` 用同樣寫法取 `固定金額`，可對照）。

- [ ] **Step 5: Lint & commit**

```bash
npx eslint src/components/SavingsGoalForm.jsx src/components/SavingsGoalForm.test.jsx
git add src/components/SavingsGoalForm.jsx src/components/SavingsGoalForm.test.jsx src/App.css
git commit -m "Add the savings goal form with per-kind fields

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: 接進 `App.jsx`、更新 `DESIGN.md`、瀏覽器驗證

**Files:**
- Modify: `src/App.jsx`
- Modify: `DESIGN.md`

**Interfaces:**
- Consumes: Task 3 的 `upsertSavingsGoal`、`setSavingsGoalArchived`、`removeSavingsGoal`、view 欄位；Task 6–8 的元件。
- Produces: 完整功能。

- [ ] **Step 1: Imports and constants**

`src/App.jsx`：

- 元件 import 區（`import BudgetDetailSheet from "./components/BudgetDetailSheet";` 附近）加：

```js
import SavingsGoalList from "./components/SavingsGoalList";
import SavingsGoalDetailSheet from "./components/SavingsGoalDetailSheet";
import SavingsGoalForm from "./components/SavingsGoalForm";
```

- `./services/portfolioService` 的 import 清單（`upsertBudget,` `removeBudget,` 那段）加 `upsertSavingsGoal,`、`setSavingsGoalArchived,`、`removeSavingsGoal,`。
- `const TEMPLATE_FORM_ID = "expense-template-form";` 之後加 `const GOAL_FORM_ID = "savings-goal-form";`。

- [ ] **Step 2: State and data**

在 `const [budgetDetailId, setBudgetDetailId] = useState(null);` 之後加：

```js
  const [savingsGoals, setSavingsGoals] = useState([]);
  const [savingsGoalAccountOptions, setSavingsGoalAccountOptions] = useState([]);
  const [savingsGoalDetailId, setSavingsGoalDetailId] = useState(null);
  const [isGoalFormOpen, setIsGoalFormOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [goalFormKey, setGoalFormKey] = useState(0);
  const [loadingGoalAction, setLoadingGoalAction] = useState(false);
```

`loadExpenseData` 內，`setExpenseMonthlySummaries(view.monthlySummaries ?? []);` 之後加：

```js
      setSavingsGoals(view.savingsGoals ?? []);
      setSavingsGoalAccountOptions(view.savingsGoalAccountOptions ?? []);
```

在 `const budgetDetail = useMemo(...)` 之後加：

```js
  const savingsGoalDetail = useMemo(
    () => savingsGoals.find((goal) => goal.id === savingsGoalDetailId) ?? null,
    [savingsGoals, savingsGoalDetailId],
  );

  // Every ongoing goal uses the same average; the form previews from it.
  const averageMonthlyExpenseTwd = useMemo(
    () => averageMonthlyExpense(expenseMonthlySummaries).averageTwd,
    [expenseMonthlySummaries],
  );
```

並在 import 區加 `import { averageMonthlyExpense } from "./utils/savingsGoals";`（不要在 App 裡重寫一份規則）。

- [ ] **Step 3: Handlers**

在 `handleRemoveTemplate` 之後加：

```js
  const openGoalForm = useCallback((goal = null) => {
    setEditingGoal(goal);
    setGoalFormKey((key) => key + 1);
    setIsGoalFormOpen(true);
  }, []);

  const closeGoalForm = useCallback(() => {
    setIsGoalFormOpen(false);
    setEditingGoal(null);
  }, []);

  const handleSubmitGoal = useCallback(
    async (values) => {
      try {
        setLoadingGoalAction(true);
        await upsertSavingsGoal({ id: editingGoal?.id, ...values });
        // Saved: close now so a failing refresh can't invite a second save.
        setIsGoalFormOpen(false);
        setEditingGoal(null);
        message.success(editingGoal ? "儲蓄目標已更新" : "已新增儲蓄目標");
        refreshExpenseDataInBackground();
      } catch (error) {
        message.error(toUserMessage(error, "儲存儲蓄目標失敗"));
      } finally {
        setLoadingGoalAction(false);
      }
    },
    [editingGoal, message, refreshExpenseDataInBackground],
  );

  const handleToggleGoalArchive = useCallback(
    async (goal) => {
      try {
        setLoadingGoalAction(true);
        await setSavingsGoalArchived({ id: goal.id, archived: !goal.isArchived });
        setSavingsGoalDetailId(null);
        message.success(goal.isArchived ? "已取消封存" : "已封存");
        refreshExpenseDataInBackground();
      } catch (error) {
        message.error(toUserMessage(error, "更新儲蓄目標失敗"));
      } finally {
        setLoadingGoalAction(false);
      }
    },
    [message, refreshExpenseDataInBackground],
  );

  const handleRemoveGoal = useCallback(
    (goal) => {
      confirmDestructive({
        title: `刪除「${goal.name}」？`,
        content: "刪除後無法復原；計入的銀行帳戶不受影響。",
        onOk: async () => {
          try {
            await removeSavingsGoal({ id: goal.id });
            setSavingsGoalDetailId(null);
            message.success("儲蓄目標已刪除");
            refreshExpenseDataInBackground();
          } catch (error) {
            message.error(toUserMessage(error, "刪除儲蓄目標失敗"));
          }
        },
      });
    },
    [confirmDestructive, message, refreshExpenseDataInBackground],
  );
```

在 `expenseTemplateFormNode` 定義之後加：

```jsx
  const savingsGoalFormNode = (
    <SavingsGoalForm
      key={goalFormKey}
      formId={GOAL_FORM_ID}
      onSubmit={handleSubmitGoal}
      initialValues={editingGoal}
      accountOptions={savingsGoalAccountOptions}
      averageMonthlyExpenseTwd={averageMonthlyExpenseTwd}
      today={dayjs().format("YYYY-MM-DD")}
      popupContainer={getSheetPopupContainer}
      disabled={isWriteDisabled}
    />
  );
```

- [ ] **Step 4: Render**

支出頁：在預算區塊的 `</Col>`（包住 `<section className="active-budgets-section">` 的那個 `Col`）之後、`<RecurringOverview` 那個 `Col` 之前加：

```jsx
                  <Col xs={24}>
                    <SavingsGoalList
                      goals={savingsGoals}
                      onOpen={(goal) => setSavingsGoalDetailId(goal.id)}
                      onCreate={() => openGoalForm()}
                      disabled={isWriteDisabled}
                    />
                  </Col>
```

在 `BudgetDetailSheet` 的 `{isMobileViewport && (...)}` 區塊之後加：

```jsx
          <SavingsGoalDetailSheet
            open={Boolean(savingsGoalDetail) && !isGoalFormOpen}
            goal={savingsGoalDetail}
            isMobile={isMobileViewport}
            onClose={() => setSavingsGoalDetailId(null)}
            onEdit={(goal) => openGoalForm(goal)}
            onToggleArchive={handleToggleGoalArchive}
            onDelete={handleRemoveGoal}
            disabled={isWriteDisabled || loadingGoalAction}
          />

          <MobileFormSheetLayout
            title={editingGoal ? "編輯儲蓄目標" : "新增儲蓄目標"}
            open={isMobileViewport && isGoalFormOpen}
            onClose={closeGoalForm}
            loading={loadingGoalAction}
            submitDisabled={isWriteDisabled}
            submitText="儲存"
            submitFormId={GOAL_FORM_ID}
          >
            {isMobileViewport && savingsGoalFormNode}
          </MobileFormSheetLayout>

          <Modal
            title={editingGoal ? "編輯儲蓄目標" : "新增儲蓄目標"}
            open={!isMobileViewport && isGoalFormOpen}
            onCancel={() => {
              if (!loadingGoalAction) closeGoalForm();
            }}
            confirmLoading={loadingGoalAction}
            okButtonProps={{
              disabled: isWriteDisabled,
              htmlType: "submit",
              form: GOAL_FORM_ID,
            }}
            okText="儲存"
            destroyOnHidden
          >
            {!isMobileViewport && savingsGoalFormNode}
          </Modal>
```

（編輯時詳細頁先讓位給表單——`open` 帶 `!isGoalFormOpen`——表單關閉後詳細頁會以更新後的資料重新出現，因為 `savingsGoalDetailId` 沒被清掉。）

- [ ] **Step 5: Update DESIGN.md**

1. frontmatter `colors:` 在 `warn-ink: "#A36100"` 之後加：

```yaml
  warn-soft: "#F6EBD3"
  down-soft: "#F7DEDF"
```

2. `### Semantic` 在 Warn Ink 那行之後加：

```markdown
- **Warn Soft / Down Soft** (`warn-soft`, `down-soft`)：warn / down 狀態的淡底，目前只用在儲蓄目標的狀態膠囊與容器圖填色；上面的字用 `warn-ink` / `down`。
```

3. `### Expense Tab Order` 改成：

```markdown
### Expense Tab Order
支出頁由上而下：hero → 支出列表（本月預計 → 日期條＋當天，讓一進頁面就看到今天）→ 預算（最急的在前；桌面為自動換行的網格，不橫向捲動）→ 儲蓄目標 → 定期支出 → 支出分析，區塊間距 `--space-section`。支出分析是參考資料，放在最後，樣式見 Analysis List。
```

4. 在 `### Budget Bar` 段落之後新增：

```markdown
### Savings Goal Card（儲蓄目標）
- 全寬卡片垂直堆疊（間距 `--space-3`），外框同預算列表：1px `line`、`radius-lg`、`surface` 底、列內距 `--space-row-y` / `--space-row-x`。手機與桌面同一套。
- 左側：目標圖示 tile（`GoalIcon`：`neutral-fill` 圓底 + `ink` 圖示，10 個目標專用圖示，與支出分類圖示分開）→ 名稱（`muted` 14px）→ 目前金額（title 20px 600，不是 display：支出頁的 display 只給總支出）→「目標 $X」與一行補充（`muted` caption）。
- 右側：狀態膠囊（淡底 + 同色系字：teal 系 `teal-soft` / `teal-ink`、warn 系 `warn-soft` / `warn-ink`、down 系 `down-soft` / `down`、資料不足 `neutral-fill` / `muted`）在上，容器圖在下：2px 狀態色外框、上小下大圓角（`radius-sm` / `radius-lg`），由下往上填該狀態的淡色。**容器圖是靜態的**，遵守 The One Living Thing Rule（支出頁會動的只有存錢塔）。
- 已封存的目標收在區塊底部「已封存（N）」，展開後金額改 `muted`、不顯示膠囊、容器為 `line-strong` 框 + `track` 填色。
- 詳細頁：手機 bottom sheet、桌面右側 drawer；金額用 hero 字級（sheet 內的大數字）。
- 規格來源：`docs/superpowers/specs/2026-10-10-savings-goals-design.md`。
```

5. `### Icons` 段落裡關於分類圖示那條之後加一句：

```markdown
- **目標圖示（Goal Icon）：** 儲蓄目標用 10 個專用圖示（`src/components/goalIconComponents.js`：存錢 `PiggyBank`、緊急預備金 `Umbrella`、買車 `Car`、旅遊 `Airplane`、手機 `SmartphoneDevice`、買房 `Home`、結婚 `Rings`、教育 `GraduationCap`、電腦 `Laptop`、醫療 `Healthcare`），選圖沿用 `CategoryIconPicker`；沒選時依名稱關鍵字對應（`src/utils/savingsGoals.js`），對不到用 `PiggyBank`。
```

- [ ] **Step 6: Full test suite, lint, build**

```bash
npm test
npm run lint
npm run build
```

Expected: 全部 PASS、lint 無錯、build 成功。

- [ ] **Step 7: Browser verification**

使用者的規則：build 成功不等於執行正常，push 前要在瀏覽器看過。啟動 `npm run dev`，用 `run` 或 `claude-in-chrome` skill 開支出頁，在**手機寬度（約 390px）與桌面寬度**各檢查：

1. 「儲蓄目標」區塊出現在預算之後、定期支出之前；空狀態有「新增目標」。
2. 新增三種類型各一個（有期限、無期限、常態），綁定至少一個帳戶；卡片金額、目標、補充文字、膠囊顏色、容器填色都合理。
3. 兩個目標綁同一帳戶：詳細頁顯示「也計入：…」。
4. 點卡片 → 詳細頁 → 編輯 → 改名稱儲存 → 詳細頁回來且已更新。
5. 封存 → 卡片移到「已封存（1）」；取消封存 → 回到列表。
6. 刪除 → 有確認框 → 卡片消失。
7. 到資產頁把某帳戶餘額改掉 → 回支出頁，目標金額跟著變。
8. Console 沒有新的 error / warning。

未登入或沒有 Firebase 設定時無法寫入：這時至少確認區塊與空狀態正常 render、新增按鈕為停用，並在回報裡說明哪些步驟沒能實測。

- [ ] **Step 8: Commit**

```bash
git add src/App.jsx DESIGN.md
git commit -m "Show savings goals on the expense tab

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
