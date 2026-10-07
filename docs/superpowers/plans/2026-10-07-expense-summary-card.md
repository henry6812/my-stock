# 支出摘要卡 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把支出頁上半部換成一張參考圖風格的摘要卡：置中直排、teal 單色無漸層、月份長條切換、月份模式用減法塔（保留敲碎）、累計模式用逐月結餘成長塔。

**Architecture:** 純計算放 `src/utils/`（每月收支彙整、減法塔加待扣段、成長塔版面），繪圖與動畫放 `src/components/`（`SavingsTower` 改造、新 `SavingsGrowthTower`、`ExpenseMonthBars`、組合用的 `ExpenseSummaryCard`）。`portfolioService.getExpenseDashboardView` 多回傳 `monthlySummaries`；`App.jsx` 只把現有 state 接進卡片並刪掉舊 hero。

**Tech Stack:** React 19、Vitest + @testing-library/react（jsdom）、純 SVG + CSS animation（不加套件）。

**Spec:** `docs/superpowers/specs/2026-10-07-expense-summary-card-design.md`

## Global Constraints

- 所有 `npm` / `npx` 指令在 `my-stock/` 下執行。
- 主色只用 teal：`--c-teal`（#2b7f74）、`--c-teal-soft`（#e4f1ee）、`--c-teal-ink`（#1e5e56）；淡 teal 長條 `#e1efec`、累計模式長條 `#c4e0da`、定期殘影 `#9fcfc6`、單筆殘影 `#cfe6e1`。**任何地方都不得使用漸層**（`linearGradient` / `linear-gradient`）。
- 超支紅色只用 `--c-down`（#cf1322）系。
- 長條上與長條下不得有任何文字；唯一文字是「累計」膠囊。
- 手機與桌機同一套卡片；卡片寬 `min(420px, 100%)` 置中。
- 不改 schema、Firestore mapper；不加套件。
- 動畫在 `prefers-reduced-motion: reduce` 時直接顯示終態。
- React hooks 規則：沿用 `SavingsTower` 的寫法——state 調整在 render 期間做、`setState` 只在 timer callback 內呼叫，不在 effect 本體同步呼叫。
- UI 文字為繁體中文；code、class 名稱、commit message 為英文。

## Review Focus

1. **某月沒設定收入** → 累計模式該月結餘以收入 0 計（整月支出為負）、從塔頂敲磚，塔上不會有該月的層。（Task 5、Task 8 有測試）
2. **換月 / 切模式後殘留選取** → 先前點過的段落或月份必須重置回總覽。（Task 8 有測試）
3. **成長塔動畫進行中資料又更新**（realtime sync reload）→ 不得卡住或顯示舊資料，動畫結束時呈現最新資料。（Task 6 有測試）
4. **全部月份支出為 0** → 長條高度不得是 NaN，仍可點。（Task 7 有測試）
5. **累計模式點長條** → 必須切回月份模式並選到該月，而不是只高亮。（Task 8 有測試，Task 9 接線）

---

### Task 1: 每月收支彙整 util

**Files:**
- Create: `src/utils/monthlySummaries.js`
- Test: `src/utils/monthlySummaries.test.js`

**Interfaces:**
- Produces: `buildMonthlySummaries({ occurrences, firstMonth, currentMonth, incomeForMonth }) → Array<{ month: "YYYY-MM", expenseTwd: number, recurringTwd: number, oneTimeTwd: number, incomeTwd: number|null, isCurrent: boolean }>`（由舊到新）

- [ ] **Step 1: Write the failing test**

```js
// src/utils/monthlySummaries.test.js
import { describe, expect, it } from 'vitest'
import { buildMonthlySummaries } from './monthlySummaries'

const occ = (occurredAt, amountTwd, isRecurringOccurrence = false) => ({
  occurredAt,
  amountTwd,
  isRecurringOccurrence,
  entryType: isRecurringOccurrence ? 'RECURRING' : 'ONE_TIME',
})

describe('buildMonthlySummaries', () => {
  it('covers every month from the first expense to now, empty months included', () => {
    const rows = buildMonthlySummaries({
      occurrences: [occ('2026-07-03', 100), occ('2026-09-10', 300, true), occ('2026-09-11', 50)],
      firstMonth: '2026-07',
      currentMonth: '2026-09',
      incomeForMonth: () => 1000,
    })
    expect(rows).toEqual([
      { month: '2026-07', expenseTwd: 100, recurringTwd: 0, oneTimeTwd: 100, incomeTwd: 1000, isCurrent: false },
      { month: '2026-08', expenseTwd: 0, recurringTwd: 0, oneTimeTwd: 0, incomeTwd: 1000, isCurrent: false },
      { month: '2026-09', expenseTwd: 350, recurringTwd: 300, oneTimeTwd: 50, incomeTwd: 1000, isCurrent: true },
    ])
  })

  it('crosses the year boundary', () => {
    const rows = buildMonthlySummaries({
      occurrences: [],
      firstMonth: '2025-11',
      currentMonth: '2026-02',
      incomeForMonth: () => null,
    })
    expect(rows.map((r) => r.month)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
  })

  it('reports income per month and null when not set', () => {
    const income = { '2026-01': 500, '2026-02': 0 }
    const rows = buildMonthlySummaries({
      occurrences: [],
      firstMonth: '2026-01',
      currentMonth: '2026-03',
      incomeForMonth: (month) => income[month] ?? null,
    })
    expect(rows.map((r) => r.incomeTwd)).toEqual([500, null, null])
  })

  it('ignores occurrences outside the range and non-positive amounts', () => {
    const rows = buildMonthlySummaries({
      occurrences: [occ('2026-05-01', 100), occ('2026-06-01', 0), occ('2026-06-02', -5), occ('2026-07-01', 9)],
      firstMonth: '2026-06',
      currentMonth: '2026-06',
      incomeForMonth: () => null,
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].expenseTwd).toBe(0)
  })

  it('falls back to the current month when there is no first month', () => {
    const rows = buildMonthlySummaries({
      occurrences: [],
      firstMonth: null,
      currentMonth: '2026-10',
      incomeForMonth: () => 100,
    })
    expect(rows.map((r) => r.month)).toEqual(['2026-10'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/monthlySummaries.test.js`
Expected: FAIL — `Failed to resolve import "./monthlySummaries"`

- [ ] **Step 3: Write minimal implementation**

```js
// src/utils/monthlySummaries.js
// Per-month expense / income series for the expense summary card (month
// bars + 累計 growth tower). Pure: portfolioService feeds it occurrences and
// an income resolver.

const nextMonth = (month) => {
  const [year, mon] = month.split("-").map(Number);
  return mon === 12
    ? `${year + 1}-01`
    : `${year}-${String(mon + 1).padStart(2, "0")}`;
};

const isRecurring = (occurrence) =>
  Boolean(occurrence?.isRecurringOccurrence) ||
  occurrence?.entryType === "RECURRING";

export const buildMonthlySummaries = ({
  occurrences = [],
  firstMonth,
  currentMonth,
  incomeForMonth,
}) => {
  if (!currentMonth) return [];
  const start =
    firstMonth && firstMonth <= currentMonth ? firstMonth : currentMonth;

  const byMonth = new Map();
  for (const occurrence of occurrences) {
    const amount = Number(occurrence?.amountTwd) || 0;
    if (amount <= 0) continue;
    const month = String(occurrence?.occurredAt ?? "").slice(0, 7);
    if (month < start || month > currentMonth) continue;
    const row = byMonth.get(month) ?? { recurringTwd: 0, oneTimeTwd: 0 };
    if (isRecurring(occurrence)) {
      row.recurringTwd += amount;
    } else {
      row.oneTimeTwd += amount;
    }
    byMonth.set(month, row);
  }

  const rows = [];
  for (let month = start; month <= currentMonth; month = nextMonth(month)) {
    const row = byMonth.get(month) ?? { recurringTwd: 0, oneTimeTwd: 0 };
    const income = incomeForMonth?.(month);
    rows.push({
      month,
      expenseTwd: row.recurringTwd + row.oneTimeTwd,
      recurringTwd: row.recurringTwd,
      oneTimeTwd: row.oneTimeTwd,
      incomeTwd: typeof income === "number" && income > 0 ? income : null,
      isCurrent: month === currentMonth,
    });
  }
  return rows;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/monthlySummaries.test.js`
Expected: PASS（5 tests）

- [ ] **Step 5: Commit**

```bash
git add src/utils/monthlySummaries.js src/utils/monthlySummaries.test.js
git commit -m "feat(expenses): add per-month expense/income summaries util"
```

---

### Task 2: `getExpenseDashboardView` 回傳 `monthlySummaries`

**Files:**
- Modify: `src/services/portfolioService.js`（import 區；`getExpenseDashboardView` 內 `allHistoryOccurrences` 宣告之後約 3654 行；return 物件約 3711 行）
- Test: `src/services/portfolioService.dashboard.test.js`

**Interfaces:**
- Consumes: `buildMonthlySummaries`（Task 1）；同檔既有的 `resolveIncomeForMonth`、`incomeSettings`、`monthOverridesMap`、`firstExpenseDate`、`today`（`getNowDate()` 字串 `YYYY-MM-DD`）、`allHistoryOccurrences`。
- Produces: `view.monthlySummaries`（形狀同 Task 1）。

- [ ] **Step 1: Write the failing test** — 在 `portfolioService.dashboard.test.js` 檔尾新增 describe（沿用檔案上方的 `seed`、`TODAY`）：

```js
describe('getExpenseDashboardView — monthly summaries', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(TODAY)
    await db.expense_entries.clear()
    await db.budgets.clear()
    await db.expense_categories.clear()
    await db.expense_templates.clear()
    await db.app_config.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('lists every month up to today with charged spending and that month\'s income', async () => {
    await seed()
    await db.app_config.put({
      key: 'income_settings',
      defaultMonthlyIncomeTwd: 100000,
      monthOverrides: [{ month: '2026-03', incomeTwd: 50000 }],
    })
    const view = await getExpenseDashboardView({ month: '2026-10' })
    const rows = view.monthlySummaries

    expect(rows.map((r) => r.month)).toEqual([
      '2026-01', '2026-02', '2026-03', '2026-04', '2026-05',
      '2026-06', '2026-07', '2026-08', '2026-09', '2026-10',
    ])
    // 房租 18000 + 電話費 600 every month.
    expect(rows[0]).toMatchObject({ expenseTwd: 18600, recurringTwd: 18600, oneTimeTwd: 0, incomeTwd: 100000, isCurrent: false })
    // March adds the yearly 保險 and uses the income override.
    expect(rows[2]).toMatchObject({ expenseTwd: 42600, incomeTwd: 50000 })
    // October: 房租 (10/20) is still upcoming → not counted; 電話費 + 午餐 are.
    expect(rows[9]).toMatchObject({ expenseTwd: 750, recurringTwd: 600, oneTimeTwd: 150, isCurrent: true })
  })

  it('reports null income when none is configured', async () => {
    await seed()
    const view = await getExpenseDashboardView({ month: '2026-10' })
    expect(view.monthlySummaries.every((r) => r.incomeTwd === null)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/portfolioService.dashboard.test.js -t "monthly summaries"`
Expected: FAIL — `Cannot read properties of undefined (reading 'map')`

- [ ] **Step 3: Implement**

在 `src/services/portfolioService.js` 的 import 區加：

```js
import { buildMonthlySummaries } from "../utils/monthlySummaries";
```

