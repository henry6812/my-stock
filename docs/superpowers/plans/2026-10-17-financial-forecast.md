# 財務預估（Financial Forecast）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在資產頁「資產分析」列表加一列「財務預估」，點開全螢幕 sheet：以今日幣值逐月模擬全家總資產、標出財務自由年份、提供四個「如果…」旋鈕，所有假設可在 App 內編輯並同步到雲端。

**Architecture:** 計算全部是 `src/utils/forecast.js` 的純函式（設定正規化 / 驗證、起點、假設合併、逐月模擬、財務自由、文案）。設定存在 `app_config` 的 `forecast_settings` record 的 `forecast` 欄位，經 `getExpenseDashboardView` 跟收入設定一起載入；`useForecast` hook 用 App 已載入的持股、現金、收入、平均支出算結果並持有旋鈕 state；`src/components/forecast/` 的元件只負責畫。

**Tech Stack:** React 19、Ant Design 6（`Drawer`、`Segmented`、`Slider`、`InputNumber`、`Modal`）、Recharts 3、dayjs、`iconoir-react`、Vitest + `@testing-library/react`。

**Spec:** `docs/superpowers/specs/2026-10-17-financial-forecast-design.md`

## Global Constraints

- 所有回覆與 UI 文案用繁體中文（zh-TW）；工程術語、識別字保留英文。
- 所有 `npm` / `npx` 指令在 `my-stock/` 下執行。
- 全部金額以**今日幣值（實質 TWD）**計：`實質年報酬 = (1 + 名目) / (1 + 通膨) − 1`，`實質月報酬 = (1 + 實質年報酬)^(1/12) − 1`；收入與支出在實質金額下固定。
- 預設值：股票年報酬 6%、現金年利率 1%、通膨 2%、提領率 4%、預估年限 30 年；年限選項 10 / 20 / 30 / 40。
- 驗證範圍：股票年報酬與現金年利率 −20% ~ 30%、通膨 0% ~ 15%、提領率 1% ~ 10%、投資比例 0% ~ 100%、金額 ≥ 0。
- 每月支出自動值 = 過去 12 個**完整**月份（不含本月、不含第一筆支出所在的不完整月份）的平均，即既有 `averageMonthlyExpense`（`src/utils/savingsGoals.js`）。
- 投資比例自動值 = `股票 ÷ (股票 + 現金)`；總資產為 0 時 50%。
- 財務自由門檻 = `每月支出 × 12 ÷ 提領率`。
- 結餘為負時先扣現金、再扣股票，兩者以 0 為下限。
- 「如果…」旋鈕不存檔；關閉 sheet 即重設。
- 寫入需登入（`ensureCloudWritable`），雲端優先（`mirrorToCloud`）。
- UI 只用 token：CSS `var(--c-*)`、`var(--fs-*)`、`var(--radius-*)`、`var(--space-*)`、`var(--icon-*)`；JS 從 `src/theme/tokens.js` 取顏色。Recharts 刻度字級沿用既有圖表的 `fontSize: 11`。小字灰只用 `muted`。sheet 內只有一個 display 級數字（財務自由年份）。
- 不用 lint disable 註解繞過規則。
- `src/utils/` 被 scripts import 的檔案才需要 `.js` 副檔名；`forecast.js` 不被 scripts import，照一般 utils 寫法不帶副檔名。

## Review Focus

1. **完全沒有持股與現金（新使用者）** — 起點 0、投資比例 50%，曲線仍能從 0 依結餘成長，不出現 NaN。→ Task 2 測試 `getAutoInvestRatio` 與 `getForecastStartingPoint` 的空輸入；Task 1 測試從 0 起算。
2. **每月支出為 0（覆寫成 0）** — 門檻為 0，結論應是「已達財務自由門檻」而不是除以 0 的錯誤。→ Task 1 測試 `getFiThreshold` 支出 0 → 0，`findFiMonth` → 0。
3. **持股有報價缺漏（`latestValueTwd` 非數字）** — 該持股不計入股票總額、也不讓報酬 % 變 NaN。→ Task 2 測試。
4. **雲端存的設定被手動改壞 / 舊版欄位（字串、超出範圍、未知年限）** — 讀取時回到預設值，不讓畫面壞掉。→ Task 2 測試 `normalizeForecastSettings`。
5. **「如果…」把收入或支出減到負數** — 以 0 為下限，不產生負支出。→ Task 3 測試 `applyWhatIf`。

---

## File Structure

| 檔案 | 動作 | 職責 |
|---|---|---|
| `src/utils/forecast.js` | Create | 所有純計算與文案 |
| `src/utils/forecast.test.js` | Create | 上述純函式測試 |
| `src/services/firebase/firestoreMappers.js` | Modify | `app_config` 的 `forecast` 欄位雙向放行 |
| `src/services/firebase/firestoreMappers.test.js` | Modify | round-trip 測試 |
| `src/services/portfolioService.js` | Modify | `getForecastSettings` / `saveForecastSettings`；dashboard view 多回傳 `forecastSettings`、`averageMonthlyExpense` |
| `src/services/portfolioService.forecast.test.js` | Create | 設定讀寫、dashboard 欄位 |
| `src/hooks/useForecast.js` | Create | 組合起點 / 自動值 / 假設 / 結果；旋鈕與檢視年限 state |
| `src/hooks/useForecast.test.jsx` | Create | hook 測試 |
| `src/components/forecast/ForecastChart.jsx` | Create | 曲線圖 + 年限切換 |
| `src/components/forecast/ForecastWhatIf.jsx` | Create | 四個旋鈕 + 差異 + 重設 |
| `src/components/forecast/ForecastAssumptions.jsx` | Create | 假設列表 + 編輯 sheet / modal |
| `src/components/forecast/ForecastSheet.jsx` | Create | 全螢幕 sheet 組合 |
| `src/components/forecast/forecast.test.jsx` | Create | 元件 smoke tests |
| `src/App.jsx` | Modify | 資產分析新增一列、sheet、state 與儲存 handler |
| `src/App.css` | Modify | `.forecast-*` 樣式 |
| `DESIGN.md` | Modify | 資產分析列的圖示、forecast sheet 與圖表配色規範 |
| `CLAUDE.md` | Modify | UI 段落加一句 forecast 的位置 |

---

### Task 1: 核心模擬（實質報酬、逐月推算、財務自由）

**Files:**
- Create: `src/utils/forecast.js`
- Test: `src/utils/forecast.test.js`

**Interfaces:**
- Consumes: 無
- Produces:
  - `toRealMonthlyRate(nominalAnnual: number, inflation?: number): number`
  - `projectNetWorth({ stockTwd, cashTwd, assumptions, months, startMonth: 'YYYY-MM' }): Array<{ monthIndex, month: 'YYYY-MM', stockTwd, cashTwd, totalTwd }>`（長度 `months + 1`，含第 0 個月）
  - `getFiThreshold(assumptions): number | null`
  - `findFiMonth(series, thresholdTwd): number | null`
  - `runForecast({ stockTwd, cashTwd, assumptions, startMonth, horizonYears? }): { series, thresholdTwd, fiMonthIndex, fiMonth, endTotalTwd, horizonYears }`
  - `assumptions` 形狀（Task 2 的 `resolveForecastAssumptions` 產生）：`{ monthlyIncomeTwd, monthlyExpenseTwd, investRatio, stockReturn, cashReturn, inflation, withdrawalRate, horizonYears }`

- [ ] **Step 1: Write the failing tests**

建立 `src/utils/forecast.test.js`：

```js
import { describe, it, expect } from 'vitest'
import {
  findFiMonth,
  getFiThreshold,
  projectNetWorth,
  runForecast,
  toRealMonthlyRate,
} from './forecast'

// Zero returns and zero inflation: the curve is just the monthly surplus.
const flat = {
  monthlyIncomeTwd: 30,
  monthlyExpenseTwd: 10,
  investRatio: 0.75,
  stockReturn: 0,
  cashReturn: 0,
  inflation: 0,
  withdrawalRate: 0.04,
  horizonYears: 30,
}

// 1% a month, compounded: (1.01)^12 − 1.
const ONE_PERCENT_MONTHLY_ANNUAL = Math.pow(1.01, 12) - 1

describe('toRealMonthlyRate', () => {
  it('is zero when the nominal return equals inflation', () => {
    expect(toRealMonthlyRate(0.02, 0.02)).toBeCloseTo(0, 12)
  })

  it('compounds the annual rate down to a month', () => {
    expect(toRealMonthlyRate(ONE_PERCENT_MONTHLY_ANNUAL, 0)).toBeCloseTo(0.01, 12)
  })

  it('takes inflation out before converting', () => {
    // 1.071 / 1.02 = 1.05 → a 5% real year.
    expect(toRealMonthlyRate(0.071, 0.02)).toBeCloseTo(Math.pow(1.05, 1 / 12) - 1, 12)
  })
})

describe('projectNetWorth', () => {
  it('adds the surplus split by the invest ratio when returns are zero', () => {
    const series = projectNetWorth({
      stockTwd: 100,
      cashTwd: 50,
      assumptions: flat,
      months: 2,
      startMonth: '2026-10',
    })
    expect(series).toEqual([
      { monthIndex: 0, month: '2026-10', stockTwd: 100, cashTwd: 50, totalTwd: 150 },
      { monthIndex: 1, month: '2026-11', stockTwd: 115, cashTwd: 55, totalTwd: 170 },
      { monthIndex: 2, month: '2026-12', stockTwd: 130, cashTwd: 60, totalTwd: 190 },
    ])
  })

  it('grows each side by its own real return before adding the surplus', () => {
    const series = projectNetWorth({
      stockTwd: 1000,
      cashTwd: 1000,
      assumptions: {
        ...flat,
        monthlyIncomeTwd: 0,
        monthlyExpenseTwd: 0,
        stockReturn: ONE_PERCENT_MONTHLY_ANNUAL,
      },
      months: 1,
      startMonth: '2026-10',
    })
    expect(series[1].stockTwd).toBeCloseTo(1010, 6)
    expect(series[1].cashTwd).toBeCloseTo(1000, 6)
  })

  it('takes a deficit from cash first, then stock, never below zero', () => {
    const series = projectNetWorth({
      stockTwd: 100,
      cashTwd: 10,
      assumptions: { ...flat, monthlyIncomeTwd: 0, monthlyExpenseTwd: 30 },
      months: 5,
      startMonth: '2026-10',
    })
    expect(series.map((point) => [point.stockTwd, point.cashTwd])).toEqual([
      [100, 10],
      [80, 0],
      [50, 0],
      [20, 0],
      [0, 0],
      [0, 0],
    ])
  })

  it('grows from nothing when there are no assets yet', () => {
    const series = projectNetWorth({
      stockTwd: 0,
      cashTwd: 0,
      assumptions: { ...flat, investRatio: 0.5 },
      months: 1,
      startMonth: '2026-10',
    })
    expect(series[1]).toMatchObject({ stockTwd: 10, cashTwd: 10, totalTwd: 20 })
  })
})

describe('financial independence', () => {
  it('needs annual expense ÷ withdrawal rate', () => {
    expect(getFiThreshold({ monthlyExpenseTwd: 10000, withdrawalRate: 0.04 })).toBeCloseTo(3_000_000, 6)
  })

  it('needs nothing when there is no expense', () => {
    expect(getFiThreshold({ monthlyExpenseTwd: 0, withdrawalRate: 0.04 })).toBe(0)
  })

  it('has no threshold without an expense or a positive withdrawal rate', () => {
    expect(getFiThreshold({ monthlyExpenseTwd: null, withdrawalRate: 0.04 })).toBeNull()
    expect(getFiThreshold({ monthlyExpenseTwd: 100, withdrawalRate: 0 })).toBeNull()
  })

  it('finds the first month at or above the threshold', () => {
    const series = [{ totalTwd: 100 }, { totalTwd: 200 }, { totalTwd: 300 }]
    expect(findFiMonth(series, 200)).toBe(1)
    expect(findFiMonth(series, 50)).toBe(0)
    expect(findFiMonth(series, 0)).toBe(0)
    expect(findFiMonth(series, 1000)).toBeNull()
    expect(findFiMonth(series, null)).toBeNull()
  })
})

describe('runForecast', () => {
  it('projects horizonYears × 12 months and reports when FI is reached', () => {
    const result = runForecast({
      stockTwd: 0,
      cashTwd: 0,
      // Threshold 10 × 12 / 0.04 = 3000; +20 a month reaches it in month 150.
      assumptions: flat,
      startMonth: '2026-10',
      horizonYears: 20,
    })
    expect(result.series).toHaveLength(241)
    expect(result.series[12].month).toBe('2027-10')
    expect(result.thresholdTwd).toBeCloseTo(3000, 6)
    expect(result.fiMonthIndex).toBe(150)
    expect(result.fiMonth).toBe('2039-04')
    expect(result.endTotalTwd).toBe(240 * 20)
    expect(result.horizonYears).toBe(20)
  })

  it('falls back to the assumptions horizon and reports no FI month', () => {
    const result = runForecast({
      stockTwd: 0,
      cashTwd: 0,
      assumptions: { ...flat, horizonYears: 10 },
      startMonth: '2026-10',
    })
    expect(result.series).toHaveLength(121)
    expect(result.fiMonthIndex).toBeNull()
    expect(result.fiMonth).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/utils/forecast.test.js`
