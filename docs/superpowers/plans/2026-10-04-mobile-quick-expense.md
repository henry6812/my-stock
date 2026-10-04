# 手機快速記帳（Quick Expense Sheet）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 手機版按 FAB 新增單筆支出時，改開記帳 App 風格的快速輸入畫面（自訂數字鍵盤 + 分類格 + 常用支出），全程不需系統鍵盤即可存檔。

**Architecture:** 鍵盤算式邏輯是純函式 `src/utils/amountExpression.js`；畫面是自管 state 的 `src/components/QuickExpenseSheet.jsx`（不使用 antd `Form`），透過 props 收資料、透過 `onSubmit(payload)` 回傳；`App.jsx` 只負責接線，並把既有存檔流程抽成共用的 `saveExpenseEntry(payload)`。`portfolioService`、schema、Firestore mapper 都不動。

**Tech Stack:** React 19、Ant Design 6（只用 `Drawer`）、dayjs、Vitest + `@testing-library/react` + `@testing-library/user-event`。

**Spec:** `docs/superpowers/specs/2026-10-04-mobile-quick-expense-design.md`

## Global Constraints

- 只影響手機 viewport（`isMobileViewport`）的「新增單筆」；編輯、新增定期支出、桌面版行為完全不變。
- 不修改 `src/services/portfolioService.js`、`src/db/database.js`、`src/services/firebase/firestoreMappers.js`。
- 金額只允許整數；運算只有 `+` / `−`；每個運算元最多 9 位數。
- 名稱未填時，存檔的 `name` = 目前分類名稱。
- 點常用項目：帶入名稱、分類、支出人、家庭/個人、預算；**金額清空**。
- 存檔成功：關閉畫面 + toast `已記錄 {名稱} {formatTwd(金額)}`；失敗：畫面保持開啟、輸入保留、`message.error(toUserMessage(error, "儲存支出失敗"))`。
- 存鍵可按條件：金額 > 0 且（已選分類 或 已填名稱）。
- 不做：`×` / `÷`、震動回饋、復原、自訂常用清單、桌面版快速畫面。
- 原始碼風格：`src/**/*.js(x)` 用雙引號 + 分號；`*.test.js(x)` 用單引號、無分號（沿用既有檔案）。
- 樣式寫在 `src/App.css` 新的獨立區段，只用 `src/index.css` 已有的 tokens（`--c-*`、`--radius-*`、`--fs-*`）。

## Review Focus

1. **算式結果 ≤ 0（例如 `5-10`）**：存鍵必須不能送出 → Task 3 測試 `blocks save when the result is not positive`。
2. **常用項目指向已刪除的分類 / 支出人 / 預算**：不可帶入失效 id → Task 2 `sanitizeSuggestions` 測試。
3. **連點兩次「存」**：只能寫入一筆 → Task 3 測試 `submits only once on a double tap`。
4. **名稱輸入時點 autocomplete chip**：input blur 不能吃掉 click，點了要套用並回到自訂鍵盤 → Task 3 測試 `name autocomplete chip applies the suggestion and restores the keypad`，並在 Task 4 實機驗證。
5. **「完整表單」交接被現有 open effect 覆蓋**：現有表單的 open effect 會用 `readLastExpenseDefaults()` 重設欄位；草稿必須在那之後套用 → Task 4 Step 6 的實作與 Step 9 瀏覽器驗證。

---

### Task 1: `amountExpression` 純函式

**Files:**
- Create: `src/utils/amountExpression.js`
- Test: `src/utils/amountExpression.test.js`

**Interfaces:**
- Consumes: 無
- Produces:
  - `pressKey(expr: string, key: string): string`，`key` ∈ `"0"`–`"9"` | `"00"` | `"+"` | `"-"` | `"backspace"` | `"clear"`
  - `evaluateExpression(expr: string): number | null`（空字串 → `null`）
  - `hasOperator(expr: string): boolean`

- [ ] **Step 1: Write the failing test**

`src/utils/amountExpression.test.js`：

```js
import { describe, it, expect } from 'vitest'
import { evaluateExpression, hasOperator, pressKey } from './amountExpression'

const typeKeys = (keys) => keys.reduce((expr, key) => pressKey(expr, key), '')

describe('pressKey', () => {
  it('appends digits', () => {
    expect(typeKeys(['1', '2', '0'])).toBe('120')
  })

  it('appends operators after a number', () => {
    expect(typeKeys(['1', '2', '0', '+', '8', '5'])).toBe('120+85')
  })

  it('ignores an operator at the start', () => {
    expect(typeKeys(['+', '-', '5'])).toBe('5')
  })

  it('replaces a trailing operator with the new one', () => {
    expect(typeKeys(['5', '+', '-'])).toBe('5-')
  })

  it('does not stack leading zeros', () => {
    expect(typeKeys(['0', '0'])).toBe('0')
    expect(typeKeys(['0', '00'])).toBe('0')
  })

  it('replaces a lone leading zero with the next digit', () => {
    expect(typeKeys(['0', '7'])).toBe('7')
    expect(typeKeys(['5', '+', '0', '3'])).toBe('5+3')
  })

  it('turns 00 at the start of an operand into a single 0', () => {
    expect(typeKeys(['00'])).toBe('0')
    expect(typeKeys(['5', '+', '00'])).toBe('5+0')
  })

  it('appends 00 after a non-zero digit', () => {
    expect(typeKeys(['1', '00'])).toBe('100')
  })

  it('caps each operand at 9 digits', () => {
    const nine = ['1', '2', '3', '4', '5', '6', '7', '8', '9']
    expect(typeKeys([...nine, '0'])).toBe('123456789')
    expect(typeKeys([...nine.slice(0, 8), '00'])).toBe('12345678')
    expect(typeKeys([...nine, '+', '1'])).toBe('123456789+1')
  })

  it('backspace removes the last character', () => {
    expect(pressKey('120+', 'backspace')).toBe('120')
    expect(pressKey('', 'backspace')).toBe('')
  })

  it('clear empties the expression', () => {
    expect(pressKey('120+85', 'clear')).toBe('')
  })

  it('ignores unknown keys', () => {
    expect(pressKey('12', '*')).toBe('12')
  })
})

describe('evaluateExpression', () => {
  it('returns null for an empty expression', () => {
    expect(evaluateExpression('')).toBeNull()
  })

  it('evaluates sums and differences left to right', () => {
    expect(evaluateExpression('120+85')).toBe(205)
    expect(evaluateExpression('100-30+5')).toBe(75)
  })

  it('ignores a trailing operator', () => {
    expect(evaluateExpression('120+')).toBe(120)
  })

  it('can go negative', () => {
    expect(evaluateExpression('5-10')).toBe(-5)
  })
})

describe('hasOperator', () => {
  it('detects + and -', () => {
    expect(hasOperator('120')).toBe(false)
    expect(hasOperator('120+')).toBe(true)
    expect(hasOperator('5-1')).toBe(true)
    expect(hasOperator('')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/amountExpression.test.js`