在 `getExpenseDashboardView` 中 `const allHistoryOccurrences = expandExpenseOccurrencesUntilDate(entries, today);` 這行之後加：

```js
  // One row per month from the first expense to today (charged spending only,
  // like the month total) — feeds the month bars and the 累計 growth tower.
  const monthlySummaries = buildMonthlySummaries({
    occurrences: allHistoryOccurrences,
    firstMonth: firstExpenseDate ? firstExpenseDate.slice(0, 7) : null,
    currentMonth: today.slice(0, 7),
    incomeForMonth: (month) =>
      resolveIncomeForMonth({
        month,
        defaultMonthlyIncomeTwd: incomeSettings.defaultMonthlyIncomeTwd,
        monthOverridesMap,
      }),
  });
```

在 return 物件的 `expenseIncomeProgress,` 之後加一行 `monthlySummaries,`。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/services/portfolioService.dashboard.test.js`
Expected: PASS（全部，含既有測試）

- [ ] **Step 5: Commit**

```bash
git add src/services/portfolioService.js src/services/portfolioService.dashboard.test.js
git commit -m "feat(expenses): return monthly summaries from the expense dashboard view"
```

---

### Task 3: 減法塔版面加入「待扣」段

**Files:**
- Modify: `src/utils/savingsTower.js`（`getTowerLayout`）
- Test: `src/utils/savingsTower.test.js`

**Interfaces:**
- Produces: `getTowerLayout({ incomeTwd, recurringTwd, oneTimeTwd, upcomingTwd = 0, rows })` 回傳物件多兩個欄位：`pendingTwd: number`（= `min(upcomingTwd, savedTwd)`）、`pendingChunks: Array<{ rowIndex, offset, take, kind: "pending" }>`（緊接在支出段下方、蓋在存下的磚上，不計入 `chunks`）。

- [ ] **Step 1: Write the failing test** — 在 `savingsTower.test.js` 的 `describe('getTowerLayout', …)` 內新增：

```js
  it('marks upcoming charges right below the spent area, without removing them', () => {
    const t = getTowerLayout({ incomeTwd: 100_000, recurringTwd: 25_000, oneTimeTwd: 13_000, upcomingTwd: 10_000 })
    expect(t.pendingTwd).toBe(10_000)
    expect(strip(t.pendingChunks)).toEqual([
      [6, 0.8, 0.2, 'pending'],
      [5, 0, 0.8, 'pending'],
    ])
    // Pending does not change what was spent or saved.
    expect(strip(t.chunks)).toHaveLength(5)
    expect(t.savedTwd).toBe(62_000)
  })

  it('caps pending at what is left of the tower', () => {
    const t = getTowerLayout({ incomeTwd: 100_000, recurringTwd: 90_000, oneTimeTwd: 5_000, upcomingTwd: 20_000 })
    expect(t.pendingTwd).toBe(5_000)
  })

  it('has no pending without upcoming charges or without income', () => {
    expect(getTowerLayout({ incomeTwd: 100_000, recurringTwd: 1, oneTimeTwd: 0 }).pendingChunks).toEqual([])
    const none = getTowerLayout({ incomeTwd: 0, recurringTwd: 1, oneTimeTwd: 0, upcomingTwd: 5 })
    expect(none.pendingChunks).toEqual([])
    expect(none.pendingTwd).toBe(0)
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/savingsTower.test.js`
Expected: FAIL — `pendingTwd` is `undefined`

- [ ] **Step 3: Implement** — 在 `src/utils/savingsTower.js`：

1. 檔頭註解第三行後加一句：`// Upcoming recurring charges are marked (not removed) right below the spent area.`
2. `getTowerLayout` 參數加 `upcomingTwd = 0,`（放在 `oneTimeTwd,` 之後）。
3. 無收入的 early return 物件加 `pendingTwd: 0, pendingChunks: [],`。
4. 把 `removeFromTop` 換成可指定輸出陣列的版本，並在算完 `savedTwd` 後切出待扣段：

```js
  const chunks = [];
  let cursor = 0; // rows sliced so far, counted from the top
  const sliceFromTop = (amountTwd, kind, out) => {
    let remaining = round(Math.min((amountTwd / income) * rows, rows - cursor));
    while (remaining > EPS) {
      const rowFromTop = Math.floor(cursor + EPS);
      const offset = round(cursor - rowFromTop);
      const take = round(Math.min(1 - offset, remaining));
      if (take <= 0) break;
      out.push({ rowIndex: rows - 1 - rowFromTop, offset, take, kind });
      cursor = round(cursor + take);
      remaining = round(remaining - take);
    }
  };
  sliceFromTop(recurring, "recurring", chunks);
  sliceFromTop(oneTime, "oneTime", chunks);

  const savedTwd = Math.max(0, income - spentTwd);
  const overspendTwd = Math.max(0, spentTwd - income);
  const pendingTwd = Math.min(toAmount(upcomingTwd), savedTwd);
  const pendingChunks = [];
  sliceFromTop(pendingTwd, "pending", pendingChunks);
```

5. 成功分支的 return 物件加 `pendingTwd, pendingChunks,`。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/savingsTower.test.js`
Expected: PASS（全部）

- [ ] **Step 5: Commit**

```bash
git add src/utils/savingsTower.js src/utils/savingsTower.test.js
git commit -m "feat(expenses): lay out upcoming charges on the savings tower"
```

---

### Task 4: `SavingsTower` 改為 teal 單色、待扣斜紋、可點選段落

**Files:**
- Modify: `src/components/SavingsTower.jsx`（整檔替換，見 Step 3）
- Modify: `src/App.css`（`/* ===== Savings tower` 區塊，約 365–495 行）
- Test: `src/components/SavingsTower.test.jsx`

**Interfaces:**
- Consumes: `getTowerLayout` 的 `pendingTwd` / `pendingChunks`（Task 3）。
- Produces: `<SavingsTower incomeTwd recurringTwd oneTimeTwd upcomingTwd hasIncome playKey onSetupIncome selectedKind onSelectKind />`
  - `selectedKind: "recurring" | "oneTime" | "pending" | "saved" | null`
  - `onSelectKind(kind | null)`：點某段傳該 kind；點 SVG 空白處傳 `null`。
  - 每段是 `<g className="savings-tower-part" data-kind="…">`，非選中段多 `is-dim` class。
  - 根元素 `.savings-tower` 帶 `data-phase="build" | "chip" | "done"`。
  - 不再畫「存下 X 萬」與超支「−X 萬」文字；只保留「收入 X 萬」。

- [ ] **Step 1: Update the tests** — 整檔替換 `src/components/SavingsTower.test.jsx`：

```jsx
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import SavingsTower from './SavingsTower'

const mockMotion = (reduce) =>
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    matches: reduce && query.includes('reduce'),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))

const rowsOf = (container, selector) =>
  [...new Set([...container.querySelectorAll(selector)].map((n) => n.dataset.row))].sort()

describe('SavingsTower', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('shows the income caption and no saved label', () => {
    mockMotion(true)
    render(<SavingsTower incomeTwd={85_000} recurringTwd={32_000} oneTimeTwd={21_500} hasIncome playKey={1} />)
    expect(screen.getByText('收入 8.5 萬')).toBeInTheDocument()
    expect(screen.queryByText(/^存下/)).toBeNull()
  })

  it('never uses gradients', () => {
    mockMotion(true)
    const { container } = render(<SavingsTower incomeTwd={85_000} recurringTwd={32_000} oneTimeTwd={0} hasIncome playKey={1} />)
    expect(container.querySelector('linearGradient')).toBeNull()
  })

  it('leaves a tinted ghost of each removed chunk, by expense kind', () => {
    mockMotion(true)
    const { container } = render(
      <SavingsTower incomeTwd={100_000} recurringTwd={25_000} oneTimeTwd={13_000} hasIncome playKey={1} />,
    )
    expect(rowsOf(container, '.savings-tower-spent--recurring')).toEqual(['7', '8', '9'])
    expect(rowsOf(container, '.savings-tower-spent--oneTime')).toEqual(['6', '7'])
  })

  it('hatches upcoming charges right below the spent area', () => {
    mockMotion(true)
    const { container } = render(
      <SavingsTower incomeTwd={100_000} recurringTwd={25_000} oneTimeTwd={13_000} upcomingTwd={10_000} hasIncome playKey={1} />,
    )
    expect(rowsOf(container, '.savings-tower-pending')).toEqual(['5', '6'])
  })

  it('reports the clicked part and dims the others when one is selected', () => {
    mockMotion(true)
    const onSelectKind = vi.fn()
    const { container, rerender } = render(
      <SavingsTower incomeTwd={100_000} recurringTwd={25_000} oneTimeTwd={13_000} hasIncome playKey={1} onSelectKind={onSelectKind} />,
    )
    fireEvent.click(container.querySelector('[data-kind="recurring"]'))
    expect(onSelectKind).toHaveBeenLastCalledWith('recurring')
    fireEvent.click(container.querySelector('svg'))
    expect(onSelectKind).toHaveBeenLastCalledWith(null)

    rerender(
      <SavingsTower incomeTwd={100_000} recurringTwd={25_000} oneTimeTwd={13_000} hasIncome playKey={1} selectedKind="recurring" onSelectKind={onSelectKind} />,
    )
    expect(container.querySelector('[data-kind="saved"]')).toHaveClass('is-dim')
    expect(container.querySelector('[data-kind="recurring"]')).not.toHaveClass('is-dim')
  })

  it('digs a pit when overspent, without a text label', () => {
    mockMotion(true)
    const { container } = render(
      <SavingsTower incomeTwd={85_000} recurringTwd={32_000} oneTimeTwd={61_000} hasIncome playKey={1} />,
    )
    expect(container.querySelector('.savings-tower-pit')).not.toBeNull()
    expect(screen.queryByText(/^−/)).toBeNull()
  })

  it('offers income setup when there is no income', () => {
    mockMotion(true)
    const onSetupIncome = vi.fn()
    render(<SavingsTower incomeTwd={0} recurringTwd={3_000} oneTimeTwd={0} hasIncome={false} playKey={1} onSetupIncome={onSetupIncome} />)
    fireEvent.click(screen.getByRole('button', { name: '設定收入' }))
    expect(onSetupIncome).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(/^收入/)).toBeNull()
  })

  it('replays the entrance when income arrives after mount', () => {
    mockMotion(false)
    vi.useFakeTimers()
    const { container, rerender } = render(
      <SavingsTower incomeTwd={0} recurringTwd={0} oneTimeTwd={0} hasIncome={false} playKey={1} />,
    )
    rerender(<SavingsTower incomeTwd={100_000} recurringTwd={30_000} oneTimeTwd={0} hasIncome playKey={1} />)
    expect(container.querySelector('.savings-tower')).toHaveAttribute('data-phase', 'build')
    expect(container.querySelectorAll('.savings-tower-shard')).toHaveLength(0)
    act(() => {
      vi.advanceTimersByTime(5_000)
    })
    expect(container.querySelector('.savings-tower')).toHaveAttribute('data-phase', 'done')
    expect(rowsOf(container, '.savings-tower-spent--recurring')).toEqual(['7', '8', '9'])
  })

  it('chips away the data that arrives during the build phase', () => {
    mockMotion(false)
    vi.useFakeTimers()
    const { container, rerender } = render(
      <SavingsTower incomeTwd={100_000} recurringTwd={30_000} oneTimeTwd={0} hasIncome playKey={1} />,
    )
    rerender(<SavingsTower incomeTwd={100_000} recurringTwd={30_000} oneTimeTwd={0} hasIncome playKey={2} />)
    rerender(<SavingsTower incomeTwd={100_000} recurringTwd={50_000} oneTimeTwd={0} hasIncome playKey={2} />)
    act(() => {
      vi.advanceTimersByTime(5_000)
    })
    expect(rowsOf(container, '.savings-tower-spent--recurring')).toEqual(['5', '6', '7', '8', '9'])
  })

  it('drops only the new chunks when an expense is added', () => {
    mockMotion(false)
    vi.useFakeTimers()
    const { container, rerender } = render(
      <SavingsTower incomeTwd={100_000} recurringTwd={30_000} oneTimeTwd={0} hasIncome playKey={1} />,
    )
    act(() => {
      vi.advanceTimersByTime(5_000)
    })
    // jsdom never fires animationend, so finished entrance shards stay in the DOM.
    const before = container.querySelectorAll('.savings-tower-shard').length
    rerender(<SavingsTower incomeTwd={100_000} recurringTwd={30_000} oneTimeTwd={10_000} hasIncome playKey={1} />)
    // One new row removed (row index 6, even row = 2 bricks) → 2 shards.
    expect(container.querySelectorAll('.savings-tower-shard').length - before).toBe(2)
    expect(rowsOf(container, '.savings-tower-spent--oneTime')).toEqual(['6'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/SavingsTower.test.jsx`
Expected: FAIL — 至少 `never uses gradients`、`hatches upcoming charges`、`reports the clicked part` 失敗。

- [ ] **Step 3: Implement** — 整檔替換 `src/components/SavingsTower.jsx`：

```jsx
// Expense-tab savings tower (月份 mode): this month's income is a tower of
// teal bricks; spending knocks bricks off the top (recurring first, then
// one-time) and what is left is what was saved. Upcoming recurring charges
// are hatched on top of the saved bricks; overspending digs a red pit.
// Each part is tappable (onSelectKind). Layout maths lives in
// utils/savingsTower.js — this file draws + animates.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  diffTowerChunks,
  formatTowerWan,
  getRowRemovedFractions,
  getTowerLayout,
} from "../utils/savingsTower";
import { prefersReducedMotion } from "../utils/motion";

const VIEW_W = 120;
const VIEW_H = 180;
const TOWER = { x: 22, w: 76, top: 14, base: 150 };
const TOWER_HEIGHT = TOWER.base - TOWER.top;
const BUILD_STAGGER_MS = 45;
const BUILD_PAUSE_MS = 900; // after the last row lands, before chipping starts
const SETTLE_MS = 200;
const BRICK_RX = 3;
const SPENT_KINDS = ["recurring", "oneTime"];

// Even rows: two half bricks. Odd rows: quarter / half / quarter (offset bond).
const rowBricks = (rowIndex) => {
  const cuts =
    rowIndex % 2 === 0
      ? [0, TOWER.w / 2, TOWER.w]
      : [0, TOWER.w / 4, (TOWER.w * 3) / 4, TOWER.w];
  return cuts.slice(0, -1).map((start, index) => ({
    x: TOWER.x + start + 0.75,
    w: cuts[index + 1] - start - 1.5,
  }));
};

// Falling pieces for one removed chunk. Spread is deterministic (no
// Math.random) so rendering stays pure.
const makeShards = (chunk, rows, firstId) => {
  const rowH = TOWER_HEIGHT / rows;
  const rowTop = TOWER.base - (chunk.rowIndex + 1) * rowH;
  const center = TOWER.x + TOWER.w / 2;
  return rowBricks(chunk.rowIndex).map((brick, index) => {
    const jitter = ((chunk.rowIndex * 7 + index * 13) % 11) - 5;
    const dx = (brick.x + brick.w / 2 - center) * 0.9 + jitter;
    return {
      id: firstId + index,
      x: brick.x,
      y: rowTop + 0.75 + chunk.offset * (rowH - 1.5),
      w: brick.w,
      h: Math.max(1, chunk.take * (rowH - 1.5)),
      kind: chunk.kind,
      dx,
      rot: dx * 3,
    };
  });
};

// Append the shards for `chunks` to the animation state.
const withShards = (state, chunks, rows) => {
  let nextId = state.nextId;
  const added = chunks.flatMap((chunk) => {
    const pieces = makeShards(chunk, rows, nextId);
    nextId += pieces.length;
    return pieces;
  });
  return { ...state, shards: [...state.shards, ...added], nextId };
};

const startRun = (runKey, layout, animate, nextId = 0) => ({
  runKey,
  phase: animate ? "build" : "done", // "build" | "chip" | "done"
  revealed: animate ? 0 : layout.chunks.length,
  shownLayout: layout,
  shards: [],
  nextId,
});

export default function SavingsTower({
  incomeTwd,
  recurringTwd,
  oneTimeTwd,
  upcomingTwd = 0,
  hasIncome,
  playKey,
  onSetupIncome,
  selectedKind = null,
  onSelectKind,
}) {
  const [reduced] = useState(prefersReducedMotion);
  const layout = useMemo(
    () =>
      getTowerLayout({
        incomeTwd: hasIncome ? incomeTwd : 0,
        recurringTwd,
        oneTimeTwd,
        upcomingTwd,
      }),
    [hasIncome, incomeTwd, recurringTwd, oneTimeTwd, upcomingTwd],
  );
  const animate = !reduced && layout.hasIncome;
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");

  // Income appearing after mount (data loaded late) replays the entrance.
  const [incomeSeen, setIncomeSeen] = useState(layout.hasIncome);
  const [replayToken, setReplayToken] = useState(0);
  if (incomeSeen !== layout.hasIncome) {
    setIncomeSeen(layout.hasIncome);
    if (layout.hasIncome) setReplayToken((token) => token + 1);
  }

  const runKey = `${playKey}:${replayToken}`;
  const [run, setRun] = useState(() => startRun(runKey, layout, animate));
  if (run.runKey !== runKey) {
    setRun(startRun(runKey, layout, animate, run.nextId));
  } else if (run.shownLayout !== layout && run.phase === "done") {
    // Data changed after the entrance: animate only the difference.
    const { added } = diffTowerChunks(run.shownLayout, layout);
    const next = { ...run, shownLayout: layout, revealed: layout.chunks.length };
    setRun(animate ? withShards(next, added, layout.rows) : next);
  }

  // Timers read the latest layout (it may change mid-entrance).
  const layoutRef = useRef(layout);
  useEffect(() => {
    layoutRef.current = layout;
  });

  useEffect(() => {
    if (!animate) return undefined;
    // Each step reads layoutRef, so data that lands mid-entrance (e.g. right
    // after switching month) is what gets chipped away.
    let timer = 0;
    let index = 0;
    const chipNext = () => {
      const current = layoutRef.current;
      if (index >= current.chunks.length) {
        timer = setTimeout(() => {
          setRun((s) => ({
            ...s,
            phase: "done",
            revealed: layoutRef.current.chunks.length,
            shownLayout: layoutRef.current,
          }));
        }, SETTLE_MS);
        return;
      }
      const chunk = current.chunks[index];
      const delay = Math.max(110, 240 - index * 18);
      index += 1;
      const revealed = index;
      setRun((s) =>
        withShards({ ...s, phase: "chip", revealed }, [chunk], current.rows),
      );
      timer = setTimeout(chipNext, delay);
    };
    timer = setTimeout(
      chipNext,
      layoutRef.current.rows * BUILD_STAGGER_MS + BUILD_PAUSE_MS,
    );
    return () => clearTimeout(timer);
    // A new run (runKey) restarts the sequence; layout changes mid-run are
    // picked up through layoutRef.
  }, [run.runKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const rowH = TOWER_HEIGHT / layout.rows;
  const revealedChunks = layout.chunks.slice(0, run.revealed);
  const removed = getRowRemovedFractions(revealedChunks, layout.rows);
  const done = run.phase === "done";
  const pitDepth = layout.overspendDepthRatio * TOWER_HEIGHT;

  const select = (kind) => (event) => {
    event.stopPropagation();
    onSelectKind?.(kind);
  };
  const partClass = (kind) =>
    `savings-tower-part${selectedKind && selectedKind !== kind ? " is-dim" : ""}`;
  const chunkRects = (chunk, className, fill) => {
    const fullH = rowH - 1.5;
    const y =
      TOWER.base - (chunk.rowIndex + 1) * rowH + 0.75 + fullH * chunk.offset;
    return rowBricks(chunk.rowIndex).map((brick) => (
      <rect
        key={`${chunk.kind}-${chunk.rowIndex}-${chunk.offset}-${brick.x}`}
        className={className}
        data-row={chunk.rowIndex}
        x={brick.x}
        y={y}
        width={brick.w}
        height={fullH * chunk.take}
        rx={BRICK_RX}
        fill={fill}
      />
    ));
  };

  return (
    <div className="savings-tower" data-phase={run.phase}>
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        aria-hidden="true"
        onClick={() => onSelectKind?.(null)}
      >
        <defs>
          <pattern
            id={`${id}-hatch`}
            width="5"
            height="5"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect className="savings-tower-hatch-bg" width="5" height="5" />
            <rect className="savings-tower-hatch-line" width="2" height="5" />
          </pattern>
        </defs>
        <line
          className="savings-tower-ground"
          x1={TOWER.x - 14}
          x2={TOWER.x + TOWER.w + 14}
          y1={TOWER.base + 0.5}
          y2={TOWER.base + 0.5}
        />
        {layout.hasIncome && (
          <text
            className="savings-tower-income"
            x={TOWER.x + TOWER.w / 2}
            y={TOWER.top - 4}
            textAnchor="middle"
          >
            {`收入 ${formatTowerWan(layout.incomeTwd)}`}
          </text>
        )}

        {/* Ghost outlines keep the original income height visible. */}
        <g className="savings-tower-ghost">
          {Array.from({ length: layout.rows }, (_, rowIndex) =>
            rowBricks(rowIndex).map((brick) => (
              <rect
                key={`${rowIndex}-${brick.x}`}
                x={brick.x}
                y={TOWER.base - (rowIndex + 1) * rowH + 0.75}
                width={brick.w}
                height={rowH - 1.5}
                rx={BRICK_RX}
              />
            )),
          )}
        </g>

        {layout.hasIncome && (
          <g className={partClass("saved")} data-kind="saved" onClick={select("saved")}>
            <g
              key={run.runKey}
              className={run.phase === "build" ? "savings-tower-build" : undefined}
            >
              {Array.from({ length: layout.rows }, (_, rowIndex) => {
                const left = 1 - removed[rowIndex];
                if (left <= 0) return null;
                const fullH = rowH - 1.5;
                const y =
                  TOWER.base - (rowIndex + 1) * rowH + 0.75 + fullH * removed[rowIndex];
                return rowBricks(rowIndex).map((brick) => (
                  <rect
                    key={`${rowIndex}-${brick.x}`}
                    className="savings-tower-brick"
                    x={brick.x}
                    y={y}
                    width={brick.w}
                    height={fullH * left}
                    rx={BRICK_RX}
                    style={{ animationDelay: `${rowIndex * BUILD_STAGGER_MS}ms` }}
                  />
                ));
              })}
            </g>
          </g>
        )}

        {/* Where spending removed income, a faint tint by kind shows the
            recurring / one-time split. */}
        {SPENT_KINDS.map((kind) => (
          <g key={kind} className={partClass(kind)} data-kind={kind} onClick={select(kind)}>
            {revealedChunks
              .filter((chunk) => chunk.kind === kind)
              .flatMap((chunk) =>
                chunkRects(chunk, `savings-tower-spent savings-tower-spent--${kind}`),
              )}
          </g>
        ))}

        {done && layout.pendingChunks.length > 0 && (
          <g className={partClass("pending")} data-kind="pending" onClick={select("pending")}>
            {layout.pendingChunks.flatMap((chunk) =>
              chunkRects(chunk, "savings-tower-pending", `url(#${id}-hatch)`),
            )}
          </g>
        )}

        {run.shards.map((shard) => (
          <rect
            key={shard.id}
            className={`savings-tower-shard savings-tower-shard--${shard.kind}`}
            x={shard.x}
            y={shard.y}
            width={shard.w}
            height={shard.h}
            rx="2"
            style={{ "--dx": `${shard.dx}px`, "--rot": `${shard.rot}deg` }}
            onAnimationEnd={() =>
              setRun((s) => ({
                ...s,
                shards: s.shards.filter((item) => item.id !== shard.id),
              }))
            }
          />
        ))}

        {done && layout.overspendTwd > 0 && (
          <rect
            className="savings-tower-pit"
            x={TOWER.x}
            y={TOWER.base + 1.5}
            width={TOWER.w}
            height={pitDepth}
            rx={BRICK_RX}
          />
        )}
      </svg>
      {!layout.hasIncome && (
        <button type="button" className="savings-tower-setup" onClick={onSetupIncome}>
          設定收入
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Update CSS** — 在 `src/App.css` 的 savings tower 區塊：

刪除這些規則：`.savings-tower-saved`、`.savings-tower-saved--inside`、`.savings-tower-over`。

把下列規則改成（其餘規則保留）：

```css
.savings-tower-ghost rect {
  fill: none;
  stroke: var(--c-line);
  stroke-dasharray: 2 2;
}

.savings-tower-brick {
  fill: var(--c-teal);
}

/* Spent area keeps a pale teal tint so the recurring / one-time split stays visible. */
.savings-tower-spent {
  animation: jar-fade-in 300ms ease-out both;
}

.savings-tower-spent--recurring {
  fill: #9fcfc6;
  opacity: 0.55;
}

.savings-tower-spent--oneTime {
  fill: #cfe6e1;
  opacity: 0.75;
}

.savings-tower-pending {
  stroke: var(--c-teal);
  stroke-opacity: 0.35;
  stroke-dasharray: 2 2;
}

.savings-tower-hatch-bg {
  fill: #ffffff;
}

.savings-tower-hatch-line {
  fill: var(--c-teal);
  opacity: 0.55;
}

.savings-tower-part {
  cursor: pointer;
  transition: opacity 200ms ease;
}

.savings-tower .is-dim,
.growth-tower .is-dim {
  opacity: 0.3;
}

.savings-tower-shard--recurring {
  fill: var(--c-teal);
}

.savings-tower-shard--oneTime {
  fill: #9fcfc6;
}

.savings-tower-pit {
  fill: var(--c-down);
  opacity: 0.18;
  transform-box: fill-box;
  transform-origin: top;
  animation: tower-pit-grow 500ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
}
```

- [ ] **Step 5: Run tests + lint**

Run: `npx vitest run src/components/SavingsTower.test.jsx src/utils/savingsTower.test.js && npx eslint src/components/SavingsTower.jsx`
Expected: PASS；eslint 無錯誤

- [ ] **Step 6: Commit**

```bash
git add src/components/SavingsTower.jsx src/components/SavingsTower.test.jsx src/App.css
git commit -m "feat(expenses): teal savings tower with hatched pending and tappable parts"
```

---

### Task 5: 成長塔版面 util

**Files:**
- Create: `src/utils/savingsGrowthTower.js`
- Test: `src/utils/savingsGrowthTower.test.js`

**Interfaces:**
- Consumes: Task 1 的 summary 形狀（`{ month, expenseTwd, incomeTwd|null, isCurrent }`）。
- Produces:
  - `getMonthSurplus(summary) → number`（`(incomeTwd ?? 0) − expenseTwd`）
  - `getGrowthTowerLayout(summaries) → { hasIncome: boolean, peakTwd: number, totalSavedTwd: number, totalSpentTwd: number, steps: Step[], layers: Layer[] }`
  - `Layer = { month, index, bottom, top, isCurrent }`（TWD，`bottom`/`top` 由地面起算；`index` = 該月在 summaries 的位置，決定磚的錯縫）
  - `Step = { month, type: "add" | "chip" | "none", stack: Layer[], removed: Array<{ month, index, bottom, top }> }`（`stack` 是該步完成後的整座塔；`layers` = 最後一步的 `stack`）

- [ ] **Step 1: Write the failing test**

```js
// src/utils/savingsGrowthTower.test.js
import { describe, expect, it } from 'vitest'
import { getGrowthTowerLayout, getMonthSurplus } from './savingsGrowthTower'

const m = (month, incomeTwd, expenseTwd, isCurrent = false) => ({ month, incomeTwd, expenseTwd, isCurrent })
const spans = (layers) => layers.map((l) => [l.month, l.bottom, l.top])

describe('getMonthSurplus', () => {
  it('treats a missing income as zero', () => {
    expect(getMonthSurplus(m('2026-01', null, 50))).toBe(-50)
    expect(getMonthSurplus(m('2026-01', 100, 40))).toBe(60)
  })
})

describe('getGrowthTowerLayout', () => {
  it('stacks each positive month on top of the last', () => {
    const t = getGrowthTowerLayout([m('2026-01', 100, 40), m('2026-02', 100, 70, true)])
    expect(spans(t.layers)).toEqual([['2026-01', 0, 60], ['2026-02', 60, 90]])
    expect(t.layers[1].isCurrent).toBe(true)
    expect(t.peakTwd).toBe(90)
    expect(t.totalSavedTwd).toBe(90)
    expect(t.totalSpentTwd).toBe(110)
    expect(t.steps.map((s) => s.type)).toEqual(['add', 'add'])
  })

  it('chips an overspent month off the top, across layers', () => {
    const t = getGrowthTowerLayout([m('2026-01', 100, 40), m('2026-02', 100, 70), m('2026-03', 100, 150)])
    expect(spans(t.layers)).toEqual([['2026-01', 0, 40]])
    expect(t.steps[2].type).toBe('chip')
    expect(t.steps[2].removed.map((r) => [r.month, r.bottom, r.top])).toEqual([
      ['2026-02', 60, 90],
      ['2026-01', 40, 60],
    ])
    expect(t.peakTwd).toBe(90)
    expect(t.totalSavedTwd).toBe(40)
  })

  it('stops chipping at the ground', () => {
    const t = getGrowthTowerLayout([m('2026-01', 100, 90), m('2026-02', null, 50)])
    expect(t.layers).toEqual([])
    expect(t.steps[1].removed.map((r) => [r.bottom, r.top])).toEqual([[0, 10]])
    expect(t.totalSavedTwd).toBe(-40)
    expect(t.peakTwd).toBe(10)
  })

  it('keeps earlier steps unchanged when later steps chip', () => {
    const t = getGrowthTowerLayout([m('2026-01', 100, 40), m('2026-02', 0, 30)])
    expect(spans(t.steps[0].stack)).toEqual([['2026-01', 0, 60]])
    expect(spans(t.steps[1].stack)).toEqual([['2026-01', 0, 30]])
  })

  it('records a break-even month as a no-op step', () => {
    const t = getGrowthTowerLayout([m('2026-01', 100, 100)])
    expect(t.steps.map((s) => s.type)).toEqual(['none'])
    expect(t.layers).toEqual([])
  })

  it('knows when no month has income', () => {
    expect(getGrowthTowerLayout([m('2026-01', null, 10)]).hasIncome).toBe(false)
    expect(getGrowthTowerLayout([]).hasIncome).toBe(false)
    expect(getGrowthTowerLayout([m('2026-01', 5, 10)]).hasIncome).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/savingsGrowthTower.test.js`
Expected: FAIL — `Failed to resolve import "./savingsGrowthTower"`

- [ ] **Step 3: Implement**

```js
// src/utils/savingsGrowthTower.js
// Pure layout for the 累計 growth tower (components/SavingsGrowthTower.jsx).
// Each month's surplus (income − expense) drops on top as one layer; an
// overspent month chips the same amount off the top, layer by layer, down
// to the ground at most. Amounts stay in TWD; the component scales by
// `peakTwd`, the tallest the stack ever got.

const EPS = 1e-9;

export const getMonthSurplus = (summary) =>
  (Number(summary?.incomeTwd) || 0) - (Number(summary?.expenseTwd) || 0);

export const getGrowthTowerLayout = (summaries = []) => {
  let stack = [];
  let height = 0;
  let peakTwd = 0;
  let totalSavedTwd = 0;
  let totalSpentTwd = 0;
  const steps = [];

  summaries.forEach((summary, index) => {
    const surplus = getMonthSurplus(summary);
    totalSavedTwd += surplus;
    totalSpentTwd += Number(summary?.expenseTwd) || 0;

    if (surplus > EPS) {
      stack = [
        ...stack,
        {
          month: summary.month,
          index,
          bottom: height,
          top: height + surplus,
          isCurrent: Boolean(summary.isCurrent),
        },
      ];
      height += surplus;
      peakTwd = Math.max(peakTwd, height);
      steps.push({ month: summary.month, type: "add", stack, removed: [] });
      return;
    }

    if (surplus < -EPS) {
      let need = -surplus;
      const next = stack.map((layer) => ({ ...layer }));
      const removed = [];
      while (need > EPS && next.length > 0) {
        const layer = next[next.length - 1];
        const cut = Math.min(need, layer.top - layer.bottom);
        removed.push({
          month: layer.month,
          index: layer.index,
          bottom: layer.top - cut,
          top: layer.top,
        });
        layer.top -= cut;
        height -= cut;
        need -= cut;
        if (layer.top - layer.bottom <= EPS) next.pop();
      }
      stack = next;
      steps.push({ month: summary.month, type: "chip", stack, removed });
      return;
    }

    steps.push({ month: summary.month, type: "none", stack, removed: [] });
  });

  return {
    hasIncome: summaries.some((summary) => Number(summary?.incomeTwd) > 0),
    peakTwd,
    totalSavedTwd,
    totalSpentTwd,
    steps,
    layers: stack,
  };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/savingsGrowthTower.test.js`
Expected: PASS（7 tests）

- [ ] **Step 5: Commit**

```bash
git add src/utils/savingsGrowthTower.js src/utils/savingsGrowthTower.test.js
git commit -m "feat(expenses): add growth tower layout for monthly surpluses"
```

---

### Task 6: `SavingsGrowthTower` 元件

**Files:**
- Create: `src/components/SavingsGrowthTower.jsx`
- Modify: `src/App.css`（savings tower 區塊之後新增 growth tower 規則；`@media (prefers-reduced-motion: reduce)` 那條加上 `.growth-tower *`）
- Test: `src/components/SavingsGrowthTower.test.jsx`

**Interfaces:**
- Consumes: `getGrowthTowerLayout`（Task 5）。
- Produces: `<SavingsGrowthTower summaries playKey selectedMonth onSelectMonth onSetupIncome />`
  - 每層 `<g className="growth-tower-layer …" data-month="YYYY-MM">`；本月加 `growth-tower-layer--current`；非選中層加 `is-dim`。
  - 點層 → `onSelectMonth(month)`；點 SVG 空白 → `onSelectMonth(null)`。
  - 根元素 `.growth-tower` 帶 `data-phase="build" | "done"`。
  - 敲除時產生 `.growth-tower-shard`（每段 4 片）。
  - `getStepDelay(stepCount)` 匯出：`min(260, 3000 / stepCount)` ms。

- [ ] **Step 1: Write the failing test**

```jsx
// src/components/SavingsGrowthTower.test.jsx
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import SavingsGrowthTower, { getStepDelay } from './SavingsGrowthTower'

const mockMotion = (reduce) =>
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    matches: reduce && query.includes('reduce'),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))

const m = (month, incomeTwd, expenseTwd, isCurrent = false) => ({ month, incomeTwd, expenseTwd, isCurrent })
const three = [m('2026-08', 100_000, 50_000), m('2026-09', 100_000, 60_000), m('2026-10', 180_000, 47_363, true)]
const layers = (container) => [...container.querySelectorAll('.growth-tower-layer')].map((n) => n.dataset.month)

describe('SavingsGrowthTower', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('draws one layer per positive month, marking the current one', () => {
    mockMotion(true)
    const { container } = render(<SavingsGrowthTower summaries={three} playKey={1} />)
    expect(layers(container)).toEqual(['2026-08', '2026-09', '2026-10'])
    expect(container.querySelector('[data-month="2026-10"]')).toHaveClass('growth-tower-layer--current')
    expect(container.querySelector('linearGradient')).toBeNull()
  })

  it('reports the clicked month and dims the others when one is selected', () => {
    mockMotion(true)
    const onSelectMonth = vi.fn()
    const { container, rerender } = render(<SavingsGrowthTower summaries={three} playKey={1} onSelectMonth={onSelectMonth} />)
    fireEvent.click(container.querySelector('[data-month="2026-09"]'))
    expect(onSelectMonth).toHaveBeenLastCalledWith('2026-09')
    fireEvent.click(container.querySelector('svg'))
    expect(onSelectMonth).toHaveBeenLastCalledWith(null)

    rerender(<SavingsGrowthTower summaries={three} playKey={1} selectedMonth="2026-09" onSelectMonth={onSelectMonth} />)
    expect(container.querySelector('[data-month="2026-08"]')).toHaveClass('is-dim')
    expect(container.querySelector('[data-month="2026-09"]')).not.toHaveClass('is-dim')
  })

  it('leaves a ghost where an overspent month chipped the tower', () => {
    mockMotion(true)
    const { container } = render(
      <SavingsGrowthTower summaries={[m('2026-08', 100, 40), m('2026-09', 100, 70), m('2026-10', 100, 150)]} playKey={1} />,
    )
    expect(layers(container)).toEqual(['2026-08'])
    expect(container.querySelectorAll('.growth-tower-ghost rect').length).toBeGreaterThan(0)
  })

  it('stacks month by month, shattering overspent months, then settles', () => {
    mockMotion(false)
    vi.useFakeTimers()
    const { container } = render(
      <SavingsGrowthTower summaries={[m('2026-08', 100, 40), m('2026-09', 100, 70), m('2026-10', 100, 150)]} playKey={1} />,
    )
    expect(container.querySelector('.growth-tower')).toHaveAttribute('data-phase', 'build')
    expect(layers(container)).toEqual([])
    act(() => {
      vi.advanceTimersByTime(5_000)
    })
    expect(container.querySelector('.growth-tower')).toHaveAttribute('data-phase', 'done')
    expect(layers(container)).toEqual(['2026-08'])
    // Two removed segments × 4 pieces (jsdom never fires animationend).
    expect(container.querySelectorAll('.growth-tower-shard')).toHaveLength(8)
  })

  it('shows the latest data when it changes mid-animation', () => {
    mockMotion(false)
    vi.useFakeTimers()
    const { container, rerender } = render(<SavingsGrowthTower summaries={three.slice(0, 2)} playKey={1} />)
    act(() => {
      vi.advanceTimersByTime(100)
    })
    rerender(<SavingsGrowthTower summaries={three} playKey={1} />)
    act(() => {
      vi.advanceTimersByTime(5_000)
    })
    expect(layers(container)).toEqual(['2026-08', '2026-09', '2026-10'])
  })

  it('offers income setup when no month has income', () => {
    mockMotion(true)
    const onSetupIncome = vi.fn()
    render(<SavingsGrowthTower summaries={[m('2026-10', null, 100)]} playKey={1} onSetupIncome={onSetupIncome} />)
    fireEvent.click(screen.getByRole('button', { name: '設定收入' }))
    expect(onSetupIncome).toHaveBeenCalledTimes(1)
  })

  it('keeps long histories within about three seconds', () => {
    expect(getStepDelay(3)).toBe(260)
    expect(getStepDelay(30)).toBe(100)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/SavingsGrowthTower.test.jsx`
Expected: FAIL — `Failed to resolve import "./SavingsGrowthTower"`

- [ ] **Step 3: Implement**

```jsx
// src/components/SavingsGrowthTower.jsx
// Expense-tab growth tower (累計 mode): each month's surplus drops on top as
// one layer of bricks; an overspent month chips the same amount off the top
// and the pieces shatter. The current month is drawn dashed (not settled).
// Layout maths lives in utils/savingsGrowthTower.js — this file draws +
// animates.
import { useEffect, useMemo, useRef, useState } from "react";
import { getGrowthTowerLayout } from "../utils/savingsGrowthTower";
import { prefersReducedMotion } from "../utils/motion";

const VIEW_W = 120;
const VIEW_H = 180;
const TOWER = { x: 22, w: 76, top: 14, base: 150 };
const TOWER_HEIGHT = TOWER.base - TOWER.top;
const MAX_STEP_MS = 260;
const MAX_TOTAL_MS = 3000;
const BRICK_RX = 3;

export const getStepDelay = (stepCount) =>
  Math.min(MAX_STEP_MS, MAX_TOTAL_MS / Math.max(1, stepCount));

// Even months: two half bricks. Odd months: quarter / half / quarter.
const layerBricks = (index) => {
  const cuts =
    index % 2 === 0
      ? [0, TOWER.w / 2, TOWER.w]
      : [0, TOWER.w / 4, (TOWER.w * 3) / 4, TOWER.w];
  return cuts.slice(0, -1).map((start, i) => ({
    x: TOWER.x + start + 1,
    w: cuts[i + 1] - start - 2,
  }));
};

// Four falling pieces per removed segment; deterministic spread.
const makeShards = (segments, toY, firstId) => {
  let nextId = firstId;
  const shards = segments.flatMap((segment) => {
    const y = toY(segment.top);
    const h = Math.max(2, toY(segment.bottom) - y);
    return [0, 1, 2, 3].map((piece) => {
      const dx = (piece - 1.5) * 22;
      return {
        id: nextId++,
        x: TOWER.x + (piece * TOWER.w) / 4 + 1,
        y,
        w: TOWER.w / 4 - 2,
        h,
        dx,
        rot: dx * 2,
      };
    });
  });
  return { shards, nextId };
};

const startRun = (runKey, stepCount, animate, nextId = 0) => ({
  runKey,
  phase: animate && stepCount > 0 ? "build" : "done",
  revealed: 0,
  shards: [],
  nextId,
});

export default function SavingsGrowthTower({
  summaries,
  playKey,
  selectedMonth = null,
  onSelectMonth,
  onSetupIncome,
}) {
  const [reduced] = useState(prefersReducedMotion);
  const layout = useMemo(() => getGrowthTowerLayout(summaries ?? []), [summaries]);
  const animate = !reduced && layout.hasIncome;

  // Income appearing after mount (data loaded late) replays the entrance.
  const [incomeSeen, setIncomeSeen] = useState(layout.hasIncome);
  const [replayToken, setReplayToken] = useState(0);
  if (incomeSeen !== layout.hasIncome) {
    setIncomeSeen(layout.hasIncome);
    if (layout.hasIncome) setReplayToken((token) => token + 1);
  }

  const runKey = `${playKey}:${replayToken}`;
  const [run, setRun] = useState(() =>
    startRun(runKey, layout.steps.length, animate),
  );
  if (run.runKey !== runKey) {
    setRun(startRun(runKey, layout.steps.length, animate, run.nextId));
  }

  const scale = layout.peakTwd > 0 ? TOWER_HEIGHT / layout.peakTwd : 0;
  const toY = (twd) => TOWER.base - twd * scale;

  // Timers read the latest layout / scale (data may change mid-entrance).
  const layoutRef = useRef(layout);
  const toYRef = useRef(toY);
  useEffect(() => {
    layoutRef.current = layout;
    toYRef.current = toY;
  });

  useEffect(() => {
    if (run.phase !== "build") return undefined;
    let timer = 0;
    let index = 0;
    const next = () => {
      const steps = layoutRef.current.steps;
      if (index >= steps.length) {
        setRun((s) => ({ ...s, phase: "done", revealed: steps.length }));
        return;
      }
      const step = steps[index];
      index += 1;
      const revealed = index;
      setRun((s) => {
        if (step.type !== "chip") return { ...s, revealed };
        const { shards, nextId } = makeShards(step.removed, toYRef.current, s.nextId);
        return { ...s, revealed, shards: [...s.shards, ...shards], nextId };
      });
      timer = setTimeout(next, getStepDelay(steps.length));
    };
    timer = setTimeout(next, 0);
    return () => clearTimeout(timer);
    // A new run (runKey) restarts the sequence.
  }, [run.runKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const done = run.phase === "done";
  const shown = done
    ? layout.steps.length
    : Math.min(run.revealed, layout.steps.length);
  const stack = shown > 0 ? layout.steps[shown - 1].stack : [];
  const ghosts = layout.steps.slice(0, shown).flatMap((step) => step.removed);

  const select = (month) => (event) => {
    event.stopPropagation();
    onSelectMonth?.(month);
  };

  return (
    <div className="growth-tower" data-phase={run.phase}>
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        aria-hidden="true"
        onClick={() => onSelectMonth?.(null)}
      >
        <line
          className="savings-tower-ground"
          x1={TOWER.x - 14}
          x2={TOWER.x + TOWER.w + 14}
          y1={TOWER.base + 0.5}
          y2={TOWER.base + 0.5}
        />

        {/* Where an overspent month chipped the tower; later layers cover it. */}
        <g className="growth-tower-ghost">
          {ghosts.map((segment, i) =>
            layerBricks(segment.index).map((brick) => (
              <rect
                key={`${i}-${brick.x}`}
                x={brick.x}
                y={toY(segment.top) + 0.75}
                width={brick.w}
                height={Math.max(0.5, (segment.top - segment.bottom) * scale - 1.5)}
                rx={BRICK_RX}
              />
            )),
          )}
        </g>

        {stack.map((layer) => {
          const y = toY(layer.top);
          const h = (layer.top - layer.bottom) * scale;
          const className = [
            "growth-tower-layer",
            layer.index % 2 ? "growth-tower-layer--alt" : "",
            layer.isCurrent ? "growth-tower-layer--current" : "",
            done ? "" : "growth-tower-layer--enter",
            selectedMonth && selectedMonth !== layer.month ? "is-dim" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <g
              key={layer.month}
              className={className}
              data-month={layer.month}
              onClick={select(layer.month)}
            >
              {layerBricks(layer.index).map((brick) => (
                <rect
                  key={brick.x}
                  x={brick.x}
                  y={y + 0.75}
                  width={brick.w}
                  height={Math.max(0.5, h - 1.5)}
                  rx={Math.min(BRICK_RX, h / 2.5)}
                />
              ))}
            </g>
          );
        })}

        {run.shards.map((shard) => (
          <rect
            key={shard.id}
            className="growth-tower-shard"
            x={shard.x}
            y={shard.y}
            width={shard.w}
            height={shard.h}
            rx="2"
            style={{ "--dx": `${shard.dx}px`, "--rot": `${shard.rot}deg` }}
            onAnimationEnd={() =>
              setRun((s) => ({
                ...s,
                shards: s.shards.filter((item) => item.id !== shard.id),
              }))
            }
          />
        ))}
      </svg>
      {!layout.hasIncome && (
        <button type="button" className="savings-tower-setup" onClick={onSetupIncome}>
          設定收入
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Add CSS** — 在 `src/App.css` 的 `@keyframes tower-pit-grow` 之後加：

```css
/* ===== Growth tower (components/SavingsGrowthTower.jsx) ===== */
.growth-tower {
  position: relative;
  width: 120px;
  height: 180px;
  flex: none;
}

.growth-tower svg {
  width: 100%;
  height: 100%;
  overflow: visible;
}

.growth-tower-layer {
  cursor: pointer;
  transition: opacity 200ms ease;
}

.growth-tower-layer rect {
  fill: var(--c-teal);
}

.growth-tower-layer--alt rect {
  fill: #3a8f84;
}

.growth-tower-layer--current rect {
  fill: var(--c-teal-soft);
  stroke: var(--c-teal);
  stroke-opacity: 0.55;
  stroke-dasharray: 3 2;
}

.growth-tower-layer--enter {
  animation: growth-layer-in 500ms cubic-bezier(0.3, 0.7, 0.3, 1) both;
}

.growth-tower-ghost rect {
  fill: none;
  stroke: var(--c-teal);
  stroke-opacity: 0.35;
  stroke-dasharray: 3 2;
}

.growth-tower-shard {
  fill: var(--c-teal);
  transform-box: fill-box;
  transform-origin: center;
  animation: tower-shard-fall 650ms ease-in forwards;
}

@keyframes growth-layer-in {
  0% { opacity: 0; transform: translateY(-40px); }
  70% { opacity: 1; transform: translateY(2px); }
  100% { opacity: 1; transform: translateY(0); }
}
```

並把既有的 reduced-motion 區塊改成：

```css
@media (prefers-reduced-motion: reduce) {
  .networth-jar *,
  .savings-tower *,
  .growth-tower * {
    animation: none !important;
    transition: none !important;
  }
}
```

- [ ] **Step 5: Run tests + lint**

Run: `npx vitest run src/components/SavingsGrowthTower.test.jsx && npx eslint src/components/SavingsGrowthTower.jsx`
Expected: PASS（7 tests）；eslint 無錯誤

- [ ] **Step 6: Commit**

```bash
git add src/components/SavingsGrowthTower.jsx src/components/SavingsGrowthTower.test.jsx src/App.css
git commit -m "feat(expenses): add the 累計 growth tower"
```

---

### Task 7: `ExpenseMonthBars` 月份長條

**Files:**
- Create: `src/components/ExpenseMonthBars.jsx`
- Modify: `src/App.css`（growth tower 區塊之後新增）
- Test: `src/components/ExpenseMonthBars.test.jsx`

**Interfaces:**
- Consumes: Task 1 summary 形狀；`formatTwd` from `src/utils/formatters.js`。
- Produces: `<ExpenseMonthBars summaries mode activeMonth highlightMonth onSelectMonth onToggleCumulative />`；`MONTH_BARS_MAX = 12`。
  - 每根長條 `<button className="expense-month-bar">`，`aria-label="2026 年 10 月，支出 $47,363"`；`aria-pressed` 只在月份模式且為 `activeMonth` 時為 true；高亮（`is-on`）：月份模式看 `activeMonth`，累計模式看 `highlightMonth`。
  - 「累計」`<button className="expense-month-bars-all">`，`aria-pressed` = 是否累計模式。

- [ ] **Step 1: Write the failing test**

```jsx
// src/components/ExpenseMonthBars.test.jsx
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import ExpenseMonthBars from './ExpenseMonthBars'

const months = (n) =>
  Array.from({ length: n }, (_, i) => {
    const date = new Date(2025, 9 + i, 1)
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    return { month, expenseTwd: 1000 * (i + 1), incomeTwd: 5000, isCurrent: i === n - 1 }
  })

const bars = () => screen.getAllByRole('button').filter((b) => b.classList.contains('expense-month-bar'))

describe('ExpenseMonthBars', () => {
  it('shows at most the last 12 months, oldest first', () => {
    render(<ExpenseMonthBars summaries={months(14)} mode="month" activeMonth="2026-11" />)
    expect(bars()).toHaveLength(12)
    expect(bars()[0]).toHaveAccessibleName('2025 年 12 月，支出 $3,000')
    expect(bars()[11]).toHaveAccessibleName('2026 年 11 月，支出 $14,000')
  })

  it('marks the active month in month mode', () => {
    render(<ExpenseMonthBars summaries={months(3)} mode="month" activeMonth="2025-11" />)
    expect(bars()[1]).toHaveAttribute('aria-pressed', 'true')
    expect(bars()[1]).toHaveClass('is-on')
    expect(bars()[0]).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: '累計' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('highlights the picked month in cumulative mode without pressing it', () => {
    const { container } = render(
      <ExpenseMonthBars summaries={months(3)} mode="cumulative" activeMonth="2025-11" highlightMonth="2025-10" />,
    )
    expect(container.firstChild).toHaveClass('expense-month-bars--cumulative')
    expect(bars()[0]).toHaveClass('is-on')
    expect(bars()[1]).not.toHaveClass('is-on')
    expect(bars().every((b) => b.getAttribute('aria-pressed') === 'false')).toBe(true)
    expect(screen.getByRole('button', { name: '累計' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('reports taps', () => {
    const onSelectMonth = vi.fn()
    const onToggleCumulative = vi.fn()
    render(
      <ExpenseMonthBars summaries={months(3)} mode="month" activeMonth="2025-12"
        onSelectMonth={onSelectMonth} onToggleCumulative={onToggleCumulative} />,
    )
    fireEvent.click(bars()[0])
    expect(onSelectMonth).toHaveBeenCalledWith('2025-10')
    fireEvent.click(screen.getByRole('button', { name: '累計' }))
    expect(onToggleCumulative).toHaveBeenCalledTimes(1)
  })

  it('keeps bars tappable when every month spent nothing', () => {
    const zero = months(2).map((s) => ({ ...s, expenseTwd: 0 }))
    render(<ExpenseMonthBars summaries={zero} mode="month" activeMonth="2025-10" />)
    expect(bars().map((b) => b.style.height)).toEqual(['12px', '12px'])
  })

  it('has no text besides the 累計 pill', () => {
    const { container } = render(<ExpenseMonthBars summaries={months(3)} mode="month" activeMonth="2025-10" />)
    expect(container.textContent).toBe('累計')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/ExpenseMonthBars.test.jsx`
Expected: FAIL — `Failed to resolve import "./ExpenseMonthBars"`

- [ ] **Step 3: Implement**

```jsx
// src/components/ExpenseMonthBars.jsx
// Month picker for the expense summary card: one bar per month (height =
// spending), the selected month solid teal. The 累計 pill switches mode.
// Deliberately text-free apart from the pill.
import { formatTwd } from "../utils/formatters";

export const MONTH_BARS_MAX = 12;
const MIN_BAR_PX = 12;
const BAR_RANGE_PX = 52;

const monthName = (month) => {
  const [year, mon] = month.split("-");
  return `${year} 年 ${Number(mon)} 月`;
};

export default function ExpenseMonthBars({
  summaries = [],
  mode,
  activeMonth,
  highlightMonth = null,
  onSelectMonth,
  onToggleCumulative,
}) {
  const cumulative = mode === "cumulative";
  const shown = summaries.slice(-MONTH_BARS_MAX);
  const max = Math.max(1, ...shown.map((s) => Number(s.expenseTwd) || 0));

  return (
    <div className={`expense-month-bars${cumulative ? " expense-month-bars--cumulative" : ""}`}>
      <div className="expense-month-bars-track">
        {shown.map((summary) => {
          const spent = Number(summary.expenseTwd) || 0;
          const on = cumulative
            ? summary.month === highlightMonth
            : summary.month === activeMonth;
          return (
            <button
              key={summary.month}
              type="button"
              className={`expense-month-bar${on ? " is-on" : ""}`}
              style={{ height: `${Math.round(MIN_BAR_PX + (spent / max) * BAR_RANGE_PX)}px` }}
              aria-label={`${monthName(summary.month)}，支出 ${formatTwd(spent)}`}
              aria-pressed={!cumulative && summary.month === activeMonth}
              onClick={() => onSelectMonth?.(summary.month)}
            />
          );
        })}
      </div>
      <button
        type="button"
        className={`expense-month-bars-all${cumulative ? " is-on" : ""}`}
        aria-pressed={cumulative}
        onClick={() => onToggleCumulative?.()}
      >
        累計
      </button>
    </div>
  );
}
```

注意：`formatTwd(3000)` 在 zh-TW 會輸出 `$3,000`；若 Step 4 測試顯示輸出格式不同（例如帶 `NT`），以 `formatTwd` 實際輸出修正**測試的期望字串**，不要改 `formatTwd`。

- [ ] **Step 4: Add CSS** — `src/App.css` growth tower 區塊之後：

```css
/* ===== Expense month bars (components/ExpenseMonthBars.jsx) ===== */
.expense-month-bars {
  width: 100%;
  display: flex;
  align-items: flex-end;
  gap: 6px;
  margin-top: 18px;
}

.expense-month-bars-track {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: flex-end;
  gap: 5px;
  height: 64px;
}

.expense-month-bar {
  flex: 1;
  min-width: 0;
  padding: 0;
  border: 0;
  border-radius: 5px;
  background: #e1efec;
  cursor: pointer;
  transition: background 250ms ease;
}

.expense-month-bars--cumulative .expense-month-bar {
  background: #c4e0da;
}

.expense-month-bar.is-on,
.expense-month-bars--cumulative .expense-month-bar.is-on {
  background: var(--c-teal);
}

.expense-month-bars-all {
  flex: none;
  font: inherit;
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1.5px solid var(--c-line-strong);
  background: transparent;
  color: var(--c-muted);
  cursor: pointer;
}

.expense-month-bars-all.is-on {
  background: var(--c-teal);
  border-color: var(--c-teal);
  color: #ffffff;
}
```

- [ ] **Step 5: Run tests + lint**

Run: `npx vitest run src/components/ExpenseMonthBars.test.jsx && npx eslint src/components/ExpenseMonthBars.jsx`
Expected: PASS（6 tests）；eslint 無錯誤

- [ ] **Step 6: Commit**

```bash
git add src/components/ExpenseMonthBars.jsx src/components/ExpenseMonthBars.test.jsx src/App.css
git commit -m "feat(expenses): add tappable month bars"
```

---

### Task 8: `ExpenseSummaryCard` 卡片

**Files:**
- Create: `src/components/ExpenseSummaryCard.jsx`
- Modify: `src/App.css`（month bars 區塊之後新增）
- Test: `src/components/ExpenseSummaryCard.test.jsx`

**Interfaces:**
- Consumes: `SavingsTower`（Task 4）、`SavingsGrowthTower`（Task 6）、`ExpenseMonthBars`（Task 7）、`getTowerLayout`（Task 3）、`getGrowthTowerLayout` / `getMonthSurplus`（Task 5）。
- Produces: `<ExpenseSummaryCard mode activeMonth monthlySummaries monthProgress upcomingTwd playKey onSelectMonth onToggleMode onSetupIncome />`
  - `mode: "month" | "cumulative"`
  - `monthProgress`: `{ numerator, denominator, hasIncome, recurringNumerator, oneTimeNumerator }`（即 `incomeProgress.month`）
  - `onSelectMonth(month)`：點長條（任何模式）；App 負責切回月份模式。
  - `onToggleMode()`：點「累計」膠囊。
  - 文字節點：`.expense-card-label`、`.expense-card-num`、`.expense-card-chip`（設定收入時為 `<button>`）。

- [ ] **Step 1: Write the failing test**

```jsx
// src/components/ExpenseSummaryCard.test.jsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import ExpenseSummaryCard from './ExpenseSummaryCard'

const summaries = [
  { month: '2026-08', expenseTwd: 50_000, incomeTwd: 100_000, isCurrent: false },
  { month: '2026-09', expenseTwd: 60_000, incomeTwd: null, isCurrent: false },
  { month: '2026-10', expenseTwd: 47_363, incomeTwd: 180_000, isCurrent: true },
]
const monthProgress = {
  numerator: 47_363,
  denominator: 180_000,
  hasIncome: true,
  recurringNumerator: 33_620,
  oneTimeNumerator: 13_743,
}

const renderCard = (props = {}) =>
  render(
    <ExpenseSummaryCard
      mode="month"
      activeMonth="2026-10"
      monthlySummaries={summaries}
      monthProgress={monthProgress}
      upcomingTwd={19_084}
      playKey={1}
      onSelectMonth={vi.fn()}
      onToggleMode={vi.fn()}
      onSetupIncome={vi.fn()}
      {...props}
    />,
  )

const text = (container) => ({
  label: container.querySelector('.expense-card-label').textContent,
  num: container.querySelector('.expense-card-num').textContent,
  chip: container.querySelector('.expense-card-chip').textContent,
})

describe('ExpenseSummaryCard', () => {
  beforeEach(() => {
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
      matches: query.includes('reduce'),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('summarises the month: spending and the share saved', () => {
    const { container } = renderCard()
    expect(text(container)).toEqual({ label: '2026 年 10 月', num: '$47,363', chip: '存下 73.7%' })
  })

  it('shows a tapped part of the tower, then goes back', () => {
    const { container } = renderCard()
    fireEvent.click(container.querySelector('[data-kind="recurring"]'))
    expect(text(container)).toEqual({ label: '定期', num: '$33,620', chip: '佔收入 18.7%' })
    fireEvent.click(container.querySelector('[data-kind="pending"]'))
    expect(text(container)).toEqual({ label: '待扣', num: '$19,084', chip: '本月尚未扣款・未計入' })
    fireEvent.click(container.querySelector('[data-kind="saved"]'))
    expect(text(container)).toEqual({ label: '存下', num: '$113,553', chip: '扣除待扣後・佔收入 63.1%' })
    fireEvent.click(container.querySelector('[data-kind="saved"]'))
    expect(text(container).label).toBe('2026 年 10 月')
  })

  it('forgets the tapped part when the month changes', () => {
    const { container, rerender } = renderCard()
    fireEvent.click(container.querySelector('[data-kind="recurring"]'))
    rerender(
      <ExpenseSummaryCard mode="month" activeMonth="2026-09" monthlySummaries={summaries}
        monthProgress={monthProgress} upcomingTwd={0} playKey={2} />,
    )
    expect(text(container).label).toBe('2026 年 9 月')
  })

  it('flags overspending in red', () => {
    const { container } = renderCard({
      monthProgress: { ...monthProgress, numerator: 200_000, recurringNumerator: 120_000, oneTimeNumerator: 80_000 },
      upcomingTwd: 0,
    })
    const chip = container.querySelector('.expense-card-chip')
    expect(chip.textContent).toBe('超支 $20,000')
    expect(chip).toHaveClass('expense-card-chip--over')
  })

  it('turns the chip into an income setup button without income', () => {
    const onSetupIncome = vi.fn()
    const { container } = renderCard({
      monthProgress: { ...monthProgress, hasIncome: false, denominator: null },
      onSetupIncome,
    })
    fireEvent.click(container.querySelector('button.expense-card-chip'))
    expect(onSetupIncome).toHaveBeenCalledTimes(1)
  })

  it('summarises 累計 as money saved since the first month', () => {
    const { container } = renderCard({ mode: 'cumulative' })
    // 50,000 − 60,000 (no income in Sept) + 132,637.
    expect(text(container)).toEqual({ label: '累計存下・2026/08 起', num: '$122,637', chip: '期間支出 $157,363' })
  })

  it('shows a tapped month in 累計', () => {
    const { container } = renderCard({ mode: 'cumulative' })
    fireEvent.click(container.querySelector('[data-month="2026-10"]'))
    expect(text(container)).toEqual({ label: '2026 年 10 月・進行中', num: '$132,637', chip: '存下該月收入 73.7%' })
    fireEvent.click(container.querySelector('[data-month="2026-10"]'))
    expect(text(container).label).toBe('累計存下・2026/08 起')
  })

  it('counts a month without income as all spending, with no layer to tap', () => {
    const rows = [
      { month: '2026-09', expenseTwd: 0, incomeTwd: 100_000, isCurrent: false },
      { month: '2026-10', expenseTwd: 60_000, incomeTwd: null, isCurrent: true },
    ]
    const { container } = renderCard({ mode: 'cumulative', monthlySummaries: rows })
    expect(text(container).num).toBe('$40,000')
    expect(container.querySelector('[data-month="2026-10"]')).toBeNull()
    // The tap shows September's own surplus, not what is left of its layer.
    fireEvent.click(container.querySelector('[data-month="2026-09"]'))
    expect(text(container)).toEqual({ label: '2026 年 9 月', num: '$100,000', chip: '存下該月收入 100.0%' })
  })

  it('shows a negative total with a minus sign', () => {
    const { container } = renderCard({
      mode: 'cumulative',
      monthlySummaries: [{ month: '2026-10', expenseTwd: 5_000, incomeTwd: null, isCurrent: true }],
    })
    expect(text(container).num).toBe('−$5,000')
  })

  it('sends bar taps and the 累計 pill to the app', () => {
    const onSelectMonth = vi.fn()
    const onToggleMode = vi.fn()
    renderCard({ mode: 'cumulative', onSelectMonth, onToggleMode })
    fireEvent.click(screen.getByRole('button', { name: /2026 年 8 月/ }))
    expect(onSelectMonth).toHaveBeenCalledWith('2026-08')
    fireEvent.click(screen.getByRole('button', { name: '累計' }))
    expect(onToggleMode).toHaveBeenCalledTimes(1)
  })
})
```

數字驗算（寫給實作者對照）：收入 180,000、支出 47,363 → 存下 132,637（73.69% → `73.7%`）；待扣 19,084 ≤ 存下 → 扣除待扣後 113,553（63.09% → `63.1%`）；定期 33,620 / 180,000 = 18.68% → `18.7%`。累計：8 月 +50,000、9 月 −60,000、10 月 +132,637 → 122,637；期間支出 157,363。

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/ExpenseSummaryCard.test.jsx`
Expected: FAIL — `Failed to resolve import "./ExpenseSummaryCard"`

- [ ] **Step 3: Implement**

```jsx
// src/components/ExpenseSummaryCard.jsx
// Expense-tab summary card: label → big number → pill → tower → month bars,
// centred. 月份 mode uses the subtractive SavingsTower; 累計 mode the
// monthly-surplus SavingsGrowthTower. Tapping a part of either tower swaps
// the number and pill for that part; anything else resets.
import { useMemo, useState } from "react";
import SavingsTower from "./SavingsTower";
import SavingsGrowthTower from "./SavingsGrowthTower";
import ExpenseMonthBars from "./ExpenseMonthBars";
import { getTowerLayout } from "../utils/savingsTower";
import {
  getGrowthTowerLayout,
  getMonthSurplus,
} from "../utils/savingsGrowthTower";

const monthName = (month) => {
  const [year, mon] = String(month ?? "").split("-");
  return year && mon ? `${year} 年 ${Number(mon)} 月` : "--";
};
const percent = (part, whole) => `${((part / whole) * 100).toFixed(1)}%`;
const digits = (value) => Math.round(Math.abs(value)).toLocaleString("en-US");
const money = (value) => `${value < 0 ? "−" : ""}$${digits(value)}`;

const describeMonth = ({ activeMonth, monthProgress, upcomingTwd, selected }) => {
  const income = monthProgress?.hasIncome ? Number(monthProgress.denominator) || 0 : 0;
  const recurring = Number(monthProgress?.recurringNumerator) || 0;
  const oneTime = Number(monthProgress?.oneTimeNumerator) || 0;
  const layout = getTowerLayout({
    incomeTwd: income,
    recurringTwd: recurring,
    oneTimeTwd: oneTime,
    upcomingTwd,
  });

  if (layout.hasIncome && selected === "recurring") {
    return { label: "定期", amount: recurring, chip: { text: `佔收入 ${percent(recurring, income)}` } };
  }
  if (layout.hasIncome && selected === "oneTime") {
    return { label: "單筆", amount: oneTime, chip: { text: `佔收入 ${percent(oneTime, income)}` } };
  }
  if (layout.hasIncome && selected === "pending") {
    return { label: "待扣", amount: layout.pendingTwd, chip: { text: "本月尚未扣款・未計入" } };
  }
  if (layout.hasIncome && selected === "saved") {
    const left = layout.savedTwd - layout.pendingTwd;
    return { label: "存下", amount: left, chip: { text: `扣除待扣後・佔收入 ${percent(left, income)}` } };
  }

  const spent = Number(monthProgress?.numerator) || 0;
  let chip;
  if (!layout.hasIncome) {
    chip = { text: "設定收入", action: true };
  } else if (layout.overspendTwd > 0) {
    chip = { text: `超支 ${money(layout.overspendTwd)}`, over: true };
  } else {
    chip = { text: `存下 ${percent(layout.savedTwd, income)}` };
  }
  return { label: monthName(activeMonth), amount: spent, chip };
};

const describeCumulative = ({ summaries, growth, selected }) => {
  const picked = selected ? summaries.find((s) => s.month === selected) : null;
  if (picked) {
    const surplus = getMonthSurplus(picked);
    // Only months with a layer can be tapped, so surplus > 0 and income > 0
    // here; the guard keeps a stale selection from dividing by zero.
    const chip =
      surplus > 0 && Number(picked.incomeTwd) > 0
        ? { text: `存下該月收入 ${percent(surplus, picked.incomeTwd)}` }
        : { text: `超支・支出 ${money(picked.expenseTwd)}`, over: true };
    return {
      label: `${monthName(picked.month)}${picked.isCurrent ? "・進行中" : ""}`,
      amount: surplus,
      chip,
    };
  }
  const first = summaries[0]?.month;
  const label = first ? `累計存下・${first.replace("-", "/")} 起` : "累計存下";
  return {
    label,
    amount: growth.totalSavedTwd,
    chip: { text: `期間支出 ${money(growth.totalSpentTwd)}` },
  };
};

export default function ExpenseSummaryCard({
  mode,
  activeMonth,
  monthlySummaries = [],
  monthProgress,
  upcomingTwd = 0,
  playKey,
  onSelectMonth,
  onToggleMode,
  onSetupIncome,
}) {
  const cumulative = mode === "cumulative";
  // A tapped part / month belongs to one view; switching month, mode or
  // replaying the tower drops it without a state reset effect.
  const viewKey = `${mode}|${activeMonth}|${playKey}`;
  const [selection, setSelection] = useState({ viewKey, value: null });
  const selected = selection.viewKey === viewKey ? selection.value : null;
  const select = (value) =>
    setSelection({ viewKey, value: value === selected ? null : value });

  const growth = useMemo(
    () => getGrowthTowerLayout(monthlySummaries),
    [monthlySummaries],
  );
  const text = cumulative
    ? describeCumulative({ summaries: monthlySummaries, growth, selected })
    : describeMonth({ activeMonth, monthProgress, upcomingTwd, selected });

  return (
    <section className="expense-card" aria-label="支出摘要">
      <div key={`${viewKey}|${selected ?? ""}`} className="expense-card-swap">
        <div className="expense-card-label">{text.label}</div>
        <div className="expense-card-num">
          <span className="expense-card-cur">{text.amount < 0 ? "−$" : "$"}</span>
          {digits(text.amount)}
        </div>
        {text.chip.action ? (
          <button type="button" className="expense-card-chip" onClick={onSetupIncome}>
            {text.chip.text}
          </button>
        ) : (
          <span className={`expense-card-chip${text.chip.over ? " expense-card-chip--over" : ""}`}>
            {text.chip.text}
          </span>
        )}
      </div>
      <div className="expense-card-tower">
        {cumulative ? (
          <SavingsGrowthTower
            summaries={monthlySummaries}
            playKey={playKey}
            selectedMonth={selected}
            onSelectMonth={select}
            onSetupIncome={onSetupIncome}
          />
        ) : (
          <SavingsTower
            incomeTwd={monthProgress?.denominator}
            recurringTwd={monthProgress?.recurringNumerator}
            oneTimeTwd={monthProgress?.oneTimeNumerator}
            upcomingTwd={upcomingTwd}
            hasIncome={Boolean(monthProgress?.hasIncome)}
            playKey={playKey}
            selectedKind={selected}
            onSelectKind={select}
            onSetupIncome={onSetupIncome}
          />
        )}
      </div>
      <ExpenseMonthBars
        summaries={monthlySummaries}
        mode={mode}
        activeMonth={activeMonth}
        highlightMonth={cumulative ? selected : null}
        onSelectMonth={onSelectMonth}
        onToggleCumulative={onToggleMode}
      />
    </section>
  );
}
```

注意 `select(null)`（點塔外空白）：`null === selected` 為 false 時設為 `null`；為 true 時也是 `null`，兩者都回到總覽。

- [ ] **Step 4: Add CSS** — `src/App.css` month bars 區塊之後：

```css
/* ===== Expense summary card (components/ExpenseSummaryCard.jsx) ===== */
.expense-card {
  width: min(420px, 100%);
  margin: 0 auto;
  box-sizing: border-box;
  border: 1.5px dashed var(--c-line-strong);
  border-radius: 24px;
  padding: 20px 18px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.expense-card-swap {
  display: flex;
  flex-direction: column;
  align-items: center;
  animation: jar-fade-in 180ms ease-out both;
}

.expense-card-label {
  font-size: 14px;
  color: var(--c-subtle);
  min-height: 20px;
}

.expense-card-num {
  margin-top: 4px;
  font-size: 38px;
  font-weight: 700;
  letter-spacing: -0.8px;
  line-height: 1.15;
  font-variant-numeric: tabular-nums;
  color: var(--c-ink);
}

.expense-card-cur {
  color: var(--c-subtle);
}

.expense-card-chip {
  margin-top: 10px;
  padding: 5px 14px;
  border-radius: 999px;
  border: 1.5px solid #bfe0d9;
  background: var(--c-teal-soft);
  color: var(--c-teal-ink);
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

button.expense-card-chip {
  cursor: pointer;
}

.expense-card-chip--over {
  border-color: #f5c2c2;
  background: #fdeaea;
  color: var(--c-down);
}

.expense-card-tower {
  margin-top: 14px;
}

@media (max-width: 768px) {
  .expense-card-num {
    font-size: 34px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .expense-card-swap {
    animation: none;
  }
}
```

- [ ] **Step 5: Run tests + lint**

Run: `npx vitest run src/components/ExpenseSummaryCard.test.jsx && npx eslint src/components/ExpenseSummaryCard.jsx`
Expected: PASS（10 tests）；eslint 無錯誤

- [ ] **Step 6: Commit**

```bash
git add src/components/ExpenseSummaryCard.jsx src/components/ExpenseSummaryCard.test.jsx src/App.css
git commit -m "feat(expenses): add the reference-style expense summary card"
```

---

### Task 9: 接進 `App.jsx`、清掉舊 hero、驗證

**Files:**
- Modify: `src/App.jsx`（import 區約 205–206 行；state 約 556–570 行；`loadExpenseData` 約 1003–1030 行；hero 相關 memo 約 4845–4925 行；hero JSX 約 6118–6273 行）
- Modify: `src/App.css`（刪除舊 hero 專用規則）
- Modify: `CLAUDE.md`（UI 段落的元件清單）

**Interfaces:**
- Consumes: `ExpenseSummaryCard`（Task 8）、`view.monthlySummaries`（Task 2）；既有 state `expenseTotalMode`（`"month" | "cumulative"`）、`activeExpenseMonth` / `setActiveExpenseMonth`、`expensePlayKey` / `setExpensePlayKey`、`incomeProgress`、`expenseUpcomingTotalTwd`、`safeActiveExpenseMonth`、`goToIncomeSettings`。

- [ ] **Step 1: State + data** — 在 `const [expenseFirstDate, setExpenseFirstDate] = useState(null);` 之後加：

```js
  const [expenseMonthlySummaries, setExpenseMonthlySummaries] = useState([]);
```

在 `loadExpenseData` 內 `setExpenseCumulativeTotalTwd(...)` 之後加：

```js
      setExpenseMonthlySummaries(view.monthlySummaries ?? []);
```

- [ ] **Step 2: Replace the hero JSX** — 把 `<div className="expense-summary-panel expense-summary-panel--plain">` 起、到它對應的結尾 `</div>`（也就是 `<SavingsTower … />` 與其外層 `summary-hero-row` 都關閉之後、`</Col>` 之前）整段換成：

```jsx
                    <ExpenseSummaryCard
                      mode={expenseTotalMode}
                      activeMonth={safeActiveExpenseMonth}
                      monthlySummaries={expenseMonthlySummaries}
                      monthProgress={incomeProgress?.month}
                      upcomingTwd={expenseUpcomingTotalTwd}
                      playKey={expensePlayKey}
                      onSelectMonth={(month) => {
                        setExpensePlayKey((key) => key + 1);
                        setExpenseTotalMode("month");
                        setActiveExpenseMonth(month);
                      }}
                      onToggleMode={() => {
                        setExpensePlayKey((key) => key + 1);
                        setExpenseTotalMode((current) =>
                          current === "cumulative" ? "month" : "cumulative",
                        );
                      }}
                      onSetupIncome={goToIncomeSettings}
                    />
```

在 import 區把 `import SavingsTower from "./components/SavingsTower";` 換成 `import ExpenseSummaryCard from "./components/ExpenseSummaryCard";`。

- [ ] **Step 3: Remove dead code** — 執行 `npx eslint src/App.jsx`。對每個回報為 unused 的識別字，若在下列清單中就刪除其宣告（含整個 `useMemo` 區塊、對應的 `useState` 與所有 setter 呼叫、以及 import）：
  `getTowerLayout`、`expenseMonthTitle`、`expenseSummaryValue`、`activeIncomeProgress`、`expenseIncomeProgressMetaLeftText`、`expenseIncomeProgressMetaRightText`、`expenseTowerLayout`、`expenseSavedText`、`expenseActiveMonthIndex`、`canGoPrevExpenseMonth`、`canGoNextExpenseMonth`、`expenseFirstDate`/`setExpenseFirstDate`、`expenseCumulativeTotalTwd`/`setExpenseCumulativeTotalTwd`、`LeftOutlined`、`RightOutlined`、`AreaChartOutlined`、`Segmented`、`HoverTooltip`。
  不在清單中的 unused 警告代表別處有問題，先停下來檢查，不要順手刪。重跑 `npx eslint src/App.jsx` 直到乾淨。

- [ ] **Step 4: Remove dead CSS** — 對下列 selector 逐一 `grep -n "<class>" src/App.jsx src/components/*.jsx`；若已無任何使用者，從 `src/App.css` 刪除其規則（含 media query 內的同名規則）：
  `expense-summary-panel`、`expense-summary-panel--plain`、`expense-summary-header`、`expense-summary-toggle`、`expense-summary-title`、`expense-summary-meta`、`expense-month-nav`、`expense-month-nav-btn`、`expense-month-nav-title`、`expense-summary-value`、`expense-summary-value-main`、`expense-summary-trend-btn`、`expense-saved-text`、`expense-saved-text--over`、`expense-tower-legend`、`expense-tower-swatch`（含 `--recurring`/`--onetime`/`--saved`）、`expense-upcoming-note`、`expense-income-progress`、`expense-income-progress-meta-row`、`expense-income-progress-meta-left`、`expense-income-progress-meta-right`、`expense-summary-subtext`。
  `summary-hero-row` / `summary-hero-text` 資產頁仍在用，**不要刪**。

- [ ] **Step 5: Confirm no gradients slipped in**

Run: `grep -n "linearGradient\|linear-gradient" src/components/SavingsTower.jsx src/components/SavingsGrowthTower.jsx src/components/ExpenseMonthBars.jsx src/components/ExpenseSummaryCard.jsx; grep -n "expense-card\|expense-month-bar\|growth-tower\|savings-tower" src/App.css | grep -i gradient`
Expected: 無輸出

- [ ] **Step 6: Update CLAUDE.md** — 把 UI 段落中「只有四個元件被抽出到 `src/components/` 之下：`HoldingForm`、`CashAccountForm`、`MobileFormSheetLayout`、`TrendChart`。」改為：

```markdown
部分元件已抽出到 `src/components/`（表單、mobile sheet、圖表，以及支出頁摘要卡 `ExpenseSummaryCard` 與其 `SavingsTower` / `SavingsGrowthTower` / `ExpenseMonthBars`、資產頁 `NetWorthJar` 等）；塔與長條的純計算在 `src/utils/savingsTower.js`、`savingsGrowthTower.js`、`monthlySummaries.js`。
```

- [ ] **Step 7: Full verification**

Run: `npm test && npm run lint && npm run build`
Expected: 全部測試 PASS、lint 無錯誤、build 成功。

- [ ] **Step 8: Browser check**（memory：build 成功 ≠ runtime 正常）

Run: `npm run dev`，在瀏覽器登入後到「支出」頁，分別在手機寬（≤ 500px）與桌機寬檢查：
  1. 卡片置中、虛線圓角，無任何漸層；長條下方沒有文字。
  2. 月份模式：入場「落下 → 敲碎掉落」動畫正常；待扣斜紋出現在存下段頂端；點定期 / 單筆 / 待扣 / 存下各段，數字與膠囊切換，再點回總覽。
  3. 點長條換月，塔重播；選中長條為實色。
  4. 點「累計」：成長塔逐月疊上、超支月份敲碎；點某層顯示該月結餘、對應長條高亮；點某根長條會切回月份模式並停在該月；再點「累計」膠囊回月份模式。
  5. Console 無錯誤。

- [ ] **Step 9: Commit**

```bash
git add src/App.jsx src/App.css CLAUDE.md
git commit -m "feat(expenses): swap the expense hero for the summary card"
```