Expected: FAIL（`Failed to resolve import "./forecast"`）

- [ ] **Step 3: Write the implementation**

建立 `src/utils/forecast.js`：

```js
// 財務預估: pure math for the forecast sheet. Everything is in today's money
// (real TWD): returns are converted from nominal with the inflation rate, and
// income / expense stay flat because they are assumed to grow with inflation.
// Spec: docs/superpowers/specs/2026-10-17-financial-forecast-design.md
import dayjs from "dayjs";

export const toRealMonthlyRate = (nominalAnnual, inflation = 0) =>
  Math.pow(
    (1 + (Number(nominalAnnual) || 0)) / (1 + (Number(inflation) || 0)),
    1 / 12,
  ) - 1;

// Month 0 is today. Each month: both sides grow by their own real return,
// then the surplus is split by investRatio; a deficit comes out of cash
// first, then stock, and neither goes below zero.
export const projectNetWorth = ({
  stockTwd,
  cashTwd,
  assumptions,
  months,
  startMonth,
}) => {
  const stockRate = toRealMonthlyRate(assumptions.stockReturn, assumptions.inflation);
  const cashRate = toRealMonthlyRate(assumptions.cashReturn, assumptions.inflation);
  const surplus =
    (Number(assumptions.monthlyIncomeTwd) || 0) -
    (Number(assumptions.monthlyExpenseTwd) || 0);
  const ratio = Math.min(1, Math.max(0, Number(assumptions.investRatio) || 0));
  const start = dayjs(`${startMonth}-01`);

  let stock = Math.max(0, Number(stockTwd) || 0);
  let cash = Math.max(0, Number(cashTwd) || 0);
  const point = (monthIndex) => ({
    monthIndex,
    month: start.add(monthIndex, "month").format("YYYY-MM"),
    stockTwd: stock,
    cashTwd: cash,
    totalTwd: stock + cash,
  });

  const series = [point(0)];
  for (let monthIndex = 1; monthIndex <= months; monthIndex += 1) {
    stock *= 1 + stockRate;
    cash *= 1 + cashRate;
    if (surplus >= 0) {
      stock += surplus * ratio;
      cash += surplus * (1 - ratio);
    } else {
      const fromCash = Math.min(cash, -surplus);
      cash -= fromCash;
      stock = Math.max(0, stock - (-surplus - fromCash));
    }
    series.push(point(monthIndex));
  }
  return series;
};

// Annual expense ÷ withdrawal rate; null when either is unknown.
export const getFiThreshold = ({ monthlyExpenseTwd, withdrawalRate } = {}) => {
  if (monthlyExpenseTwd === null || monthlyExpenseTwd === undefined) return null;
  const expense = Number(monthlyExpenseTwd);
  const rate = Number(withdrawalRate);
  if (!Number.isFinite(expense) || expense < 0) return null;
  if (!Number.isFinite(rate) || rate <= 0) return null;
  return (expense * 12) / rate;
};

export const findFiMonth = (series = [], thresholdTwd) => {
  if (thresholdTwd === null || thresholdTwd === undefined) return null;
  const index = series.findIndex((point) => point.totalTwd >= thresholdTwd);
  return index < 0 ? null : index;
};

export const runForecast = ({
  stockTwd,
  cashTwd,
  assumptions,
  startMonth,
  horizonYears,
}) => {
  const years = horizonYears ?? assumptions.horizonYears;
  const series = projectNetWorth({
    stockTwd,
    cashTwd,
    assumptions,
    months: years * 12,
    startMonth,
  });
  const thresholdTwd = getFiThreshold(assumptions);
  const fiMonthIndex = findFiMonth(series, thresholdTwd);
  return {
    series,
    thresholdTwd,
    fiMonthIndex,
    fiMonth: fiMonthIndex === null ? null : series[fiMonthIndex].month,
    endTotalTwd: series[series.length - 1].totalTwd,
    horizonYears: years,
  };
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/utils/forecast.test.js`
Expected: PASS（全部）

- [ ] **Step 5: Lint and commit**

```bash
npx eslint src/utils/forecast.js src/utils/forecast.test.js
git add src/utils/forecast.js src/utils/forecast.test.js
git commit -m "feat(forecast): add monthly net-worth projection and FI threshold"
```

---

### Task 2: 設定與假設（預設、正規化、驗證、起點、合併）

**Files:**
- Modify: `src/utils/forecast.js`
- Test: `src/utils/forecast.test.js`

**Interfaces:**
- Consumes: Task 1 的 `assumptions` 形狀
- Produces:
  - `FORECAST_HORIZONS: number[]`（`[10, 20, 30, 40]`）
  - `FORECAST_DEFAULTS: { monthlyIncomeTwd: null, monthlyExpenseTwd: null, investRatio: null, stockReturn: 0.06, cashReturn: 0.01, inflation: 0.02, withdrawalRate: 0.04, horizonYears: 30 }`
  - `FORECAST_LIMITS: Record<'stockReturn'|'cashReturn'|'inflation'|'withdrawalRate'|'investRatio', { min, max, label }>`
  - `normalizeForecastSettings(raw): ForecastSettings`（永遠回傳完整物件）
  - `validateForecastSettings(settings): void`（不合法時 throw `Error`，訊息為 zh-TW）
  - `getForecastStartingPoint({ rows, cashRows }): { stockTwd, cashTwd, holdingsReturn: number | null, unsetCostCount }`
  - `getAutoInvestRatio({ stockTwd, cashTwd }): number`
  - `resolveForecastAssumptions({ settings, auto }): Assumptions & { sources: { monthlyIncomeTwd, monthlyExpenseTwd, investRatio }: 'auto'|'custom', isComplete: boolean }`；`auto = { monthlyIncomeTwd: number|null, monthlyExpenseTwd: number|null, investRatio: number }`

- [ ] **Step 1: Write the failing tests**

在 `src/utils/forecast.test.js` 的 import 加上 `FORECAST_DEFAULTS, getAutoInvestRatio, getForecastStartingPoint, normalizeForecastSettings, resolveForecastAssumptions, validateForecastSettings`，並在檔尾加：

```js
describe('normalizeForecastSettings', () => {
  it('fills every field with its default when nothing is stored', () => {
    expect(normalizeForecastSettings(null)).toEqual(FORECAST_DEFAULTS)
    expect(normalizeForecastSettings(undefined)).toEqual(FORECAST_DEFAULTS)
  })

  it('keeps valid values and rounds amounts to whole TWD', () => {
    expect(
      normalizeForecastSettings({
        monthlyIncomeTwd: 80000.4,
        monthlyExpenseTwd: 0,
        investRatio: 0.6,
        stockReturn: 0.08,
        cashReturn: 0.015,
        inflation: 0.025,
        withdrawalRate: 0.035,
        horizonYears: 40,
      }),
    ).toEqual({
      monthlyIncomeTwd: 80000,
      monthlyExpenseTwd: 0,
      investRatio: 0.6,
      stockReturn: 0.08,
      cashReturn: 0.015,
      inflation: 0.025,
      withdrawalRate: 0.035,
      horizonYears: 40,
    })
  })

  it('drops broken or out-of-range values back to their defaults', () => {
    expect(
      normalizeForecastSettings({
        monthlyIncomeTwd: 'abc',
        monthlyExpenseTwd: -5,
        investRatio: 1.5,
        stockReturn: 0.9,
        cashReturn: 'x',
        inflation: -0.01,
        withdrawalRate: 0,
        horizonYears: 25,
      }),
    ).toEqual(FORECAST_DEFAULTS)
  })

  it('reads numeric strings', () => {
    expect(normalizeForecastSettings({ stockReturn: '0.05' }).stockReturn).toBe(0.05)
  })
})

describe('validateForecastSettings', () => {
  const valid = { ...FORECAST_DEFAULTS }

  it('accepts the defaults and null amounts / ratio', () => {
    expect(() => validateForecastSettings(valid)).not.toThrow()
  })

  it('accepts the range edges', () => {
    expect(() =>
      validateForecastSettings({ ...valid, stockReturn: -0.2, cashReturn: 0.3, inflation: 0, withdrawalRate: 0.1, investRatio: 1 }),
    ).not.toThrow()
  })

  it('rejects a rate out of range with its label', () => {
    expect(() => validateForecastSettings({ ...valid, stockReturn: 0.31 })).toThrow('股票年報酬需介於 -20% 到 30%')
    expect(() => validateForecastSettings({ ...valid, cashReturn: -0.21 })).toThrow('現金年利率需介於 -20% 到 30%')
    expect(() => validateForecastSettings({ ...valid, inflation: 0.16 })).toThrow('通膨率需介於 0% 到 15%')
    expect(() => validateForecastSettings({ ...valid, withdrawalRate: 0.005 })).toThrow('提領率需介於 1% 到 10%')
    expect(() => validateForecastSettings({ ...valid, investRatio: -0.1 })).toThrow('新存款投資比例需介於 0% 到 100%')
  })

  it('rejects a missing rate', () => {
    expect(() => validateForecastSettings({ ...valid, inflation: null })).toThrow('請輸入通膨率')
  })

  it('rejects negative amounts', () => {
    expect(() => validateForecastSettings({ ...valid, monthlyIncomeTwd: -1 })).toThrow('每月收入不能小於 0')
    expect(() => validateForecastSettings({ ...valid, monthlyExpenseTwd: -1 })).toThrow('每月支出不能小於 0')
  })

  it('rejects an unknown horizon', () => {
    expect(() => validateForecastSettings({ ...valid, horizonYears: 25 })).toThrow('預估年限只能是 10、20、30 或 40 年')
  })
})

describe('getForecastStartingPoint', () => {
  it('sums holdings and cash, and the return of holdings with a cost', () => {
    const start = getForecastStartingPoint({
      rows: [
        { market: 'TW', latestValueTwd: 1200, totalCost: 1000 },
        // 30 USD of cost at 32 → 960 TWD.
        { market: 'US', latestValueTwd: 1040, totalCost: 30, fxRateToTwd: 32 },
        { market: 'TW', latestValueTwd: 500, totalCost: null },
      ],
      cashRows: [{ balanceTwd: 300 }, { balanceTwd: 200 }],
    })
    expect(start.stockTwd).toBe(2740)
    expect(start.cashTwd).toBe(500)
    // (1200 + 1040 − 1000 − 960) / (1000 + 960)
    expect(start.holdingsReturn).toBeCloseTo(280 / 1960, 12)
    expect(start.unsetCostCount).toBe(1)
  })

  it('skips holdings without a price', () => {
    const start = getForecastStartingPoint({
      rows: [
        { market: 'TW', latestValueTwd: undefined, totalCost: 100 },
        { market: 'TW', latestValueTwd: 110, totalCost: 100 },
      ],
      cashRows: [],
    })
    expect(start.stockTwd).toBe(110)
    expect(start.holdingsReturn).toBeCloseTo(0.1, 12)
  })

  it('is all zero with no return when there is nothing yet', () => {
    expect(getForecastStartingPoint({ rows: [], cashRows: [] })).toEqual({
      stockTwd: 0,
      cashTwd: 0,
      holdingsReturn: null,
      unsetCostCount: 0,
    })
    expect(getForecastStartingPoint()).toEqual({
      stockTwd: 0,
      cashTwd: 0,
      holdingsReturn: null,
      unsetCostCount: 0,
    })
  })
})

describe('getAutoInvestRatio', () => {
  it('is the current stock share', () => {
    expect(getAutoInvestRatio({ stockTwd: 300, cashTwd: 100 })).toBe(0.75)
  })

  it('is half when there are no assets', () => {
    expect(getAutoInvestRatio({ stockTwd: 0, cashTwd: 0 })).toBe(0.5)
  })
})

describe('resolveForecastAssumptions', () => {
  const auto = { monthlyIncomeTwd: 90000, monthlyExpenseTwd: 60000, investRatio: 0.7 }

  it('uses the automatic values when nothing is overridden', () => {
    const resolved = resolveForecastAssumptions({ settings: null, auto })
    expect(resolved).toEqual({
      monthlyIncomeTwd: 90000,
      monthlyExpenseTwd: 60000,
      investRatio: 0.7,
      stockReturn: 0.06,
      cashReturn: 0.01,
      inflation: 0.02,
      withdrawalRate: 0.04,
      horizonYears: 30,
      sources: { monthlyIncomeTwd: 'auto', monthlyExpenseTwd: 'auto', investRatio: 'auto' },
      isComplete: true,
    })
  })

  it('prefers overrides, including a zero expense', () => {
    const resolved = resolveForecastAssumptions({
      settings: { monthlyExpenseTwd: 0, investRatio: 1, stockReturn: 0.05 },
      auto,
    })
    expect(resolved.monthlyExpenseTwd).toBe(0)
    expect(resolved.investRatio).toBe(1)
    expect(resolved.stockReturn).toBe(0.05)
    expect(resolved.sources).toEqual({
      monthlyIncomeTwd: 'auto',
      monthlyExpenseTwd: 'custom',
      investRatio: 'custom',
    })
  })

  it('is incomplete without an income or an expense', () => {
    expect(
      resolveForecastAssumptions({ settings: null, auto: { ...auto, monthlyIncomeTwd: null } }).isComplete,
    ).toBe(false)
    expect(
      resolveForecastAssumptions({ settings: null, auto: { ...auto, monthlyExpenseTwd: null } }).isComplete,
    ).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/utils/forecast.test.js`