Expected: FAIL（`Failed to resolve import "./amountExpression"`）

- [ ] **Step 3: Write minimal implementation**

`src/utils/amountExpression.js`：

```js
// Calculator-style amount entry for the mobile quick-expense keypad: whole
// numbers joined by + / −, evaluated left to right. No eval().

const OPERATORS = ["+", "-"];
const MAX_OPERAND_DIGITS = 9;

const lastOperand = (expr) => expr.split(/[+-]/).pop();

export const pressKey = (expr, key) => {
  const current = String(expr || "");
  if (key === "clear") return "";
  if (key === "backspace") return current.slice(0, -1);

  if (OPERATORS.includes(key)) {
    if (!current) return current;
    if (OPERATORS.includes(current.at(-1))) {
      return current.slice(0, -1) + key;
    }
    return current + key;
  }

  if (key !== "00" && !/^\d$/.test(key)) return current;

  const operand = lastOperand(current);
  if (operand === "") {
    return current + (key === "00" ? "0" : key);
  }
  if (operand === "0") {
    if (key === "0" || key === "00") return current;
    return current.slice(0, -1) + key;
  }
  if (operand.length + key.length > MAX_OPERAND_DIGITS) return current;
  return current + key;
};

export const evaluateExpression = (expr) => {
  const trimmed = String(expr || "").replace(/[+-]$/, "");
  if (!trimmed) return null;
  return trimmed
    .match(/[+-]?\d+/g)
    .reduce((sum, token) => sum + Number(token), 0);
};

export const hasOperator = (expr) => /[+-]/.test(String(expr || ""));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/amountExpression.test.js`
Expected: PASS（全部）

- [ ] **Step 5: Lint & commit**

```bash
npx eslint src/utils/amountExpression.js src/utils/amountExpression.test.js
git add src/utils/amountExpression.js src/utils/amountExpression.test.js
git commit -m "feat(expense): add calculator-style amount expression helpers"
```

---

### Task 2: `sanitizeSuggestions`（清掉失效的分類 / 支出人 / 預算 id）

**Files:**
- Modify: `src/utils/expenseSuggestions.js`（檔尾新增 export）
- Test: `src/utils/expenseSuggestions.test.js`（新增 describe）

**Interfaces:**
- Consumes: `buildExpenseNameSuggestions` 產出的 suggestion 物件 `{ name, categoryId, payer, expenseKind, budgetId, amountTwd, count, lastUsedAt }`
- Produces: `sanitizeSuggestions(suggestions, { categoryIds: Set, payers: Set, budgetIds: Set }): Suggestion[]`，失效欄位改為 `null`，其他欄位原樣保留。

- [ ] **Step 1: Write the failing test**

在 `src/utils/expenseSuggestions.test.js` 的 import 加上 `sanitizeSuggestions`，檔尾新增：

```js
describe('sanitizeSuggestions', () => {
  const lookups = {
    categoryIds: new Set(['c-food']),
    payers: new Set(['小明']),
    budgetIds: new Set(['b-1']),
  }

  it('keeps references that still exist', () => {
    const item = {
      name: '早餐',
      categoryId: 'c-food',
      payer: '小明',
      expenseKind: '個人',
      budgetId: 'b-1',
      amountTwd: 80,
    }
    expect(sanitizeSuggestions([item], lookups)).toEqual([item])
  })

  it('nulls references that no longer exist', () => {
    const [result] = sanitizeSuggestions(
      [
        {
          name: '早餐',
          categoryId: 'c-gone',
          payer: '離職的人',
          expenseKind: '個人',
          budgetId: 'b-gone',
          amountTwd: 80,
        },
      ],
      lookups,
    )
    expect(result).toEqual({
      name: '早餐',
      categoryId: null,
      payer: null,
      expenseKind: '個人',
      budgetId: null,
      amountTwd: 80,
    })
  })

  it('handles a missing list', () => {
    expect(sanitizeSuggestions(undefined, lookups)).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/expenseSuggestions.test.js`
Expected: FAIL（`sanitizeSuggestions is not a function`）

- [ ] **Step 3: Write minimal implementation**

`src/utils/expenseSuggestions.js` 檔尾新增：

```js
// Drops references to categories / payers / budgets that no longer exist, so
// picking a suggestion never fills in a stale id.
export const sanitizeSuggestions = (
  suggestions,
  { categoryIds, payers, budgetIds },
) =>
  (suggestions || []).map((item) => ({
    ...item,
    categoryId: categoryIds.has(item.categoryId) ? item.categoryId : null,
    payer: payers.has(item.payer) ? item.payer : null,
    budgetId: budgetIds.has(item.budgetId) ? item.budgetId : null,
  }));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/expenseSuggestions.test.js`
Expected: PASS（含既有測試）

- [ ] **Step 5: Lint & commit**

```bash
npx eslint src/utils/expenseSuggestions.js src/utils/expenseSuggestions.test.js
git add src/utils/expenseSuggestions.js src/utils/expenseSuggestions.test.js
git commit -m "feat(expense): add sanitizeSuggestions for stale suggestion refs"
```

---

### Task 3: `QuickExpenseSheet` 元件 + 樣式

**Files:**
- Create: `src/components/QuickExpenseSheet.jsx`
- Test: `src/components/QuickExpenseSheet.test.jsx`
- Modify: `src/App.css`（檔尾新增 `/* Quick expense sheet (mobile) */` 區段）

**Interfaces:**
- Consumes: Task 1 的 `pressKey`、`evaluateExpression`、`hasOperator`；既有 `filterNameSuggestions(suggestions, query, { limit })`（`src/utils/expenseSuggestions.js`）
- Produces: `default export QuickExpenseSheet`，props：

