# 資產水位瓶 + 支出減法磚塔 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 SVG 動畫「水位瓶」取代資產頁淨值進度條，用「減法磚塔」（收入 = 金色磚塔，支出從塔頂扣磚，剩下 = 存下）取代支出頁的花費 / 收入進度條。

**Architecture:** 兩個純函式 util（`netWorthJar.js`、`savingsTower.js`）負責所有數學並以 Vitest TDD；兩個 React 元件（`NetWorthJar.jsx`、`SavingsTower.jsx`）只負責畫 SVG 與動畫（波紋用 rAF，碎片 / 淡入用 CSS keyframes）。`App.jsx` 只決定「何時重播」（遞增 `playKey`），並刪除舊進度條的 state / animejs 動畫 / CSS。

**Tech Stack:** React 19、Vitest + @testing-library/react（jsdom）、純 SVG、CSS keyframes、`requestAnimationFrame`。不新增套件。

**Spec:** `docs/superpowers/specs/2026-10-06-savings-visualization-design.md`

## Global Constraints

- 所有 `npm` / `npx` 指令在 `my-stock/` 下執行。
- 不新增任何 npm 套件；不修改 `portfolioService` / schema / Firestore mapper。
- 瓶子容量單位 = 1,000 萬（`10_000_000`），刻度每 200 萬（`2_000_000`）。
- 磚塔固定 10 層；扣磚順序：塔頂往下，先定期（`var(--c-teal)`）再單筆（`#86c4b9`）。
- 存下的錢 = 金色漸層 `#f2cf6b` → `#d9a93a`。
- 上漲綠 `var(--c-up)`、下跌紅 `var(--c-down)`；超支誠實呈現（紅色虛線坑）。
- `prefers-reduced-motion: reduce` → 不播任何動畫（含波紋），直接最終狀態。
- UI 文字一律繁體中文；新 CSS 全部寫在 `src/App.css`（專案慣例：元件不 import 自己的 CSS）。
- 每個 task 結束都要 `npm test` 全綠再 commit；commit message 結尾加：
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`

## Review Focus

1. **資料在元件 mount 之後才到**（支出頁先渲染預設的 `hasIncome: false`，之後才載入收入）→ 應播完整進場（疊塔 → 扣磚），而不是所有碎片同時炸開。→ Task 4 測試 `replays the entrance when income arrives after mount`；切換月份後新資料在疊塔途中才到 → 扣的是新資料 → `chips away the data that arrives during the build phase`。
2. **沒有昨日基準（`baselineTotalTwd` 為 0）而總資產已 ≥ 1,000 萬** → 不可每次開啟都誤判為「剛突破千萬」而放煙火，也不畫漲跌帶。→ Task 1 測試 `treats a missing baseline as no baseline`。
3. **在千萬整數附近下跌**（昨日 1,005 萬、今日 995 萬）→ 瓶子回到 0–1,000 萬，昨日線貼在瓶口（clamp 到 1），漲跌帶為紅色。→ Task 1 測試 `clamps a baseline above the cap when crossing down`。
4. **存下比例很高（≥ 85%）** → 「存下 x.x 萬」標籤不可和塔頂的「收入 x.x 萬」重疊，改畫在金色磚區內。→ Task 4 測試 `puts the saved label inside the tower when nearly everything is saved`。
5. **非數字 / 負數 / 字串輸入**（`incomeTwd: "85000"`、`oneTimeTwd: -5`、`NaN`）→ 視為合法數字或 0，不可產生 NaN 座標或無窮迴圈。→ Task 2 測試 `sanitises non-numeric and negative inputs`。

---

## File Structure

| 檔案 | 動作 | 職責 |
|---|---|---|
| `src/utils/netWorthJar.js` | Create | `getJarGeometry` 純函式 |
| `src/utils/netWorthJar.test.js` | Create | 上述測試 |
| `src/utils/savingsTower.js` | Create | `getTowerLayout`、`getRowRemovedFractions`、`diffTowerChunks`、`chunkKey`、`formatTowerWan` |
| `src/utils/savingsTower.test.js` | Create | 上述測試 |
| `src/utils/motion.js` | Create | `prefersReducedMotion()` |
| `src/utils/motion.test.js` | Create | 上述測試 |
| `src/components/NetWorthJar.jsx` | Create | SVG 水位瓶 |
| `src/components/NetWorthJar.test.jsx` | Create | smoke test |
| `src/components/SavingsTower.jsx` | Create | SVG 磚塔 |
| `src/components/SavingsTower.test.jsx` | Create | smoke test |
| `src/App.jsx` | Modify | 接上元件、刪除舊進度條程式碼 |
| `src/App.css` | Modify | 新增元件與左右排版 CSS、刪除舊進度條 CSS |
| `src/utils/portfolioView.js` / `.test.js` | Modify | 刪除 `getProgressDisplayTargets`、`buildProgressStops` |

---

### Task 1: `getJarGeometry` 純函式

**Files:**
- Create: `src/utils/netWorthJar.js`
- Test: `src/utils/netWorthJar.test.js`

**Interfaces:**
- Consumes: `floorToTenThousand(value) → number`（`src/utils/portfolioView.js`，已存在；負數 / 非數字回傳 0）。
- Produces:
  ```js
  export const JAR_UNIT_TWD = 10_000_000
  export const JAR_TICK_TWD = 2_000_000
  export const getJarGeometry = ({ totalTwd, baselineTwd }) => ({
    floorTwd: number, capTwd: number, totalTwd: number, baselineTwd: number,
    levelRatio: number,            // 0..1
    baselineRatio: number | null,  // null = 不畫昨日線
    hasBaseline: boolean,
    crossedMilestone: boolean,
    direction: 'up' | 'down' | 'flat',
    ticks: Array<{ twd: number, ratio: number }>,
    gapToCapTwd: number,
    isEmpty: boolean,
  })
  ```

- [ ] **Step 1: Write the failing test**

`src/utils/netWorthJar.test.js`：

```js
import { describe, expect, it } from 'vitest'
import { getJarGeometry, JAR_UNIT_TWD } from './netWorthJar'