Expected: FAIL（新 import 的函式為 `undefined`，例如 `normalizeForecastSettings is not a function`）

- [ ] **Step 3: Write the implementation**

在 `src/utils/forecast.js` 頂端 import 下加：

```js
import { normalizeTotalCost } from "./holdingShares";
```

並在檔案中（`toRealMonthlyRate` 之前）加入：

```js
export const FORECAST_HORIZONS = [10, 20, 30, 40];

// null amounts / ratio mean "use the automatic value".
export const FORECAST_DEFAULTS = {
  monthlyIncomeTwd: null,
  monthlyExpenseTwd: null,
  investRatio: null,
  stockReturn: 0.06,
  cashReturn: 0.01,
  inflation: 0.02,
  withdrawalRate: 0.04,
  horizonYears: 30,
};

export const FORECAST_LIMITS = {
  stockReturn: { min: -0.2, max: 0.3, label: "股票年報酬" },
  cashReturn: { min: -0.2, max: 0.3, label: "現金年利率" },
  inflation: { min: 0, max: 0.15, label: "通膨率" },
  withdrawalRate: { min: 0.01, max: 0.1, label: "提領率" },
  investRatio: { min: 0, max: 1, label: "新存款投資比例" },
};

const RATE_KEYS = ["stockReturn", "cashReturn", "inflation", "withdrawalRate"];
const AMOUNT_LABELS = {
  monthlyIncomeTwd: "每月收入",
  monthlyExpenseTwd: "每月支出",
};

const toFiniteOrNull = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const inRange = (value, { min, max }) => value >= min && value <= max;

const formatLimitPercent = (value) => `${Math.round(value * 100)}%`;

// Whatever is stored (or nothing) → a complete settings object; a missing,
// broken or out-of-range value falls back to its default.
export const normalizeForecastSettings = (raw) => {
  const source = raw && typeof raw === "object" ? raw : {};
  const next = { ...FORECAST_DEFAULTS };
  for (const key of Object.keys(AMOUNT_LABELS)) {
    const value = toFiniteOrNull(source[key]);
    next[key] = value !== null && value >= 0 ? Math.round(value) : null;
  }
  const ratio = toFiniteOrNull(source.investRatio);
  next.investRatio =
    ratio !== null && inRange(ratio, FORECAST_LIMITS.investRatio) ? ratio : null;
  for (const key of RATE_KEYS) {
    const value = toFiniteOrNull(source[key]);
    if (value !== null && inRange(value, FORECAST_LIMITS[key])) next[key] = value;
  }
  const horizon = Number(source.horizonYears);
  if (FORECAST_HORIZONS.includes(horizon)) next.horizonYears = horizon;
  return next;
};

// A save must not store what normalize would silently drop: throw instead.
export const validateForecastSettings = (settings = {}) => {
  for (const [key, label] of Object.entries(AMOUNT_LABELS)) {
    const raw = settings[key];
    if (raw === null || raw === undefined) continue;
    const value = toFiniteOrNull(raw);
    if (value === null || value < 0) throw new Error(`${label}不能小於 0`);
  }
  for (const key of [...RATE_KEYS, "investRatio"]) {
    const limit = FORECAST_LIMITS[key];
    const raw = settings[key];
    if (raw === null || raw === undefined) {
      if (key === "investRatio") continue;
      throw new Error(`請輸入${limit.label}`);
    }
    const value = toFiniteOrNull(raw);
    if (value === null || !inRange(value, limit)) {
      throw new Error(
        `${limit.label}需介於 ${formatLimitPercent(limit.min)} 到 ${formatLimitPercent(limit.max)}`,
      );
    }
  }
  if (
    settings.horizonYears !== undefined &&
    !FORECAST_HORIZONS.includes(Number(settings.horizonYears))
  ) {
    throw new Error("預估年限只能是 10、20、30 或 40 年");
  }
};

// Today's stock and cash, plus the cumulative return of the holdings that
// have a cost (not annualised: holdings carry no purchase date). A holding
// without a price is left out; one without a cost (or a US one without a
// rate) counts toward the stock total but not the return.
export const getForecastStartingPoint = ({ rows = [], cashRows = [] } = {}) => {
  let stockTwd = 0;
  let valueWithCostTwd = 0;
  let costTwd = 0;
  let unsetCostCount = 0;
  for (const row of rows ?? []) {
    const valueTwd = Number(row?.latestValueTwd);
    if (row?.latestValueTwd === null || !Number.isFinite(valueTwd)) continue;
    stockTwd += valueTwd;
    const cost = normalizeTotalCost(row.totalCost);
    const rate = row.market === "US" ? Number(row.fxRateToTwd) : 1;
    if (cost === null || !Number.isFinite(rate)) {
      unsetCostCount += 1;
      continue;
    }
    valueWithCostTwd += valueTwd;
    costTwd += cost * rate;
  }
  const cashTwd = (cashRows ?? []).reduce(
    (sum, row) => sum + (Number(row?.balanceTwd) || 0),
    0,
  );
  return {
    stockTwd,
    cashTwd,
    holdingsReturn: costTwd > 0 ? (valueWithCostTwd - costTwd) / costTwd : null,
    unsetCostCount,
  };
};

export const getAutoInvestRatio = ({ stockTwd, cashTwd }) => {
  const stock = Math.max(0, Number(stockTwd) || 0);
  const total = stock + Math.max(0, Number(cashTwd) || 0);
  return total > 0 ? stock / total : 0.5;
};

// Settings + automatic values → the assumptions the projection runs on.
// `sources` says which of the three automatic fields were overridden.
export const resolveForecastAssumptions = ({ settings, auto = {} }) => {
  const normalized = normalizeForecastSettings(settings);
  const pick = (key) =>
    normalized[key] !== null
      ? { value: normalized[key], source: "custom" }
      : { value: auto[key] ?? null, source: "auto" };
  const income = pick("monthlyIncomeTwd");
  const expense = pick("monthlyExpenseTwd");
  const ratio = pick("investRatio");
  return {
    monthlyIncomeTwd: income.value,
    monthlyExpenseTwd: expense.value,
    investRatio: ratio.value ?? 0.5,
    stockReturn: normalized.stockReturn,
    cashReturn: normalized.cashReturn,
    inflation: normalized.inflation,
    withdrawalRate: normalized.withdrawalRate,
    horizonYears: normalized.horizonYears,
    sources: {
      monthlyIncomeTwd: income.source,
      monthlyExpenseTwd: expense.source,
      investRatio: ratio.source,
    },
    isComplete: income.value !== null && expense.value !== null,
  };
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/utils/forecast.test.js`
Expected: PASS（全部，含 Task 1）

- [ ] **Step 5: Lint and commit**

```bash
npx eslint src/utils/forecast.js src/utils/forecast.test.js
git add src/utils/forecast.js src/utils/forecast.test.js
git commit -m "feat(forecast): add settings normalization, validation and assumptions"
```

---

### Task 3: 「如果…」與文案

**Files:**
- Modify: `src/utils/forecast.js`
- Test: `src/utils/forecast.test.js`

**Interfaces:**
- Consumes: Task 1 `runForecast` 的結果形狀；Task 2 的 assumptions
- Produces:
  - `DEFAULT_WHAT_IF: { expenseDeltaTwd: 0, incomeDeltaTwd: 0, investRatio: null, stockReturn: null }`
  - `applyWhatIf(assumptions, knobs): assumptions`
  - `isWhatIfActive(assumptions, knobs): boolean`
  - `getWhatIfAmountRange(amountTwd): number`（旋鈕的 ± 範圍）
  - `FORECAST_INCOMPLETE_TEXT: string`
  - `describeFiResult(result | null): string`
  - `getFiHeadline(result): string`（sheet 的 display 數字：`'2041 年'` / `'已達成'` / `'未達'`）
  - `describeWhatIfDiff(base, alt): string`
  - `buildForecastChartData({ base, whatIf }): Array<{ yearsFromNow, year, stockTwd, cashTwd, totalTwd, whatIfTotalTwd: number|null }>`

- [ ] **Step 1: Write the failing tests**

在 `src/utils/forecast.test.js` 的 import 加上 `applyWhatIf, buildForecastChartData, DEFAULT_WHAT_IF, describeFiResult, describeWhatIfDiff, FORECAST_INCOMPLETE_TEXT, getFiHeadline, getWhatIfAmountRange, isWhatIfActive`，並 `import { formatTwd } from './formatters'`，在檔尾加：