| prop | 型別 | 說明 |
|---|---|---|
| `open` | `boolean` | |
| `onClose` | `() => void` | 取消 / 下滑 / 點遮罩 |
| `suggestions` | `Suggestion[]` | 已經過 `sanitizeSuggestions`，依常用度排序 |
| `quickCategories` | `{ id, name }[]` | 分類格 |
| `allCategories` | `{ id, name }[]` | 「更多」清單 + 名稱查詢 |
| `defaults` | `{ payer: string \| null, expenseKind: string \| null }` | 未選常用時的支出人 / 家庭個人 |
| `onSubmit` | `(payload) => Promise<void>` | payload：`{ name, amountTwd, occurredAt: "YYYY-MM-DD", entryType: "ONE_TIME", categoryId, payer, expenseKind, budgetId }`（後四者可為 `null`） |
| `onOpenFullForm` | `(draft) => void` | draft：`{ name, amountTwd?, occurredAt: "YYYY-MM-DD", categoryId?, payer?, expenseKind?, budgetId? }`（沒有值的欄位為 `undefined`） |
| `loading` | `boolean` | 存檔中 |
| `disabled` | `boolean` | 不可寫入 |

元件**不**在 `open` 變化時自行重置；由 App 每次打開時換 `key` 讓它 remount（Task 4）。

> 實作說明：spec 寫「📅 開 `DatePicker`」。這裡改用疊在 chip 上的透明原生 `<input type="date">`，手機上會直接開系統日期滾輪，比 antd `DatePicker` 好按，而且 `max` 可以擋未來日期。行為與 spec 等價。

- [ ] **Step 1: Write the failing tests**

`src/components/QuickExpenseSheet.test.jsx`：

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import dayjs from 'dayjs'
import QuickExpenseSheet from './QuickExpenseSheet'

const categories = [
  { id: 'c-food', name: '餐飲' },
  { id: 'c-traffic', name: '交通' },
  { id: 'c-home', name: '家用' },
]

const suggestions = [
  {
    name: '早餐',
    categoryId: 'c-food',
    payer: '小明',
    expenseKind: '個人',
    budgetId: 'b-1',
    amountTwd: 85,
    count: 5,
    lastUsedAt: '2026-10-01|',
  },
  {
    name: '加油',
    categoryId: 'c-traffic',
    payer: null,
    expenseKind: null,
    budgetId: null,
    amountTwd: 1200,
    count: 3,
    lastUsedAt: '2026-09-28|',
  },
]

const KEY_LABELS = { '+': '加', '-': '減', backspace: '刪除', clear: '清除' }

const renderSheet = (props = {}) => {
  const handlers = {
    onClose: vi.fn(),
    onSubmit: vi.fn().mockResolvedValue(undefined),
    onOpenFullForm: vi.fn(),
  }
  render(
    <QuickExpenseSheet
      open
      suggestions={suggestions}
      quickCategories={categories.slice(0, 2)}
      allCategories={categories}
      defaults={{ payer: '共同帳戶', expenseKind: '家庭' }}
      {...handlers}
      {...props}
    />,
  )
  return { user: userEvent.setup(), ...handlers, ...props }
}

const press = async (user, keys) => {
  for (const key of keys) {
    await user.click(screen.getByRole('button', { name: KEY_LABELS[key] ?? key }))
  }
}

const saveButton = () => screen.getByRole('button', { name: '存' })