describe('getJarGeometry', () => {
  it('fills the first 千萬 jar on an up day', () => {
    const g = getJarGeometry({ totalTwd: 6_384_200, baselineTwd: 6_301_000 })
    expect(g.floorTwd).toBe(0)
    expect(g.capTwd).toBe(JAR_UNIT_TWD)
    expect(g.totalTwd).toBe(6_380_000)
    expect(g.levelRatio).toBeCloseTo(0.638)
    expect(g.baselineRatio).toBeCloseTo(0.63)
    expect(g.hasBaseline).toBe(true)
    expect(g.direction).toBe('up')
    expect(g.crossedMilestone).toBe(false)
    expect(g.gapToCapTwd).toBe(3_620_000)
    expect(g.isEmpty).toBe(false)
  })

  it('places ticks every 200萬 strictly inside the jar', () => {
    const g = getJarGeometry({ totalTwd: 6_384_200, baselineTwd: 6_301_000 })
    expect(g.ticks.map((t) => t.twd)).toEqual([2_000_000, 4_000_000, 6_000_000, 8_000_000])
    expect(g.ticks.map((t) => t.ratio)).toEqual([0.2, 0.4, 0.6, 0.8])
  })

  it('reports a down day', () => {
    const g = getJarGeometry({ totalTwd: 6_218_500, baselineTwd: 6_301_000 })
    expect(g.direction).toBe('down')
    expect(g.levelRatio).toBeCloseTo(0.621)
    expect(g.baselineRatio).toBeCloseTo(0.63)
  })

  it('reports a flat day', () => {
    const g = getJarGeometry({ totalTwd: 6_300_000, baselineTwd: 6_300_000 })
    expect(g.direction).toBe('flat')
  })

  it('starts a new jar and flags the milestone when crossing a 千萬 upward', () => {
    const g = getJarGeometry({ totalTwd: 10_046_000, baselineTwd: 9_982_000 })
    expect(g.floorTwd).toBe(10_000_000)
    expect(g.capTwd).toBe(20_000_000)
    expect(g.levelRatio).toBeCloseTo(0.004)
    expect(g.baselineRatio).toBeNull()
    expect(g.crossedMilestone).toBe(true)
    expect(g.direction).toBe('up')
    expect(g.ticks[0].twd).toBe(12_000_000)
  })

  it('puts an exact 千萬 total at the bottom of the next jar', () => {
    const g = getJarGeometry({ totalTwd: 10_000_000, baselineTwd: 10_000_000 })
    expect(g.floorTwd).toBe(10_000_000)
    expect(g.levelRatio).toBe(0)
    expect(g.crossedMilestone).toBe(false)
    expect(g.baselineRatio).toBe(0)
  })

  it('clamps a baseline above the cap when crossing down', () => {
    const g = getJarGeometry({ totalTwd: 9_950_000, baselineTwd: 10_050_000 })
    expect(g.floorTwd).toBe(0)
    expect(g.baselineRatio).toBe(1)
    expect(g.direction).toBe('down')
    expect(g.crossedMilestone).toBe(false)
  })

  it('treats a missing baseline as no baseline', () => {
    const g = getJarGeometry({ totalTwd: 12_000_000, baselineTwd: 0 })
    expect(g.hasBaseline).toBe(false)
    expect(g.baselineRatio).toBeNull()
    expect(g.crossedMilestone).toBe(false)
    expect(g.direction).toBe('flat')
  })

  it('marks an empty jar for zero or invalid totals', () => {
    expect(getJarGeometry({ totalTwd: 0, baselineTwd: 0 }).isEmpty).toBe(true)
    const g = getJarGeometry({ totalTwd: 'abc', baselineTwd: undefined })
    expect(g.isEmpty).toBe(true)
    expect(g.capTwd).toBe(JAR_UNIT_TWD)
    expect(g.levelRatio).toBe(0)
  })

  it('accepts numeric strings', () => {
    expect(getJarGeometry({ totalTwd: '6384200', baselineTwd: '6301000' }).levelRatio).toBeCloseTo(0.638)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/netWorthJar.test.js`
Expected: FAIL — `Failed to resolve import "./netWorthJar"`。

- [ ] **Step 3: Write minimal implementation**

`src/utils/netWorthJar.js`：

```js
// Pure geometry for the asset-tab net-worth jar (components/NetWorthJar.jsx).
// The jar holds one 千萬: its floor is the 千萬 the total is currently in and
// its cap is the next one. Values are floored to 萬 like the old progress bar.
import { floorToTenThousand } from "./portfolioView";

export const JAR_UNIT_TWD = 10_000_000;
export const JAR_TICK_TWD = 2_000_000;

const clamp01 = (value) => Math.min(1, Math.max(0, value));

export const getJarGeometry = ({ totalTwd, baselineTwd }) => {
  const total = floorToTenThousand(totalTwd);
  const baseline = floorToTenThousand(baselineTwd);
  const floorTwd = Math.floor(total / JAR_UNIT_TWD) * JAR_UNIT_TWD;
  const capTwd = floorTwd + JAR_UNIT_TWD;
  const toRatio = (value) => clamp01((value - floorTwd) / JAR_UNIT_TWD);

  // No snapshot from yesterday yet: don't draw a line or a delta band, and
  // never mistake "0 → today" for crossing a milestone.
  const hasBaseline = baseline > 0;
  const crossedMilestone = hasBaseline && baseline < floorTwd;

  const ticks = [];
  for (let twd = floorTwd + JAR_TICK_TWD; twd < capTwd; twd += JAR_TICK_TWD) {
    ticks.push({ twd, ratio: toRatio(twd) });
  }

  let direction = "flat";
  if (hasBaseline && total > baseline) direction = "up";
  if (hasBaseline && total < baseline) direction = "down";

  return {
    floorTwd,
    capTwd,
    totalTwd: total,
    baselineTwd: baseline,
    levelRatio: toRatio(total),
    baselineRatio: hasBaseline && !crossedMilestone ? toRatio(baseline) : null,
    hasBaseline,
    crossedMilestone,
    direction,
    ticks,
    gapToCapTwd: capTwd - total,
    isEmpty: total <= 0,
  };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/netWorthJar.test.js`
Expected: PASS（10 tests）。

- [ ] **Step 5: Commit**

```bash
git add src/utils/netWorthJar.js src/utils/netWorthJar.test.js
git commit -m "feat(asset): add net-worth jar geometry util

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 磚塔 layout 純函式

**Files:**
- Create: `src/utils/savingsTower.js`
- Test: `src/utils/savingsTower.test.js`

**Interfaces:**
- Consumes: 無。
- Produces:
  ```js
  export const TOWER_ROWS = 10
  export const OVERSPEND_DEPTH_CAP = 0.12
  // chunk = { rowIndex: number /* 0 = bottom row */, offset: number /* 0..1 already removed from the row's top */, take: number /* 0..1 */, kind: 'recurring' | 'oneTime' }
  export const getTowerLayout = ({ incomeTwd, recurringTwd, oneTimeTwd, rows = TOWER_ROWS }) => ({
    hasIncome: boolean, rows: number, chunks: chunk[],
    incomeTwd: number, spentTwd: number,
    savedTwd: number, savedRatio: number,          // savedRatio 0..1
    overspendTwd: number, overspendDepthRatio: number, // depth as fraction of tower height, ≤ OVERSPEND_DEPTH_CAP
  })
  export const getRowRemovedFractions = (chunks, rows) => number[] // index = rowIndex, value 0..1
  export const chunkKey = (chunk) => string
  export const diffTowerChunks = (prevLayout, nextLayout) => ({ added: chunk[], restored: chunk[] })
  export const formatTowerWan = (twd) => string // 31500 → "3.2 萬"
  ```

- [ ] **Step 1: Write the failing test**

`src/utils/savingsTower.test.js`：

```js
import { describe, expect, it } from 'vitest'
import {
  OVERSPEND_DEPTH_CAP,
  TOWER_ROWS,
  diffTowerChunks,
  formatTowerWan,
  getRowRemovedFractions,
  getTowerLayout,
} from './savingsTower'

const strip = (chunks) => chunks.map(({ rowIndex, offset, take, kind }) => [rowIndex, offset, take, kind])

describe('getTowerLayout', () => {
  it('removes recurring first, then one-time, from the top down', () => {
    const t = getTowerLayout({ incomeTwd: 100_000, recurringTwd: 25_000, oneTimeTwd: 13_000 })
    expect(t.hasIncome).toBe(true)
    expect(t.rows).toBe(TOWER_ROWS)
    expect(strip(t.chunks)).toEqual([
      [9, 0, 1, 'recurring'],
      [8, 0, 1, 'recurring'],
      [7, 0, 0.5, 'recurring'],
      [7, 0.5, 0.5, 'oneTime'],
      [6, 0, 0.8, 'oneTime'],
    ])
    expect(t.spentTwd).toBe(38_000)
    expect(t.savedTwd).toBe(62_000)
    expect(t.savedRatio).toBeCloseTo(0.62)
    expect(t.overspendTwd).toBe(0)
    expect(t.overspendDepthRatio).toBe(0)
  })

  it('keeps the whole tower when nothing is spent', () => {
    const t = getTowerLayout({ incomeTwd: 85_000, recurringTwd: 0, oneTimeTwd: 0 })
    expect(t.chunks).toEqual([])
    expect(t.savedTwd).toBe(85_000)
    expect(t.savedRatio).toBe(1)
  })

  it('empties the tower exactly when spending equals income', () => {
    const t = getTowerLayout({ incomeTwd: 100_000, recurringTwd: 40_000, oneTimeTwd: 60_000 })
    const removed = getRowRemovedFractions(t.chunks, t.rows)
    expect(removed.every((f) => f === 1)).toBe(true)
    expect(t.savedTwd).toBe(0)
    expect(t.overspendTwd).toBe(0)
  })

  it('reports overspend with a capped pit depth', () => {
    const big = getTowerLayout({ incomeTwd: 100_000, recurringTwd: 32_000, oneTimeTwd: 98_000 })
    expect(big.overspendTwd).toBe(30_000)
    expect(big.overspendDepthRatio).toBe(OVERSPEND_DEPTH_CAP)
    expect(getRowRemovedFractions(big.chunks, big.rows).every((f) => f === 1)).toBe(true)
    const small = getTowerLayout({ incomeTwd: 100_000, recurringTwd: 50_000, oneTimeTwd: 55_000 })
    expect(small.overspendTwd).toBe(5_000)
    expect(small.overspendDepthRatio).toBeCloseTo(0.05)
  })

  it('has no tower without income', () => {
    const t = getTowerLayout({ incomeTwd: 0, recurringTwd: 12_000, oneTimeTwd: 3_000 })
    expect(t.hasIncome).toBe(false)
    expect(t.chunks).toEqual([])
    expect(t.spentTwd).toBe(15_000)
    expect(t.savedTwd).toBe(0)
  })

  it('sanitises non-numeric and negative inputs', () => {
    const t = getTowerLayout({ incomeTwd: '85000', recurringTwd: Number.NaN, oneTimeTwd: -5 })
    expect(t.hasIncome).toBe(true)
    expect(t.incomeTwd).toBe(85_000)
    expect(t.spentTwd).toBe(0)
    expect(t.chunks).toEqual([])
    expect(getTowerLayout({ incomeTwd: undefined, recurringTwd: null, oneTimeTwd: 'x' }).hasIncome).toBe(false)
  })

  it('splits awkward fractions without float drift', () => {
    const t = getTowerLayout({ incomeTwd: 85_000, recurringTwd: 32_000, oneTimeTwd: 21_500 })
    const total = t.chunks.reduce((sum, c) => sum + c.take, 0)
    expect(total).toBeCloseTo((53_500 / 85_000) * 10, 5)
    t.chunks.forEach((c) => {
      expect(c.take).toBeGreaterThan(0)
      expect(c.offset + c.take).toBeLessThanOrEqual(1 + 1e-9)
    })
  })
})

describe('getRowRemovedFractions', () => {
  it('sums the chunk takes per row', () => {
    const t = getTowerLayout({ incomeTwd: 100_000, recurringTwd: 25_000, oneTimeTwd: 13_000 })
    expect(getRowRemovedFractions(t.chunks, t.rows)).toEqual([0, 0, 0, 0, 0, 0, 0.8, 1, 1, 1])
  })
})

describe('diffTowerChunks', () => {
  const before = getTowerLayout({ incomeTwd: 100_000, recurringTwd: 25_000, oneTimeTwd: 13_000 })
  const after = getTowerLayout({ incomeTwd: 100_000, recurringTwd: 25_000, oneTimeTwd: 20_000 })

  it('lists newly removed chunks when an expense is added', () => {
    const { added, restored } = diffTowerChunks(before, after)
    expect(strip(added)).toEqual([
      [6, 0, 1, 'oneTime'],
      [5, 0, 0.5, 'oneTime'],
    ])
    expect(strip(restored)).toEqual([[6, 0, 0.8, 'oneTime']])
  })

  it('lists restored chunks when an expense is removed', () => {
    const { added, restored } = diffTowerChunks(after, before)
    expect(strip(added)).toEqual([[6, 0, 0.8, 'oneTime']])
    expect(strip(restored)).toEqual([
      [6, 0, 1, 'oneTime'],
      [5, 0, 0.5, 'oneTime'],
    ])
  })

  it('is empty when nothing changed', () => {
    expect(diffTowerChunks(before, before)).toEqual({ added: [], restored: [] })
  })

  it('tolerates a missing previous layout', () => {
    expect(diffTowerChunks(null, before).added).toHaveLength(before.chunks.length)
  })
})

describe('formatTowerWan', () => {
  it('shows 萬 with one decimal', () => {
    expect(formatTowerWan(31_500)).toBe('3.2 萬')
    expect(formatTowerWan(85_000)).toBe('8.5 萬')
    expect(formatTowerWan(0)).toBe('0.0 萬')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/savingsTower.test.js`
Expected: FAIL — `Failed to resolve import "./savingsTower"`。

- [ ] **Step 3: Write minimal implementation**

`src/utils/savingsTower.js`：

```js
// Pure layout for the expense-tab savings tower (components/SavingsTower.jsx).
// Income is a tower of TOWER_ROWS rows; spending removes it from the top —
// recurring first, then one-time. Whatever is left is what was saved.

export const TOWER_ROWS = 10;
// The overspend pit below the ground line never grows past this fraction of
// the tower's height, however large the overspend.
export const OVERSPEND_DEPTH_CAP = 0.12;

const EPS = 1e-9;

const toAmount = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
};

// Row maths happens in fractions of a row; rounding to 1e-6 keeps repeated
// subtraction from drifting (and keeps the split loop finite).
const round = (value) => Math.round(value * 1e6) / 1e6;

export const getTowerLayout = ({
  incomeTwd,
  recurringTwd,
  oneTimeTwd,
  rows = TOWER_ROWS,
}) => {
  const income = toAmount(incomeTwd);
  const recurring = toAmount(recurringTwd);
  const oneTime = toAmount(oneTimeTwd);
  const spentTwd = recurring + oneTime;

  if (income <= 0) {
    return {
      hasIncome: false,
      rows,
      chunks: [],
      incomeTwd: 0,
      spentTwd,
      savedTwd: 0,
      savedRatio: 0,
      overspendTwd: 0,
      overspendDepthRatio: 0,
    };
  }

  const chunks = [];
  let cursor = 0; // rows removed so far, counted from the top
  const removeFromTop = (amountTwd, kind) => {
    let remaining = round(Math.min((amountTwd / income) * rows, rows - cursor));
    while (remaining > EPS) {
      const rowFromTop = Math.floor(cursor + EPS);
      const offset = round(cursor - rowFromTop);
      const take = round(Math.min(1 - offset, remaining));
      if (take <= 0) break;
      chunks.push({ rowIndex: rows - 1 - rowFromTop, offset, take, kind });
      cursor = round(cursor + take);
      remaining = round(remaining - take);
    }
  };
  removeFromTop(recurring, "recurring");
  removeFromTop(oneTime, "oneTime");

  const savedTwd = Math.max(0, income - spentTwd);
  const overspendTwd = Math.max(0, spentTwd - income);
  return {
    hasIncome: true,
    rows,
    chunks,
    incomeTwd: income,
    spentTwd,
    savedTwd,
    savedRatio: savedTwd / income,
    overspendTwd,
    overspendDepthRatio: Math.min(OVERSPEND_DEPTH_CAP, overspendTwd / income),
  };
};

export const getRowRemovedFractions = (chunks, rows) => {
  const removed = new Array(rows).fill(0);
  chunks.forEach((chunk) => {
    removed[chunk.rowIndex] = round(removed[chunk.rowIndex] + chunk.take);
  });
  return removed;
};

export const chunkKey = (chunk) =>
  `${chunk.rowIndex}:${chunk.offset}:${chunk.take}:${chunk.kind}`;

export const diffTowerChunks = (prevLayout, nextLayout) => {
  const prevChunks = prevLayout?.chunks ?? [];
  const nextChunks = nextLayout?.chunks ?? [];
  const prevKeys = new Set(prevChunks.map(chunkKey));
  const nextKeys = new Set(nextChunks.map(chunkKey));
  return {
    added: nextChunks.filter((chunk) => !prevKeys.has(chunkKey(chunk))),
    restored: prevChunks.filter((chunk) => !nextKeys.has(chunkKey(chunk))),
  };
};

// Round on whole 千 first: (31500 / 10000).toFixed(1) gives "3.1" due to float.
export const formatTowerWan = (twd) =>
  `${(Math.round(toAmount(twd) / 1000) / 10).toFixed(1)} 萬`;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/savingsTower.test.js`
Expected: PASS（13 tests）。

- [ ] **Step 5: Commit**

```bash
git add src/utils/savingsTower.js src/utils/savingsTower.test.js
git commit -m "feat(expenses): add savings tower layout util

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `prefersReducedMotion` + `NetWorthJar` 元件

**Files:**
- Create: `src/utils/motion.js`, `src/utils/motion.test.js`
- Create: `src/components/NetWorthJar.jsx`, `src/components/NetWorthJar.test.jsx`
- Modify: `src/App.jsx:245-255`（`getNumberAnimationDuration` 改用 `prefersReducedMotion`）
- Modify: `src/App.css`（新增 `.networth-jar*` 規則，放在檔案中 `.asset-summary-actions` 規則之前）

**Interfaces:**
- Consumes: `getJarGeometry`（Task 1）；`formatNetWorthScaleLabel(value) → string`（`src/utils/portfolioView.js`，已存在，例：`6_380_000 → "638萬"`）；`formatTwd(value) → string`（`src/utils/formatters.js`）。
- Produces:
  - `export const prefersReducedMotion = () => boolean`（`src/utils/motion.js`）
  - `export default function NetWorthJar({ totalTwd, baselineTwd, playKey })`：`playKey` 改變 → 重播進場；`totalTwd` / `baselineTwd` 改變 → 水位平滑移動。根元素 `<svg className="networth-jar" role="img" aria-label="總資產水位 {current}，容量 {cap}">`。

- [ ] **Step 1: Write the failing tests**

`src/utils/motion.test.js`：

```js
import { afterEach, describe, expect, it, vi } from 'vitest'
import { prefersReducedMotion } from './motion'

describe('prefersReducedMotion', () => {
  afterEach(() => vi.restoreAllMocks())

  it('reflects the media query', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({ matches: query.includes('reduce') }))
    expect(prefersReducedMotion()).toBe(true)
  })

  it('is false when matchMedia throws', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(() => {
      throw new Error('nope')
    })
    expect(prefersReducedMotion()).toBe(false)
  })
})
```

`src/components/NetWorthJar.test.jsx`：

```jsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import NetWorthJar from './NetWorthJar'

describe('NetWorthJar (reduced motion → final state)', () => {
  beforeEach(() => {
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
      matches: query.includes('reduce'),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  })
  afterEach(() => vi.restoreAllMocks())

  it('labels the jar with the current level and capacity', () => {
    render(<NetWorthJar totalTwd={6_384_200} baselineTwd={6_301_000} playKey={1} />)
    expect(screen.getByRole('img', { name: '總資產水位 638萬，容量 1000萬' })).toBeInTheDocument()
    expect(screen.getByText('638萬')).toBeInTheDocument()
    expect(screen.getByText('1000萬')).toBeInTheDocument()
  })

  it("draws yesterday's line with its exact value", () => {
    render(<NetWorthJar totalTwd={6_384_200} baselineTwd={6_301_000} playKey={1} />)
    const line = screen.getByTestId('jar-baseline')
    expect(line).toBeInTheDocument()
    expect(line.querySelector('title').textContent).toContain('昨日23:59')
  })

  it('marks the band up or down', () => {
    const { container, rerender } = render(<NetWorthJar totalTwd={6_384_200} baselineTwd={6_301_000} playKey={1} />)
    expect(container.querySelector('.networth-jar-band--up')).not.toBeNull()
    rerender(<NetWorthJar totalTwd={6_218_500} baselineTwd={6_301_000} playKey={1} />)
    expect(container.querySelector('.networth-jar-band--down')).not.toBeNull()
  })

  it('hides the baseline in a freshly crossed jar and labels its floor', () => {
    render(<NetWorthJar totalTwd={10_046_000} baselineTwd={9_982_000} playKey={1} />)
    expect(screen.queryByTestId('jar-baseline')).toBeNull()
    expect(screen.getByText('2000萬')).toBeInTheDocument()
    expect(screen.getByText('從 1000萬 起')).toBeInTheDocument()
  })

  it('renders no water for an empty jar', () => {
    const { container } = render(<NetWorthJar totalTwd={0} baselineTwd={0} playKey={1} />)
    expect(container.querySelector('.networth-jar-water')).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/utils/motion.test.js src/components/NetWorthJar.test.jsx`
Expected: FAIL — `Failed to resolve import "./motion"` / `"./NetWorthJar"`。

- [ ] **Step 3: Implement `motion.js` and use it in App**

`src/utils/motion.js`：

```js
// animejs tweens and rAF loops ignore the CSS prefers-reduced-motion rule, so
// JS-driven animation checks it here. matchMedia can be missing or throw.
export const prefersReducedMotion = () => {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
};
```

`src/App.jsx`：在 import 區加入 `import { prefersReducedMotion } from "./utils/motion";`，並把第 245–255 行改為：

```js
// animejs ignores the CSS prefers-reduced-motion rule, so honour it here:
// a 0ms tween jumps straight to the final number.
const getNumberAnimationDuration = () =>
  prefersReducedMotion() ? 0 : NUMBER_ANIMATION_DURATION_MS;
```

- [ ] **Step 4: Implement `NetWorthJar.jsx`**

`src/components/NetWorthJar.jsx`：

```jsx
// Asset-tab net-worth jar: the total is the water level inside a jar that
// holds one 千萬. Yesterday's level is a dashed line; today's move between the
// two is a striped band (green up / red down). Geometry lives in
// utils/netWorthJar.js — this file only draws and animates it.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { getJarGeometry } from "../utils/netWorthJar";
import { formatNetWorthScaleLabel } from "../utils/portfolioView";
import { formatTwd } from "../utils/formatters";
import { prefersReducedMotion } from "../utils/motion";

const VIEW_W = 120;
const VIEW_H = 170;
const JAR = { x: 18, y: 16, w: 84, h: 146, r: 18 };
// Entrance: rise to yesterday's level first, then move to today's.
const RISE_TO_BASELINE_MS = 1100;
const CELEBRATE_DELAY_MS = 900;
const CELEBRATE_MS = 1500;
const LEVEL_EASE = 0.06; // per-frame lerp toward the target level
const BUBBLE_COUNT = 8;

const yOf = (ratio) => JAR.y + JAR.h * (1 - ratio);

const buildWavePath = (levelY, phase, amp, offset) => {
  const bottom = JAR.y + JAR.h + 4;
  let d = `M ${JAR.x - 4} ${bottom} L ${JAR.x - 4} ${levelY}`;
  for (let i = 0; i <= JAR.w + 8; i += 4) {
    const y = levelY + offset + Math.sin(i / 13 + phase) * amp;
    d += ` L ${JAR.x - 4 + i} ${y.toFixed(2)}`;
  }
  return `${d} L ${JAR.x + JAR.w + 4} ${bottom} Z`;
};

export default function NetWorthJar({ totalTwd, baselineTwd, playKey }) {
  const [reduced] = useState(prefersReducedMotion);
  const geometry = useMemo(
    () => getJarGeometry({ totalTwd, baselineTwd }),
    [totalTwd, baselineTwd],
  );
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  // The playKey whose entrance is currently celebrating a new 千萬 (or null).
  const [celebrateKey, setCelebrateKey] = useState(null);
  const celebrating = celebrateKey === playKey;

  const geometryRef = useRef(geometry);
  const levelRef = useRef(reduced ? geometry.levelRatio : 0);
  const targetRef = useRef(geometry.levelRatio);
  const ampRef = useRef(reduced ? 0 : 3);
  const phaseRef = useRef(0);
  const risingRef = useRef(false); // true while the entrance rises to yesterday
  const bandOnRef = useRef(reduced);
  const frontRef = useRef(null);
  const backRef = useRef(null);
  const bandRef = useRef(null);

  const paint = () => {
    const g = geometryRef.current;
    const levelY = yOf(levelRef.current);
    frontRef.current?.setAttribute(
      "d",
      buildWavePath(levelY, phaseRef.current, ampRef.current, 0),
    );
    backRef.current?.setAttribute(
      "d",
      buildWavePath(levelY, -phaseRef.current * 0.8 + 2, ampRef.current * 1.3, -2.5),
    );
    if (bandRef.current) {
      const fromRatio = g.crossedMilestone ? 0 : g.baselineRatio;
      const show = bandOnRef.current && fromRatio !== null && g.direction !== "flat";
      const baseY = yOf(fromRatio ?? 0);
      bandRef.current.setAttribute("y", Math.min(levelY, baseY));
      bandRef.current.setAttribute("height", show ? Math.abs(levelY - baseY) : 0);
    }
  };

  // Data changed (price refresh etc.): glide to the new level, no replay.
  useEffect(() => {
    geometryRef.current = geometry;
    if (reduced) {
      levelRef.current = geometry.levelRatio;
      paint();
      return;
    }
    if (!risingRef.current) targetRef.current = geometry.levelRatio;
  }, [geometry, reduced]);

  // Entrance on mount and whenever playKey changes.
  useEffect(() => {
    if (reduced) return undefined;
    const g = geometryRef.current;
    levelRef.current = 0;
    ampRef.current = 3;
    bandOnRef.current = false;
    risingRef.current = true;
    targetRef.current = g.crossedMilestone ? 0 : (g.baselineRatio ?? 0);
    const timers = [
      setTimeout(() => {
        risingRef.current = false;
        bandOnRef.current = true;
        targetRef.current = geometryRef.current.levelRatio;
        ampRef.current = 4;
      }, RISE_TO_BASELINE_MS),
    ];
    if (g.crossedMilestone) {
      timers.push(
        setTimeout(() => setCelebrateKey(playKey), RISE_TO_BASELINE_MS + CELEBRATE_DELAY_MS),
        setTimeout(
          () => setCelebrateKey(null),
          RISE_TO_BASELINE_MS + CELEBRATE_DELAY_MS + CELEBRATE_MS,
        ),
      );
    }
    return () => timers.forEach(clearTimeout);
  }, [playKey, reduced]);

  // Wave loop. Browsers already stop rAF in hidden tabs.
  useEffect(() => {
    if (reduced) {
      paint();
      return undefined;
    }
    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      phaseRef.current += 0.045;
      levelRef.current += (targetRef.current - levelRef.current) * LEVEL_EASE;
      const settled = Math.abs(targetRef.current - levelRef.current) < 0.002;
      ampRef.current += ((settled ? 1.2 : 3) - ampRef.current) * 0.04;
      paint();
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reduced]);

  const capLabel = formatNetWorthScaleLabel(geometry.capTwd);
  const currentLabel = formatNetWorthScaleLabel(geometry.totalTwd);
  const levelY = yOf(geometry.levelRatio);
  const up = geometry.direction === "up" || geometry.crossedMilestone;

  return (
    <svg
      className={`networth-jar${celebrating ? " networth-jar--celebrate" : ""}`}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      role="img"
      aria-label={`總資產水位 ${currentLabel}，容量 ${capLabel}`}
    >
      <defs>
        <clipPath id={`${id}-clip`}>
          <rect x={JAR.x} y={JAR.y} width={JAR.w} height={JAR.h} rx={JAR.r} />
        </clipPath>
        <linearGradient id={`${id}-water`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5cbcae" />
          <stop offset="1" stopColor="#2b7f74" />
        </linearGradient>
        <pattern id={`${id}-up`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="5" height="5" fill="rgba(35,120,4,.35)" />
          <rect width="1.2" height="5" fill="rgba(255,255,255,.6)" />
        </pattern>
        <pattern id={`${id}-down`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="5" height="5" fill="rgba(207,19,34,.10)" />
          <rect width="1.2" height="5" fill="rgba(207,19,34,.45)" />
        </pattern>
      </defs>

      <rect className="networth-jar-glass" x={JAR.x} y={JAR.y} width={JAR.w} height={JAR.h} rx={JAR.r} />
      <g clipPath={`url(#${id}-clip)`}>
        {!geometry.isEmpty && (
          <g className="networth-jar-water">
            <path ref={backRef} className="networth-jar-wave-back" />
            <path ref={frontRef} fill={`url(#${id}-water)`} />
          </g>
        )}
        <rect
          ref={bandRef}
          className={`networth-jar-band networth-jar-band--${up ? "up" : "down"}`}
          x={JAR.x}
          width={JAR.w}
          height="0"
          fill={`url(#${id}-${up ? "up" : "down"})`}
        />
        {celebrating &&
          Array.from({ length: BUBBLE_COUNT }, (_, index) => (
            <circle
              key={index}
              className="networth-jar-bubble"
              cx={JAR.x + 10 + ((index * 37) % (JAR.w - 20))}
              cy={levelY}
              r={1.5 + (index % 3)}
              style={{ animationDelay: `${index * 70}ms` }}
            />
          ))}
      </g>

      {geometry.ticks.map((tick) => (
        <line
          key={tick.twd}
          className="networth-jar-tick"
          x1={JAR.x + JAR.w - 10}
          x2={JAR.x + JAR.w}
          y1={yOf(tick.ratio)}
          y2={yOf(tick.ratio)}
        />
      ))}
      <rect className="networth-jar-outline" x={JAR.x} y={JAR.y} width={JAR.w} height={JAR.h} rx={JAR.r} />
      <rect className="networth-jar-shine" x={JAR.x + 8} y={JAR.y + 14} width="4" height={JAR.h * 0.55} rx="2" />
      {celebrating && (
        <rect className="networth-jar-halo" x={JAR.x} y={JAR.y} width={JAR.w} height={JAR.h} rx={JAR.r} />
      )}

      <text className="networth-jar-cap" x={JAR.x + JAR.w / 2} y={JAR.y - 5} textAnchor="middle">
        {capLabel}
      </text>
      {geometry.floorTwd > 0 && (
        <text className="networth-jar-floor" x={JAR.x + JAR.w / 2} y={JAR.y + JAR.h + 13} textAnchor="middle">
          {`從 ${formatNetWorthScaleLabel(geometry.floorTwd)} 起`}
        </text>
      )}

      {geometry.baselineRatio !== null && (
        <g key={`baseline-${playKey}`} className="networth-jar-baseline" data-testid="jar-baseline">
          <title>{`昨日23:59：${formatTwd(geometry.baselineTwd)}`}</title>
          <line
            x1={JAR.x - 6}
            x2={JAR.x + JAR.w + 6}
            y1={yOf(geometry.baselineRatio)}
            y2={yOf(geometry.baselineRatio)}
          />
          <text x={JAR.x - 8} y={yOf(geometry.baselineRatio) + 3} textAnchor="end">
            昨日
          </text>
        </g>
      )}

      {!geometry.isEmpty && (
        <text
          key={`current-${playKey}`}
          className="networth-jar-current"
          x={JAR.x + JAR.w + 6}
          y={levelY + 3}
        >
          {currentLabel}
        </text>
      )}
    </svg>
  );
}
```

> 註：專案用 `eslint-plugin-react-hooks` v7（含 React Compiler 規則）：**不可**在 render 中讀寫 `ref.current`、**不可**在 effect 本體同步呼叫 `setState`（timer callback 內可以）、render 中不可用 `Math.random`。上面的寫法已依此驗證過（`celebrateKey === playKey` 取代「effect 開頭 reset state」）。

- [ ] **Step 5: Add jar CSS**

`src/App.css`，在 `.asset-summary-actions {` 規則之前加入：

```css
/* ===== Net-worth jar (components/NetWorthJar.jsx) ===== */
.networth-jar {
  width: 120px;
  height: 170px;
  flex: none;
  overflow: visible;
}

.networth-jar-glass {
  fill: var(--c-track);
}

.networth-jar-wave-back {
  fill: #86c4b9;
  opacity: 0.55;
}

.networth-jar-outline {
  fill: none;
  stroke: var(--c-line-strong);
  stroke-width: 1.5;
}

.networth-jar-shine {
  fill: rgba(255, 255, 255, 0.55);
}

.networth-jar-tick {
  stroke: rgba(27, 43, 41, 0.25);
  stroke-width: 1;
}

.networth-jar-cap,
.networth-jar-floor,
.networth-jar-baseline text {
  font-size: 10px;
  fill: var(--c-muted);
}

.networth-jar-floor {
  fill: var(--c-subtle);
}

.networth-jar-baseline line {
  stroke: var(--c-muted);
  stroke-width: 1;
  stroke-dasharray: 3 3;
}

.networth-jar-baseline {
  animation: jar-fade-in 300ms ease-out 1100ms both;
}

.networth-jar-current {
  font-size: 10px;
  font-weight: 700;
  fill: var(--c-teal-ink);
  animation: jar-fade-in 300ms ease-out 1900ms both;
}

.networth-jar-bubble {
  fill: #fff;
  transform-box: fill-box;
  animation: jar-bubble-rise 1200ms ease-out both;
}

.networth-jar-halo {
  fill: none;
  stroke: var(--c-teal-bright);
  stroke-width: 2;
  transform-box: fill-box;
  transform-origin: center;
  animation: jar-halo 900ms ease-out both;
}

@keyframes jar-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes jar-bubble-rise {
  from { opacity: 0.9; transform: translateY(0); }
  to { opacity: 0; transform: translateY(-70px); }
}

@keyframes jar-halo {
  from { opacity: 1; transform: scale(1); }
  to { opacity: 0; transform: scale(1.12); }
}

@media (prefers-reduced-motion: reduce) {
  .networth-jar *,
  .savings-tower * {
    animation: none !important;
    transition: none !important;
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/utils/motion.test.js src/components/NetWorthJar.test.jsx`
Expected: PASS（7 tests）。
Then: `npm test` → 全綠；`npx eslint src/components/NetWorthJar.jsx src/utils/motion.js src/App.jsx` → 無錯誤、無警告。

- [ ] **Step 7: Commit**

```bash
git add src/utils/motion.js src/utils/motion.test.js src/components/NetWorthJar.jsx src/components/NetWorthJar.test.jsx src/App.jsx src/App.css
git commit -m "feat(asset): add animated NetWorthJar component

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `SavingsTower` 元件

**Files:**
- Create: `src/components/SavingsTower.jsx`, `src/components/SavingsTower.test.jsx`
- Modify: `src/App.css`（新增 `.savings-tower*` 規則，緊接在 Task 3 的 jar CSS 之後、`@media (prefers-reduced-motion)` 之前）

**Interfaces:**
- Consumes: `getTowerLayout`、`getRowRemovedFractions`、`diffTowerChunks`、`formatTowerWan`（Task 2）；`prefersReducedMotion`（Task 3）。
- Produces: `export default function SavingsTower({ incomeTwd, recurringTwd, oneTimeTwd, hasIncome, playKey, onSetupIncome })`。
  - `playKey` 改變、或收入從無變有 → 重播進場（疊塔 → 逐塊扣磚）。
  - 其他 props 改變 → 只讓 `diffTowerChunks(...).added` 的區塊掉落。
  - 根元素 `<div className="savings-tower">`；無收入時渲染 `<button>設定收入</button>`。

- [ ] **Step 1: Write the failing test**

`src/components/SavingsTower.test.jsx`：

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

describe('SavingsTower', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('shows income and what was saved', () => {
    mockMotion(true)
    render(<SavingsTower incomeTwd={85_000} recurringTwd={32_000} oneTimeTwd={21_500} hasIncome playKey={1} />)
    expect(screen.getByText('收入 8.5 萬')).toBeInTheDocument()
    expect(screen.getByText('存下 3.2 萬')).toBeInTheDocument()
  })

  it('puts the saved label inside the tower when nearly everything is saved', () => {
    mockMotion(true)
    render(<SavingsTower incomeTwd={85_000} recurringTwd={5_000} oneTimeTwd={0} hasIncome playKey={1} />)
    expect(screen.getByText('存下 8.0 萬')).toHaveClass('savings-tower-saved--inside')
  })

  it('digs a pit and labels the overspend', () => {
    mockMotion(true)
    const { container } = render(
      <SavingsTower incomeTwd={85_000} recurringTwd={32_000} oneTimeTwd={61_000} hasIncome playKey={1} />,
    )
    expect(screen.getByText('−0.8 萬')).toBeInTheDocument()
    expect(container.querySelector('.savings-tower-pit')).not.toBeNull()
    expect(screen.queryByText(/^存下/)).toBeNull()
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
    // Entrance starts with the full gold tower and no shards yet.
    expect(container.querySelectorAll('.savings-tower-shard')).toHaveLength(0)
    expect(screen.queryByText(/^存下/)).toBeNull()
    act(() => {
      vi.advanceTimersByTime(5_000)
    })
    expect(screen.getByText('存下 7.0 萬')).toBeInTheDocument()
  })

  it('chips away the data that arrives during the build phase', () => {
    mockMotion(false)
    vi.useFakeTimers()
    const { rerender } = render(
      <SavingsTower incomeTwd={100_000} recurringTwd={30_000} oneTimeTwd={0} hasIncome playKey={1} />,
    )
    rerender(<SavingsTower incomeTwd={100_000} recurringTwd={30_000} oneTimeTwd={0} hasIncome playKey={2} />)
    // New month's numbers land while the tower is still being built.
    rerender(<SavingsTower incomeTwd={100_000} recurringTwd={50_000} oneTimeTwd={0} hasIncome playKey={2} />)
    act(() => {
      vi.advanceTimersByTime(5_000)
    })
    expect(screen.getByText('存下 5.0 萬')).toBeInTheDocument()
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
    // One new row removed (row index 6) → one shard per brick in that row (even row = 2 bricks).
    expect(container.querySelectorAll('.savings-tower-shard').length - before).toBe(2)
    expect(screen.getByText('存下 6.0 萬')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/SavingsTower.test.jsx`
Expected: FAIL — `Failed to resolve import "./SavingsTower"`。

- [ ] **Step 3: Implement `SavingsTower.jsx`**

`src/components/SavingsTower.jsx`：

```jsx
// Expense-tab savings tower: this period's income is a tower of gold bricks;
// spending knocks bricks off the top (recurring first, then one-time) and
// what is left is what was saved. Overspending digs a red pit below ground.
// Layout maths lives in utils/savingsTower.js — this file draws + animates.
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
const INSIDE_LABEL_RATIO = 0.85;

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
  hasIncome,
  playKey,
  onSetupIncome,
}) {
  const [reduced] = useState(prefersReducedMotion);
  const layout = useMemo(
    () =>
      getTowerLayout({
        incomeTwd: hasIncome ? incomeTwd : 0,
        recurringTwd,
        oneTimeTwd,
      }),
    [hasIncome, incomeTwd, recurringTwd, oneTimeTwd],
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
  const removed = getRowRemovedFractions(
    layout.chunks.slice(0, run.revealed),
    layout.rows,
  );
  const done = run.phase === "done";
  const savedHeight = layout.savedRatio * TOWER_HEIGHT;
  const savedInside = layout.savedRatio >= INSIDE_LABEL_RATIO;
  const pitDepth = layout.overspendDepthRatio * TOWER_HEIGHT;

  return (
    <div className="savings-tower">
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} aria-hidden="true">
        <defs>
          <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f2cf6b" />
            <stop offset="1" stopColor="#d9a93a" />
          </linearGradient>
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
                rx="2"
              />
            )),
          )}
        </g>

        {layout.hasIncome && (
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
                  rx="2"
                  fill={`url(#${id}-gold)`}
                  style={{ animationDelay: `${rowIndex * BUILD_STAGGER_MS}ms` }}
                />
              ));
            })}
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

        {done && layout.hasIncome && layout.savedTwd > 0 && (
          <text
            className={`savings-tower-saved${savedInside ? " savings-tower-saved--inside" : ""}`}
            x={TOWER.x + TOWER.w / 2}
            y={
              savedInside
                ? TOWER.base - savedHeight / 2 + 3
                : TOWER.base - savedHeight - 5
            }
            textAnchor="middle"
          >
            {`存下 ${formatTowerWan(layout.savedTwd)}`}
          </text>
        )}

        {done && layout.overspendTwd > 0 && (
          <>
            <rect
              className="savings-tower-pit"
              x={TOWER.x}
              y={TOWER.base + 1.5}
              width={TOWER.w}
              height={pitDepth}
              rx="2"
            />
            <text
              className="savings-tower-over"
              x={TOWER.x + TOWER.w / 2}
              y={TOWER.base + pitDepth + 12}
              textAnchor="middle"
            >
              {`−${formatTowerWan(layout.overspendTwd)}`}
            </text>
          </>
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

> 註：動畫狀態集中在 `run` 物件。換場（`runKey` 改變）與「進場結束後資料變動 → 只掉差異」都在 **render 期間**以「比對上一次值再 `setRun`」的 React 官方 pattern 處理，effect 只負責排 timer（timer callback 內 `setRun` 是允許的）。扣磚每一步都讀 `layoutRef`，所以進場途中才到的資料（例如切月份後才載入）會被正確扣除。碎片散開角度用確定性的 jitter，不用 `Math.random`。唯一的 `eslint-disable-line` 是 timer effect 的 deps（刻意只依 `run.runKey` 重啟）。

- [ ] **Step 4: Add tower CSS**

`src/App.css`，在 Task 3 加入的 `@media (prefers-reduced-motion: reduce)` 區塊**之前**加入：

```css
/* ===== Savings tower (components/SavingsTower.jsx) ===== */
.savings-tower {
  position: relative;
  width: 120px;
  height: 180px;
  flex: none;
}

.savings-tower svg {
  width: 100%;
  height: 100%;
  overflow: visible;
}

.savings-tower-ground {
  stroke: var(--c-line-strong);
  stroke-width: 1.5;
}

.savings-tower-ghost rect {
  fill: none;
  stroke: var(--c-line);
  stroke-dasharray: 2 2;
}

.savings-tower-income {
  font-size: 9.5px;
  fill: var(--c-subtle);
}

.savings-tower-build .savings-tower-brick {
  animation: tower-brick-in 260ms ease-out both;
}

.savings-tower-shard {
  transform-box: fill-box;
  transform-origin: center;
  animation: tower-shard-fall 650ms ease-in forwards;
}

.savings-tower-shard--recurring {
  fill: var(--c-teal);
}

.savings-tower-shard--oneTime {
  fill: #86c4b9;
}

.savings-tower-saved {
  font-size: 10px;
  font-weight: 700;
  fill: #8a6414;
  animation: jar-fade-in 400ms ease-out both;
}

.savings-tower-saved--inside {
  fill: #5c430d;
}

.savings-tower-pit {
  fill: rgba(207, 19, 34, 0.12);
  stroke: var(--c-down);
  stroke-dasharray: 3 2;
  transform-box: fill-box;
  transform-origin: top;
  animation: tower-pit-grow 500ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

.savings-tower-over {
  font-size: 9.5px;
  font-weight: 700;
  fill: var(--c-down);
}

.savings-tower-setup {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  border: 0;
  background: none;
  padding: 4px 6px;
  font-size: 12px;
  color: var(--c-teal);
  cursor: pointer;
}

@keyframes tower-brick-in {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes tower-shard-fall {
  from { opacity: 1; transform: translate(0, 0) rotate(0deg); }
  to { opacity: 0; transform: translate(var(--dx), 150px) rotate(var(--rot)); }
}

@keyframes tower-pit-grow {
  from { transform: scaleY(0); }
  to { transform: scaleY(1); }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/components/SavingsTower.test.jsx`
Expected: PASS（7 tests）。若 `drops only the new chunks` 的 shard 數不符，先確認 `diffTowerChunks(30k → 40k one-time)` 只回傳 `[6, 0, 1, 'oneTime']`（row 6 為偶數列 → 2 塊磚）。注意 jsdom 不會觸發 `animationend`，所以測試以「rerender 前後的差值」計算碎片數。
Then: `npm test` 全綠；`npx eslint src/components/SavingsTower.jsx` 無錯誤。

- [ ] **Step 6: Commit**

```bash
git add src/components/SavingsTower.jsx src/components/SavingsTower.test.jsx src/App.css
git commit -m "feat(expenses): add animated SavingsTower component

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: 資產頁接上水位瓶，刪除舊淨值進度條

**Files:**
- Modify: `src/App.jsx`（import 區 ~178-205；state ~644-648；refs ~665-690；函式 ~731-760、~879-964；`loadAllData` ~1079-1175；unmount effect ~3922-3935；memos ~4340-4386；JSX ~6083-6200）
- Modify: `src/App.css`（刪除 `.networth-progress-*`、`.networth-track-stop-line`、`.networth-delta-segment*`、`.networth-marker*` 規則與 mobile media query 內對應規則；新增 `.summary-hero-row`）
- Modify: `src/utils/portfolioView.js`、`src/utils/portfolioView.test.js`

**Interfaces:**
- Consumes: `NetWorthJar`（Task 3）、`getJarGeometry`（Task 1）、`formatNetWorthScaleLabel`。
- Produces: `assetPlayKey` state（僅 App 內部）。

> 行號會隨前面的編輯位移；每一步都以「搜尋字串」定位，不要依賴行號。

- [ ] **Step 1: 確認現有測試是綠的**

Run: `npm test`
Expected: PASS。

- [ ] **Step 2: 加入 import 與 state**

`src/App.jsx` import 區加入：

```js
import NetWorthJar from "./components/NetWorthJar";
import { getJarGeometry } from "./utils/netWorthJar";
```

在 `const [rowAnimationValues, setRowAnimationValues] = useState({});` 下一行，把這 5 行：

```js
  const [progressDisplayRatio, setProgressDisplayRatio] = useState(0);
  const [baselineDisplayRatio, setBaselineDisplayRatio] = useState(0);
  const [deltaDisplayLeftRatio, setDeltaDisplayLeftRatio] = useState(0);
  const [deltaDisplayWidthRatio, setDeltaDisplayWidthRatio] = useState(0);
  const [markerDisplayWan, setMarkerDisplayWan] = useState(0);
```

換成：

```js
  // Bumped whenever the asset summary should replay its entrance animation.
  const [assetPlayKey, setAssetPlayKey] = useState(0);
```

- [ ] **Step 3: 刪除舊 refs 與動畫函式**

刪除下列宣告（整個 statement）：
- `const progressAnimationRef = useRef(null);`
- `const markerValueAnimationRef = useRef(null);`
- `const latestMarkerWanRef = useRef(0);`
- `const latestProgressTargetsRef = useRef({ ... });`（含物件內容，共 6 行）
- `const stopProgressAnimation = useCallback(...)`（整個 useCallback）
- `const stopMarkerValueAnimation = useCallback(...)`（整個 useCallback）
- `const animateProgress = useCallback(...)`（整個 useCallback）
- `const animateMarkerValue = useCallback(...)`（整個 useCallback）

- [ ] **Step 4: 改寫 `loadAllData` 的動畫段落**

搜尋 `const progressTargets = getProgressDisplayTargets(`，把從這行到 `else` 分支結束（`console.groupCollapsed(` 之前）整段換成：

```js
    const applyLatestDisplayState = () => {
      setDisplayTotalTwd(normalizedTotalTwd);
      setRowAnimationValues({});
    };

    const shouldAnimateNow =
      !didRunInitialAnimationRef.current || shouldAnimateNumbersRef.current;
    if (shouldAnimateNow) {
      didRunInitialAnimationRef.current = true;
      shouldAnimateNumbersRef.current = false;
      stopNumberAnimations("manual");
      setAssetPlayKey((key) => key + 1);
      const totalAnimationStarted = animateTotalValue(normalizedTotalTwd);
      const rowAnimationStarted = animateVisibleRows(
        filterRowsByHolderTab(
          Array.isArray(portfolio.rows) ? portfolio.rows : [],
          activeHoldingTabRef.current,
        ),
      );
      if (totalAnimationStarted || rowAnimationStarted) {
        beginNumberAnimationLock();
      } else {
        applyLatestDisplayState();
      }
    } else {
      const locked = isNumberAnimationLocked();
      const hasLiveAnimations = Boolean(
        totalAnimationRef.current || rowAnimationInstanceRef.current,
      );
      const hasStaleLock = locked && !hasLiveAnimations;
      if (!locked || hasStaleLock) {
        if (hasStaleLock) {
          animationLockedUntilRef.current = 0;
        }
        stopNumberAnimations("force");
        applyLatestDisplayState();
      }
    }
```

並把 `loadAllData` 的 deps 陣列改為：

```js
  }, [
    animateTotalValue,
    animateVisibleRows,
    beginNumberAnimationLock,
    isNumberAnimationLocked,
    range,
    stopNumberAnimations,
  ]);
```

- [ ] **Step 5: 改寫 unmount cleanup effect**

搜尋 `stopProgressAnimation("force");` 所在的 unmount effect，整個換成（`stopExpenseProgressAnimation` 會在 Task 6 刪除，這裡先保留）：

```js
  useEffect(
    () => () => {
      stopNumberAnimations("force");
      stopExpenseProgressAnimation();
    },
    [stopExpenseProgressAnimation, stopNumberAnimations],
  );
```

- [ ] **Step 6: 換掉舊 memos**

搜尋 `const flooredBaselineTwd = useMemo(`，從這行到 `deltaSegmentClassName` 的 `useMemo` 結束（`const handleGoogleLogin` 之前），整段換成：

```js
  const jarGeometry = useMemo(
    () => getJarGeometry({ totalTwd, baselineTwd: baselineTotalTwd }),
    [baselineTotalTwd, totalTwd],
  );
```

- [ ] **Step 7: 改寫資產摘要 JSX**

搜尋 `<div className="asset-summary-panel">`。把裡面現有的 `<div className="asset-summary-value"> ... </div>`（含其中的 `<div className="networth-progress-wrap">...</div>`）改為下列結構：外層新增 `.summary-hero-row`，`asset-summary-value` 內**刪除整個 `networth-progress-wrap` div**，並在 `autoRefreshIssue` 區塊之後加入距離千萬的文字：

```jsx
                <div className="asset-summary-panel">
                  <div className="summary-hero-row">
                    <div className="asset-summary-value">
                      {/* …保留原本的 <Statistic>、當日漲跌 <Text>、報價時間 <Text>、autoRefreshIssue 區塊，內容不變… */}
                      {!jarGeometry.isEmpty && (
                        <Text type="secondary" className="asset-jar-gap">
                          距離 {formatNetWorthScaleLabel(jarGeometry.capTwd)} 還差{" "}
                          {formatNetWorthScaleLabel(jarGeometry.gapToCapTwd)}
                        </Text>
                      )}
                    </div>
                    <NetWorthJar
                      totalTwd={totalTwd}
                      baselineTwd={baselineTotalTwd}
                      playKey={assetPlayKey}
                    />
                  </div>
                  <div className="asset-summary-actions">
                    {/* …原本的「趨勢」「分配」按鈕不變… */}
                  </div>
                </div>
```

（「保留原本」的註解處，貼回原本那幾個元素即可，不要改內容；最後實作中不要留下這兩行註解。）

- [ ] **Step 8: 清理 import 與 portfolioView**

1. 從 `./utils/portfolioView` 的 import 移除 `getProgressDisplayTargets`、`buildProgressStops`。
2. 執行 `grep -n "floorToTenThousand" src/App.jsx`；若只剩 import 那一行，也從 import 移除。
3. `src/utils/portfolioView.js`：刪除 `const PROGRESS_UNIT_TWD = 10000000;`、`const clampRatio = ...`、`export const getProgressDisplayTargets = ...`、`export const buildProgressStops = ...`。
4. `src/utils/portfolioView.test.js`：從 import 移除那兩個名稱，並刪除整個 `describe('progress bar math', ...)` 區塊。
5. 執行：

```bash
grep -n "progressDisplayRatio\|baselineDisplayRatio\|deltaDisplay\|markerDisplayWan\|animateProgress\|stopProgressAnimation\|animateMarkerValue\|stopMarkerValueAnimation\|latestMarkerWanRef\|latestProgressTargetsRef\|progressStops\|isMarkerOverlap\|deltaSegment\|currentMarkerWanLabel\|getProgressDisplayTargets\|buildProgressStops" src
```

Expected: 無輸出。

- [ ] **Step 9: CSS**

`src/App.css`：
1. 刪除所有 selector 以 `.networth-progress`、`.networth-track-stop-line`、`.networth-delta-segment`、`.networth-marker` 開頭的規則（桌面區塊約第 246–400 行，以及 mobile `@media` 內的 `.networth-progress-wrap`、`.networth-progress-scale-label`、`.networth-marker-label`）。**保留** Task 3 新增的 `.networth-jar*`。刪完執行 `grep -n "networth-progress\|networth-marker\|networth-delta\|networth-track" src/App.css src/App.jsx`，Expected: 無輸出。
2. 在 `.asset-summary-panel` 規則後加入：

```css
/* Hero row: figures on the left, the jar / tower on the right. */
.summary-hero-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  width: min(560px, 100%);
  text-align: left;
}

.summary-hero-row > :first-child {
  flex: 1;
  min-width: 0;
}

.summary-hero-row .ant-statistic-content {
  white-space: nowrap;
}

.summary-hero-row .asset-total-delta {
  text-align: left;
}

.asset-jar-gap {
  display: block;
  margin-top: 4px;
  font-size: 12px;
}
```

3. 在 mobile `@media` 區塊內，把 `.asset-summary-value { width: 80vw; margin: 0 auto; }` 刪掉，並加入：

```css
  .summary-hero-row .ant-statistic-content {
    font-size: 26px;
  }
```

- [ ] **Step 10: 驗證**

Run: `npm test` → PASS；`npm run lint` → 無錯誤；`npm run build` → 成功。

- [ ] **Step 11: Commit**

```bash
git add src/App.jsx src/App.css src/utils/portfolioView.js src/utils/portfolioView.test.js
git commit -m "feat(asset): replace net-worth progress bar with animated jar

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: 支出頁接上磚塔，刪除舊花費 / 收入進度條

**Files:**
- Modify: `src/App.jsx`（state ~607-615；refs `expenseProgressAnimationRef`、`latestExpenseProgressTargetsRef`；函式 `stopExpenseProgressAnimation`、`animateExpenseProgress`；`saveExpenseEntry`、`handleRemoveExpense`、`confirmStopRecurring`；memos ~5166-5222；effect ~5223-5265；JSX ~6600-6700）
- Modify: `src/App.css`（刪除 `.expense-income-segmented-track*`、`.expense-income-segment*`、`.expense-rate-marker*`；調整 `.expense-income-progress`；新增 legend / saved 樣式）

**Interfaces:**
- Consumes: `SavingsTower`（Task 4）、`getTowerLayout`、`formatTowerWan`（Task 2）、現有 `activeIncomeProgress`（`{ hasIncome, denominator, numerator, recurringNumerator, oneTimeNumerator }`）、`goToIncomeSettings`、`formatTwd`。
- Produces: `expensePlayKey` state（僅 App 內部）。

- [ ] **Step 1: import 與 state**

import 區加入：

```js
import SavingsTower from "./components/SavingsTower";
import { getTowerLayout } from "./utils/savingsTower";
```

刪除下列 state（`useState` 整行，含換行接續的部分）：`expenseRecurringDisplayPercent`、`expenseOneTimeDisplayPercent`、`expenseMarkerDisplayPercent`、`expenseRateDisplayPercent`、`showExpenseRateMarkerDisplay`，並在原位置加入：

```js
  // Bumped whenever the expense summary should replay its tower entrance.
  const [expensePlayKey, setExpensePlayKey] = useState(0);
```

- [ ] **Step 2: 刪除舊動畫 refs / 函式**

刪除：`const expenseProgressAnimationRef = useRef(null);`、`const latestExpenseProgressTargetsRef = useRef({ ... });`、`const stopExpenseProgressAnimation = useCallback(...)`、`const animateExpenseProgress = useCallback(...)`。

把 Task 5 改過的 unmount effect 改成：

```js
  useEffect(
    () => () => {
      stopNumberAnimations("force");
    },
    [stopNumberAnimations],
  );
```

- [ ] **Step 3: 把「該重播」的旗標換成直接遞增 `expensePlayKey`**

`react-hooks` v7 不允許在 effect 本體同步 `setState`，所以不再用「effect 觀察 `activeIncomeProgress` + ref 旗標」的方式，改為在觸發點直接遞增 playKey（磚塔每一步扣磚都讀最新資料，所以 playKey 比資料早一點更新沒關係）：

1. 刪除 `const expenseShouldAnimateRef = useRef(false);` 與 `const didRunExpenseInitialAnimationRef = useRef(false);`。
2. 在 `saveExpenseEntry`、`handleRemoveExpense`、`confirmStopRecurring` 中**刪除** `expenseShouldAnimateRef.current = true;`（新增 / 刪除 / 停止定期支出 → 磚塔只掉落差異區塊）。
3. 其餘每一處 `expenseShouldAnimateRef.current = true;`（`handleAddIncomeOverride`、`handleRemoveIncomeOverride`、`handleSaveIncomeSettings`、月份 / 累計 `Segmented` 的 `onChange`、月份導覽的兩個 `onClick`）**換成**：

```js
setExpensePlayKey((key) => key + 1);
```

（初次進入支出 tab 時，`SavingsTower` mount 本身就會播進場，不需要額外處理。）

完成後執行 `grep -n "expenseShouldAnimateRef\|didRunExpenseInitialAnimationRef" src/App.jsx`，Expected: 無輸出。

- [ ] **Step 4: 換掉舊 memos 與 effect**

搜尋 `const expenseRecurringSegmentPercent = useMemo(`。刪除這些 memo：`expenseRecurringSegmentPercent`、`expenseOneTimeSegmentPercent`、`expenseRateRawPercent`、`expenseRateMarkerLeftPercent`、`expenseRateMarkerLabel`、`showExpenseRateMarker`、`showExpenseSegmentDividerDisplay`。**保留** `activeIncomeProgress`、`expenseIncomeProgressMetaLeftText`、`expenseIncomeProgressMetaRightText`。

把緊接其後、以 `const targets = {` 開頭、deps 含 `animateExpenseProgress` 的 `useEffect` **整個刪除**，在原位置加入：

```js
  const expenseTowerLayout = useMemo(
    () =>
      getTowerLayout({
        incomeTwd: activeIncomeProgress?.hasIncome
          ? activeIncomeProgress?.denominator
          : 0,
        recurringTwd: activeIncomeProgress?.recurringNumerator,
        oneTimeTwd: activeIncomeProgress?.oneTimeNumerator,
      }),
    [activeIncomeProgress],
  );
  const expenseSavedText = useMemo(() => {
    if (!expenseTowerLayout.hasIncome) {
      return null;
    }
    if (expenseTowerLayout.overspendTwd > 0) {
      return {
        over: true,
        text: `超支 ${formatTwd(expenseTowerLayout.overspendTwd)}`,
      };
    }
    return {
      over: false,
      text: `存下 ${formatTwd(expenseTowerLayout.savedTwd)}（${(
        expenseTowerLayout.savedRatio * 100
      ).toFixed(1)}%）`,
    };
  }, [expenseTowerLayout]);
```

- [ ] **Step 5: 改寫支出摘要 JSX**

搜尋 `<div className="expense-summary-value">`。改為把 `expense-summary-title` 與 `expense-summary-value` 一起包進 `.summary-hero-row` 的左欄，右欄放磚塔；`expense-income-progress` 內**刪除整個 `expense-income-segmented-track` div**（含 marker），並刪除 meta-left 裡的「前往設定收入」`<Button>`（磚塔的空狀態已提供）：

```jsx
                      <div className="summary-hero-row">
                        <div className="summary-hero-text">
                          <div className="expense-summary-title">
                            {/* …原本 expense-summary-title 的內容不變… */}
                          </div>
                          <div className="expense-summary-value">
                            {/* …原本的 expense-summary-value-main（Statistic + 走勢按鈕）不變… */}
                            {expenseSavedText ? (
                              <Text
                                className={`expense-saved-text${
                                  expenseSavedText.over ? " expense-saved-text--over" : ""
                                }`}
                              >
                                {expenseSavedText.text}
                              </Text>
                            ) : null}
                            <div className="expense-tower-legend">
                              <span><i className="expense-tower-swatch expense-tower-swatch--recurring" />定期</span>
                              <span><i className="expense-tower-swatch expense-tower-swatch--onetime" />單筆</span>
                              <span><i className="expense-tower-swatch expense-tower-swatch--saved" />存下</span>
                            </div>
                            {/* …原本的 expense-upcoming-note 條件區塊不變… */}
                            <div className="expense-income-progress">
                              <div className="expense-income-progress-meta-row">
                                <Text type="secondary" className="expense-income-progress-meta-left">
                                  {expenseIncomeProgressMetaLeftText}
                                </Text>
                                <Text type="secondary" className="expense-income-progress-meta-right">
                                  {expenseIncomeProgressMetaRightText}
                                </Text>
                              </div>
                            </div>
                            {/* …原本 cumulative 的 expense-summary-subtext 條件區塊不變… */}
                          </div>
                        </div>
                        <SavingsTower
                          incomeTwd={activeIncomeProgress?.denominator}
                          recurringTwd={activeIncomeProgress?.recurringNumerator}
                          oneTimeTwd={activeIncomeProgress?.oneTimeNumerator}
                          hasIncome={Boolean(activeIncomeProgress?.hasIncome)}
                          playKey={expensePlayKey}
                          onSetupIncome={goToIncomeSettings}
                        />
                      </div>
```

`<Segmented className="expense-summary-toggle" …>` 維持在 `.summary-hero-row` 之上不動。（同 Task 5：「不變」的註解處貼回原本元素，最後不要留下這些註解。）

然後執行：

```bash
grep -n "expenseRecurringDisplayPercent\|expenseOneTimeDisplayPercent\|expenseMarkerDisplayPercent\|expenseRateDisplayPercent\|showExpenseRateMarker\|expenseProgressAnimationRef\|latestExpenseProgressTargetsRef\|animateExpenseProgress\|stopExpenseProgressAnimation\|expenseRateMarker\|expenseRecurringSegmentPercent\|expenseOneTimeSegmentPercent\|expenseRateRawPercent\|showExpenseSegmentDivider\|expense-income-segment\|expense-rate-marker" src
```

Expected: 無輸出。

- [ ] **Step 6: CSS**

`src/App.css`：
1. 刪除所有 selector 以 `.expense-income-segmented-track`、`.expense-income-segment`、`.expense-rate-marker` 開頭的規則（含 media query 內的）。
2. 把 `.expense-income-progress` 規則中的 `width: min(520px, 92vw);` 改為 `width: 100%;`，`margin: 48px auto 0;` 改為 `margin: 8px 0 0;`（原本的 48px 是給舊 marker 標籤的空間）。
3. 把 `.expense-summary-value { text-align: center; }` 改為 `text-align: left;`。
4. 在 `.expense-summary-subtext` 規則後加入：

```css
.expense-saved-text {
  display: block;
  margin-top: 2px;
  font-size: 13px;
  font-weight: 600;
  color: var(--c-teal-ink);
  font-variant-numeric: tabular-nums;
}

.expense-saved-text--over {
  color: var(--c-down);
}

.expense-tower-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 6px;
  font-size: 11px;
  color: var(--c-muted);
}

.expense-tower-swatch {
  display: inline-block;
  width: 9px;
  height: 9px;
  margin-right: 4px;
  border-radius: 2px;
  vertical-align: -1px;
}

.expense-tower-swatch--recurring {
  background: var(--c-teal);
}

.expense-tower-swatch--onetime {
  background: #86c4b9;
}

.expense-tower-swatch--saved {
  background: linear-gradient(#f2cf6b, #d9a93a);
}
```

- [ ] **Step 7: 驗證**

Run: `npm test` → PASS；`npm run lint` → 無錯誤；`npm run build` → 成功。

- [ ] **Step 8: Commit**

```bash
git add src/App.jsx src/App.css
git commit -m "feat(expenses): replace income progress bar with savings tower

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: 瀏覽器實際驗證

**Files:** 無新增（驗證中發現問題才修改，修完補 commit）。

- [ ] **Step 1: 跑全套檢查**

Run: `npm test && npm run lint && npm run build`
Expected: 全部成功。

- [ ] **Step 2: 啟動 dev server 並在手機寬度檢查**

Run: `npm run dev`（背景執行），用瀏覽器開啟 dev URL，視窗寬度調為 390px。需要登入才看得到資料（若未登入，請使用者自行登入，不要代填帳密）。逐項確認：

- 資產頁：重新整理 → 水位先漲到昨日線、再走到今天；漲 / 跌斜紋顏色正確；「昨日」虛線 hover 顯示 `昨日23:59：NT$ …`；「距離 1000萬 還差 xxx萬」正確；主數字不換行；按「更新報價」→ 水位平滑移動（若 App 判斷需要重播則重播）。
- 支出頁（月份）：切到支出 tab → 金色塔疊起、依序扣磚（定期深青、單筆淺青）、最後顯示「存下 x.x 萬」與左側「存下 NT$ …（xx.x%）」。
- 新增一筆單筆支出 → 只有新扣的那幾塊掉落，不整座重建；刪除該筆 → 金磚補回。
- 切換「累計」與月份導覽 ←/→ → 整座重播。
- 若有收入未設定的月份：顯示虛線空塔與「設定收入」，點擊會捲到收入設定。
- macOS「減少動態效果」開啟後重新整理 → 無動畫，直接最終狀態。
- Console 無 error / warning（React key、SVG 屬性）。

- [ ] **Step 3: 若有修正，commit**

```bash
git add -A src
git commit -m "fix: polish jar/tower after in-browser review

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