```js
describe('what-if', () => {
  const base = { ...flat, monthlyIncomeTwd: 90000, monthlyExpenseTwd: 60000, investRatio: 0.7, stockReturn: 0.06 }

  it('leaves the assumptions alone with the default knobs', () => {
    expect(applyWhatIf(base, DEFAULT_WHAT_IF)).toEqual(base)
    expect(isWhatIfActive(base, DEFAULT_WHAT_IF)).toBe(false)
  })

  it('adds the deltas and replaces the ratio and return', () => {
    const knobs = { expenseDeltaTwd: -5000, incomeDeltaTwd: 2000, investRatio: 0.9, stockReturn: 0.08 }
    expect(applyWhatIf(base, knobs)).toMatchObject({
      monthlyIncomeTwd: 92000,
      monthlyExpenseTwd: 55000,
      investRatio: 0.9,
      stockReturn: 0.08,
    })
    expect(isWhatIfActive(base, knobs)).toBe(true)
  })

  it('never takes income or expense below zero', () => {
    const applied = applyWhatIf(base, { ...DEFAULT_WHAT_IF, expenseDeltaTwd: -70000, incomeDeltaTwd: -100000 })
    expect(applied.monthlyExpenseTwd).toBe(0)
    expect(applied.monthlyIncomeTwd).toBe(0)
  })

  it('is inactive when a knob is set back to the base value', () => {
    expect(isWhatIfActive(base, { ...DEFAULT_WHAT_IF, investRatio: 0.7, stockReturn: 6 / 100 })).toBe(false)
  })

  it('ranges the amount knobs over half the base, at least 10,000', () => {
    expect(getWhatIfAmountRange(60000)).toBe(30000)
    expect(getWhatIfAmountRange(61000)).toBe(31000)
    expect(getWhatIfAmountRange(5000)).toBe(10000)
    expect(getWhatIfAmountRange(null)).toBe(10000)
  })
})

describe('forecast copy', () => {
  const result = (fiMonthIndex, fiMonth = null) => ({ fiMonthIndex, fiMonth, horizonYears: 30, endTotalTwd: 0 })

  it('describes the FI result', () => {
    expect(describeFiResult(null)).toBe(FORECAST_INCOMPLETE_TEXT)
    expect(FORECAST_INCOMPLETE_TEXT).toBe('設定每月收入與支出以開始預估')
    expect(describeFiResult(result(0, '2026-10'))).toBe('已達財務自由門檻')
    expect(describeFiResult(result(180, '2041-10'))).toBe('照目前步調，2041 年可財務自由（約 15 年後）')
    expect(describeFiResult(result(5, '2027-03'))).toBe('照目前步調，2027 年可財務自由（約 5 個月後）')
    expect(describeFiResult(result(null))).toBe('30 年內未達財務自由')
  })

  it('heads the sheet with the FI year', () => {
    expect(getFiHeadline(result(0, '2026-10'))).toBe('已達成')
    expect(getFiHeadline(result(180, '2041-10'))).toBe('2041 年')
    expect(getFiHeadline(result(null))).toBe('未達')
  })

  it('describes how the what-if line differs', () => {
    const base = { fiMonthIndex: 180, fiMonth: '2041-10', horizonYears: 30, endTotalTwd: 10_000_000 }
    expect(
      describeWhatIfDiff(base, { ...base, fiMonthIndex: 144, fiMonth: '2038-10', endTotalTwd: 14_800_000 }),
    ).toBe(`財務自由提早 3 年 · 30 年後多 ${formatTwd(4_800_000, true)}`)
    expect(
      describeWhatIfDiff(base, { ...base, fiMonthIndex: 186, fiMonth: '2042-04', endTotalTwd: 9_000_000 }),
    ).toBe(`財務自由延後 6 個月 · 30 年後少 ${formatTwd(1_000_000, true)}`)
    expect(describeWhatIfDiff(base, { ...base })).toBe('跟目前步調一樣')
  })

  it('describes reaching or losing FI within the horizon', () => {
    const never = { fiMonthIndex: null, fiMonth: null, horizonYears: 30, endTotalTwd: 100 }
    const reached = { fiMonthIndex: 300, fiMonth: '2051-10', horizonYears: 30, endTotalTwd: 100 }
    expect(describeWhatIfDiff(never, reached)).toBe('變成 2051 年可財務自由')
    expect(describeWhatIfDiff(reached, never)).toBe('變成 30 年內未達財務自由')
  })
})

describe('buildForecastChartData', () => {
  it('keeps one point a year and lines up the what-if total', () => {
    const base = runForecast({ stockTwd: 0, cashTwd: 0, assumptions: flat, startMonth: '2026-10', horizonYears: 2 })
    const whatIf = runForecast({
      stockTwd: 0,
      cashTwd: 0,
      assumptions: { ...flat, monthlyIncomeTwd: 40 },
      startMonth: '2026-10',
      horizonYears: 2,
    })
    expect(buildForecastChartData({ base })).toEqual([
      { yearsFromNow: 0, year: 2026, stockTwd: 0, cashTwd: 0, totalTwd: 0, whatIfTotalTwd: null },
      { yearsFromNow: 1, year: 2027, stockTwd: 180, cashTwd: 60, totalTwd: 240, whatIfTotalTwd: null },
      { yearsFromNow: 2, year: 2028, stockTwd: 360, cashTwd: 120, totalTwd: 480, whatIfTotalTwd: null },
    ])
    expect(buildForecastChartData({ base, whatIf }).map((point) => point.whatIfTotalTwd)).toEqual([0, 360, 720])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/utils/forecast.test.js`
Expected: FAIL（`applyWhatIf is not a function` 等）

- [ ] **Step 3: Write the implementation**

在 `src/utils/forecast.js` import 區加 `import { formatTwd } from "./formatters";`，檔尾加：

```js
export const DEFAULT_WHAT_IF = {
  expenseDeltaTwd: 0,
  incomeDeltaTwd: 0,
  investRatio: null,
  stockReturn: null,
};

const EPS = 1e-9;

export const applyWhatIf = (assumptions, knobs = DEFAULT_WHAT_IF) => ({
  ...assumptions,
  monthlyIncomeTwd: Math.max(
    0,
    (Number(assumptions.monthlyIncomeTwd) || 0) + (Number(knobs.incomeDeltaTwd) || 0),
  ),
  monthlyExpenseTwd: Math.max(
    0,
    (Number(assumptions.monthlyExpenseTwd) || 0) + (Number(knobs.expenseDeltaTwd) || 0),
  ),
  investRatio: knobs.investRatio ?? assumptions.investRatio,
  stockReturn: knobs.stockReturn ?? assumptions.stockReturn,
});

const differs = (knobValue, baseValue) =>
  knobValue !== null &&
  knobValue !== undefined &&
  Math.abs(Number(knobValue) - Number(baseValue)) > EPS;

export const isWhatIfActive = (assumptions, knobs = DEFAULT_WHAT_IF) =>
  (Number(knobs.expenseDeltaTwd) || 0) !== 0 ||
  (Number(knobs.incomeDeltaTwd) || 0) !== 0 ||
  differs(knobs.investRatio, assumptions.investRatio) ||
  differs(knobs.stockReturn, assumptions.stockReturn);

// ± range of the income / expense knobs: half the base, in whole thousands,
// at least 10,000.
export const getWhatIfAmountRange = (amountTwd) =>
  Math.max(10000, Math.round(((Number(amountTwd) || 0) * 0.5) / 1000) * 1000);

export const FORECAST_INCOMPLETE_TEXT = "設定每月收入與支出以開始預估";

const describeSpan = (months) =>
  months >= 12 ? `${Math.round(months / 12)} 年` : `${months} 個月`;

const fiYear = (result) => result.fiMonth.slice(0, 4);

export const describeFiResult = (result) => {
  if (!result) return FORECAST_INCOMPLETE_TEXT;
  if (result.fiMonthIndex === null) return `${result.horizonYears} 年內未達財務自由`;
  if (result.fiMonthIndex === 0) return "已達財務自由門檻";
  return `照目前步調，${fiYear(result)} 年可財務自由（約 ${describeSpan(result.fiMonthIndex)}後）`;
};

export const getFiHeadline = (result) => {
  if (result.fiMonthIndex === null) return "未達";
  if (result.fiMonthIndex === 0) return "已達成";
  return `${fiYear(result)} 年`;
};

export const describeWhatIfDiff = (base, alt) => {
  const parts = [];
  if (base.fiMonthIndex !== null && alt.fiMonthIndex !== null) {
    const diff = base.fiMonthIndex - alt.fiMonthIndex;
    if (diff !== 0) {
      parts.push(`財務自由${diff > 0 ? "提早" : "延後"} ${describeSpan(Math.abs(diff))}`);
    }
  } else if (alt.fiMonthIndex !== null) {
    parts.push(
      alt.fiMonthIndex === 0 ? "變成已達財務自由門檻" : `變成 ${fiYear(alt)} 年可財務自由`,
    );
  } else if (base.fiMonthIndex !== null) {
    parts.push(`變成 ${alt.horizonYears} 年內未達財務自由`);
  }
  const delta = alt.endTotalTwd - base.endTotalTwd;
  if (Math.abs(delta) >= 1) {
    parts.push(
      `${alt.horizonYears} 年後${delta > 0 ? "多" : "少"} ${formatTwd(Math.abs(delta), true)}`,
    );
  }
  return parts.length ? parts.join(" · ") : "跟目前步調一樣";
};

// One point a year (month 0, 12, 24…) for the chart.
export const buildForecastChartData = ({ base, whatIf = null }) =>
  base.series
    .filter((point) => point.monthIndex % 12 === 0)
    .map((point) => ({
      yearsFromNow: point.monthIndex / 12,
      year: Number(point.month.slice(0, 4)),
      stockTwd: point.stockTwd,
      cashTwd: point.cashTwd,
      totalTwd: point.totalTwd,
      whatIfTotalTwd: whatIf ? whatIf.series[point.monthIndex].totalTwd : null,
    }));
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/utils/forecast.test.js`
Expected: PASS（全部）

- [ ] **Step 5: Lint and commit**

```bash
npx eslint src/utils/forecast.js src/utils/forecast.test.js
git add src/utils/forecast.js src/utils/forecast.test.js
git commit -m "feat(forecast): add what-if knobs, copy and chart data"
```

---

### Task 4: 雲端同步 — mapper 與設定讀寫、dashboard 欄位

**Files:**
- Modify: `src/services/firebase/firestoreMappers.js:254-273`（`appConfigToRemote`）、`:477-493`（`remoteToAppConfig`）
- Modify: `src/services/firebase/firestoreMappers.test.js`（檔尾）
- Modify: `src/services/portfolioService.js`（`saveScreenSettings` 之後新增 forecast 函式；`getExpenseDashboardView` 回傳物件）
- Create: `src/services/portfolioService.forecast.test.js`

**Interfaces:**
- Consumes: Task 2 的 `normalizeForecastSettings`、`validateForecastSettings`；既有 `averageMonthlyExpense`（`src/utils/savingsGoals.js`，回傳 `{ averageTwd: number|null, monthsUsed: number }`）
- Produces:
  - `getForecastSettings(): Promise<ForecastSettings>`
  - `saveForecastSettings(patch: Partial<ForecastSettings>): Promise<ForecastSettings>`（未登入時 throw，驗證失敗時 throw zh-TW 訊息）
  - `getExpenseDashboardView()` 回傳多兩個欄位：`forecastSettings: ForecastSettings`、`averageMonthlyExpense: { averageTwd, monthsUsed }`（既有 `savingsGoalAverageMonthlyExpenseTwd` 保留，值改為 `averageMonthlyExpense.averageTwd`）

- [ ] **Step 1: Write the failing mapper test**

在 `src/services/firebase/firestoreMappers.test.js` 檔尾加：

```js
describe('app_config forecast settings', () => {
  it('round-trips the forecast map', () => {
    const forecast = {
      monthlyIncomeTwd: null,
      monthlyExpenseTwd: 60000,
      investRatio: null,
      stockReturn: 0.06,
      cashReturn: 0.01,
      inflation: 0.02,
      withdrawalRate: 0.04,
      horizonYears: 30,
    }
    const remote = appConfigToRemote({ key: 'forecast_settings', forecast, updatedAt: '2026-10-17T00:00:00.000Z' })
    expect(remote.forecast).toEqual(forecast)
    expect(remoteToAppConfig(remote).forecast).toEqual(forecast)
    expect(appConfigToRemote({ key: 'x', updatedAt: 't' })).not.toHaveProperty('forecast')
  })
})
```

- [ ] **Step 2: Write the failing service tests**

建立 `src/services/portfolioService.forecast.test.js`：