describe('<QuickExpenseSheet />', () => {
  it('evaluates the keypad expression and submits it with the category name', async () => {
    const { user, onSubmit } = renderSheet()
    await user.click(screen.getByRole('button', { name: '餐飲' }))
    await press(user, ['1', '2', '0', '+', '8', '5'])

    expect(screen.getByLabelText('金額')).toHaveTextContent('$205')
    expect(screen.getByLabelText('算式')).toHaveTextContent('120+85')

    await user.click(saveButton())
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit).toHaveBeenCalledWith({
      name: '餐飲',
      amountTwd: 205,
      occurredAt: dayjs().format('YYYY-MM-DD'),
      entryType: 'ONE_TIME',
      categoryId: 'c-food',
      payer: '共同帳戶',
      expenseKind: '家庭',
      budgetId: null,
    })
  })

  it('picking a suggestion fills name, category and extras but clears the amount', async () => {
    const { user, onSubmit } = renderSheet()
    await press(user, ['5'])
    await user.click(screen.getByRole('button', { name: '常用 早餐' }))

    expect(screen.getByLabelText('名稱')).toHaveValue('早餐')
    expect(screen.getByRole('button', { name: '餐飲' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '常用 早餐' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('金額')).toHaveTextContent('$0')

    await press(user, ['9', '0'])
    await user.click(saveButton())
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: '早餐',
        amountTwd: 90,
        categoryId: 'c-food',
        payer: '小明',
        expenseKind: '個人',
        budgetId: 'b-1',
      }),
    )
  })

  it('changing category clears a suggestion-filled name and its extras', async () => {
    const { user, onSubmit } = renderSheet()
    await user.click(screen.getByRole('button', { name: '常用 早餐' }))
    await user.click(screen.getByRole('button', { name: '交通' }))

    expect(screen.getByLabelText('名稱')).toHaveValue('')
    expect(screen.getByRole('button', { name: '常用 早餐' })).toHaveAttribute('aria-pressed', 'false')

    await press(user, ['5', '0'])
    await user.click(saveButton())
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: '交通',
        categoryId: 'c-traffic',
        payer: '共同帳戶',
        expenseKind: '家庭',
        budgetId: null,
      }),
    )
  })

  it('keeps a hand-typed name when the category changes', async () => {
    const { user } = renderSheet()
    await user.click(screen.getByRole('button', { name: '餐飲' }))
    await user.type(screen.getByLabelText('名稱'), '午餐')
    await user.keyboard('{Enter}')
    await user.click(screen.getByRole('button', { name: '交通' }))
    expect(screen.getByLabelText('名稱')).toHaveValue('午餐')
  })

  it('blocks save without an amount', async () => {
    const { user, onSubmit } = renderSheet()
    await user.click(screen.getByRole('button', { name: '餐飲' }))
    expect(saveButton()).toHaveAttribute('aria-disabled', 'true')
    await user.click(saveButton())
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('blocks save when the result is not positive', async () => {
    const { user, onSubmit } = renderSheet()
    await user.click(screen.getByRole('button', { name: '餐飲' }))
    await press(user, ['5', '-', '1', '0'])
    expect(saveButton()).toHaveAttribute('aria-disabled', 'true')
    await user.click(saveButton())
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('blocks save with neither a category nor a name', async () => {
    const { user, onSubmit } = renderSheet()
    await press(user, ['5', '0'])
    expect(saveButton()).toHaveAttribute('aria-disabled', 'true')
    await user.click(saveButton())
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('allows a name without a category', async () => {
    const { user, onSubmit } = renderSheet()
    await user.type(screen.getByLabelText('名稱'), '雜支')
    await user.keyboard('{Enter}')
    await press(user, ['3', '0'])
    await user.click(saveButton())
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: '雜支', categoryId: null, amountTwd: 30 }),
    )
  })

  it('submits only once on a double tap', async () => {
    const onSubmit = vi.fn(() => new Promise(() => {}))
    const { user } = renderSheet({ onSubmit })
    await user.click(screen.getByRole('button', { name: '餐飲' }))
    await press(user, ['8'])
    await user.click(saveButton())
    await user.click(saveButton())
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('stays usable after a failed submit', async () => {
    const onSubmit = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined)
    const { user } = renderSheet({ onSubmit })
    await user.click(screen.getByRole('button', { name: '餐飲' }))
    await press(user, ['8'])
    await user.click(saveButton())
    expect(screen.getByLabelText('金額')).toHaveTextContent('$8')
    await user.click(saveButton())
    expect(onSubmit).toHaveBeenCalledTimes(2)
  })

  it('hides the keypad while the name is focused', async () => {
    const { user } = renderSheet()
    await user.click(screen.getByLabelText('名稱'))
    expect(screen.queryByRole('button', { name: '存' })).not.toBeInTheDocument()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('button', { name: '存' })).toBeInTheDocument()
  })

  it('name autocomplete chip applies the suggestion and restores the keypad', async () => {
    const { user } = renderSheet()
    await user.type(screen.getByLabelText('名稱'), '早')
    await user.click(screen.getByRole('button', { name: '早餐' }))
    expect(screen.getByLabelText('名稱')).toHaveValue('早餐')
    expect(screen.getByRole('button', { name: '餐飲' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '存' })).toBeInTheDocument()
  })

  it('date chips switch the date', async () => {
    const { user, onSubmit } = renderSheet()
    await user.click(screen.getByRole('button', { name: '昨天' }))
    expect(screen.getByRole('button', { name: '昨天' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: '餐飲' }))
    await press(user, ['1'])
    await user.click(saveButton())
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        occurredAt: dayjs().subtract(1, 'day').format('YYYY-MM-DD'),
      }),
    )
  })

  it('更多 opens the full category list', async () => {
    const { user } = renderSheet()
    await user.click(screen.getByRole('button', { name: '更多' }))
    await user.click(screen.getByRole('button', { name: '家用' }))
    expect(screen.getByText('家用', { selector: '.quick-expense-category-label' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '存' })).toBeInTheDocument()
  })

  it('完整表單 hands the draft over', async () => {
    const { user, onOpenFullForm } = renderSheet()
    await user.click(screen.getByRole('button', { name: '常用 加油' }))
    await press(user, ['1', '2', '0', '0'])
    await user.click(screen.getByRole('button', { name: '完整表單' }))
    expect(onOpenFullForm).toHaveBeenCalledWith({
      name: '加油',
      amountTwd: 1200,
      occurredAt: dayjs().format('YYYY-MM-DD'),
      categoryId: 'c-traffic',
      payer: undefined,
      expenseKind: undefined,
      budgetId: undefined,
    })
  })

  it('locks the save key while disabled', async () => {
    const { user, onSubmit } = renderSheet({ disabled: true })
    await user.click(screen.getByRole('button', { name: '餐飲' }))
    await user.click(saveButton())
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/QuickExpenseSheet.test.jsx`
Expected: FAIL（`Failed to resolve import "./QuickExpenseSheet"`）

- [ ] **Step 3: Write the component**

`src/components/QuickExpenseSheet.jsx`：

```jsx
import { useMemo, useRef, useState } from "react";
import { Drawer } from "antd";
import dayjs from "dayjs";
import {
  evaluateExpression,
  hasOperator,
  pressKey,
} from "../utils/amountExpression";
import { filterNameSuggestions } from "../utils/expenseSuggestions";

// Mobile-only "add one expense" sheet: custom keypad, category grid and
// frequent-expense chips so a typical entry never opens the system keyboard.
// Owns its own state; the parent remounts it (via `key`) on every open.

const SUGGESTION_LIMIT = 8;
const NAME_MATCH_LIMIT = 6;
const FLASH_MS = 600;
const DAY_CHIPS = ["今天", "昨天", "前天"];
const KEYPAD_ROWS = [
  [{ key: "7" }, { key: "8" }, { key: "9" }, { key: "backspace", label: "⌫", aria: "刪除" }],
  [{ key: "4" }, { key: "5" }, { key: "6" }, { key: "+", label: "+", aria: "加" }],
  [{ key: "1" }, { key: "2" }, { key: "3" }, { key: "-", label: "−", aria: "減" }],
  [{ key: "clear", label: "C", aria: "清除" }, { key: "0" }, { key: "00" }],
];

// Keeps the name input focused when a chip under it is pressed, so the chip
// list doesn't unmount (on blur) before the click lands.
const keepFocus = (event) => event.preventDefault();

function QuickExpenseSheet({
  open,
  onClose,
  suggestions = [],
  quickCategories = [],
  allCategories = [],
  defaults = {},
  onSubmit,
  onOpenFullForm,
  loading = false,
  disabled = false,
}) {
  const defaultExtras = {
    payer: defaults.payer ?? null,
    expenseKind: defaults.expenseKind ?? null,
    budgetId: null,
  };
  const [today] = useState(() => dayjs().startOf("day"));
  const [expr, setExpr] = useState("");
  const [categoryId, setCategoryId] = useState(null);
  const [name, setName] = useState("");
  const [suggestionName, setSuggestionName] = useState(null);
  const [extras, setExtras] = useState(defaultExtras);
  const [occurredAt, setOccurredAt] = useState(today);
  const [isNameFocused, setIsNameFocused] = useState(false);
  const [isPickingCategory, setIsPickingCategory] = useState(false);
  const [flashTarget, setFlashTarget] = useState(null);
  const submittingRef = useRef(false);
  const flashTimerRef = useRef(null);
  const nameInputRef = useRef(null);

  const categoryNames = useMemo(
    () => new Map(allCategories.map((item) => [item.id, item.name])),
    [allCategories],
  );
  const categoryName = categoryId ? (categoryNames.get(categoryId) ?? "") : "";
  const amount = evaluateExpression(expr);
  const trimmedName = name.trim();
  const isBusy = loading || disabled;
  const canSave = amount > 0 && Boolean(categoryId || trimmedName) && !isBusy;
  const nameMatches =
    isNameFocused && trimmedName
      ? filterNameSuggestions(suggestions, trimmedName, {
          limit: NAME_MATCH_LIMIT,
        }).filter((item) => item.name !== trimmedName)
      : [];
  const dayChips = DAY_CHIPS.map((label, daysAgo) => ({
    label,
    day: today.subtract(daysAgo, "day"),
  }));
  const isCustomDate = !dayChips.some(({ day }) => occurredAt.isSame(day, "day"));

  const applySuggestion = (item) => {
    setName(item.name);
    setSuggestionName(item.name);
    if (item.categoryId) setCategoryId(item.categoryId);
    setExtras({
      payer: item.payer ?? null,
      expenseKind: item.expenseKind ?? null,
      budgetId: item.budgetId ?? null,
    });
    setExpr("");
  };

  const selectCategory = (id) => {
    if (suggestionName !== null && id !== categoryId) {
      setName("");
      setSuggestionName(null);
      setExtras(defaultExtras);
    }
    setCategoryId(id);
    setIsPickingCategory(false);
  };

  const flash = (target) => {
    window.clearTimeout(flashTimerRef.current);
    setFlashTarget(target);
    flashTimerRef.current = window.setTimeout(() => setFlashTarget(null), FLASH_MS);
  };

  const handleSave = async () => {
    if (isBusy || submittingRef.current) return;
    if (!(amount > 0)) {
      flash("amount");
      return;
    }
    if (!categoryId && !trimmedName) {
      flash("category");
      return;
    }
    submittingRef.current = true;
    try {
      await onSubmit({
        name: trimmedName || categoryName,
        amountTwd: amount,
        occurredAt: occurredAt.format("YYYY-MM-DD"),
        entryType: "ONE_TIME",
        categoryId: categoryId ?? null,
        ...extras,
      });
    } catch {
      // The parent reports the error and keeps the sheet open.
    } finally {
      submittingRef.current = false;
    }
  };

  const handleOpenFullForm = () => {
    onOpenFullForm?.({
      name: trimmedName,
      amountTwd: amount > 0 ? amount : undefined,
      occurredAt: occurredAt.format("YYYY-MM-DD"),
      categoryId: categoryId ?? undefined,
      payer: extras.payer ?? undefined,
      expenseKind: extras.expenseKind ?? undefined,
      budgetId: extras.budgetId ?? undefined,
    });
  };

  const chipClass = (active) =>
    `quick-expense-chip${active ? " is-active" : ""}`;

  const renderPicker = () => (
    <div className="quick-expense-picker">
      <button
        type="button"
        className="quick-expense-link"
        onClick={() => setIsPickingCategory(false)}
      >
        ← 返回
      </button>
      <div className="quick-expense-picker-list">
        {allCategories.map((item) => (
          <button
            key={item.id}
            type="button"
            className={chipClass(item.id === categoryId)}
            aria-pressed={item.id === categoryId}
            onClick={() => selectCategory(item.id)}
          >
            {item.name}
          </button>
        ))}
      </div>
    </div>
  );

  const renderSelectors = () => (
    <>
      {suggestions.length > 0 && (
        <div className="quick-expense-row" role="group" aria-label="常用">
          <span className="quick-expense-row-label">常用</span>
          <div className="quick-expense-scroll">
            {suggestions.slice(0, SUGGESTION_LIMIT).map((item) => {
              const meta = categoryNames.get(item.categoryId);
              return (
                <button
                  key={item.name}
                  type="button"
                  className={chipClass(suggestionName === item.name)}
                  aria-label={`常用 ${item.name}`}
                  aria-pressed={suggestionName === item.name}
                  onClick={() => applySuggestion(item)}
                >
                  {item.name}
                  {meta && <span className="quick-expense-chip-meta">·{meta}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div
        className={`quick-expense-categories${
          flashTarget === "category" ? " is-flashing" : ""
        }`}
        role="group"
        aria-label="分類"
      >
        {quickCategories.map((item) => (
          <button
            key={item.id}
            type="button"
            className={chipClass(item.id === categoryId)}
            aria-pressed={item.id === categoryId}
            onClick={() => selectCategory(item.id)}
          >
            {item.name}
          </button>
        ))}
        <button
          type="button"
          className="quick-expense-chip"
          onClick={() => setIsPickingCategory(true)}
        >
          更多
        </button>
      </div>
      <div className="quick-expense-dates" role="group" aria-label="日期">
        {dayChips.map(({ label, day }) => (
          <button
            key={label}
            type="button"
            className={chipClass(occurredAt.isSame(day, "day"))}
            aria-pressed={occurredAt.isSame(day, "day")}
            onClick={() => setOccurredAt(day)}
          >
            {label}
          </button>
        ))}
        <label className={`${chipClass(isCustomDate)} quick-expense-date-chip`}>
          📅 {isCustomDate ? occurredAt.format("M/D") : "其他"}
          <input
            type="date"
            aria-label="其他日期"
            className="quick-expense-date-input"
            max={today.format("YYYY-MM-DD")}
            value={occurredAt.format("YYYY-MM-DD")}
            onChange={(event) => {
              if (event.target.value) setOccurredAt(dayjs(event.target.value));
            }}
          />
        </label>
      </div>
    </>
  );

  const renderKeypad = () => (
    <div className="quick-expense-keypad">
      {KEYPAD_ROWS.flat().map(({ key, label, aria }) => (
        <button
          key={key}
          type="button"
          className="quick-expense-key"
          aria-label={aria ?? key}
          disabled={isBusy}
          onClick={() => setExpr((prev) => pressKey(prev, key))}
        >
          {label ?? key}
        </button>
      ))}
      <button
        type="button"
        className="quick-expense-key quick-expense-key--save"
        aria-label="存"
        aria-disabled={!canSave}
        onClick={handleSave}
      >
        {loading ? "…" : "存"}
      </button>
    </div>
  );

  return (
    <Drawer
      placement="bottom"
      title="新增支出"
      open={open}
      onClose={() => {
        if (!loading) onClose?.();
      }}
      extra={
        <button
          type="button"
          className="quick-expense-link"
          onClick={handleOpenFullForm}
        >
          完整表單
        </button>
      }
      size="90vh"
      closable={!loading}
      maskClosable={!loading}
      destroyOnHidden
      className="form-bottom-sheet quick-expense-sheet"
      styles={{ body: { padding: 0 } }}
    >
      {isPickingCategory ? (
        renderPicker()
      ) : (
        <div className="quick-expense">
          <div className="quick-expense-main">
            <div
              className={`quick-expense-amount${
                flashTarget === "amount" ? " is-flashing" : ""
              }`}
            >
              <span className="quick-expense-category-label">
                {categoryName || "未選分類"}
              </span>
              <output aria-label="金額" className="quick-expense-amount-value">
                ${(amount ?? 0).toLocaleString("zh-TW")}
              </output>
              {hasOperator(expr) && (
                <span aria-label="算式" className="quick-expense-expr">
                  {expr}
                </span>
              )}
            </div>
            <input
              ref={nameInputRef}
              className="quick-expense-name"
              aria-label="名稱"
              placeholder={categoryName ? `名稱（預設：${categoryName}）` : "名稱"}
              value={name}
              autoComplete="off"
              enterKeyHint="done"
              onChange={(event) => {
                setName(event.target.value);
                setSuggestionName(null);
              }}
              onFocus={() => setIsNameFocused(true)}
              onBlur={() => setIsNameFocused(false)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
              }}
            />
            {isNameFocused ? (
              nameMatches.length > 0 && (
                <div className="quick-expense-scroll">
                  {nameMatches.map((item) => (
                    <button
                      key={item.name}
                      type="button"
                      className="quick-expense-chip"
                      onPointerDown={keepFocus}
                      onMouseDown={keepFocus}
                      onClick={() => {
                        applySuggestion(item);
                        nameInputRef.current?.blur();
                      }}
                    >
                      {item.name}
                    </button>
                  ))}
                </div>
              )
            ) : (
              renderSelectors()
            )}
          </div>
          {!isNameFocused && renderKeypad()}
        </div>
      )}
    </Drawer>
  );
}

export default QuickExpenseSheet;
```

說明：
- 算式顯示直接用 `expr`（`-` 是 ASCII），測試比對 `120+85`。按鍵標籤才用 `−`。
- `selectCategory` 只要「名稱來自常用」(`suggestionName !== null`) 且改到不同分類，就清空名稱、取消常用選中，並把支出人 / 家庭個人 / 預算還原成 `defaults`，避免「早餐」的預算被帶到「交通」。手動改過名稱時，`onChange` 已經把 `suggestionName` 設回 `null`，所以手打的名稱會保留。

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/QuickExpenseSheet.test.jsx`
Expected: PASS（全部）。如果 `name autocomplete chip ...` 失敗，原因多半是 blur 先觸發、chip 被卸載：確認 `onPointerDown` / `onMouseDown` 有 `preventDefault`，不要改測試。

- [ ] **Step 5: Add styles**

`src/App.css` 檔尾新增：

```css
/* Quick expense sheet (mobile) */
.quick-expense-sheet .ant-drawer-body {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.quick-expense {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
}

.quick-expense-main {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.quick-expense-amount {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  padding: 8px 4px;
  border-radius: var(--radius-md);
  transition: background-color 0.2s;
}

.quick-expense-category-label {
  align-self: flex-start;
  color: var(--c-muted);
  font-size: var(--fs-body);
}

.quick-expense-amount-value {
  font-size: var(--fs-hero);
  font-weight: 600;
  color: var(--c-ink);
  font-variant-numeric: tabular-nums;
}

.quick-expense-expr {
  color: var(--c-subtle);
  font-size: var(--fs-caption);
  font-variant-numeric: tabular-nums;
}

.quick-expense-name {
  width: 100%;
  min-height: 44px;
  padding: 0 12px;
  border: 1px solid var(--c-line-strong);
  border-radius: var(--radius-md);
  font-size: var(--fs-subhead); /* >= 16px keeps iOS from zooming on focus */
  color: var(--c-ink);
  background: var(--c-surface);
}

.quick-expense-name:focus {
  outline: none;
  border-color: var(--c-teal);
}

.quick-expense-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.quick-expense-row-label {
  flex: 0 0 auto;
  color: var(--c-muted);
  font-size: var(--fs-caption);
}

.quick-expense-scroll {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  min-width: 0;
  scrollbar-width: none;
}

.quick-expense-scroll::-webkit-scrollbar {
  display: none;
}

.quick-expense-categories,
.quick-expense-dates,
.quick-expense-picker-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  border-radius: var(--radius-md);
  transition: background-color 0.2s;
}

.quick-expense-chip {
  flex: 0 0 auto;
  min-height: 36px;
  padding: 0 14px;
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--c-line-strong);
  border-radius: var(--radius-pill);
  background: var(--c-surface);
  color: var(--c-ink);
  font-size: var(--fs-body);
  white-space: nowrap;
  cursor: pointer;
}

.quick-expense-chip.is-active {
  border-color: var(--c-teal);
  background: var(--c-teal);
  color: #fff;
}

.quick-expense-chip-meta {
  margin-left: 2px;
  opacity: 0.7;
  font-size: var(--fs-caption);
}

.quick-expense-date-chip {
  position: relative;
}

.quick-expense-date-input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
}

.quick-expense .is-flashing {
  background: var(--c-teal-soft);
}

.quick-expense-keypad {
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1px;
  background: var(--c-line);
  border-top: 1px solid var(--c-line);
  padding-bottom: env(safe-area-inset-bottom);
}

.quick-expense-key {
  min-height: 56px;
  border: none;
  background: var(--c-surface);
  color: var(--c-ink);
  font-size: var(--fs-title);
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  touch-action: manipulation;
}

.quick-expense-key:active {
  background: var(--c-neutral-fill);
}

.quick-expense-key--save {
  background: var(--c-teal);
  color: #fff;
  font-weight: 600;
}

.quick-expense-key--save:active {
  background: var(--c-teal-ink);
}

.quick-expense-key--save[aria-disabled="true"] {
  background: var(--c-line-strong);
}

.quick-expense-link {
  border: none;
  background: none;
  padding: 4px 0;
  color: var(--c-teal);
  font-size: var(--fs-body);
  cursor: pointer;
}

.quick-expense-picker {
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
}
```

- [ ] **Step 6: Run full test suite + lint**

Run: `npm test && npx eslint src/components/QuickExpenseSheet.jsx src/components/QuickExpenseSheet.test.jsx`
Expected: 全部 PASS、lint 無錯誤。

- [ ] **Step 7: Commit**

```bash
git add src/components/QuickExpenseSheet.jsx src/components/QuickExpenseSheet.test.jsx src/App.css
git commit -m "feat(expense): add mobile QuickExpenseSheet with keypad and frequent chips"
```

---

### Task 4: `App.jsx` 接線

**Files:**
- Modify: `src/App.jsx`
  - import 區（約 `:98-101`、`:188-191`）
  - state 宣告（約 `:398-401`、`:547`）
  - `handleSubmitExpense`（約 `:1207-1263`）
  - `quickExpenseCategories` 之後（約 `:1382`）
  - `openExpenseForm` 之後（約 `:1615`）
  - 現有表單 open effect（約 `:3335-3395`）
  - FAB `onClick`（約 `:6595`）
  - `MobileFormSheetLayout`（新增支出那一個）之前（約 `:6870`）

**Interfaces:**
- Consumes: Task 2 `sanitizeSuggestions`；Task 3 `QuickExpenseSheet` 與其 `onSubmit` payload / `onOpenFullForm` draft 形狀；既有 `upsertExpenseEntry`、`writeLastExpenseDefaults`、`readLastExpenseDefaults`、`loadExpenseData`、`performCloudSync`、`formatTwd`、`toUserMessage`、`message`。
- Produces: `saveExpenseEntry(payload): Promise<void>`（App 內部，給完整表單與快速畫面共用）。

> 行號是寫計畫時的位置，請以搜尋字串定位。

- [ ] **Step 1: Imports**

在 `import TrendChart from "./components/TrendChart";` 下一行加入：

```js
import QuickExpenseSheet from "./components/QuickExpenseSheet";
```

在既有的 `import { filterNameSuggestions, ... } from "./utils/expenseSuggestions";` 的大括號中加入 `sanitizeSuggestions`。

- [ ] **Step 2: State 與 ref**

在 `const [isExpenseSheetOpen, setIsExpenseSheetOpen] = useState(false);` 下方加入：

```js
  const [isQuickExpenseOpen, setIsQuickExpenseOpen] = useState(false);
  // Bumped on every open so QuickExpenseSheet remounts with fresh state.
  const [quickExpenseKey, setQuickExpenseKey] = useState(0);
  const [quickExpenseDefaults, setQuickExpenseDefaults] = useState({});
```

在 `const expenseShouldAnimateRef = useRef(false);` 下方加入：

```js
  // Quick-sheet values handed to the full expense form ("完整表單"); applied
  // by the form's open effect after its own defaults.
  const pendingExpenseDraftRef = useRef(null);
```

- [ ] **Step 3: 抽出 `saveExpenseEntry`**

在 `const handleSubmitExpense = useCallback(async () => {` 正上方新增：

```js
  // Shared by the full form and the mobile quick sheet: write, remember the
  // payer / kind / category for the next new entry, then refresh + resync in
  // the background (the write itself already reached the cloud).
  const saveExpenseEntry = useCallback(
    async (payload) => {
      expenseShouldAnimateRef.current = true;
      await upsertExpenseEntry(payload);
      if (!payload.id) {
        writeLastExpenseDefaults({
          payer: payload.payer || null,
          expenseKind: payload.expenseKind || null,
          categoryId: payload.categoryId || null,
        });
      }
      loadExpenseData()
        .then(() => performCloudSync())
        .catch((error) => {
          console.warn("[expense] post-save refresh failed", error);
        });
    },
    [loadExpenseData, performCloudSync],
  );
```

把 `handleSubmitExpense` 改成：

```js
  const handleSubmitExpense = useCallback(async () => {
    try {
      const values = await expenseForm.validateFields();
      setLoadingExpenseAction(true);
      const isRecurringCreateMode =
        expenseFormMode === "recurring-create" && !editingExpenseEntry;
      await saveExpenseEntry({
        id: editingExpenseEntry?.id,
        name: values.name,
        payer: values.payer || null,
        expenseKind: values.expenseKind || null,
        amountTwd: values.amountTwd,
        occurredAt:
          values.occurredAt?.format?.("YYYY-MM-DD") || values.occurredAt,
        entryType: isRecurringCreateMode ? "RECURRING" : values.entryType,
        recurrenceType: values.recurrenceType || null,
        monthlyDay: values.monthlyDay || null,
        yearlyMonth: values.yearlyMonth || null,
        yearlyDay: values.yearlyDay || null,
        categoryId: values.categoryId || null,
        budgetId: values.budgetId || null,
      });
      setIsExpenseModalOpen(false);
      setIsExpenseSheetOpen(false);
      setEditingExpenseEntry(null);
      setExpenseFormMode("normal");
      expenseForm.resetFields();
      message.success("支出已儲存");
    } catch (error) {
      if (error?.errorFields) return;
      message.error(toUserMessage(error, "儲存支出失敗"));
    } finally {
      setLoadingExpenseAction(false);
    }
  }, [
    editingExpenseEntry,
    expenseForm,
    expenseFormMode,
    message,
    saveExpenseEntry,
  ]);
```

（行為不變：原本的 `expenseShouldAnimateRef`、`writeLastExpenseDefaults`、背景 refresh 都搬進 `saveExpenseEntry`。）

- [ ] **Step 4: 快速畫面的資料與 submit handler**

在 `const quickExpenseCategories = useMemo(...)` 那段之後新增：

```js
  const quickExpenseSuggestions = useMemo(
    () =>
      sanitizeSuggestions(expenseNameSuggestions, {
        categoryIds: new Set(expenseCategoryRows.map((item) => item.id)),
        payers: new Set(expensePayerOptions.map((item) => item.value)),
        budgetIds: new Set(selectableBudgetOptions.map((item) => item.id)),
      }),
    [
      expenseCategoryRows,
      expenseNameSuggestions,
      expensePayerOptions,
      selectableBudgetOptions,
    ],
  );

  const handleSubmitQuickExpense = useCallback(
    async (payload) => {
      try {
        setLoadingExpenseAction(true);
        await saveExpenseEntry(payload);
        setIsQuickExpenseOpen(false);
        message.success(
          `已記錄 ${payload.name} ${formatTwd(payload.amountTwd)}`,
        );
      } catch (error) {
        message.error(toUserMessage(error, "儲存支出失敗"));
      } finally {
        setLoadingExpenseAction(false);
      }
    },
    [message, saveExpenseEntry],
  );
```

- [ ] **Step 5: 開啟快速畫面 / 交接完整表單**

在 `const openExpenseForm = useCallback(...)` 那段之後新增：

```js
  const openQuickExpense = useCallback(() => {
    const lastUsed = readLastExpenseDefaults();
    setQuickExpenseDefaults({
      payer: expensePayerOptions.some((item) => item.value === lastUsed.payer)
        ? lastUsed.payer
        : null,
      expenseKind: lastUsed.expenseKind ?? null,
    });
    setQuickExpenseKey((key) => key + 1);
    setIsQuickExpenseOpen(true);
  }, [expensePayerOptions]);

  const handleQuickExpenseFullForm = useCallback(
    (draft) => {
      pendingExpenseDraftRef.current = draft;
      setIsQuickExpenseOpen(false);
      openExpenseForm();
    },
    [openExpenseForm],
  );
```

- [ ] **Step 6: 讓現有表單的 open effect 套用草稿**

在 `useEffect(() => { if (!isExpenseModalOpen && !isExpenseSheetOpen) { return; } ...` 內，把從 `const payer =` 到 `expenseForm.setFieldsValue({ ... });` 結束的這段改成（`lastUsed` / `categoryRows` 的處理保持不變）：

```js
    const draft = editingExpenseEntry ? null : pendingExpenseDraftRef.current;
    pendingExpenseDraftRef.current = null;
    const payer =
      editingExpenseEntry?.payer === "共同"
        ? "共同帳戶"
        : (editingExpenseEntry?.payer ?? lastUsed.payer ?? undefined);
    const expenseKind =
      editingExpenseEntry?.expenseKind ?? lastUsed.expenseKind ?? undefined;
    const values = {
      name: editingExpenseEntry?.name ?? "",
      payer,
      expenseKind,
      amountTwd: editingExpenseEntry?.amountTwd ?? undefined,
      occurredAt: dayjs(
        editingExpenseEntry?.originalOccurredAt ||
          editingExpenseEntry?.occurredAt ||
          dayjs(),
      ),
      entryType: isRecurringCreateMode
        ? "RECURRING"
        : editingExpenseEntry?.entryType || "ONE_TIME",
      recurrenceType: editingExpenseEntry?.recurrenceType || undefined,
      monthlyDay: editingExpenseEntry?.monthlyDay ?? undefined,
      yearlyMonth: editingExpenseEntry?.yearlyMonth ?? undefined,
      yearlyDay: editingExpenseEntry?.yearlyDay ?? undefined,
      categoryId:
        editingExpenseEntry?.categoryId ?? lastUsed.categoryId ?? undefined,
      budgetId: editingExpenseEntry?.budgetId ?? undefined,
    };
    if (draft) {
      // Coming from the quick sheet: its values win over the remembered
      // defaults; fields it left empty keep them.
      Object.entries(draft).forEach(([field, value]) => {
        if (value === undefined || value === "") return;
        values[field] = field === "occurredAt" ? dayjs(value) : value;
      });
    }
    setShowExpenseMoreFields(
      Boolean(values.budgetId || values.payer || values.expenseKind),
    );
    expenseForm.setFieldsValue(values);
```

注意：原本的 `setShowExpenseMoreFields(Boolean(editingExpenseEntry?.budgetId || payer || expenseKind))` 用 `values` 改寫後結果相同（沒有草稿時 `values.budgetId` 等於 `editingExpenseEntry?.budgetId`）。effect 的 deps 不用改（ref 不需要列入）。

- [ ] **Step 7: FAB 改開快速畫面 + 渲染元件**

FAB `onClick` 改成：

```js
              onClick={() => {
                if (activeMainTab === "asset") {
                  openAddHoldingForm();
                  return;
                }
                if (isMobileViewport) {
                  openQuickExpense();
                  return;
                }
                openExpenseForm();
              }}
```

在標題為 `expenseFormMode === "recurring-create" ? "新增定期支出" : ...` 的那個 `<MobileFormSheetLayout` 正上方加入：

```jsx
          <QuickExpenseSheet
            key={quickExpenseKey}
            open={isMobileViewport && isQuickExpenseOpen}
            onClose={() => setIsQuickExpenseOpen(false)}
            suggestions={quickExpenseSuggestions}
            quickCategories={quickExpenseCategories}
            allCategories={expenseCategoryRows}
            defaults={quickExpenseDefaults}
            onSubmit={handleSubmitQuickExpense}
            onOpenFullForm={handleQuickExpenseFullForm}
            loading={loadingExpenseAction}
            disabled={isWriteDisabled}
          />
```

- [ ] **Step 8: Tests, lint, build**

Run: `npm test && npm run lint && npm run build`
Expected: 測試全 PASS、lint 無錯誤、build 成功（留意 bundle 沒有明顯變大，PWA precache 上限是 3 MB）。

- [ ] **Step 9: 瀏覽器手機尺寸實測**

`npm run dev`，用 Chrome DevTools 切成 iPhone 尺寸（390×844），登入後到支出 tab：

1. 按 FAB → 開的是快速畫面（不是舊表單）；桌面寬度按 FAB 仍是舊 Modal。
2. 點「餐飲」→ 按 `1 2 0 + 8 5` → 顯示 `$205` 與 `120+85` → 按「存」→ 畫面關閉、toast「已記錄 餐飲 $205」（`formatTwd` 實際格式為準）、列表出現該筆。
3. 點常用 chip → 名稱、分類帶入，金額是 0；改點別的分類 → 名稱清空。
4. 點名稱 → 自訂鍵盤消失；打一個字 → 出現 autocomplete chip → 點了會帶入，鍵盤回來（**Review Focus 4**）。
5. 填一些值後點「完整表單」→ 舊表單打開，金額、名稱、分類、日期都在，而且**沒有**被上次的預設分類蓋掉（**Review Focus 5**）。
6. 編輯一筆既有支出、從定期支出入口新增 → 都還是舊表單。
7. 確認底部鍵盤沒被 safe-area 或 `90vh` 裁切，存鍵完整可見。

有任何一項不符，先修再 commit。

- [ ] **Step 10: Commit**

```bash
git add src/App.jsx
git commit -m "feat(expense): open QuickExpenseSheet from the mobile FAB"
```