```js
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('./firebase/cloudSyncService', async (importOriginal) => ({
  ...(await importOriginal()),
  assertCloudWriteReady: vi.fn(),
  writeCollectionRecord: vi.fn(),
}))

import { db } from '../db/database'
import { assertCloudWriteReady, writeCollectionRecord } from './firebase/cloudSyncService'
import { getExpenseDashboardView, getForecastSettings, saveForecastSettings } from './portfolioService'
import { FORECAST_DEFAULTS } from '../utils/forecast'

const TODAY = new Date('2026-10-04T10:00:00+08:00')
let clock = TODAY.getTime()
const tick = () => {
  clock += 1000
  vi.setSystemTime(clock)
}

const expense = (name, amountTwd, occurredAt) => ({
  name,
  amountTwd,
  occurredAt,
  entryType: 'ONE_TIME',
  payer: null,
  expenseKind: null,
  categoryId: null,
  deletedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
})

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  clock = TODAY.getTime()
  vi.setSystemTime(clock)
  await db.app_config.clear()
  await db.expense_entries.clear()
  await db.budgets.clear()
  await db.expense_categories.clear()
  await db.expense_templates.clear()
  writeCollectionRecord.mockReset()
  assertCloudWriteReady.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('forecast settings', () => {
  it('reads the defaults when nothing is stored', async () => {
    expect(await getForecastSettings()).toEqual(FORECAST_DEFAULTS)
  })

  it('merges a patch, mirrors it and reads it back', async () => {
    tick()
    await saveForecastSettings({ stockReturn: 0.07, monthlyExpenseTwd: 55000 })
    expect(writeCollectionRecord.mock.calls[0][0]).toMatchObject({
      collectionName: 'app_config',
      record: { key: 'forecast_settings', forecast: { stockReturn: 0.07, monthlyExpenseTwd: 55000 } },
    })
    tick()
    await saveForecastSettings({ horizonYears: 40 })
    expect(await getForecastSettings()).toEqual({
      ...FORECAST_DEFAULTS,
      stockReturn: 0.07,
      monthlyExpenseTwd: 55000,
      horizonYears: 40,
    })
  })

  it('puts an automatic value back with null', async () => {
    tick()
    await saveForecastSettings({ monthlyExpenseTwd: 55000 })
    tick()
    await saveForecastSettings({ monthlyExpenseTwd: null })
    expect((await getForecastSettings()).monthlyExpenseTwd).toBeNull()
  })

  it('rejects an out-of-range value without writing', async () => {
    await expect(saveForecastSettings({ stockReturn: 0.5 })).rejects.toThrow('股票年報酬需介於 -20% 到 30%')
    expect(writeCollectionRecord).not.toHaveBeenCalled()
  })

  it('refuses to save when the cloud is not writable', async () => {
    assertCloudWriteReady.mockImplementation(() => {
      throw new Error('請先登入')
    })
    await expect(saveForecastSettings({ stockReturn: 0.07 })).rejects.toThrow('請先登入')
    expect(writeCollectionRecord).not.toHaveBeenCalled()
  })
})

describe('getExpenseDashboardView — forecast inputs', () => {
  it('returns the forecast settings and the complete-month expense average', async () => {
    // August and September are complete; October (this month) is left out.
    await db.expense_entries.add(expense('房租', 3000, '2026-08-01'))
    await db.expense_entries.add(expense('旅遊', 5000, '2026-09-05'))
    await db.expense_entries.add(expense('午餐', 150, '2026-10-03'))
    tick()
    await saveForecastSettings({ inflation: 0.03 })

    const view = await getExpenseDashboardView({ month: '2026-10' })
    expect(view.averageMonthlyExpense).toEqual({ averageTwd: 4000, monthsUsed: 2 })
    expect(view.savingsGoalAverageMonthlyExpenseTwd).toBe(4000)
    expect(view.forecastSettings).toEqual({ ...FORECAST_DEFAULTS, inflation: 0.03 })
  })

  it('has no average before a month is complete', async () => {
    await db.expense_entries.add(expense('午餐', 150, '2026-10-03'))
    const view = await getExpenseDashboardView({ month: '2026-10' })
    expect(view.averageMonthlyExpense).toEqual({ averageTwd: null, monthsUsed: 0 })
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/services/firebase/firestoreMappers.test.js src/services/portfolioService.forecast.test.js`
Expected: FAIL（mapper：`remote.forecast` 為 `undefined`；service：`getForecastSettings is not a function`）

- [ ] **Step 4: Implement the mapper field**

`src/services/firebase/firestoreMappers.js` 的 `appConfigToRemote`，在 `screen` 那段 spread 之後加：

```js
  ...(config.forecast && typeof config.forecast === 'object'
    ? { forecast: config.forecast }
    : {}),
```

`remoteToAppConfig`，在 `screen:` 之後加：

```js
  forecast:
    data.forecast && typeof data.forecast === 'object' ? data.forecast : undefined,
```

- [ ] **Step 5: Implement the service functions**

`src/services/portfolioService.js`：

1. 在 import 區加：

```js
import { normalizeForecastSettings, validateForecastSettings } from "../utils/forecast";
```

2. 在 `saveScreenSettings` 之後加：

```js
// 財務預估 assumptions, synced like other settings. A patch merges into what
// is stored; null on an amount / ratio puts its automatic value back.
const FORECAST_SETTINGS_KEY = "forecast_settings";

export const getForecastSettings = async () => {
  const config = await db.app_config.get(FORECAST_SETTINGS_KEY);
  return normalizeForecastSettings(config && !config.deletedAt ? config.forecast : null);
};

export const saveForecastSettings = async (patch = {}) => {
  ensureCloudWritable();
  const merged = { ...(await getForecastSettings()), ...patch };
  validateForecastSettings(merged);
  const next = normalizeForecastSettings(merged);
  await mirrorToCloud(CLOUD_COLLECTION.APP_CONFIG, {
    key: FORECAST_SETTINGS_KEY,
    forecast: next,
    updatedAt: getNowIso(),
    deletedAt: null,
    syncState: SYNC_PENDING,
  });
  return next;
};
```

3. `getExpenseDashboardView` 的 return 物件中，把：

```js
    savingsGoalAverageMonthlyExpenseTwd: averageMonthlyExpense(
      monthlySummaries,
      { firstExpenseDate },
    ).averageTwd,
```

改成：

```js
    savingsGoalAverageMonthlyExpenseTwd: expenseAverage.averageTwd,
    averageMonthlyExpense: expenseAverage,
    forecastSettings: await getForecastSettings(),
```

並在 return 之前（`monthlySummaries` 建好之後）加：

```js
  const expenseAverage = averageMonthlyExpense(monthlySummaries, {
    firstExpenseDate,
  });
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/services/firebase/firestoreMappers.test.js src/services/portfolioService.forecast.test.js src/services/portfolioService.dashboard.test.js src/services/portfolioService.savingsGoals.test.js`
Expected: PASS（全部）

- [ ] **Step 7: Lint and commit**

```bash
npx eslint src/services/firebase/firestoreMappers.js src/services/portfolioService.js src/services/portfolioService.forecast.test.js src/services/firebase/firestoreMappers.test.js
git add src/services/firebase/firestoreMappers.js src/services/firebase/firestoreMappers.test.js src/services/portfolioService.js src/services/portfolioService.forecast.test.js
git commit -m "feat(forecast): sync forecast settings via app_config"
```

---

### Task 5: `useForecast` hook

**Files:**
- Create: `src/hooks/useForecast.js`
- Test: `src/hooks/useForecast.test.jsx`

**Interfaces:**
- Consumes: Task 1–3 的 `forecast.js` 匯出
- Produces: `useForecast({ rows, cashRows, defaultMonthlyIncomeTwd, averageMonthlyExpense, settings, currentMonth? })`（default export）回傳：
  ```
  {
    start,            // getForecastStartingPoint
    auto,             // { monthlyIncomeTwd, monthlyExpenseTwd, expenseMonthsUsed, investRatio }
    assumptions,      // resolveForecastAssumptions
    horizonYears, setHorizonYears(years | null),
    base,             // runForecast | null（假設不完整時 null）
    whatIf,           // runForecast | null（旋鈕沒動時 null）
    knobs, setKnobs(knobs), resetKnobs(),
    summary,          // describeFiResult(base)
    diffText,         // describeWhatIfDiff | null
  }
  ```

- [ ] **Step 1: Write the failing test**

建立 `src/hooks/useForecast.test.jsx`：

```jsx
import { describe, it, expect } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import useForecast from './useForecast'
import { FORECAST_INCOMPLETE_TEXT } from '../utils/forecast'

const input = {
  rows: [{ market: 'TW', latestValueTwd: 3_000_000, totalCost: 2_000_000 }],
  cashRows: [{ balanceTwd: 1_000_000 }],
  defaultMonthlyIncomeTwd: 100_000,
  averageMonthlyExpense: { averageTwd: 60_000, monthsUsed: 12 },
  settings: null,
  currentMonth: '2026-10',
}

describe('useForecast', () => {
  it('builds the base forecast from the loaded data', () => {
    const { result } = renderHook(() => useForecast(input))
    expect(result.current.start.stockTwd).toBe(3_000_000)
    expect(result.current.auto).toEqual({
      monthlyIncomeTwd: 100_000,
      monthlyExpenseTwd: 60_000,
      expenseMonthsUsed: 12,
      investRatio: 0.75,
    })
    expect(result.current.base.series).toHaveLength(30 * 12 + 1)
    expect(result.current.base.thresholdTwd).toBeCloseTo(18_000_000, 6)
    expect(result.current.summary).toMatch(/^照目前步調，\d{4} 年可財務自由/)
    expect(result.current.whatIf).toBeNull()
    expect(result.current.diffText).toBeNull()
  })

  it('has no forecast until income and expense are known', () => {
    const { result } = renderHook(() =>
      useForecast({ ...input, defaultMonthlyIncomeTwd: null }),
    )
    expect(result.current.base).toBeNull()
    expect(result.current.summary).toBe(FORECAST_INCOMPLETE_TEXT)
  })

  it('runs a what-if line while a knob is moved, and resets it', () => {
    const { result } = renderHook(() => useForecast(input))
    act(() => result.current.setKnobs({ ...result.current.knobs, expenseDeltaTwd: -10_000 }))
    expect(result.current.whatIf).not.toBeNull()
    expect(result.current.whatIf.thresholdTwd).toBeCloseTo(15_000_000, 6)
    expect(result.current.diffText).toMatch(/^財務自由提早/)
    act(() => result.current.resetKnobs())
    expect(result.current.whatIf).toBeNull()
  })

  it('views another horizon without changing the settings', () => {
    const { result } = renderHook(() => useForecast(input))
    act(() => result.current.setHorizonYears(10))
    expect(result.current.horizonYears).toBe(10)
    expect(result.current.base.series).toHaveLength(121)
    expect(result.current.assumptions.horizonYears).toBe(30)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/useForecast.test.jsx`
Expected: FAIL（`Failed to resolve import "./useForecast"`）

- [ ] **Step 3: Write the implementation**

建立 `src/hooks/useForecast.js`：

```js
import { useCallback, useMemo, useState } from "react";
import dayjs from "dayjs";
import {
  applyWhatIf,
  DEFAULT_WHAT_IF,
  describeFiResult,
  describeWhatIfDiff,
  getAutoInvestRatio,
  getForecastStartingPoint,
  isWhatIfActive,
  resolveForecastAssumptions,
  runForecast,
} from "../utils/forecast";

// 財務預估 from what App already loaded: holdings + cash (loadAllData) and
// income, the expense average and the saved assumptions (loadExpenseData).
// The what-if knobs and the viewed horizon live here and are never saved;
// the sheet resets them when it closes.
export default function useForecast({
  rows,
  cashRows,
  defaultMonthlyIncomeTwd,
  averageMonthlyExpense,
  settings,
  currentMonth,
}) {
  const [knobs, setKnobs] = useState(DEFAULT_WHAT_IF);
  const [horizonOverride, setHorizonYears] = useState(null);

  const start = useMemo(
    () => getForecastStartingPoint({ rows, cashRows }),
    [rows, cashRows],
  );
  const auto = useMemo(
    () => ({
      monthlyIncomeTwd:
        typeof defaultMonthlyIncomeTwd === "number" ? defaultMonthlyIncomeTwd : null,
      monthlyExpenseTwd: averageMonthlyExpense?.averageTwd ?? null,
      expenseMonthsUsed: averageMonthlyExpense?.monthsUsed ?? 0,
      investRatio: getAutoInvestRatio(start),
    }),
    [defaultMonthlyIncomeTwd, averageMonthlyExpense, start],
  );
  const assumptions = useMemo(
    () => resolveForecastAssumptions({ settings, auto }),
    [settings, auto],
  );
  const horizonYears = horizonOverride ?? assumptions.horizonYears;
  const startMonth = currentMonth ?? dayjs().format("YYYY-MM");

  const base = useMemo(
    () =>
      assumptions.isComplete
        ? runForecast({
            stockTwd: start.stockTwd,
            cashTwd: start.cashTwd,
            assumptions,
            startMonth,
            horizonYears,
          })
        : null,
    [assumptions, start, startMonth, horizonYears],
  );
  const whatIf = useMemo(
    () =>
      base && isWhatIfActive(assumptions, knobs)
        ? runForecast({
            stockTwd: start.stockTwd,
            cashTwd: start.cashTwd,
            assumptions: applyWhatIf(assumptions, knobs),
            startMonth,
            horizonYears,
          })
        : null,
    [base, assumptions, knobs, start, startMonth, horizonYears],
  );

  const resetKnobs = useCallback(() => setKnobs(DEFAULT_WHAT_IF), []);

  return {
    start,
    auto,
    assumptions,
    horizonYears,
    setHorizonYears,
    base,
    whatIf,
    knobs,
    setKnobs,
    resetKnobs,
    summary: describeFiResult(base),
    diffText: base && whatIf ? describeWhatIfDiff(base, whatIf) : null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/useForecast.test.jsx`
Expected: PASS

- [ ] **Step 5: Lint and commit**

```bash
npx eslint src/hooks/useForecast.js src/hooks/useForecast.test.jsx
git add src/hooks/useForecast.js src/hooks/useForecast.test.jsx
git commit -m "feat(forecast): add useForecast hook"
```

---

### Task 6: 圖表與「如果…」元件

**Files:**
- Create: `src/components/forecast/ForecastChart.jsx`
- Create: `src/components/forecast/ForecastWhatIf.jsx`
- Create: `src/components/forecast/forecast.test.jsx`
- Modify: `src/App.css`（檔尾新增 forecast 區塊）

**Interfaces:**
- Consumes: Task 3 `buildForecastChartData`、`getWhatIfAmountRange`、`FORECAST_HORIZONS`；Task 5 hook 回傳的 `base` / `whatIf` / `knobs` / `assumptions`
- Produces:
  - `<ForecastChart base whatIf horizonYears onHorizonChange(years) height? />`
  - `<ForecastWhatIf assumptions knobs onChange(knobs) onReset() diffText />`

- [ ] **Step 1: Write the failing tests**

建立 `src/components/forecast/forecast.test.jsx`：

```jsx
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import ForecastChart from './ForecastChart'
import ForecastWhatIf from './ForecastWhatIf'
import { DEFAULT_WHAT_IF, runForecast } from '../../utils/forecast'

const assumptions = {
  monthlyIncomeTwd: 100000,
  monthlyExpenseTwd: 60000,
  investRatio: 0.75,
  stockReturn: 0.06,
  cashReturn: 0.01,
  inflation: 0.02,
  withdrawalRate: 0.04,
  horizonYears: 30,
}
const base = runForecast({ stockTwd: 3_000_000, cashTwd: 1_000_000, assumptions, startMonth: '2026-10' })

describe('ForecastChart', () => {
  it('offers the four horizons and reports a change', () => {
    const onHorizonChange = vi.fn()
    render(<ForecastChart base={base} horizonYears={30} onHorizonChange={onHorizonChange} />)
    for (const label of ['10 年', '20 年', '30 年', '40 年']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    fireEvent.click(screen.getByText('10 年'))
    expect(onHorizonChange).toHaveBeenCalledWith(10)
  })
})

describe('ForecastWhatIf', () => {
  it('shows the knob values and no difference while untouched', () => {
    render(
      <ForecastWhatIf
        assumptions={assumptions}
        knobs={DEFAULT_WHAT_IF}
        onChange={() => {}}
        onReset={() => {}}
        diffText={null}
      />,
    )
    expect(screen.getByText('每月支出')).toBeInTheDocument()
    expect(screen.getByText('每月收入')).toBeInTheDocument()
    expect(screen.getAllByText('不變')).toHaveLength(2)
    expect(screen.getByText('75%')).toBeInTheDocument()
    expect(screen.getByText('6%')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '重設' })).not.toBeInTheDocument()
  })

  it('shows the difference and resets', () => {
    const onReset = vi.fn()
    render(
      <ForecastWhatIf
        assumptions={assumptions}
        knobs={{ ...DEFAULT_WHAT_IF, expenseDeltaTwd: -5000 }}
        onChange={() => {}}
        onReset={onReset}
        diffText="財務自由提早 3 年"
      />,
    )
    expect(screen.getByText('−$5,000')).toBeInTheDocument()
    expect(screen.getByText('財務自由提早 3 年')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '重設' }))
    expect(onReset).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/forecast/forecast.test.jsx`
Expected: FAIL（`Failed to resolve import "./ForecastChart"`）

- [ ] **Step 3: Write `ForecastChart.jsx`**

```jsx
import { Segmented } from "antd";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatAxisTwd, formatTwd } from "../../utils/formatters";
import { buildForecastChartData, FORECAST_HORIZONS } from "../../utils/forecast";
import { CHART_STOCK, COLORS } from "../../theme/tokens";

const horizonOptions = FORECAST_HORIZONS.map((years) => ({
  label: `${years} 年`,
  value: years,
}));

const tick = { fontSize: 11, fill: COLORS.muted };

function ForecastTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="pe-river-tooltip">
      <div className="pe-river-tooltip-title">{`${point.year} 年`}</div>
      <div>{`股票 ${formatTwd(point.stockTwd)}`}</div>
      <div>{`現金 ${formatTwd(point.cashTwd)}`}</div>
      <div>{`總額 ${formatTwd(point.totalTwd)}`}</div>
      {point.whatIfTotalTwd !== null && (
        <div>{`如果… ${formatTwd(point.whatIfTotalTwd)}`}</div>
      )}
    </div>
  );
}

// Total assets a year at a time: the base line solid (the savings colour, as
// on the trend chart), the what-if line dashed cobalt, the FI threshold a
// muted dashed rule with a dot where each line crosses it.
function ForecastChart({ base, whatIf = null, horizonYears, onHorizonChange, height = 280 }) {
  const data = buildForecastChartData({ base, whatIf });
  const startYear = data[0]?.year ?? 0;
  const showWhatIfThreshold =
    whatIf && whatIf.thresholdTwd !== null && whatIf.thresholdTwd !== base.thresholdTwd;

  return (
    <div className="forecast-chart">
      <Segmented
        block
        value={horizonYears}
        options={horizonOptions}
        onChange={onHorizonChange}
      />
      <div className="forecast-chart-plot" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={COLORS.line} />
            <XAxis
              dataKey="yearsFromNow"
              type="number"
              domain={[0, horizonYears]}
              allowDecimals={false}
              tickFormatter={(value) => String(startYear + value)}
              tick={tick}
              minTickGap={24}
            />
            <YAxis tickFormatter={formatAxisTwd} width={56} tick={tick} />
            <Tooltip content={<ForecastTooltip />} />
            {base.thresholdTwd !== null && (
              <ReferenceLine
                y={base.thresholdTwd}
                stroke={COLORS.muted}
                strokeDasharray="4 4"
                label={{
                  value: "財務自由門檻",
                  position: "insideTopLeft",
                  fontSize: 11,
                  fill: COLORS.muted,
                }}
              />
            )}
            {showWhatIfThreshold && (
              <ReferenceLine
                y={whatIf.thresholdTwd}
                stroke={CHART_STOCK.primary}
                strokeOpacity={0.5}
                strokeDasharray="4 4"
              />
            )}
            <Line
              isAnimationActive={false}
              dataKey="totalTwd"
              stroke={COLORS.tealBright}
              strokeWidth={2}
              dot={false}
            />
            {whatIf && (
              <Line
                isAnimationActive={false}
                dataKey="whatIfTotalTwd"
                stroke={CHART_STOCK.primary}
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={false}
              />
            )}
            {base.fiMonthIndex !== null && (
              <ReferenceDot
                x={base.fiMonthIndex / 12}
                y={base.thresholdTwd}
                r={4}
                fill={COLORS.tealBright}
                stroke={COLORS.surface}
              />
            )}
            {whatIf && whatIf.fiMonthIndex !== null && (
              <ReferenceDot
                x={whatIf.fiMonthIndex / 12}
                y={whatIf.thresholdTwd}
                r={4}
                fill={CHART_STOCK.primary}
                stroke={COLORS.surface}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <ul className="stock-detail-legend">
        <li>
          <span
            className="stock-detail-legend-swatch"
            style={{ background: COLORS.tealBright }}
          />
          目前步調
        </li>
        {whatIf && (
          <li>
            <span
              className="stock-detail-legend-swatch stock-detail-legend-swatch--outline"
              style={{ borderColor: CHART_STOCK.primary }}
            />
            如果…
          </li>
        )}
      </ul>
    </div>
  );
}

export default ForecastChart;
```

- [ ] **Step 4: Write `ForecastWhatIf.jsx`**

```jsx
import { Button, Slider } from "antd";
import { formatTwd } from "../../utils/formatters";
import { getWhatIfAmountRange } from "../../utils/forecast";

const formatDelta = (value) => {
  if (!value) return "不變";
  return value > 0 ? `+${formatTwd(value)}` : `−${formatTwd(Math.abs(value))}`;
};

const formatPercent = (ratio) => `${Math.round(ratio * 1000) / 10}%`;

function Knob({ label, value, children }) {
  return (
    <div className="forecast-knob">
      <div className="forecast-knob-head">
        <span>{label}</span>
        <span className="forecast-knob-value">{value}</span>
      </div>
      {children}
    </div>
  );
}

// The four 如果… knobs. Amounts move by ± around the base; the ratio and the
// stock return are set outright. Nothing here is saved.
function ForecastWhatIf({ assumptions, knobs, onChange, onReset, diffText }) {
  const expenseRange = getWhatIfAmountRange(assumptions.monthlyExpenseTwd);
  const incomeRange = getWhatIfAmountRange(assumptions.monthlyIncomeTwd);
  const investRatio = knobs.investRatio ?? assumptions.investRatio;
  const stockReturn = knobs.stockReturn ?? assumptions.stockReturn;
  const set = (patch) => onChange({ ...knobs, ...patch });

  return (
    <div className="forecast-whatif">
      <Knob label="每月支出" value={formatDelta(knobs.expenseDeltaTwd)}>
        <Slider
          min={-expenseRange}
          max={expenseRange}
          step={1000}
          value={knobs.expenseDeltaTwd}
          onChange={(value) => set({ expenseDeltaTwd: value })}
          tooltip={{ open: false }}
          ariaLabelForHandle="每月支出增減"
        />
      </Knob>
      <Knob label="每月收入" value={formatDelta(knobs.incomeDeltaTwd)}>
        <Slider
          min={-incomeRange}
          max={incomeRange}
          step={1000}
          value={knobs.incomeDeltaTwd}
          onChange={(value) => set({ incomeDeltaTwd: value })}
          tooltip={{ open: false }}
          ariaLabelForHandle="每月收入增減"
        />
      </Knob>
      <Knob label="新存款投資比例" value={`${Math.round(investRatio * 100)}%`}>
        <Slider
          min={0}
          max={100}
          step={5}
          value={Math.round(investRatio * 100)}
          onChange={(value) => set({ investRatio: value / 100 })}
          tooltip={{ open: false }}
          ariaLabelForHandle="新存款投資比例"
        />
      </Knob>
      <Knob label="股票年報酬" value={formatPercent(stockReturn)}>
        <Slider
          min={-5}
          max={15}
          step={0.5}
          value={Math.round(stockReturn * 1000) / 10}
          onChange={(value) => set({ stockReturn: value / 100 })}
          tooltip={{ open: false }}
          ariaLabelForHandle="股票年報酬"
        />
      </Knob>
      {diffText && (
        <div className="forecast-whatif-diff">
          <span>{diffText}</span>
          <Button type="link" size="small" onClick={onReset}>
            重設
          </Button>
        </div>
      )}
    </div>
  );
}

export default ForecastWhatIf;
```

- [ ] **Step 5: Add the CSS**

`src/App.css` 檔尾加：

```css
/* ---- 財務預估 sheet ----
   Same rhythm as the stock detail sheet: the FI year leads, sections sit
   apart with subhead titles (.stock-detail-section / -heading). */
.forecast-chart {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.forecast-whatif {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.forecast-knob-head {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
  color: var(--c-ink);
}

.forecast-knob-value {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.forecast-whatif-diff {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-row-x);
  border-radius: var(--radius-lg);
  background: var(--c-neutral-fill);
  color: var(--c-ink);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/components/forecast/forecast.test.jsx`
Expected: PASS

- [ ] **Step 7: Lint and commit**

```bash
npx eslint src/components/forecast
git add src/components/forecast src/App.css
git commit -m "feat(forecast): add forecast chart and what-if knobs"
```

---

### Task 7: 假設列表與編輯

**Files:**
- Create: `src/components/forecast/ForecastAssumptions.jsx`
- Modify: `src/components/forecast/forecast.test.jsx`
- Modify: `src/App.css`

**Interfaces:**
- Consumes: Task 2 `FORECAST_LIMITS`；Task 5 hook 的 `assumptions`、`auto`、`start`；既有 `MobileSwipeRow`、`MobileFormSheetLayout`、`makeRoomForPicker` 不需要
- Produces: `<ForecastAssumptions assumptions auto start disabled isMobile onSave(patch) => Promise<boolean> />`；`onSave` resolve `true` 才關閉編輯框

- [ ] **Step 1: Write the failing tests**

在 `src/components/forecast/forecast.test.jsx` 加 import `ForecastAssumptions from './ForecastAssumptions'`、`waitFor`（從 `@testing-library/react`），並在檔尾加：

```jsx
describe('ForecastAssumptions', () => {
  const resolved = {
    ...assumptions,
    sources: { monthlyIncomeTwd: 'auto', monthlyExpenseTwd: 'custom', investRatio: 'auto' },
    isComplete: true,
  }
  const auto = { monthlyIncomeTwd: 100000, monthlyExpenseTwd: 58000, expenseMonthsUsed: 4, investRatio: 0.75 }
  const start = { stockTwd: 3_000_000, cashTwd: 1_000_000, holdingsReturn: 0.25, unsetCostCount: 2 }

  it('lists every assumption with its value and source', () => {
    render(
      <ForecastAssumptions assumptions={resolved} auto={auto} start={start} isMobile onSave={vi.fn()} />,
    )
    expect(screen.getByText('每月收入')).toBeInTheDocument()
    expect(screen.getByText('$100,000')).toBeInTheDocument()
    expect(screen.getByText('收入設定的每月收入')).toBeInTheDocument()
    expect(screen.getByText('$60,000')).toBeInTheDocument()
    expect(screen.getByText('自訂 · 依 4 個月資料平均為 $58,000')).toBeInTheDocument()
    expect(screen.getByText('目前股票占比')).toBeInTheDocument()
    expect(screen.getByText('目前持股累計報酬 25%（2 檔未設定成本）')).toBeInTheDocument()
    expect(screen.getByText('提領率')).toBeInTheDocument()
  })

  it('saves an edited rate as a fraction', async () => {
    const onSave = vi.fn().mockResolvedValue(true)
    render(
      <ForecastAssumptions assumptions={resolved} auto={auto} start={start} isMobile onSave={onSave} />,
    )
    fireEvent.click(screen.getByRole('button', { name: '股票年報酬 6%，編輯' }))
    fireEvent.change(screen.getByLabelText('股票年報酬'), { target: { value: '7.5' } })
    fireEvent.click(screen.getByRole('button', { name: '儲存' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ stockReturn: 0.075 }))
  })

  it('puts an overridden value back to automatic', async () => {
    const onSave = vi.fn().mockResolvedValue(true)
    render(
      <ForecastAssumptions assumptions={resolved} auto={auto} start={start} isMobile onSave={onSave} />,
    )
    fireEvent.click(screen.getByRole('button', { name: '每月支出 $60,000，編輯' }))
    fireEvent.click(screen.getByRole('button', { name: '改回自動' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ monthlyExpenseTwd: null }))
  })

  it('is read-only when writing is disabled', () => {
    render(
      <ForecastAssumptions assumptions={resolved} auto={auto} start={start} isMobile disabled onSave={vi.fn()} />,
    )
    expect(screen.queryByRole('button', { name: /，編輯$/ })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/forecast/forecast.test.jsx`
Expected: FAIL（`Failed to resolve import "./ForecastAssumptions"`）

- [ ] **Step 3: Write `ForecastAssumptions.jsx`**

```jsx
import { useState } from "react";
import { Button, Form, InputNumber, Modal, Table, Typography } from "antd";
import MobileFormSheetLayout from "../MobileFormSheetLayout";
import MobileSwipeRow from "../MobileSwipeRow";
import { formatTwd } from "../../utils/formatters";
import { FORECAST_LIMITS } from "../../utils/forecast";

const { Text } = Typography;

const formatPercent = (ratio) => `${Math.round(ratio * 1000) / 10}%`;

const describeExpenseAuto = (auto) =>
  auto.expenseMonthsUsed >= 12
    ? "過去 12 個月平均"
    : `依 ${auto.expenseMonthsUsed} 個月資料平均`;

const describeHoldingsReturn = (start) => {
  if (start.holdingsReturn === null) return "名目報酬，App 會扣掉通膨";
  const unset = start.unsetCostCount
    ? `（${start.unsetCostCount} 檔未設定成本）`
    : "";
  return `目前持股累計報酬 ${formatPercent(start.holdingsReturn)}${unset}`;
};

// kind: amount (TWD), ratio / rate (stored as a fraction, edited in %).
// hasAuto rows can be overridden and put back; the others always hold a value.
const buildRows = ({ auto, start }) => [
  {
    key: "monthlyIncomeTwd",
    label: "每月收入",
    kind: "amount",
    hasAuto: true,
    autoText: () => "收入設定的每月收入",
    autoValue: auto.monthlyIncomeTwd,
  },
  {
    key: "monthlyExpenseTwd",
    label: "每月支出",
    kind: "amount",
    hasAuto: true,
    autoText: () =>
      auto.monthlyExpenseTwd === null ? "還沒有完整月份的支出" : describeExpenseAuto(auto),
    autoValue: auto.monthlyExpenseTwd,
  },
  {
    key: "investRatio",
    label: "新存款投資比例",
    kind: "ratio",
    hasAuto: true,
    autoText: () => "目前股票占比",
    autoValue: auto.investRatio,
  },
  { key: "stockReturn", label: "股票年報酬", kind: "rate", hint: describeHoldingsReturn(start) },
  { key: "cashReturn", label: "現金年利率", kind: "rate", hint: "名目利率，App 會扣掉通膨" },
  { key: "inflation", label: "通膨率", kind: "rate", hint: "收入與支出假設跟著通膨成長" },
  { key: "withdrawalRate", label: "提領率", kind: "rate", hint: "財務自由門檻 = 年支出 ÷ 提領率" },
];

const formatValue = (row, value) => {
  if (value === null || value === undefined) return "未設定";
  return row.kind === "amount" ? formatTwd(value) : formatPercent(value);
};

const describeSource = (row, assumptions) => {
  if (!row.hasAuto) return row.hint;
  if (assumptions.sources[row.key] === "auto") return row.autoText();
  if (row.autoValue === null || row.autoValue === undefined) return "自訂";
  return `自訂 · ${row.autoText()}為 ${formatValue(row, row.autoValue)}`;
};

function ForecastAssumptions({ assumptions, auto, start, disabled = false, isMobile, onSave }) {
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const rows = buildRows({ auto, start });

  const open = (row) => {
    const value = assumptions[row.key];
    setDraft(
      value === null || value === undefined
        ? null
        : row.kind === "amount"
          ? value
          : Math.round(value * 1000) / 10,
    );
    setEditing(row);
  };

  const save = async (patch) => {
    setSaving(true);
    try {
      if (await onSave(patch)) setEditing(null);
    } finally {
      setSaving(false);
    }
  };

  const submit = () => {
    if (!editing) return;
    const value =
      draft === null ? null : editing.kind === "amount" ? draft : draft / 100;
    save({ [editing.key]: value });
  };

  const renderRow = (_, row) => {
    const valueText = formatValue(row, assumptions[row.key]);
    return (
      <MobileSwipeRow
        actions={[]}
        onTap={disabled ? undefined : () => open(row)}
        label={`${row.label} ${valueText}，編輯`}
        main={
          <span className="income-row-main">
            <span className="holding-main-text">{row.label}</span>
            <Text type="secondary" className="income-row-meta">
              {describeSource(row, assumptions)}
            </Text>
          </span>
        }
        side={valueText}
      />
    );
  };

  const limit = editing && FORECAST_LIMITS[editing.key];
  const field = editing && (
    <Form layout="vertical" component="div">
      <Form.Item
        label={editing.kind === "amount" ? `${editing.label} (TWD)` : `${editing.label} (%)`}
        extra={editing.hasAuto ? editing.autoText() : editing.hint}
      >
        <InputNumber
          aria-label={editing.label}
          inputMode="decimal"
          style={{ width: "100%" }}
          min={editing.kind === "amount" ? 0 : limit.min * 100}
          max={editing.kind === "amount" ? undefined : limit.max * 100}
          step={editing.kind === "amount" ? 1000 : 0.5}
          precision={editing.kind === "amount" ? 0 : 1}
          value={draft ?? undefined}
          onChange={(value) => setDraft(typeof value === "number" ? value : null)}
        />
      </Form.Item>
      {editing.hasAuto && assumptions.sources[editing.key] === "custom" && (
        <Button block onClick={() => save({ [editing.key]: null })} disabled={saving}>
          改回自動
        </Button>
      )}
    </Form>
  );

  return (
    <div className="forecast-assumptions">
      <Table
        showHeader={false}
        className="mobile-swipe-table"
        rowKey="key"
        dataSource={rows}
        columns={[{ key: "row", render: renderRow }]}
        pagination={false}
      />
      {isMobile ? (
        <MobileFormSheetLayout
          title={editing?.label}
          open={Boolean(editing)}
          onClose={() => setEditing(null)}
          loading={saving}
          submitDisabled={disabled}
          onSubmit={submit}
        >
          {field}
        </MobileFormSheetLayout>
      ) : (
        <Modal
          title={editing?.label}
          open={Boolean(editing)}
          onCancel={() => {
            if (!saving) setEditing(null);
          }}
          onOk={submit}
          confirmLoading={saving}
          okText="儲存"
          okButtonProps={{ disabled }}
          destroyOnHidden
        >
          {field}
        </Modal>
      )}
    </div>
  );
}

export default ForecastAssumptions;
```

> 註：`MobileFormSheetLayout` 的 `onSubmit` 由底部「儲存」按鈕觸發（`submitFormId` 未給時）。實作前先讀 `src/components/MobileFormSheetLayout.jsx` 確認按鈕在沒有 `submitFormId` 時呼叫 `onSubmit`；若不是，改成傳 `submitFormId` 並把 `field` 包在 `<form id=... onSubmit>` 裡。

- [ ] **Step 4: Add the CSS**

`src/App.css` 的 forecast 區塊加：

```css
.forecast-assumptions {
  border: 1px solid var(--c-line);
  border-radius: var(--radius-lg);
  background: var(--c-surface);
  overflow: hidden;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/components/forecast/forecast.test.jsx`
Expected: PASS（全部）

- [ ] **Step 6: Lint and commit**

```bash
npx eslint src/components/forecast
git add src/components/forecast src/App.css
git commit -m "feat(forecast): add editable assumptions list"
```

---

### Task 8: Forecast sheet 與 App 接線

**Files:**
- Create: `src/components/forecast/ForecastSheet.jsx`
- Modify: `src/components/forecast/forecast.test.jsx`
- Modify: `src/App.jsx`（state 宣告約 `:559`、`:574`；`loadExpenseData` 約 `:1109-1121`；`assetChartRows` 約 `:2281-2307`；資產分析列表約 `:6034-6060`；`SavingsGoalForm` 的 `averageMonthlyExpenseTwd` prop 約 `:4784`；`StockDetailSheet` 前方渲染 sheet 約 `:7396`）
- Modify: `src/App.css`

**Interfaces:**
- Consumes: Task 4 `saveForecastSettings`、dashboard 的 `forecastSettings` / `averageMonthlyExpense`；Task 5 `useForecast`；Task 6、7 元件
- Produces: `<ForecastSheet open isMobile onClose forecast disabled onSaveSettings(patch) => Promise<boolean> priceDataStale quoteAt />`

- [ ] **Step 1: Write the failing sheet test**

在 `src/components/forecast/forecast.test.jsx` 加 import `ForecastSheet from './ForecastSheet'`、`{ renderHook } from '@testing-library/react'`、`useForecast from '../../hooks/useForecast'`，檔尾加：

```jsx
describe('ForecastSheet', () => {
  const hookInput = {
    rows: [{ market: 'TW', latestValueTwd: 3_000_000, totalCost: 2_000_000 }],
    cashRows: [{ balanceTwd: 1_000_000 }],
    defaultMonthlyIncomeTwd: 100_000,
    averageMonthlyExpense: { averageTwd: 60_000, monthsUsed: 12 },
    settings: null,
    currentMonth: '2026-10',
  }

  it('leads with the FI year and the end total', () => {
    const { result } = renderHook(() => useForecast(hookInput))
    render(
      <ForecastSheet open isMobile onClose={() => {}} forecast={result.current} onSaveSettings={vi.fn()} />,
    )
    expect(screen.getByText('財務預估')).toBeInTheDocument()
    expect(screen.getByText(/^\d{4} 年$/)).toBeInTheDocument()
    expect(screen.getByText(/^30 年後總資產/)).toBeInTheDocument()
    expect(screen.getByText('以今日幣值計算，假設收入與支出隨通膨成長；不構成投資建議。')).toBeInTheDocument()
  })

  it('asks for income and expense when they are missing', () => {
    const { result } = renderHook(() => useForecast({ ...hookInput, defaultMonthlyIncomeTwd: null }))
    render(
      <ForecastSheet open isMobile onClose={() => {}} forecast={result.current} onSaveSettings={vi.fn()} />,
    )
    expect(screen.getByText('設定每月收入與支出以開始預估')).toBeInTheDocument()
    expect(screen.queryByText('如果…')).not.toBeInTheDocument()
    expect(screen.getByText('每月收入')).toBeInTheDocument()
  })

  it('saves the viewed horizon when writing is allowed', () => {
    const onSaveSettings = vi.fn().mockResolvedValue(true)
    const { result } = renderHook(() => useForecast(hookInput))
    render(
      <ForecastSheet open isMobile onClose={() => {}} forecast={result.current} onSaveSettings={onSaveSettings} />,
    )
    fireEvent.click(screen.getByText('20 年'))
    expect(onSaveSettings).toHaveBeenCalledWith({ horizonYears: 20 })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/forecast/forecast.test.jsx`
Expected: FAIL（`Failed to resolve import "./ForecastSheet"`）

- [ ] **Step 3: Write `ForecastSheet.jsx`**

```jsx
import { Drawer, Typography } from "antd";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";
import { formatDateTime, formatTwd } from "../../utils/formatters";
import { FORECAST_INCOMPLETE_TEXT, getFiHeadline } from "../../utils/forecast";
import ForecastAssumptions from "./ForecastAssumptions";
import ForecastChart from "./ForecastChart";
import ForecastWhatIf from "./ForecastWhatIf";

const { Text } = Typography;

// 財務預估: a bottom sheet on mobile, a right-hand drawer on desktop (same
// frame as the stock detail sheet). The FI year is the one display number.
function ForecastSheet({
  open,
  isMobile,
  onClose,
  forecast,
  disabled = false,
  onSaveSettings,
  priceDataStale = false,
  quoteAt = null,
}) {
  useBodyScrollLock(Boolean(open) && isMobile);
  const { base, whatIf, assumptions, auto, start, horizonYears } = forecast;

  const handleHorizonChange = (years) => {
    forecast.setHorizonYears(years);
    if (!disabled) onSaveSettings?.({ horizonYears: years });
  };

  const body = (
    <div className="forecast-sheet">
      <section className="forecast-hero">
        {base ? (
          <>
            <span className="forecast-hero-label">財務自由</span>
            <span className="forecast-hero-number">{getFiHeadline(base)}</span>
            <span className="forecast-hero-meta">
              {`${horizonYears} 年後總資產 ${formatTwd(base.endTotalTwd)}`}
            </span>
            {base.thresholdTwd !== null && (
              <Text type="secondary" className="forecast-hero-caption">
                {`門檻 ${formatTwd(base.thresholdTwd)}（年支出 ÷ 提領率）`}
              </Text>
            )}
          </>
        ) : (
          <span className="forecast-hero-meta">{FORECAST_INCOMPLETE_TEXT}</span>
        )}
        {priceDataStale && quoteAt && (
          <Text type="warning" className="forecast-hero-caption">
            {`報價時間 ${formatDateTime(quoteAt)}，可能不是最新`}
          </Text>
        )}
      </section>

      {base && (
        <section className="stock-detail-section">
          <h3 className="stock-detail-heading">預估走勢</h3>
          <ForecastChart
            base={base}
            whatIf={whatIf}
            horizonYears={horizonYears}
            onHorizonChange={handleHorizonChange}
          />
        </section>
      )}

      {base && (
        <section className="stock-detail-section">
          <h3 className="stock-detail-heading">如果…</h3>
          <ForecastWhatIf
            assumptions={assumptions}
            knobs={forecast.knobs}
            onChange={forecast.setKnobs}
            onReset={forecast.resetKnobs}
            diffText={forecast.diffText}
          />
        </section>
      )}

      <section className="stock-detail-section">
        <h3 className="stock-detail-heading">假設</h3>
        <ForecastAssumptions
          assumptions={assumptions}
          auto={auto}
          start={start}
          disabled={disabled}
          isMobile={isMobile}
          onSave={onSaveSettings}
        />
      </section>

      <Text type="secondary" className="forecast-footnote">
        以今日幣值計算，假設收入與支出隨通膨成長；不構成投資建議。
      </Text>
    </div>
  );

  return (
    <Drawer
      placement={isMobile ? "bottom" : "right"}
      title="財務預估"
      open={open}
      onClose={onClose}
      size={isMobile ? "90vh" : 520}
      destroyOnHidden
      className={isMobile ? "form-bottom-sheet stock-detail-sheet" : "stock-detail-sheet"}
    >
      {body}
    </Drawer>
  );
}

export default ForecastSheet;
```

- [ ] **Step 4: Add the CSS**

`src/App.css` 的 forecast 區塊加：

```css
.forecast-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
  text-align: center;
}

.forecast-hero-label {
  font-size: var(--fs-caption);
  color: var(--c-muted);
}

.forecast-hero-number {
  font-size: var(--fs-display);
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: -0.8px;
  color: var(--c-ink);
  font-variant-numeric: tabular-nums;
}

.forecast-hero-meta {
  font-weight: 600;
  color: var(--c-ink);
  font-variant-numeric: tabular-nums;
}

.forecast-hero-caption.ant-typography {
  font-size: var(--fs-caption);
}

.forecast-footnote.ant-typography {
  display: block;
  margin-top: var(--space-8);
  font-size: var(--fs-caption);
}
```

> `letter-spacing: -0.8px` 與 `line-height: 1.15` 照 `DESIGN.md` 的 display typography；實作前先在 `src/App.css` 搜尋 `--fs-display` 的既有用法（例如 hero 數字），若已有共用 class 就改用那個 class，不重複宣告。

- [ ] **Step 5: Run the sheet tests**

Run: `npx vitest run src/components/forecast/forecast.test.jsx`
Expected: PASS（全部）

- [ ] **Step 6: Wire it into `App.jsx`**

1. Import（跟其他 component / hook import 放一起；`StatUp` 加進既有的 `iconoir-react` import 清單；`saveForecastSettings` 加進既有的 `./services/portfolioService` import 清單）：

```js
import ForecastSheet from "./components/forecast/ForecastSheet";
import useForecast from "./hooks/useForecast";
```

2. State：把

```js
  const [averageMonthlyExpenseTwd, setAverageMonthlyExpenseTwd] = useState(null);
```

改成

```js
  const [averageMonthlyExpense, setAverageMonthlyExpense] = useState({
    averageTwd: null,
    monthsUsed: 0,
  });
  // 財務預估: saved assumptions (null until the first expense load) and the sheet.
  const [forecastSettings, setForecastSettings] = useState(null);
  const [isForecastOpen, setIsForecastOpen] = useState(false);
```

3. `loadExpenseData` 中，把

```js
      setAverageMonthlyExpenseTwd(view.savingsGoalAverageMonthlyExpenseTwd ?? null);
```

改成

```js
      setAverageMonthlyExpense(
        view.averageMonthlyExpense ?? { averageTwd: null, monthsUsed: 0 },
      );
      setForecastSettings(view.forecastSettings ?? null);
```

4. `SavingsGoalForm` 的 prop 改成 `averageMonthlyExpenseTwd={averageMonthlyExpense.averageTwd}`。

5. 在 `assetChartRows` 的 `useMemo` 之前加：

```js
  const forecast = useForecast({
    rows,
    cashRows,
    defaultMonthlyIncomeTwd,
    averageMonthlyExpense,
    settings: forecastSettings,
  });
  const forecastSummary = forecast.summary;
  const { resetKnobs: resetForecastKnobs, setHorizonYears: setForecastHorizon } = forecast;

  const closeForecast = useCallback(() => {
    setIsForecastOpen(false);
    resetForecastKnobs();
    setForecastHorizon(null);
  }, [resetForecastKnobs, setForecastHorizon]);

  const handleSaveForecastSettings = useCallback(
    async (patch) => {
      try {
        await saveForecastSettings(patch);
        await loadExpenseData();
        return true;
      } catch (error) {
        message.error(toUserMessage(error, "儲存預估假設失敗"));
        return false;
      }
    },
    [loadExpenseData, message],
  );
```

6. `assetChartRows` 的陣列開頭加一列，並把 `forecastSummary` 加進 deps：

```js
      {
        key: "forecast",
        title: "財務預估",
        icon: StatUp,
        summary: forecastSummary,
        onOpen: () => setIsForecastOpen(true),
      },
```

7. 資產分析列表的按鈕 `onClick` 改成：

```jsx
                          onClick={() =>
                            chart.onOpen
                              ? chart.onOpen()
                              : setActiveAssetChartKey(chart.key)
                          }
```

8. 在 `<StockDetailSheet` 之前渲染：

```jsx
          <ForecastSheet
            open={isForecastOpen}
            isMobile={isMobileViewport}
            onClose={closeForecast}
            forecast={forecast}
            disabled={isWriteDisabled}
            onSaveSettings={handleSaveForecastSettings}
            priceDataStale={priceDataStale}
            quoteAt={latestPriceCapturedAt}
          />
```

- [ ] **Step 7: Run the full suite, lint and build**

Run: `npm test && npm run lint && npm run build`
Expected: 全部測試 PASS、lint 無錯誤、build 成功（留意 bundle 未超過 PWA precache 3 MB 上限）

- [ ] **Step 8: Verify in the browser**

`npm run dev`，登入後在手機尺寸（390×844）與桌面尺寸各檢查：
- 資產頁「資產分析」第一列是「財務預估」，重點句是財務自由結論。
- 點開 sheet：財務自由年份是唯一大數字、曲線有門檻線與交會點、切換 10 / 20 / 30 / 40 年會更新曲線。
- 拖動「每月支出」旋鈕出現虛線與差異文字，「重設」後消失；關閉再打開 sheet 旋鈕已歸零。
- 編輯「股票年報酬」為 7.5 → 儲存 → 數值與曲線更新；重新整理頁面後仍是 7.5（已同步到 Firestore）。
- 覆寫「每月支出」後列上顯示「自訂 · …」，「改回自動」後回到平均值。
- 輸入超出範圍（例如股票年報酬 40）時有錯誤訊息且不儲存。
- console 沒有新的錯誤或 React warning。

- [ ] **Step 9: Commit**

```bash
git add src/components/forecast src/App.jsx src/App.css
git commit -m "feat(forecast): add forecast sheet to the asset analysis list"
```

---

### Task 9: 文件

**Files:**
- Modify: `DESIGN.md`（「支出分析與資產分析」那段的圖示清單；圖表配色段落）
- Modify: `CLAUDE.md`（Architecture → UI 段落）

**Interfaces:**
- Consumes: Task 6–8 實際做出的樣式
- Produces: 無

- [ ] **Step 1: Update `DESIGN.md`**

1. 分析列表段落（含「走勢 `GraphUp`、分配 `PercentageCircle`…」那句）的圖示清單加上「財務預估 `StatUp`」，並補一句：「資產分析的第一列『財務預估』點開的是 forecast sheet（`ForecastSheet`），不是分析 modal。」
2. 圖表配色段落（`CHART_PALETTE` / `CHART_STOCK` 那一條）之後加一條：
   「財務預估圖（`ForecastChart`）：目前步調為 `teal-bright` 實線 2px（跟淨資產走勢同色，因為它是『錢累積』）；『如果…』為 `CHART_STOCK.primary` 虛線 2px；財務自由門檻為 `muted` 虛線，交會處用同線色的實心點（白色外圈）。圖例沿用 `stock-detail-legend`，『如果…』用虛線外框色塊。sheet 內唯一的 display 數字是財務自由年份。」

- [ ] **Step 2: Update `CLAUDE.md`**

在 UI 段落「研究 tab 的觀察清單在 …」那句之後加：

「資產頁『資產分析』的第一列『財務預估』開 `src/components/forecast/ForecastSheet`；計算全在 `src/utils/forecast.js`（今日幣值、逐月模擬），狀態在 `src/hooks/useForecast.js`，假設存在 `app_config` 的 `forecast_settings`（`forecast` 欄位）。」

- [ ] **Step 3: Commit**

```bash
git add DESIGN.md CLAUDE.md
git commit -m "docs: document the financial forecast sheet"
```

---

## Self-Review 結果

- **Spec coverage**：計算模型（Task 1）、假設與驗證（Task 2）、如果…與文案（Task 3）、儲存與同步（Task 4）、資料流（Task 5、8）、入口列與 sheet（Task 8）、圖表與旋鈕（Task 6）、假設列表與「改回自動」（Task 7）、測試（各 task）、文件（Task 9）。spec 的「N 年後總資產」副文字放在 sheet hero（入口列依 `DESIGN.md` 只放一句重點）。
- **型別一致性**：`assumptions` 形狀、`runForecast` 結果欄位（`series`、`thresholdTwd`、`fiMonthIndex`、`fiMonth`、`endTotalTwd`、`horizonYears`）、`knobs` 形狀、hook 回傳欄位在 Task 1–8 一致。
- **Review Focus**：五項都已在對應 task 的測試中。
