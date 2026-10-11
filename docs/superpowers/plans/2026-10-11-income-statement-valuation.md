# 損益表估價推估器 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在台股上市個股的細節頁，用「營收 → 毛利率 → 營業費用率 → 業外 → 稅率 → EPS」逐季推估下一季與明年 EPS，接回估價卡（近四季／下季後／今年／明年）、記錄預估 vs 實際，並以本益比河流圖呈現股價與 EPS。

**Architecture:** GitHub Actions 把 TWSE／MOPS 的季損益表、月營收、月底收盤價累積在 `data/twse/*.json`（repo 內、不部署），`prebuild`／`predev` 拆成 `public/data/tw/{code}.json` 給前端逐檔載入。推估是純函式 `src/utils/incomeModel.js`，由 `buildValuationModel` 呼叫；假設存在既有 `app_config` 的 `valuation` 物件（新增 `model`、`snapshots`），沿用 `mirrorToCloud` 同步。UI 改造 `ValuationAssumptions`，新增 `PeRiverChart`。

**Tech Stack:** React 19、Ant Design 6、Recharts 3、iconoir-react、Vitest + Testing Library、Node 20 scripts（內建 `fetch`、`TextDecoder('big5')`）、GitHub Actions。

**Spec:** `docs/superpowers/specs/2026-10-11-income-statement-valuation-design.md`

## Global Constraints

- 所有 `npm` / `npx` / `node` 指令都在 `my-stock/` 下執行。
- 在 `feat/income-model` 分支上工作（從 `main` 開），不要 push 到 `main`。
- 不新增任何 npm dependency。
- 金額內部一律用來源單位**千元**；UI 顯示**億元** = 千元 ÷ 100,000。
- 比率一律存小數（`0.15` = 15%），UI 以 % 輸入與顯示。
- 只做台股上市；美股、上櫃行為不變（上櫃仍顯示「目前僅支援上市股票」）。
- 模型只對 `statement === 'general'`（有營業毛利欄位）啟用；金融股顯示「金融股不適用損益表推估」。
- 寫入需登入：service 端 `ensureCloudWritable()`；UI 端 `disabled` 時唯讀並顯示「登入後可調整估價假設」。
- 前端讀 snapshot 一律用 `${import.meta.env.BASE_URL}data/...`。
- 對 TWSE 的連續請求間隔 ≥ 1,200 ms；對 MOPS 間隔 ≥ 3,000 ms。MOPS 主機用 `mopsov.twse.com.tw`。
- UI 只用 token：CSS 用 `var(--c-*)`、`var(--fs-*)`、`var(--space-*)`、`var(--radius-*)`、`var(--icon-*)`、`var(--shadow-*)`；JS 用 `src/theme/tokens.js` 的 `COLORS`、`CHART_STOCK`。圖表不用 teal、不用炭黑。不寫 lint disable。
- 漲跌方向只標一次：▲／▼ + `up`／`down` 色，不加正負號。
- 可能為負的欄位（營收 YoY、毛利率、業外）不加 `inputMode`；其餘數字欄位 `inputMode="decimal"`。
- 每個 commit message 結尾加上：`Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`

## Review Focus

- **1～3 月（最新財報仍是去年 Q3）**：推估範圍要涵蓋去年 Q4，「今年」全部是推估（`reportedQuarters` 為 0），「明年」是今年 +1 → Task 5 測試 `projects from last year's Q4 in January`。
- **近四季稅前合計 ≤ 0（虧損公司）**：稅率回退 20%、EPS 為負，估價卡顯示「虧損中，無法用本益比估價」而不是 `NaN` → Task 4 測試 `falls back to a 20% tax rate when pre-tax income is not positive`，Task 7 測試 `reports a projected loss as loss`。
- **月初公司陸續公布月營收**：每日 merge 同一個月時，不能把其他公司或其他月份的資料洗掉 → Task 1 測試 `merges a month without touching other months or companies`。
- **舊版本同步過來的 `growthRate`**：讀取時忽略、下次儲存時從文件移除，不可報 Unknown field → Task 6 測試 `drops a legacy growthRate`。
- **月底收盤價缺值（停牌、新上市）**：河流圖該月斷線，不畫 0 → Task 12 測試 `leaves a gap for a month without a close`。

---

### Task 1: 擴充 snapshot 純函式（損益表欄位、收盤價、月營收）

**Files:**
- Modify: `src/utils/twFundamentalsMerge.js`
- Test: `src/utils/twFundamentalsMerge.test.js`

**Interfaces:**
- Consumes: 無。
- Produces（Task 2、3 使用）:
  - `normalizeIncomeRow(row, period?)` → `{code, name, year, quarter, statement: 'general'|'financial', eps, revenue, grossProfit, operatingIncome, nonOperating, pretaxIncome, tax, netIncome, parentNetIncome} | null`
  - `INCOME_VALUE_FIELDS: string[]` = `['eps','revenue','grossProfit','operatingIncome','nonOperating','pretaxIncome','tax','netIncome','parentNetIncome']`
  - `mergeEpsRows(history, rows)` → `{history, changed}`；公司形狀 `{name, statement, quarters: {[quarterKey]: {…INCOME_VALUE_FIELDS}}}`
  - `parseBwibbuRows(json)` → `Array<{code, pe: number|null, close: number|null}> | null`
  - `mergePeMonth(history, month, rows)`：每列存 `[month, pe, close]`（新到舊）
  - `hasPeMonth(history, month)`：該月有**含收盤價欄位**的列才算有
  - `parseMopsRevenueRows(html: string)` → `Array<{code, revenue: number}>`
  - `mergeMonthlyRevenue(history, month, rows)` → `{history, changed}`；形狀 `{updatedAt, companies: {[code]: {[month]: number}}}`，每家只留最近 `REVENUE_MONTHS_KEPT = 36` 個月
  - `monthsBack(month: 'YYYY-MM', count: number)` → `string[]`（含 `month`，新到舊）

- [ ] **Step 1: 建分支**

```bash
git checkout -b feat/income-model
```

- [ ] **Step 2: Write the failing tests**

在 `src/utils/twFundamentalsMerge.test.js` 的 import 加上 `INCOME_VALUE_FIELDS, mergeMonthlyRevenue, monthsBack, parseMopsRevenueRows`，並在檔尾新增：

```js
describe('normalizeIncomeRow — full income statement', () => {
  const generalRow = {
    年度: '115', 季別: '2', 公司代號: '2330', 公司名稱: '台積電',
    營業收入: '2404483690.00', 營業成本: '792877574.00',
    '營業毛利（毛損）': '1611606116.00', '營業毛利（毛損）淨額': '1611606116.00',
    營業費用: '192987740.00', '營業利益（損失）': '1425568793.00',
    營業外收入及支出: '124660980.00', '稅前淨利（淨損）': '1550229773.00',
    '所得稅費用（利益）': '270647546.00', '本期淨利（淨損）': '1279582227.00',
    '淨利（淨損）歸屬於母公司業主': '1279041690.00', '基本每股盈餘（元）': '49.33',
  }

  it('keeps every line the model needs and marks the statement as general', () => {
    expect(normalizeIncomeRow(generalRow)).toEqual({
      code: '2330', name: '台積電', year: 2026, quarter: 2, statement: 'general',
      eps: 49.33, revenue: 2404483690, grossProfit: 1611606116, operatingIncome: 1425568793,
      nonOperating: 124660980, pretaxIncome: 1550229773, tax: 270647546,
      netIncome: 1279582227, parentNetIncome: 1279041690,
    })
  })

  it('falls back to 營業毛利（毛損） when the 淨額 column is blank', () => {
    const row = { ...generalRow, '營業毛利（毛損）淨額': '' }
    expect(normalizeIncomeRow(row).grossProfit).toBe(1611606116)
  })

  it('marks a bank layout (no gross profit) as financial', () => {
    const bank = {
      公司代號: '2801', 公司名稱: '彰銀', 利息淨收益: '19,797,974',
      '繼續營業單位稅前淨利（淨損）': '16,936,820', '所得稅費用（利益）': '2,786,369',
      '本期稅後淨利（淨損）': '14,150,451', '淨利（損）歸屬於母公司業主': '14,150,451',
      '基本每股盈餘（元）': '1.20',
    }
    const result = normalizeIncomeRow(bank, { year: 2025, quarter: 3 })
    expect(result.statement).toBe('financial')
    expect(result.grossProfit).toBeNull()
    expect(result.pretaxIncome).toBe(16936820)
    expect(result.parentNetIncome).toBe(14150451)
  })
})

describe('mergeEpsRows — full statement', () => {
  it('stores every value field and the statement type', () => {
    const row = {
      code: '2330', name: '台積電', year: 2026, quarter: 2, statement: 'general',
      ...Object.fromEntries(INCOME_VALUE_FIELDS.map((field, index) => [field, index + 1])),
    }
    const { history, changed } = mergeEpsRows(null, [row])
    expect(changed).toBe(true)
    expect(history.companies['2330'].statement).toBe('general')
    expect(history.companies['2330'].quarters['2026Q2']).toEqual(
      Object.fromEntries(INCOME_VALUE_FIELDS.map((field, index) => [field, index + 1])),
    )
    expect(mergeEpsRows(history, [row]).changed).toBe(false)
  })
})

describe('BWIBBU close', () => {
  const json = {
    stat: 'OK',
    fields: ['證券代號', '證券名稱', '收盤價', '殖利率(%)', '股利年度', '本益比', '股價淨值比', '財報年/季'],
    data: [
      ['1101', '台泥', '26.30', '3.04', 114, '-', '0.85', '115/2'],
      ['2330', '台積電', '1,285.00', '1.40', 114, '28.75', '8.10', '115/2'],
    ],
  }

  it('reads the close next to the P/E', () => {
    expect(parseBwibbuRows(json)).toEqual([
      { code: '1101', pe: null, close: 26.3 },
      { code: '2330', pe: 28.75, close: 1285 },
    ])
  })

  it('stores [month, pe, close] and only counts months that carry a close', () => {
    const legacy = { updatedAt: null, companies: { 2330: [['2026-09', 28.75]] } }
    expect(hasPeMonth(legacy, '2026-09')).toBe(false)
    const merged = mergePeMonth(legacy, '2026-09', parseBwibbuRows(json))
    expect(merged.companies['2330']).toEqual([['2026-09', 28.75, 1285]])
    expect(hasPeMonth(merged, '2026-09')).toBe(true)
  })
})

describe('MOPS monthly revenue', () => {
  const html = `<table><tr><th class=tt>公司代號</th><th class=tt>公司名稱</th><th class=tt>當月營收</th></tr>
<tr align=right><td align=center>2330</td><td align=left>台積電</td><td nowrap>            511,857,399</td><td nowrap>  514,805,337</td><Td nowrap>  54.64</td></tr><tr align=right><td align=center>2337</td><td align=left>旺宏</td><td nowrap>8,367,275</td></tr>
<tr><td colspan=2>合計</td><td>1,000</td></tr></table>`

  it('reads code and this month’s revenue, skipping totals and headers', () => {
    expect(parseMopsRevenueRows(html)).toEqual([
      { code: '2330', revenue: 511857399 },
      { code: '2337', revenue: 8367275 },
    ])
  })

  it('returns no rows for a month that is not published yet', () => {
    expect(parseMopsRevenueRows('<html><body>查無資料</body></html>')).toEqual([])
  })

  it('merges a month without touching other months or companies', () => {
    const history = { updatedAt: null, companies: { 2330: { '2026-08': 514805337 }, 1101: { '2026-08': 10 } } }
    const { history: merged, changed } = mergeMonthlyRevenue(history, '2026-09', [{ code: '2330', revenue: 511857399 }])
    expect(changed).toBe(true)
    expect(merged.companies['2330']).toEqual({ '2026-08': 514805337, '2026-09': 511857399 })
    expect(merged.companies['1101']).toEqual({ '2026-08': 10 })
    expect(mergeMonthlyRevenue(merged, '2026-09', [{ code: '2330', revenue: 511857399 }]).changed).toBe(false)
  })

  it('keeps only the latest 36 months per company', () => {
    const months = monthsBack('2026-09', 40)
    let history = null
    for (const month of months) history = mergeMonthlyRevenue(history, month, [{ code: '2330', revenue: 1 }]).history
    const kept = Object.keys(history.companies['2330']).sort()
    expect(kept).toHaveLength(36)
    expect(kept[0]).toBe('2023-10')
    expect(kept.at(-1)).toBe('2026-09')
  })

  it('lists months back from a month, newest first', () => {
    expect(monthsBack('2026-02', 3)).toEqual(['2026-02', '2026-01', '2025-12'])
  })
})
```

同時把既有測試中 `normalizeIncomeRow` 的預期物件補上新欄位（舊 fixture 沒有的欄位預期為 `null`，`statement` 依是否有毛利欄位），以及既有 `parseBwibbuRows`／`mergePeMonth` 測試的預期改為含 `close`（fixture 沒有 `收盤價` 欄位時 `close: null`，`mergePeMonth` 存 `[month, pe, null]`）。

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/utils/twFundamentalsMerge.test.js`
Expected: FAIL（`parseMopsRevenueRows is not a function` 等）

- [ ] **Step 4: Implement**

在 `src/utils/twFundamentalsMerge.js`：

1. `pickNumber` 改為回傳第一個**非 null** 的值（openapi 會給空字串欄位）：

```js
const pickNumber = (row, names) => {
  for (const name of names) {
    if (row[name] === undefined) continue
    const value = parseTwNumber(row[name])
    if (value !== null) return value
  }
  return null
}
```

2. 欄位清單與 `normalizeIncomeRow`：

```js
const GROSS_PROFIT_FIELDS = ['營業毛利（毛損）淨額', '營業毛利（毛損）']
const NON_OPERATING_FIELDS = ['營業外收入及支出', '營業外損益']
const PRETAX_FIELDS = [
  '稅前淨利（淨損）',
  '繼續營業單位稅前淨利（淨損）',
  '繼續營業單位稅前損益',
  '繼續營業單位稅前純益（純損）',
]
// Only the expense-signed column: insurers' 所得稅（費用）利益 has the
// opposite sign, and they are not modelled anyway.
const TAX_FIELDS = ['所得稅費用（利益）']
const PARENT_NET_INCOME_FIELDS = ['淨利（淨損）歸屬於母公司業主', '淨利（損）歸屬於母公司業主']

export const INCOME_VALUE_FIELDS = [
  'eps', 'revenue', 'grossProfit', 'operatingIncome', 'nonOperating',
  'pretaxIncome', 'tax', 'netIncome', 'parentNetIncome',
]
```

`normalizeIncomeRow` 的 return 改為：

```js
  const hasGrossProfit = GROSS_PROFIT_FIELDS.some((name) => row[name] !== undefined)
  return {
    code,
    name: String(row['公司名稱'] ?? '').trim(),
    year,
    quarter,
    // Banks, insurers and brokers have no gross-profit line; the income
    // model only runs on the general layout.
    statement: hasGrossProfit ? 'general' : 'financial',
    eps,
    revenue: pickNumber(row, REVENUE_FIELDS),
    grossProfit: pickNumber(row, GROSS_PROFIT_FIELDS),
    operatingIncome: pickNumber(row, OPERATING_INCOME_FIELDS),
    nonOperating: pickNumber(row, NON_OPERATING_FIELDS),
    pretaxIncome: pickNumber(row, PRETAX_FIELDS),
    tax: pickNumber(row, TAX_FIELDS),
    netIncome: pickNumber(row, NET_INCOME_FIELDS),
    parentNetIncome: pickNumber(row, PARENT_NET_INCOME_FIELDS),
  }
```

3. `mergeEpsRows`：刪掉舊的 `VALUE_FIELDS`，改用 `INCOME_VALUE_FIELDS`，並存 `statement`：

```js
const sameValues = (a, b) => Boolean(a && b) && INCOME_VALUE_FIELDS.every((field) => a[field] === b[field])

export const mergeEpsRows = (history, rows) => {
  const companies = { ...(history?.companies ?? {}) }
  let changed = false
  for (const row of rows) {
    const previous = companies[row.code] ?? { name: row.name, statement: row.statement, quarters: {} }
    const key = quarterKey(row.year, row.quarter)
    const value = Object.fromEntries(INCOME_VALUE_FIELDS.map((field) => [field, row[field] ?? null]))
    const name = row.name || previous.name
    const statement = row.statement ?? previous.statement ?? null
    if (sameValues(previous.quarters[key], value) && name === previous.name && statement === previous.statement) continue
    companies[row.code] = { name, statement, quarters: { ...previous.quarters, [key]: value } }
    changed = true
  }
  return {
    history: { basis: 'cumulative', updatedAt: history?.updatedAt ?? null, companies },
    changed,
  }
}
```

4. 收盤價：

```js
export const parseBwibbuRows = (json) => {
  if (json?.stat !== 'OK' || !Array.isArray(json.fields) || !Array.isArray(json.data)) return null
  const codeIndex = json.fields.indexOf('證券代號')
  const peIndex = json.fields.indexOf('本益比')
  const closeIndex = json.fields.indexOf('收盤價')
  if (codeIndex < 0 || peIndex < 0) return null
  return json.data.map((row) => {
    const pe = parseTwNumber(row[peIndex])
    const close = closeIndex < 0 ? null : parseTwNumber(row[closeIndex])
    return {
      code: String(row[codeIndex]).trim(),
      pe: pe !== null && pe > 0 ? pe : null,
      close: close !== null && close > 0 ? close : null,
    }
  })
}

export const mergePeMonth = (history, month, rows) => {
  const companies = { ...(history?.companies ?? {}) }
  for (const { code, pe, close = null } of rows) {
    const series = (companies[code] ?? []).filter(([existing]) => existing !== month)
    series.push([month, pe, close])
    series.sort((a, b) => (a[0] < b[0] ? 1 : -1))
    companies[code] = series
  }
  return { updatedAt: history?.updatedAt ?? null, companies }
}

// Rows stored before the close was kept are [month, pe]; those months are
// fetched again so the price history fills in.
export const hasPeMonth = (history, month) =>
  Object.values(history?.companies ?? {}).some((series) =>
    series.some((entry) => entry[0] === month && entry.length >= 3),
  )
```

5. 月營收（加在檔尾）：

```js
export const REVENUE_MONTHS_KEPT = 36

export const monthsBack = (month, count) => {
  const [year, monthNumber] = month.split('-').map(Number)
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(year, monthNumber - 1 - index, 1))
    return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}`
  })
}

const cellsOf = (tr) =>
  [...tr.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((match) => stripTags(match[1]))

// MOPS t21sc03 (Big5, decoded by the caller): one table per industry, each
// company row is 公司代號 / 公司名稱 / 當月營收 / 上月營收 / …
export const parseMopsRevenueRows = (html) => {
  const rows = []
  for (const match of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = cellsOf(match[0])
    if (cells.length < 3 || !/^\d{4,6}[A-Z]?$/.test(cells[0])) continue
    const revenue = parseTwNumber(cells[2])
    if (revenue !== null) rows.push({ code: cells[0], revenue })
  }
  return rows
}

export const mergeMonthlyRevenue = (history, month, rows) => {
  const companies = { ...(history?.companies ?? {}) }
  let changed = false
  for (const { code, revenue } of rows) {
    const previous = companies[code] ?? {}
    if (previous[month] === revenue) continue
    const months = Object.keys({ ...previous, [month]: revenue }).sort().slice(-REVENUE_MONTHS_KEPT)
    const next = { ...previous, [month]: revenue }
    companies[code] = Object.fromEntries(months.map((key) => [key, next[key]]))
    changed = true
  }
  return { history: { updatedAt: history?.updatedAt ?? null, companies }, changed }
}
```

（`stripTags`、`pad2` 已在檔內，`monthsBack` 與 `cellsOf` 要放在它們定義之後。）

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/utils/twFundamentalsMerge.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/utils/twFundamentalsMerge.js src/utils/twFundamentalsMerge.test.js
git commit -m "Keep the full income statement, month-end close and monthly revenue in the TW snapshot helpers

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 資料管線搬家、抓月營收、回補

**Files:**
- Move: `public/data/tw_eps_history.json` → `data/twse/eps_history.json`
- Move: `public/data/tw_pe_history.json` → `data/twse/pe_history.json`
- Create: `data/twse/monthly_revenue.json`（由 backfill 產生）
- Modify: `scripts/lib/twse.mjs`、`scripts/update-tw-fundamentals.mjs`、`scripts/backfill-tw-fundamentals.mjs`、`.github/workflows/update-tw-fundamentals.yml`

**Interfaces:**
- Consumes（Task 1）: `normalizeIncomeRow`、`mergeEpsRows`、`parseBwibbuRows`、`mergePeMonth`、`hasPeMonth`、`parseMopsRevenueRows`、`mergeMonthlyRevenue`、`monthsBack`、`previousMonth`
- Produces（Task 3 使用）: `scripts/lib/twse.mjs` 匯出 `EPS_PATH = 'data/twse/eps_history.json'`、`PE_PATH = 'data/twse/pe_history.json'`、`REVENUE_PATH = 'data/twse/monthly_revenue.json'`、`MOPS_DELAY_MS = 3_000`、`fetchMopsRevenueMonth(month): Promise<Array<{code, revenue}>>`

這個 task 主要是 Node scripts 與網路 I/O；純邏輯已在 Task 1 測過，這裡以實際執行驗證。

- [ ] **Step 1: 搬檔**

```bash
mkdir -p data/twse
git mv public/data/tw_eps_history.json data/twse/eps_history.json
git mv public/data/tw_pe_history.json data/twse/pe_history.json
```

- [ ] **Step 2: 改 `scripts/lib/twse.mjs`**

路徑常數改為：

```js
export const EPS_PATH = 'data/twse/eps_history.json'
export const PE_PATH = 'data/twse/pe_history.json'
export const REVENUE_PATH = 'data/twse/monthly_revenue.json'
export const TWSE_DELAY_MS = 1_200
export const MOPS_DELAY_MS = 3_000
```

import 加上 `parseMopsRevenueRows`，檔尾新增：

```js
// MOPS monthly revenue summary for 上市: _0 = domestic, _1 = foreign (KY)
// companies. An unpublished month is a short page with no rows.
export const fetchMopsRevenueMonth = async (month) => {
  const [year, monthNumber] = month.split('-').map(Number)
  const rows = []
  for (const suffix of ['0', '1']) {
    const url = `https://mopsov.twse.com.tw/nas/t21/sii/t21sc03_${year - 1911}_${monthNumber}_${suffix}.html`
    const response = await fetch(url, { headers: HEADERS })
    if (response.ok) {
      const html = new TextDecoder('big5').decode(await response.arrayBuffer())
      rows.push(...parseMopsRevenueRows(html))
    } else if (response.status !== 404) {
      throw new Error(`${url} → HTTP ${response.status}`)
    }
    await sleep(MOPS_DELAY_MS)
  }
  return rows
}
```

- [ ] **Step 3: 改 `scripts/update-tw-fundamentals.mjs`**

import 加上 `mergeMonthlyRevenue, monthsBack`，以及 `REVENUE_PATH, fetchMopsRevenueMonth`。在 P/E 段落之後加：

```js
// Companies publish last month's revenue by the 10th, a few each day, so
// the latest two months are re-read daily and merged.
let revenueHistory = await readJson(REVENUE_PATH, { updatedAt: null, companies: {} })
let revenueChanged = false
for (const revenueMonth of monthsBack(previousMonth(new Date()), 2)) {
  const revenueRows = await fetchMopsRevenueMonth(revenueMonth)
  const { history, changed } = mergeMonthlyRevenue(revenueHistory, revenueMonth, revenueRows)
  revenueHistory = history
  revenueChanged ||= changed
  console.log(`Revenue ${revenueMonth}: ${revenueRows.length} rows`)
}
if (revenueChanged) {
  await writeJson(REVENUE_PATH, { ...revenueHistory, updatedAt: new Date().toISOString() })
}
```

並把檔頭註解更新為「EPS／損益表、上月月底本益比與收盤價、近兩個月月營收」。

- [ ] **Step 4: 改 `scripts/backfill-tw-fundamentals.mjs`**

import 加上 `mergeMonthlyRevenue, monthsBack` 與 `REVENUE_PATH, fetchMopsRevenueMonth`；常數加 `const REVENUE_MONTHS = 36`。`MOPS_DELAY_MS` 改從 `./lib/twse.mjs` import（刪掉本檔的同名常數）。檔尾新增：

```js
let revenueHistory = await readJson(REVENUE_PATH, { updatedAt: null, companies: {} })
for (const month of monthsBack(previousMonth(now), REVENUE_MONTHS)) {
  const stored = Object.values(revenueHistory.companies).some((months) => months[month] !== undefined)
  if (stored) continue
  const rows = await fetchMopsRevenueMonth(month)
  if (rows.length === 0) {
    console.log(`Revenue ${month}: no data`)
    continue
  }
  revenueHistory = { ...mergeMonthlyRevenue(revenueHistory, month, rows).history, updatedAt: new Date().toISOString() }
  await writeJson(REVENUE_PATH, revenueHistory)
  console.log(`Revenue ${month}: ${rows.length} rows`)
}
```

檔頭註解改為「13 季損益表（MOPS）、60 個月月底本益比與收盤價、36 個月月營收」。既有的 P/E 迴圈不用改：`hasPeMonth` 現在對沒有收盤價的舊月份回傳 false，會重抓。

- [ ] **Step 5: 改 workflow**

`.github/workflows/update-tw-fundamentals.yml` 的 `FILES` 改為：

```bash
          FILES="data/twse/eps_history.json data/twse/pe_history.json data/twse/monthly_revenue.json"
```

`workflow_dispatch.inputs.backfill.description` 改為 `'Run the historical backfill (MOPS income statements + 60 months of P/E and close + 36 months of revenue) instead of the daily update'`。

- [ ] **Step 6: 在本機跑回補（約 15 分鐘，背景執行）**

```bash
node scripts/backfill-tw-fundamentals.mjs
```

Expected: 依序印出 `EPS 2023Q3: … rows` … `P/E 2026-09: … rows` … `Revenue 2026-09: … rows`，最後沒有錯誤。中斷可以重跑（已存的月份會跳過）。

- [ ] **Step 7: 驗證資料**

```bash
node -e '
const eps = require("./data/twse/eps_history.json"), pe = require("./data/twse/pe_history.json"), rev = require("./data/twse/monthly_revenue.json");
console.log(eps.companies["2330"].statement, eps.companies["2330"].quarters["2026Q2"]);
console.log(eps.companies["2801"].statement);
console.log(pe.companies["2330"].slice(0, 2), pe.companies["1101"].slice(0, 14));
console.log(Object.keys(rev.companies["2330"]).length, rev.companies["2330"]["2026-09"]);
'
node scripts/check-tw-fundamentals.mjs
```

Expected:
- 2330 `general`，2026Q2 有 9 個欄位且皆為數字。
- 2801 `financial`。
- 2330 本益比列為 `[month, pe, close]`。
- 2330 月營收有 36 個月，`2026-09` 為 `511857399`。
- `No quarter gaps`。

另外看 1101 自 2025-11 起的本益比：若 `close` 有值、`pe` 為 null，代表那段期間虧損（TWSE 顯示「-」），屬正常；若 `close` 也是 null，代表資料缺漏，回報給使用者。

- [ ] **Step 8: Commit**

```bash
git add data/twse scripts .github/workflows/update-tw-fundamentals.yml
git commit -m "Move the TW snapshots to data/twse and add income statements, closes and monthly revenue

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

（此時前端還在讀 `public/data/tw_*.json`，會壞；Task 3 修好。不要在 Task 3 完成前部署。）

---

### Task 3: 每家公司一檔（split 腳本 + 前端 provider）

**Files:**
- Modify: `src/utils/twFundamentalsMerge.js`（加 `buildCompanyFiles`）
- Create: `scripts/split-tw-fundamentals.mjs`
- Modify: `package.json`、`.gitignore`、`vite.config.js`
- Modify: `src/services/fundamentalsProviders/twFundamentalsProvider.js`、`src/services/fundamentalsProviders/index.js`
- Test: `src/utils/twFundamentalsMerge.test.js`、`src/services/fundamentalsProviders/twFundamentalsProvider.test.js`、`src/services/fundamentalsProviders/index.test.js`

**Interfaces:**
- Consumes（Task 2）: `EPS_PATH`、`PE_PATH`、`REVENUE_PATH`、`readJson`、`writeJson`
- Produces:
  - `buildCompanyFiles({eps, pe, revenue})` → `{[code]: {code, name, statement, updatedAt, quarters, monthlyRevenue, monthly}}`
  - `getTwFundamentals(symbol)` → `null | {name, statement, cumulative, monthlyRevenue, monthly: Array<{month, pe, close}>（舊到新，最多 60）, peSeries: Array<{label, pe}>, updatedAt}`
  - `loadStockFundamentals('TW', …)` 回傳多一個 `company: {statement, cumulative, monthlyRevenue, monthly}`（Task 7、12 使用）

- [ ] **Step 1: Write the failing tests**

`src/utils/twFundamentalsMerge.test.js` import 加 `buildCompanyFiles`，新增：

```js
describe('buildCompanyFiles', () => {
  it('gives each company its statements, revenue and month-end series', () => {
    const files = buildCompanyFiles({
      eps: { updatedAt: '2026-10-05T00:00:00Z', companies: { 2330: { name: '台積電', statement: 'general', quarters: { '2026Q2': { eps: 35.17 } } } } },
      pe: { companies: { 2330: [['2026-09', 28.75, 1285]] } },
      revenue: { companies: { 2330: { '2026-09': 511857399 } } },
    })
    expect(files).toEqual({
      2330: {
        code: '2330', name: '台積電', statement: 'general', updatedAt: '2026-10-05T00:00:00Z',
        quarters: { '2026Q2': { eps: 35.17 } },
        monthlyRevenue: { '2026-09': 511857399 },
        monthly: [['2026-09', 28.75, 1285]],
      },
    })
  })

  it('still writes a company that has no revenue or P/E yet', () => {
    const files = buildCompanyFiles({ eps: { companies: { 9999: { name: '新上市', quarters: {} } } }, pe: null, revenue: null })
    expect(files['9999']).toMatchObject({ statement: null, monthlyRevenue: {}, monthly: [] })
  })
})
```

`src/services/fundamentalsProviders/twFundamentalsProvider.test.js` 整檔改為：

```js
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getTwFundamentals, resetTwFundamentalsCache } from './twFundamentalsProvider'

const file = {
  code: '2330',
  name: '台積電',
  statement: 'general',
  updatedAt: '2026-10-05T12:03:11Z',
  quarters: { '2026Q2': { eps: 35.17 } },
  monthlyRevenue: { '2026-09': 511857399 },
  monthly: [['2026-09', 28.1, 1285], ['2026-08', 27.4, 1200], ['2026-07', null, null]],
}

const response = (status, body, type = 'application/json') => ({
  ok: status === 200,
  status,
  headers: { get: () => type },
  json: async () => body,
})

beforeEach(() => {
  resetTwFundamentalsCache()
})

describe('getTwFundamentals', () => {
  it('reads one file per company, once, with the month-end series oldest first', async () => {
    globalThis.fetch = vi.fn(async () => response(200, file))
    const data = await getTwFundamentals('2330')
    expect(data).toEqual({
      name: '台積電',
      statement: 'general',
      cumulative: { '2026Q2': { eps: 35.17 } },
      monthlyRevenue: { '2026-09': 511857399 },
      monthly: [
        { month: '2026-07', pe: null, close: null },
        { month: '2026-08', pe: 27.4, close: 1200 },
        { month: '2026-09', pe: 28.1, close: 1285 },
      ],
      peSeries: [
        { label: '2026-07', pe: null },
        { label: '2026-08', pe: 27.4 },
        { label: '2026-09', pe: 28.1 },
      ],
      updatedAt: '2026-10-05T12:03:11Z',
    })
    await getTwFundamentals('2330')
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    expect(globalThis.fetch.mock.calls[0][0]).toMatch(/data\/tw\/2330\.json$/)
  })

  it('returns null for a code without a file (上櫃), including the dev server’s HTML fallback', async () => {
    globalThis.fetch = vi.fn(async () => response(404, null, 'text/html'))
    expect(await getTwFundamentals('6488')).toBeNull()
    globalThis.fetch = vi.fn(async () => response(200, null, 'text/html'))
    expect(await getTwFundamentals('6489')).toBeNull()
  })

  it('throws a readable error and retries on the next call after a failure', async () => {
    globalThis.fetch = vi.fn(async () => response(500, null))
    await expect(getTwFundamentals('2330')).rejects.toThrow('無法載入台股財報資料')
    globalThis.fetch = vi.fn(async () => response(200, file))
    expect(await getTwFundamentals('2330')).not.toBeNull()
  })
})
```

在 `src/services/fundamentalsProviders/index.test.js` 的 TW mock 回傳值補上 `statement`、`monthlyRevenue`、`monthly`、`updatedAt`（取代 `epsUpdatedAt`），並新增斷言：

```js
    expect(result.company).toEqual({
      statement: 'general',
      cumulative: raw.cumulative,
      monthlyRevenue: raw.monthlyRevenue,
      monthly: raw.monthly,
    })
    expect(result.updatedAt).toBe(raw.updatedAt)
```

（先讀該檔，看它怎麼 mock `getTwFundamentals`，用同一個 `raw` 物件。）

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/utils/twFundamentalsMerge.test.js src/services/fundamentalsProviders`
Expected: FAIL

- [ ] **Step 3: Implement `buildCompanyFiles`**（`src/utils/twFundamentalsMerge.js` 檔尾）

```js
// One small file per company for the detail sheet, so opening a stock
// downloads its own history instead of the whole market.
export const buildCompanyFiles = ({ eps, pe, revenue }) =>
  Object.fromEntries(
    Object.entries(eps?.companies ?? {}).map(([code, company]) => [
      code,
      {
        code,
        name: company.name,
        statement: company.statement ?? null,
        updatedAt: eps?.updatedAt ?? null,
        quarters: company.quarters ?? {},
        monthlyRevenue: revenue?.companies?.[code] ?? {},
        monthly: pe?.companies?.[code] ?? [],
      },
    ]),
  )
```

- [ ] **Step 4: 建 `scripts/split-tw-fundamentals.mjs`**

```js
// Runs before `vite` / `vite build`: splits the market-wide snapshots in
// data/twse/ into public/data/tw/{code}.json (gitignored).
import { rm } from 'node:fs/promises'
import { buildCompanyFiles } from '../src/utils/twFundamentalsMerge.js'
import { EPS_PATH, PE_PATH, REVENUE_PATH, readJson, writeJson } from './lib/twse.mjs'

const OUT_DIR = 'public/data/tw'

const [eps, pe, revenue] = await Promise.all([
  readJson(EPS_PATH, null),
  readJson(PE_PATH, null),
  readJson(REVENUE_PATH, null),
])
if (!eps) throw new Error(`${EPS_PATH} not found`)

const files = buildCompanyFiles({ eps, pe, revenue })
await rm(OUT_DIR, { recursive: true, force: true })
await Promise.all(Object.entries(files).map(([code, file]) => writeJson(`${OUT_DIR}/${code}.json`, file)))
console.log(`Split TW fundamentals: ${Object.keys(files).length} companies → ${OUT_DIR}`)
```

- [ ] **Step 5: `package.json`、`.gitignore`、`vite.config.js`**

`package.json` 的 `scripts` 加：

```json
    "predev": "node scripts/split-tw-fundamentals.mjs",
    "prebuild": "node scripts/split-tw-fundamentals.mjs",
```

`.gitignore` 檔尾加：

```
# Per-company TW fundamentals, split from data/twse/ by prebuild / predev
public/data/tw/
```

`vite.config.js` 的 runtime cache 規則改為：

```js
          {
            // Per-company TW fundamentals (public/data/tw/{code}.json):
            // fresh when online, last copy when offline. Not precached
            // (globPatterns excludes json).
            urlPattern: /\/data\/tw\/[^/]+\.json$/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'tw-fundamentals',
              networkTimeoutSeconds: 8,
              expiration: {
                maxEntries: 60,
                maxAgeSeconds: 60 * 60 * 24 * 14,
              },
            },
          },
```

- [ ] **Step 6: 改 provider**

`src/services/fundamentalsProviders/twFundamentalsProvider.js` 整檔：

```js
// Reads public/data/tw/{code}.json, split from data/twse/ at build time
// (scripts/split-tw-fundamentals.mjs).
const MONTH_POINTS = 60

const cache = new Map()

const companyUrl = (symbol) => `${import.meta.env.BASE_URL}data/tw/${encodeURIComponent(symbol)}.json`

// GitHub Pages answers a missing file with 404; the Vite dev server answers
// with index.html, so anything that is not JSON also means "no file".
const fetchCompany = async (symbol) => {
  const response = await fetch(companyUrl(symbol))
  const isJson = (response.headers.get('content-type') ?? '').includes('json')
  if (response.status === 404 || (response.ok && !isJson)) return null
  if (!response.ok) throw new Error(`無法載入台股財報資料（HTTP ${response.status}）`)
  return response.json()
}

const loadCompany = (symbol) => {
  if (!cache.has(symbol)) {
    cache.set(
      symbol,
      fetchCompany(symbol).catch((error) => {
        cache.delete(symbol)
        throw error
      }),
    )
  }
  return cache.get(symbol)
}

export const resetTwFundamentalsCache = () => {
  cache.clear()
}

// null = the code has no file (上櫃, newly listed, ETF …).
export const getTwFundamentals = async (symbol) => {
  const file = await loadCompany(symbol)
  if (!file) return null
  const monthly = (file.monthly ?? [])
    .slice(0, MONTH_POINTS)
    .map(([month, pe, close]) => ({ month, pe: pe ?? null, close: close ?? null }))
    .reverse()
  return {
    name: file.name,
    statement: file.statement ?? null,
    cumulative: file.quarters ?? {},
    monthlyRevenue: file.monthlyRevenue ?? {},
    monthly,
    peSeries: monthly.map(({ month, pe }) => ({ label: month, pe })),
    updatedAt: file.updatedAt ?? null,
  }
}
```

`src/services/fundamentalsProviders/index.js` 的 TW 分支 return 改為：

```js
    return {
      market,
      singles: cumulativeToSingles(raw.cumulative),
      cumulative: raw.cumulative,
      company: {
        statement: raw.statement,
        cumulative: raw.cumulative,
        monthlyRevenue: raw.monthlyRevenue,
        monthly: raw.monthly,
      },
      surprises: [],
      upcoming: [],
      peSeries: raw.peSeries,
      nextEarnings: deadline ? { date: deadline.date, label: `${deadline.label}法定截止日` } : null,
      updatedAt: raw.updatedAt,
    }
```

- [ ] **Step 7: Run tests and the split**

```bash
npx vitest run src/utils/twFundamentalsMerge.test.js src/services/fundamentalsProviders
node scripts/split-tw-fundamentals.mjs
ls public/data/tw | wc -l
du -h public/data/tw/2330.json
git status --short public/data
```

Expected: 測試 PASS；約 1,000 個檔案；2330 單檔約 10–20 KB；`git status` 不列出 `public/data/tw/`。

- [ ] **Step 8: Commit**

```bash
git add src/utils/twFundamentalsMerge.js src/utils/twFundamentalsMerge.test.js scripts/split-tw-fundamentals.mjs package.json .gitignore vite.config.js src/services/fundamentalsProviders
git commit -m "Serve TW fundamentals as one small file per company, split from data/twse at build time

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 推估模型 — 單季換算與自動預設

**Files:**
- Create: `src/utils/incomeModel.js`
- Create: `src/utils/incomeModel.fixture.js`
- Test: `src/utils/incomeModel.test.js`

**Interfaces:**
- Consumes: 無（不 import `valuation.js`，避免循環）。
- Produces:
  - `MODEL_FIELDS = ['revenueYoy','grossMargin','opexRatio','nonOperating','taxRate','nciRatio']`
  - `STATEMENT_FIELDS = ['revenue','grossProfit','operatingIncome','nonOperating','pretaxIncome','tax','netIncome','parentNetIncome','eps']`
  - `UNAVAILABLE_REASONS: {financial, incomplete, shares, 'revenue-history'}` → 中文訊息
  - `quarterKeyOf({year, quarter})` → `'2026Q3'`
  - `toSingleStatements(cumulative)` → `Array<{year, quarter, …STATEMENT_FIELDS (number|null)}>`（舊到新）
  - `recentRevenueYoy(monthlyRevenue)` → `number|null`
  - `revenueCalibration(quarters, monthlyRevenue)` → `number`
  - `computeAutoAssumptions({singles, cumulative, monthlyRevenue})` → `{status:'ok', latest:{year,quarter}, auto:{…MODEL_FIELDS}, shares, calibration} | {status:'unavailable', reason}`
  - fixture：`CUMULATIVE`、`MONTHLY_REVENUE`、`COMPANY`

- [ ] **Step 1: 建 fixture `src/utils/incomeModel.fixture.js`**

數字刻意取整，方便手算（單位千元；股數 100 千股）：

```js
// Hand-checkable company for the income-model tests: every 2025 quarter is
// Q2025, every 2026 quarter so far is Q2026, 100 thousand shares, no
// minority interest. Revenue: 2024 months 250, 2025 months 300, 2026 H1
// months 400, Q3 months 450 (published, the quarter's statement is not).
export const Q2025 = {
  revenue: 900, grossProfit: 450, operatingIncome: 270, nonOperating: 20,
  pretaxIncome: 290, tax: 58, netIncome: 232, parentNetIncome: 232, eps: 2.32,
}
export const Q2026 = {
  revenue: 1200, grossProfit: 600, operatingIncome: 360, nonOperating: 20,
  pretaxIncome: 380, tax: 76, netIncome: 304, parentNetIncome: 304, eps: 3.04,
}

const cumulate = (single, count) =>
  Object.fromEntries(Object.entries(single).map(([field, value]) => [field, Math.round(value * count * 100) / 100]))

export const CUMULATIVE = {
  '2025Q1': cumulate(Q2025, 1),
  '2025Q2': cumulate(Q2025, 2),
  '2025Q3': cumulate(Q2025, 3),
  '2025Q4': cumulate(Q2025, 4),
  '2026Q1': cumulate(Q2026, 1),
  '2026Q2': cumulate(Q2026, 2),
}

const months = (year, from, to, value) =>
  Object.fromEntries(
    Array.from({ length: to - from + 1 }, (_, index) => [`${year}-${String(from + index).padStart(2, '0')}`, value]),
  )

export const MONTHLY_REVENUE = {
  ...months(2024, 1, 12, 250),
  ...months(2025, 1, 12, 300),
  ...months(2026, 1, 6, 400),
  ...months(2026, 7, 9, 450),
}

export const COMPANY = { statement: 'general', cumulative: CUMULATIVE, monthlyRevenue: MONTHLY_REVENUE, monthly: [] }
```

- [ ] **Step 2: Write the failing tests `src/utils/incomeModel.test.js`**

```js
import { describe, it, expect } from 'vitest'
import {
  computeAutoAssumptions,
  recentRevenueYoy,
  revenueCalibration,
  toSingleStatements,
} from './incomeModel'
import { CUMULATIVE, MONTHLY_REVENUE, Q2025, Q2026 } from './incomeModel.fixture'

const singles = toSingleStatements(CUMULATIVE)

describe('toSingleStatements', () => {
  it('turns year-to-date statements into single quarters, oldest first', () => {
    expect(singles.map(({ year, quarter }) => `${year}Q${quarter}`)).toEqual([
      '2025Q1', '2025Q2', '2025Q3', '2025Q4', '2026Q1', '2026Q2',
    ])
    expect(singles[2]).toEqual({ year: 2025, quarter: 3, ...Q2025 })
    expect(singles[5]).toEqual({ year: 2026, quarter: 2, ...Q2026 })
  })

  it('leaves a field null when the previous year-to-date value is missing', () => {
    const result = toSingleStatements({ '2025Q2': { revenue: 1800, eps: 4.64 }, '2025Q3': { revenue: 2700 } })
    expect(result[0].revenue).toBeNull()
    expect(result[1].revenue).toBe(900)
    expect(result[1].eps).toBeNull()
  })
})

describe('recentRevenueYoy', () => {
  it('compares the latest three months with the same months a year earlier', () => {
    expect(recentRevenueYoy(MONTHLY_REVENUE)).toBeCloseTo(0.5, 6)
  })

  it('returns null without a year-earlier base or with a gap in the latest months', () => {
    expect(recentRevenueYoy({ '2026-07': 1, '2026-08': 1, '2026-09': 1 })).toBeNull()
    const gap = { ...MONTHLY_REVENUE }
    delete gap['2026-08']
    expect(recentRevenueYoy(gap)).toBeNull()
  })
})

describe('revenueCalibration', () => {
  const recent = singles.slice(-4)

  it('is 1 when monthly revenue matches the statements', () => {
    expect(revenueCalibration(recent, MONTHLY_REVENUE)).toBe(1)
  })

  it('is 1 within 3%, the ratio beyond it, and 1 when months are missing', () => {
    const scaled = (factor) =>
      Object.fromEntries(Object.entries(MONTHLY_REVENUE).map(([month, value]) => [month, value * factor]))
    expect(revenueCalibration(recent, scaled(1 / 1.02))).toBe(1)
    expect(revenueCalibration(recent, scaled(1 / 1.1))).toBeCloseTo(1.1, 6)
    expect(revenueCalibration(recent, {})).toBe(1)
  })
})

describe('computeAutoAssumptions', () => {
  it('derives every default from the latest four quarters', () => {
    const result = computeAutoAssumptions({ singles, cumulative: CUMULATIVE, monthlyRevenue: MONTHLY_REVENUE })
    expect(result.status).toBe('ok')
    expect(result.latest).toEqual({ year: 2026, quarter: 2 })
    expect(result.auto.revenueYoy).toBeCloseTo(0.5, 6)
    expect(result.auto.grossMargin).toBeCloseTo(0.5, 6)
    // (2100 − 1260) / 4200
    expect(result.auto.opexRatio).toBeCloseTo(0.2, 6)
    expect(result.auto.nonOperating).toBeCloseTo(20, 6)
    // 268 / 1340
    expect(result.auto.taxRate).toBeCloseTo(0.2, 6)
    expect(result.auto.nciRatio).toBeCloseTo(0, 6)
    // 608 thousand NTD ÷ 6.08 NTD
    expect(result.shares).toBeCloseTo(100, 6)
    expect(result.calibration).toBe(1)
  })

  it('falls back to a 20% tax rate when pre-tax income is not positive', () => {
    const loss = Object.fromEntries(
      Object.entries(CUMULATIVE).map(([key, values]) => [key, { ...values, pretaxIncome: -values.pretaxIncome, tax: -values.tax }]),
    )
    const result = computeAutoAssumptions({ singles: toSingleStatements(loss), cumulative: loss, monthlyRevenue: MONTHLY_REVENUE })
    expect(result.auto.taxRate).toBe(0.2)
  })

  it('reports why it cannot run', () => {
    const missingField = { ...CUMULATIVE, '2026Q2': { ...CUMULATIVE['2026Q2'], grossProfit: null } }
    expect(
      computeAutoAssumptions({ singles: toSingleStatements(missingField), cumulative: missingField, monthlyRevenue: MONTHLY_REVENUE }),
    ).toEqual({ status: 'unavailable', reason: 'incomplete' })

    const short = { '2026Q1': CUMULATIVE['2026Q1'], '2026Q2': CUMULATIVE['2026Q2'] }
    expect(
      computeAutoAssumptions({ singles: toSingleStatements(short), cumulative: short, monthlyRevenue: MONTHLY_REVENUE }).reason,
    ).toBe('incomplete')

    const zeroEps = { ...CUMULATIVE, '2026Q2': { ...CUMULATIVE['2026Q2'], eps: 0 } }
    expect(
      computeAutoAssumptions({ singles: toSingleStatements(zeroEps), cumulative: zeroEps, monthlyRevenue: MONTHLY_REVENUE }).reason,
    ).toBe('shares')

    expect(computeAutoAssumptions({ singles, cumulative: CUMULATIVE, monthlyRevenue: {} }).reason).toBe('revenue-history')
  })
})
```

注意 `zeroEps`：把 2026Q2 累計 EPS 設 0 會讓單季 EPS 變成 −3.04，但這不影響「近四季資料完整」的判斷（仍是有限數字），所以會走到股數檢查。

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/utils/incomeModel.test.js`
Expected: FAIL（`Cannot find module './incomeModel'`）

- [ ] **Step 4: Implement `src/utils/incomeModel.js`（第一部分）**

```js
// Quarter-by-quarter income-statement projection for TW listed stocks.
// Pure functions; see
// docs/superpowers/specs/2026-10-11-income-statement-valuation-design.md.
// Amounts are in thousand NTD as published; ratios are fractions.

export const MODEL_FIELDS = ['revenueYoy', 'grossMargin', 'opexRatio', 'nonOperating', 'taxRate', 'nciRatio']

export const STATEMENT_FIELDS = [
  'revenue', 'grossProfit', 'operatingIncome', 'nonOperating',
  'pretaxIncome', 'tax', 'netIncome', 'parentNetIncome', 'eps',
]

export const UNAVAILABLE_REASONS = {
  financial: '金融股不適用損益表推估',
  incomplete: '近四季財報資料不完整',
  shares: '無法計算股數',
  'revenue-history': '月營收資料不足',
}

const CALIBRATION_TOLERANCE = 0.03
const DEFAULT_TAX_RATE = 0.2

const round = (value, digits = 4) => Math.round(value * 10 ** digits) / 10 ** digits
const sum = (values) => values.reduce((total, value) => total + value, 0)

export const quarterIndexOf = ({ year, quarter }) => year * 4 + (quarter - 1)
export const quarterOfIndex = (index) => ({ year: Math.floor(index / 4), quarter: (index % 4) + 1 })
export const quarterKeyOf = ({ year, quarter }) => `${year}Q${quarter}`
export const parseQuarterKey = (key) => {
  const [year, quarter] = key.split('Q').map(Number)
  return { year, quarter }
}

const monthKey = (year, month) => `${year}-${String(month).padStart(2, '0')}`
const monthIndex = (key) => Number(key.slice(0, 4)) * 12 + Number(key.slice(5, 7)) - 1
export const monthsOfQuarter = ({ year, quarter }) => [1, 2, 3].map((offset) => monthKey(year, (quarter - 1) * 3 + offset))
export const shiftYear = (key, years) => `${Number(key.slice(0, 4)) + years}${key.slice(4)}`

export const toSingleStatements = (cumulative) => {
  const entries = Object.entries(cumulative ?? {})
    .map(([key, values]) => ({ ...parseQuarterKey(key), values }))
    .sort((a, b) => quarterIndexOf(a) - quarterIndexOf(b))
  const byIndex = new Map(entries.map((entry) => [quarterIndexOf(entry), entry.values]))
  return entries.map(({ year, quarter, values }) => {
    const previous = quarter === 1 ? null : byIndex.get(quarterIndexOf({ year, quarter }) - 1)
    const single = { year, quarter }
    for (const field of STATEMENT_FIELDS) {
      const value = values?.[field]
      if (!Number.isFinite(value)) single[field] = null
      else if (quarter === 1) single[field] = value
      else single[field] = Number.isFinite(previous?.[field]) ? round(value - previous[field]) : null
    }
    return single
  })
}

const latestFourComplete = (singles) => {
  const quarters = singles.slice(-4)
  if (quarters.length < 4) return null
  for (let i = 1; i < quarters.length; i += 1) {
    if (quarterIndexOf(quarters[i]) !== quarterIndexOf(quarters[i - 1]) + 1) return null
  }
  if (quarters.some((item) => STATEMENT_FIELDS.some((field) => !Number.isFinite(item[field])))) return null
  return quarters
}

export const recentRevenueYoy = (monthlyRevenue) => {
  const recent = Object.keys(monthlyRevenue ?? {}).sort().slice(-3)
  if (recent.length < 3 || monthIndex(recent[2]) - monthIndex(recent[0]) !== 2) return null
  const current = recent.map((month) => monthlyRevenue[month])
  const base = recent.map((month) => monthlyRevenue[shiftYear(month, -1)])
  if ([...current, ...base].some((value) => !Number.isFinite(value))) return null
  const baseTotal = sum(base)
  return baseTotal > 0 ? sum(current) / baseTotal - 1 : null
}

// Statement revenue ÷ the same quarters' monthly revenue: corrects a
// company whose monthly figure is reported on a different basis.
export const revenueCalibration = (quarters, monthlyRevenue) => {
  const monthly = quarters.flatMap((quarter) => monthsOfQuarter(quarter).map((month) => monthlyRevenue?.[month]))
  if (monthly.some((value) => !Number.isFinite(value))) return 1
  const monthlyTotal = sum(monthly)
  if (!(monthlyTotal > 0)) return 1
  const factor = sum(quarters.map((quarter) => quarter.revenue)) / monthlyTotal
  return Math.abs(factor - 1) <= CALIBRATION_TOLERANCE ? 1 : factor
}

const unavailable = (reason) => ({ status: 'unavailable', reason })

export const computeAutoAssumptions = ({ singles, cumulative, monthlyRevenue }) => {
  const recent = latestFourComplete(singles)
  if (!recent) return unavailable('incomplete')
  const total = (field) => sum(recent.map((item) => item[field]))
  const revenue = total('revenue')
  if (!(revenue > 0)) return unavailable('incomplete')
  const latest = { year: recent[3].year, quarter: recent[3].quarter }
  const latestCumulative = cumulative?.[quarterKeyOf(latest)]
  const shares =
    Number.isFinite(latestCumulative?.eps) && latestCumulative.eps !== 0
      ? latestCumulative.parentNetIncome / latestCumulative.eps
      : null
  if (!(shares > 0)) return unavailable('shares')
  const revenueYoy = recentRevenueYoy(monthlyRevenue)
  if (revenueYoy === null) return unavailable('revenue-history')
  const grossProfit = total('grossProfit')
  const pretax = total('pretaxIncome')
  const netIncome = total('netIncome')
  return {
    status: 'ok',
    latest,
    auto: {
      revenueYoy,
      grossMargin: grossProfit / revenue,
      opexRatio: (grossProfit - total('operatingIncome')) / revenue,
      nonOperating: total('nonOperating') / 4,
      taxRate: pretax > 0 ? total('tax') / pretax : DEFAULT_TAX_RATE,
      nciRatio: netIncome > 0 ? 1 - total('parentNetIncome') / netIncome : 0,
    },
    shares,
    calibration: revenueCalibration(recent, monthlyRevenue),
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/utils/incomeModel.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/utils/incomeModel.js src/utils/incomeModel.fixture.js src/utils/incomeModel.test.js
git commit -m "Derive single-quarter statements and default assumptions for the income model

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: 推估模型 — 逐季推估、彙總、預估 vs 實際

**Files:**
- Modify: `src/utils/incomeModel.js`
- Test: `src/utils/incomeModel.test.js`

**Interfaces:**
- Consumes（Task 4）: `computeAutoAssumptions`、`toSingleStatements`、`quarterIndexOf`、`quarterOfIndex`、`quarterKeyOf`、`monthsOfQuarter`、`shiftYear`、`MODEL_FIELDS`
- Produces（Task 7、9–13 使用）:
  - `projectIncome(company: {statement, cumulative, monthlyRevenue}, assumptions: {global, quarters}|undefined, {todayIso})` →
    `{status:'unavailable', reason}` 或
    ```
    {
      status: 'ok', latest: {year, quarter}, shares, calibration, auto,
      reported: singles（toSingleStatements 結果）,
      quarters: Array<ProjectedQuarter>,
      nextQuarter: ProjectedQuarter & {yoy: number|null, qoq: number|null},
      ttmAfterNext: {eps, from: {year, quarter}},
      thisYear: {year, eps, reportedQuarters},
      nextYear: {year, eps},
      rollingTtm: Array<{year, quarter, eps}>,
    }
    ```
    `ProjectedQuarter = {year, quarter, key, reportedMonths, revenue, grossProfit, operatingIncome, pretaxIncome, netIncome, parentNetIncome, eps, overridden: boolean, assumptions: {[field]: {value, source: 'quarter'|'global'|'auto'}}}`
  - `compareSnapshots(snapshots, reported)` → `Array<{key, year, quarter, savedAt, estimate: {eps, revenue, grossMargin, opexRatio}, actual: {同}, epsDiff: number|null}>`（新到舊）

- [ ] **Step 1: Write the failing tests**（加到 `src/utils/incomeModel.test.js`，import 加 `compareSnapshots, projectIncome`，fixture import 加 `COMPANY`）

```js
const TODAY = '2026-10-11'
const project = (assumptions, todayIso = TODAY, company = COMPANY) => projectIncome(company, assumptions, { todayIso })
const epsOf = (result) => Object.fromEntries(result.quarters.map((item) => [item.key, item.eps]))

describe('projectIncome', () => {
  it('projects from the first unpublished quarter to next year’s Q4', () => {
    const result = project()
    expect(result.status).toBe('ok')
    expect(result.quarters.map((item) => item.key)).toEqual([
      '2026Q3', '2026Q4', '2027Q1', '2027Q2', '2027Q3', '2027Q4',
    ])
    // Q3 revenue is all published (3 × 450); Q4 grows last year's 300s by 50%;
    // 2027 grows 2026's actual / projected months by another 50%.
    expect(result.quarters[0]).toMatchObject({ reportedMonths: 3, revenue: 1350 })
    expect(result.quarters[1]).toMatchObject({ reportedMonths: 0, revenue: 1350 })
    expect(result.quarters[2].revenue).toBeCloseTo(1800, 6)
    expect(result.quarters[4].revenue).toBeCloseTo(2025, 6)
    expect(result.quarters[5].revenue).toBeCloseTo(2025, 6)
    const eps = epsOf(result)
    expect(eps['2026Q3']).toBeCloseTo(3.4, 6)
    expect(eps['2026Q4']).toBeCloseTo(3.4, 6)
    expect(eps['2027Q1']).toBeCloseTo(4.48, 6)
    expect(eps['2027Q3']).toBeCloseTo(5.02, 6)
  })

  it('walks the chain revenue → gross profit → operating → pre-tax → net', () => {
    const q3 = project().quarters[0]
    expect(q3.grossProfit).toBeCloseTo(675, 6)
    expect(q3.operatingIncome).toBeCloseTo(405, 6)
    expect(q3.pretaxIncome).toBeCloseTo(425, 6)
    expect(q3.netIncome).toBeCloseTo(340, 6)
    expect(q3.parentNetIncome).toBeCloseTo(340, 6)
    expect(q3.assumptions.grossMargin).toEqual({ value: expect.closeTo(0.5, 6), source: 'auto' })
  })

  it('sums next quarter, the TTM after it, this year, next year and the rolling TTM', () => {
    const result = project()
    expect(result.nextQuarter.key).toBe('2026Q3')
    expect(result.nextQuarter.yoy).toBeCloseTo(3.4 / 2.32 - 1, 6)
    expect(result.nextQuarter.qoq).toBeCloseTo(3.4 / 3.04 - 1, 6)
    expect(result.ttmAfterNext.eps).toBeCloseTo(11.8, 4)
    expect(result.ttmAfterNext.from).toEqual({ year: 2025, quarter: 4 })
    expect(result.thisYear).toEqual({ year: 2026, eps: expect.closeTo(12.88, 4), reportedQuarters: 2 })
    expect(result.nextYear).toEqual({ year: 2027, eps: expect.closeTo(19.0, 4) })
    expect(result.rollingTtm.map((item) => item.eps)).toEqual([
      expect.closeTo(11.8, 4), expect.closeTo(12.88, 4), expect.closeTo(14.32, 4),
      expect.closeTo(15.76, 4), expect.closeTo(17.38, 4), expect.closeTo(19.0, 4),
    ])
  })

  it('prefers a quarter override over a global one over the default', () => {
    const result = project({
      global: { grossMargin: 0.6 },
      quarters: { '2026Q4': { grossMargin: 0.55 }, '2026Q2': { grossMargin: 0.9 } },
    })
    const [q3, q4] = result.quarters
    expect(q3.assumptions.grossMargin).toEqual({ value: 0.6, source: 'global' })
    expect(q3.eps).toBeCloseTo(4.48, 6)
    expect(q4.assumptions.grossMargin).toEqual({ value: 0.55, source: 'quarter' })
    expect(q4.overridden).toBe(true)
    expect(q4.eps).toBeCloseTo(3.94, 6)
    expect(q3.overridden).toBe(false)
  })

  it('grows only the unpublished months by the revenue YoY', () => {
    const result = project({ global: {}, quarters: { '2026Q3': { revenueYoy: 0 }, '2026Q4': { revenueYoy: 0 } } })
    expect(result.quarters[0].revenue).toBe(1350)
    expect(result.quarters[1].revenue).toBe(900)
    expect(result.quarters[1].eps).toBeCloseTo(2.32, 6)
  })

  it('takes minority interest out before EPS', () => {
    const q3 = project({ global: { nciRatio: 0.1 }, quarters: {} }).quarters[0]
    expect(q3.parentNetIncome).toBeCloseTo(306, 6)
    expect(q3.eps).toBeCloseTo(3.06, 6)
  })

  it('projects from last year’s Q4 in January', () => {
    const result = project(undefined, '2027-01-20')
    expect(result.quarters[0].key).toBe('2026Q3')
    expect(result.quarters.at(-1).key).toBe('2028Q4')
    expect(result.thisYear).toEqual({ year: 2027, eps: expect.closeTo(19.0, 4), reportedQuarters: 0 })
    expect(result.nextYear.year).toBe(2028)
  })

  it('is unavailable for financial statements and missing revenue history', () => {
    expect(project(undefined, TODAY, { ...COMPANY, statement: 'financial' })).toEqual({
      status: 'unavailable',
      reason: 'financial',
    })
    const thin = { ...COMPANY, monthlyRevenue: { '2025-07': 300, '2025-08': 300, '2025-09': 300, '2026-07': 450, '2026-08': 450, '2026-09': 450 } }
    expect(project(undefined, TODAY, thin)).toEqual({ status: 'unavailable', reason: 'revenue-history' })
  })
})

describe('compareSnapshots', () => {
  const reported = toSingleStatements(CUMULATIVE)

  it('pairs each snapshot with the quarter’s actual figures, newest first, once published', () => {
    const snapshots = {
      '2026Q1': { eps: 2.8, revenue: 1100, grossMargin: 0.48, opexRatio: 0.21, savedAt: '2026-04-20T00:00:00Z' },
      '2026Q2': { eps: 3.2, revenue: 1250, grossMargin: 0.5, opexRatio: 0.2, savedAt: '2026-07-20T00:00:00Z' },
      '2026Q3': { eps: 3.4, revenue: 1350, grossMargin: 0.5, opexRatio: 0.2, savedAt: '2026-10-11T00:00:00Z' },
    }
    const result = compareSnapshots(snapshots, reported)
    expect(result.map((item) => item.key)).toEqual(['2026Q2', '2026Q1'])
    expect(result[0]).toMatchObject({
      year: 2026,
      quarter: 2,
      savedAt: '2026-07-20T00:00:00Z',
      estimate: { eps: 3.2, revenue: 1250 },
      actual: { eps: 3.04, revenue: 1200, grossMargin: 0.5, opexRatio: 0.2 },
    })
    expect(result[0].epsDiff).toBeCloseTo(3.04 / 3.2 - 1, 6)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/utils/incomeModel.test.js`
Expected: FAIL（`projectIncome is not a function`）

- [ ] **Step 3: Implement**（加到 `src/utils/incomeModel.js` 檔尾）

```js
const resolveAssumption = (field, key, auto, assumptions) => {
  const quarterValue = assumptions?.quarters?.[key]?.[field]
  if (Number.isFinite(quarterValue)) return { value: quarterValue, source: 'quarter' }
  const globalValue = assumptions?.global?.[field]
  if (Number.isFinite(globalValue)) return { value: globalValue, source: 'global' }
  return { value: auto[field], source: 'auto' }
}

const changeRatio = (value, base) => (Number.isFinite(value) && Number.isFinite(base) && base > 0 ? value / base - 1 : null)

export const projectIncome = (company, assumptions, { todayIso }) => {
  if (company?.statement !== 'general') return unavailable('financial')
  const reported = toSingleStatements(company.cumulative)
  const base = computeAutoAssumptions({ singles: reported, cumulative: company.cumulative, monthlyRevenue: company.monthlyRevenue })
  if (base.status !== 'ok') return base
  const { auto, shares, calibration, latest } = base
  const thisYear = Number(todayIso.slice(0, 4))
  const firstIndex = quarterIndexOf(latest) + 1
  const lastIndex = quarterIndexOf({ year: thisYear + 1, quarter: 4 })

  // Published months, then each projected month as it is computed, so next
  // year's months grow this year's projections.
  const revenueByMonth = { ...company.monthlyRevenue }
  const quarters = []
  for (let index = firstIndex; index <= lastIndex; index += 1) {
    const period = quarterOfIndex(index)
    const key = quarterKeyOf(period)
    const resolved = Object.fromEntries(
      MODEL_FIELDS.map((field) => [field, resolveAssumption(field, key, auto, assumptions)]),
    )
    let reportedMonths = 0
    let monthlyTotal = 0
    for (const month of monthsOfQuarter(period)) {
      if (Number.isFinite(company.monthlyRevenue?.[month])) {
        reportedMonths += 1
        monthlyTotal += company.monthlyRevenue[month]
        continue
      }
      const lastYear = revenueByMonth[shiftYear(month, -1)]
      if (!Number.isFinite(lastYear)) return unavailable('revenue-history')
      revenueByMonth[month] = lastYear * (1 + resolved.revenueYoy.value)
      monthlyTotal += revenueByMonth[month]
    }
    const revenue = monthlyTotal * calibration
    const grossProfit = revenue * resolved.grossMargin.value
    const operatingIncome = grossProfit - revenue * resolved.opexRatio.value
    const pretaxIncome = operatingIncome + resolved.nonOperating.value
    const netIncome = pretaxIncome * (1 - resolved.taxRate.value)
    const parentNetIncome = netIncome * (1 - resolved.nciRatio.value)
    const overrides = assumptions?.quarters?.[key] ?? {}
    quarters.push({
      ...period,
      key,
      reportedMonths,
      revenue,
      grossProfit,
      operatingIncome,
      pretaxIncome,
      netIncome,
      parentNetIncome,
      eps: round(parentNetIncome / shares),
      overridden: MODEL_FIELDS.some((field) => Number.isFinite(overrides[field])),
      assumptions: resolved,
    })
  }

  const epsByIndex = new Map([
    ...reported.map((item) => [quarterIndexOf(item), item.eps]),
    ...quarters.map((item) => [quarterIndexOf(item), item.eps]),
  ])
  const sumEps = (from, to) => {
    let total = 0
    for (let index = from; index <= to; index += 1) {
      const value = epsByIndex.get(index)
      if (!Number.isFinite(value)) return null
      total += value
    }
    return round(total)
  }

  const next = quarters[0]
  return {
    status: 'ok',
    latest,
    shares,
    calibration,
    auto,
    reported,
    quarters,
    nextQuarter: {
      ...next,
      yoy: changeRatio(next.eps, epsByIndex.get(firstIndex - 4)),
      qoq: changeRatio(next.eps, epsByIndex.get(firstIndex - 1)),
    },
    ttmAfterNext: { eps: sumEps(firstIndex - 3, firstIndex), from: quarterOfIndex(firstIndex - 3) },
    thisYear: {
      year: thisYear,
      eps: sumEps(quarterIndexOf({ year: thisYear, quarter: 1 }), quarterIndexOf({ year: thisYear, quarter: 4 })),
      reportedQuarters: latest.year === thisYear ? latest.quarter : 0,
    },
    nextYear: {
      year: thisYear + 1,
      eps: sumEps(quarterIndexOf({ year: thisYear + 1, quarter: 1 }), lastIndex),
    },
    rollingTtm: quarters.map((item) => ({
      year: item.year,
      quarter: item.quarter,
      eps: sumEps(quarterIndexOf(item) - 3, quarterIndexOf(item)),
    })),
  }
}

const ratioOf = (part, whole) => (Number.isFinite(part) && whole > 0 ? part / whole : null)

// Snapshots of quarters that have since been published, with the actual
// figures next to the estimate.
export const compareSnapshots = (snapshots, reported) =>
  Object.entries(snapshots ?? {})
    .map(([key, estimate]) => {
      const { year, quarter } = parseQuarterKey(key)
      const actual = reported.find((item) => item.year === year && item.quarter === quarter)
      if (!actual || !Number.isFinite(actual.eps) || !(actual.revenue > 0)) return null
      return {
        key,
        year,
        quarter,
        savedAt: estimate.savedAt ?? null,
        estimate,
        actual: {
          eps: actual.eps,
          revenue: actual.revenue,
          grossMargin: ratioOf(actual.grossProfit, actual.revenue),
          opexRatio: ratioOf(actual.grossProfit - actual.operatingIncome, actual.revenue),
        },
        epsDiff: changeRatio(actual.eps, estimate.eps),
      }
    })
    .filter(Boolean)
    .sort((a, b) => quarterIndexOf(b) - quarterIndexOf(a))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/utils/incomeModel.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/incomeModel.js src/utils/incomeModel.test.js
git commit -m "Project the income statement quarter by quarter to next year's Q4, and compare snapshots with actuals

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: 估價設定的新結構（model、snapshots），移除 growthRate

**Files:**
- Modify: `src/utils/valuation.js`（`VALUATION_SETTING_FIELDS`、`EMPTY_VALUATION_SETTINGS`）
- Modify: `src/services/portfolioService.js:880-935`
- Modify: `src/hooks/useValuationSettings.js`
- Modify: `src/components/stockDetail/ValuationAssumptions.jsx`（只移除成長率欄位）
- Test: `src/services/portfolioService.valuation.test.js`、`src/components/stockDetail/ValuationAssumptions.test.jsx`

**Interfaces:**
- Consumes（Task 4）: `MODEL_FIELDS`、`quarterIndexOf`、`parseQuarterKey`
- Produces:
  - `VALUATION_SETTING_FIELDS = ['peCheap','peFair','peExpensive','forwardEps']`
  - `EMPTY_VALUATION_SETTINGS = {peCheap:null, peFair:null, peExpensive:null, forwardEps:null, model:{global:{6 個 null}, quarters:{}}, snapshots:{}}`（deep frozen）
  - `getValuationSettings({market, symbol})` → 上述形狀
  - `saveValuationSettings({market, symbol, patch, snapshot?})`：`patch = {peFair?, …, model?: {global?: {[field]: value|null}, quarters?: {[key]: {[field]: value|null}}}}`；`snapshot = {quarter, eps, revenue, grossMargin, opexRatio} | null`
  - `useValuationSettings(...).save(patch, snapshot?)`

- [ ] **Step 1: Write the failing tests**

`src/services/portfolioService.valuation.test.js`：import 加 `EMPTY_VALUATION_SETTINGS`（from `'../utils/valuation'`）。

把 `returns all-null settings` 測試的預期改為 `toEqual(EMPTY_VALUATION_SETTINGS)`；把 `merges a patch` 測試中的 `growthRate: '0.15'` 改為 `forwardEps: '81.5'`，預期 `valuation` 中為 `forwardEps: 81.5`；`rejects invalid values` 中的 `growthRate: -1` 那行改為 `growthRate: 0.1` 預期 `rejects.toThrow('growthRate')`（未知欄位）。然後新增：

```js
  it('drops a legacy growthRate synced from an older version', async () => {
    await db.app_config.put({
      key: 'valuation:TW_2330',
      valuation: { peFair: 18, growthRate: 0.15 },
      updatedAt: '2026-10-01T00:00:00.000Z',
      deletedAt: null,
    })
    expect(await getValuationSettings({ market: 'TW', symbol: '2330' })).not.toHaveProperty('growthRate')
    await save({ market: 'TW', symbol: '2330', patch: { peCheap: 12 } })
    expect(writeCollectionRecord.mock.calls[0][0].record.valuation).not.toHaveProperty('growthRate')
  })

  it('merges model assumptions, clearing a field with null', async () => {
    await save({
      market: 'TW',
      symbol: '2330',
      patch: { model: { global: { grossMargin: '0.55', nonOperating: -1200 }, quarters: { '2026Q4': { opexRatio: 0.1 } } } },
    })
    await save({
      market: 'TW',
      symbol: '2330',
      patch: { model: { global: { grossMargin: null }, quarters: { '2026Q4': { opexRatio: null }, '2027Q1': { taxRate: 0.18 } } } },
    })
    const settings = await getValuationSettings({ market: 'TW', symbol: '2330' })
    expect(settings.model.global).toMatchObject({ grossMargin: null, nonOperating: -1200 })
    expect(settings.model.quarters).toEqual({ '2027Q1': { taxRate: 0.18 } })
  })

  it('validates model assumptions', async () => {
    const patch = (global) => save({ market: 'TW', symbol: '2330', patch: { model: { global } } })
    await expect(patch({ revenueYoy: -1 })).rejects.toThrow('營收 YoY 必須大於 -100%')
    await expect(patch({ grossMargin: 1.2 })).rejects.toThrow('毛利率必須介於 -100% 與 100%')
    await expect(patch({ opexRatio: -0.1 })).rejects.toThrow('營業費用率必須介於 0% 與 100%')
    await expect(patch({ taxRate: 1.5 })).rejects.toThrow('稅率必須介於 0% 與 100%')
    await expect(patch({ nciRatio: -0.1 })).rejects.toThrow('非控制權益比必須介於 0% 與 100%')
    await expect(patch({ foo: 1 })).rejects.toThrow('foo')
    await expect(
      save({ market: 'TW', symbol: '2330', patch: { model: { quarters: { '2026Q5': { taxRate: 0.2 } } } } }),
    ).rejects.toThrow('2026Q5')
    expect(writeCollectionRecord).not.toHaveBeenCalled()
  })

  it('records a snapshot, drops overrides of published quarters and keeps 8 snapshots', async () => {
    await save({
      market: 'TW',
      symbol: '2330',
      patch: { model: { quarters: { '2026Q2': { grossMargin: 0.5 }, '2026Q4': { grossMargin: 0.55 } } } },
    })
    for (let index = 0; index < 9; index += 1) {
      const year = 2024 + Math.floor(index / 4)
      const quarter = (index % 4) + 1
      await save({
        market: 'TW',
        symbol: '2330',
        patch: {},
        snapshot: { quarter: `${year}Q${quarter}`, eps: index, revenue: 100, grossMargin: 0.5, opexRatio: 0.2 },
      })
    }
    await save({
      market: 'TW',
      symbol: '2330',
      patch: {},
      snapshot: { quarter: '2026Q3', eps: 3.4, revenue: 1350, grossMargin: 0.5, opexRatio: 0.2 },
    })
    const settings = await getValuationSettings({ market: 'TW', symbol: '2330' })
    expect(settings.model.quarters).toEqual({ '2026Q4': { grossMargin: 0.55 } })
    expect(Object.keys(settings.snapshots).sort()).toEqual([
      '2024Q3', '2024Q4', '2025Q1', '2025Q2', '2025Q3', '2025Q4', '2026Q1', '2026Q3',
    ])
    expect(settings.snapshots['2026Q3']).toEqual({
      eps: 3.4,
      revenue: 1350,
      grossMargin: 0.5,
      opexRatio: 0.2,
      savedAt: expect.any(String),
    })
  })
```

`ValuationAssumptions.test.jsx`：刪除 `warns about an extreme growth rate`、`shows that the growth rate is unknown rather than 0` 兩個測試；`saves only the changed fields` 改為只改 `合理本益比` 與 `預估 EPS`（`fireEvent.change(screen.getByLabelText('預估 EPS'), { target: { value: '80' } })`），預期 `onSave` 被呼叫為 `({ peFair: 20, forwardEps: 80 }, null)`；`resets an overridden field` 的預期改為 `toHaveBeenCalledWith({ peFair: null }, null)`；`hides growth rate for US stocks` 改名為 `never shows a growth-rate field`，對 `market="TW"` 與 `"US"` 都斷言 `queryByLabelText('成長率 (%)')` 為 null。

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/services/portfolioService.valuation.test.js src/components/stockDetail/ValuationAssumptions.test.jsx`
Expected: FAIL

- [ ] **Step 3: `src/utils/valuation.js` 的設定常數**

檔頭 import 加 `import { MODEL_FIELDS } from './incomeModel'`，把原本的兩個常數改為：

```js
export const VALUATION_SETTING_FIELDS = ['peCheap', 'peFair', 'peExpensive', 'forwardEps']

export const EMPTY_MODEL_ASSUMPTIONS = Object.freeze({
  global: Object.freeze(Object.fromEntries(MODEL_FIELDS.map((field) => [field, null]))),
  quarters: Object.freeze({}),
})

export const EMPTY_VALUATION_SETTINGS = Object.freeze({
  ...Object.fromEntries(VALUATION_SETTING_FIELDS.map((field) => [field, null])),
  model: EMPTY_MODEL_ASSUMPTIONS,
  snapshots: Object.freeze({}),
})
```

（`estimateTwForwardEps` 仍讀 `settings?.growthRate`，現在永遠是 undefined → 用自動成長率；Task 7 會整個移除它。）

- [ ] **Step 4: `src/services/portfolioService.js`**

import 加 `import { MODEL_FIELDS, parseQuarterKey, quarterIndexOf } from "../utils/incomeModel";`（確認 `VALUATION_SETTING_FIELDS`、`EMPTY_VALUATION_SETTINGS` 已從 `../utils/valuation` import）。把 `normalizeValuationValue` 中的 `growthRate` 分支刪掉，然後把 `getValuationSettings`／`saveValuationSettings` 換成：

```js
const MODEL_FIELD_RULES = {
  revenueYoy: { min: -1, minExclusive: true, message: "營收 YoY 必須大於 -100%" },
  grossMargin: { min: -1, max: 1, message: "毛利率必須介於 -100% 與 100%" },
  opexRatio: { min: 0, max: 1, message: "營業費用率必須介於 0% 與 100%" },
  nonOperating: {},
  taxRate: { min: 0, max: 1, message: "稅率必須介於 0% 與 100%" },
  nciRatio: { min: 0, max: 1, message: "非控制權益比必須介於 0% 與 100%" },
};

const QUARTER_KEY_PATTERN = /^\d{4}Q[1-4]$/;
const SNAPSHOT_LIMIT = 8;

const quarterOrder = (key) => quarterIndexOf(parseQuarterKey(key));

const normalizeModelValue = (field, value) => {
  if (!MODEL_FIELDS.includes(field)) {
    throw new Error(`Unknown valuation field: ${field}`);
  }
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`${field} 必須是數字`);
  }
  const { min = -Infinity, max = Infinity, minExclusive = false, message } = MODEL_FIELD_RULES[field];
  if ((minExclusive ? number <= min : number < min) || number > max) {
    throw new Error(message);
  }
  return number;
};

const readModelAssumptions = (stored) => {
  const quarters = {};
  for (const [key, values] of Object.entries(stored?.quarters ?? {})) {
    if (!QUARTER_KEY_PATTERN.test(key)) continue;
    const kept = Object.fromEntries(
      MODEL_FIELDS.filter((field) => Number.isFinite(values?.[field])).map((field) => [field, values[field]]),
    );
    if (Object.keys(kept).length > 0) quarters[key] = kept;
  }
  return {
    global: Object.fromEntries(
      MODEL_FIELDS.map((field) => [field, Number.isFinite(stored?.global?.[field]) ? stored.global[field] : null]),
    ),
    quarters,
  };
};

const readSnapshots = (stored) =>
  Object.fromEntries(
    Object.entries(stored ?? {}).filter(([key, snapshot]) => QUARTER_KEY_PATTERN.test(key) && Number.isFinite(snapshot?.eps)),
  );

const finiteOrNull = (value) => (Number.isFinite(value) ? value : null);

export const getValuationSettings = async ({ market, symbol }) => {
  const config = await db.app_config.get(valuationConfigKey(market, symbol));
  const stored = config && !config.deletedAt ? config.valuation ?? {} : {};
  return {
    ...Object.fromEntries(
      VALUATION_SETTING_FIELDS.map((field) => [
        field,
        Number.isFinite(stored[field]) ? stored[field] : EMPTY_VALUATION_SETTINGS[field],
      ]),
    ),
    model: readModelAssumptions(stored.model),
    snapshots: readSnapshots(stored.snapshots),
  };
};

// patch: changed P/E / forwardEps fields and model.global / model.quarters
// leaves (null clears). snapshot: the next quarter's estimate at save time;
// overrides of quarters before it are published and dropped.
export const saveValuationSettings = async ({ market, symbol, patch, snapshot = null }) => {
  ensureCloudWritable();
  if (!market || !symbol) {
    throw new Error("Missing market / symbol");
  }
  const next = await getValuationSettings({ market, symbol });
  const { model: modelPatch, ...scalarPatch } = patch ?? {};
  for (const [field, value] of Object.entries(scalarPatch)) {
    if (!VALUATION_SETTING_FIELDS.includes(field)) {
      throw new Error(`Unknown valuation field: ${field}`);
    }
    next[field] = normalizeValuationValue(field, value);
  }
  for (const [field, value] of Object.entries(modelPatch?.global ?? {})) {
    next.model.global[field] = normalizeModelValue(field, value);
  }
  for (const [key, values] of Object.entries(modelPatch?.quarters ?? {})) {
    if (!QUARTER_KEY_PATTERN.test(key)) {
      throw new Error(`Unknown quarter: ${key}`);
    }
    const merged = { ...(next.model.quarters[key] ?? {}) };
    for (const [field, value] of Object.entries(values ?? {})) {
      const normalized = normalizeModelValue(field, value);
      if (normalized === null) delete merged[field];
      else merged[field] = normalized;
    }
    if (Object.keys(merged).length > 0) next.model.quarters[key] = merged;
    else delete next.model.quarters[key];
  }
  if (snapshot) {
    if (!QUARTER_KEY_PATTERN.test(snapshot.quarter ?? "") || !Number.isFinite(snapshot.eps)) {
      throw new Error("Invalid valuation snapshot");
    }
    const cutoff = quarterOrder(snapshot.quarter);
    for (const key of Object.keys(next.model.quarters)) {
      if (quarterOrder(key) < cutoff) delete next.model.quarters[key];
    }
    const snapshots = {
      ...next.snapshots,
      [snapshot.quarter]: {
        eps: snapshot.eps,
        revenue: finiteOrNull(snapshot.revenue),
        grossMargin: finiteOrNull(snapshot.grossMargin),
        opexRatio: finiteOrNull(snapshot.opexRatio),
        savedAt: getNowIso(),
      },
    };
    const kept = Object.keys(snapshots)
      .sort((a, b) => quarterOrder(b) - quarterOrder(a))
      .slice(0, SNAPSHOT_LIMIT);
    next.snapshots = Object.fromEntries(kept.map((key) => [key, snapshots[key]]));
  }
  await mirrorToCloud(CLOUD_COLLECTION.APP_CONFIG, {
    key: valuationConfigKey(market, symbol),
    valuation: next,
    updatedAt: getNowIso(),
    deletedAt: null,
    syncState: SYNC_PENDING,
  });
  return next;
};
```

（Firestore mapper 對 `valuation` 整個物件原樣傳遞，不用改；`database.js` 不用改。）

- [ ] **Step 5: `src/hooks/useValuationSettings.js`**

```js
  const save = useCallback(
    async (patch, snapshot = null) => {
      const settings = await saveValuationSettings({ market, symbol, patch, snapshot })
      setState({ key, settings })
      return settings
    },
    [key, market, symbol],
  )
```

- [ ] **Step 6: `ValuationAssumptions.jsx` 移除成長率**

- 刪除 `GROWTH_WARNING_THRESHOLD`、`growthRate`／`showGrowthWarning` 變數、成長率 `field(...)` 區塊、`<Alert … 成長率異常 …>`，以及 import 的 `Alert`（若已無其他使用）。
- `toDraft`／`draftToSettings` 改為只處理 `VALUATION_SETTING_FIELDS`：

```js
const toDraft = (settings) => Object.fromEntries(VALUATION_SETTING_FIELDS.map((field) => [field, settings[field]]));
```

  `draftToSettings` 刪除，`nextSettings` 改用 `draft`；import `VALUATION_SETTING_FIELDS`。
- `runSave(values, …)` 內呼叫改為 `await onSave(values, null);`。

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run src/services/portfolioService.valuation.test.js src/components/stockDetail src/components/StockDetailSheet.test.jsx src/utils/valuation`
Expected: PASS（`valuation.forward.test.js` 中 `uses an overridden growth rate` 會失敗 → 刪除該測試，Task 7 會整段移除 TW 預估測試。）

- [ ] **Step 8: Commit**

```bash
git add src/utils/valuation.js src/utils/valuation.forward.test.js src/services/portfolioService.js src/services/portfolioService.valuation.test.js src/hooks/useValuationSettings.js src/components/stockDetail/ValuationAssumptions.jsx src/components/stockDetail/ValuationAssumptions.test.jsx
git commit -m "Store income-model assumptions and estimate snapshots with the valuation settings, and retire growthRate

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: 估價模型接上推估器，估價卡四個基準

**Files:**
- Modify: `src/utils/valuation.js`
- Modify: `src/components/stockDetail/ValuationCard.jsx`
- Modify: `src/components/StockDetailSheet.jsx`
- Modify: `src/components/stockDetail/ValuationAssumptions.jsx`（EPS 區塊改讀 `model.byBasis`）
- Modify: `src/App.css`（`.valuation-card-formula`）
- Create: `src/utils/incomeModel.fixture.js` 增補 `TW_FUNDAMENTALS`
- Test: `src/utils/valuation.forward.test.js`、`src/components/stockDetail/ValuationCard.test.jsx`、`src/components/StockDetailSheet.test.jsx`、`src/components/stockDetail/ValuationAssumptions.test.jsx`

**Interfaces:**
- Consumes（Task 5、6）: `projectIncome`、`UNAVAILABLE_REASONS`、`EMPTY_VALUATION_SETTINGS`
- Produces:
  - `TW_BASES = ['ttm','ttmAfterNext','thisYear','nextYear']`、`US_BASES = ['ttm','forward']`
  - `buildValuationModel({fundamentals, settings, price, basis, todayIso})` → `{basis, ttm, income (TW 才有；projectIncome 結果), byBasis: {[basis]: {eps, formula} | {eps: null, reason}}, chosen, autoBands, bands, valuation}`
  - fixture `TW_FUNDAMENTALS`（Task 9–13 的元件測試共用）

- [ ] **Step 1: fixture 增補**（`src/utils/incomeModel.fixture.js` 檔尾）

```js
// The fundamentals object loadStockFundamentals returns for this company.
// cumulativeToSingles is inlined here (eps only) to keep the fixture free of
// app imports.
const epsSingles = Object.entries(CUMULATIVE).map(([key, values], index, entries) => {
  const [year, quarter] = key.split('Q').map(Number)
  const previous = quarter === 1 ? 0 : entries[index - 1][1].eps
  return { year, quarter, eps: Math.round((values.eps - previous) * 10000) / 10000 }
})

export const MONTHLY_CLOSES = [
  { month: '2026-02', pe: null, close: 40 },
  { month: '2026-03', pe: null, close: 42 },
  { month: '2026-05', pe: null, close: 45 },
  { month: '2026-08', pe: null, close: 50 },
  { month: '2026-09', pe: null, close: null },
]

export const TW_FUNDAMENTALS = {
  market: 'TW',
  singles: epsSingles,
  cumulative: CUMULATIVE,
  company: { ...COMPANY, monthly: MONTHLY_CLOSES },
  surprises: [],
  upcoming: [],
  peSeries: [10, 12, 14, 15, 16, 18, 20, 22].map((pe, index) => ({ label: `2026-0${index + 1}`, pe })),
  nextEarnings: null,
  updatedAt: '2026-10-05T12:03:11Z',
}
```

- [ ] **Step 2: Write the failing tests**

`src/utils/valuation.forward.test.js`：刪除整個 `describe('estimateTwForwardEps', …)` 與 import 中的 `estimateTwForwardEps`；把 `describe('buildValuationModel', …)` 整段換成：

```js
describe('buildValuationModel', () => {
  const build = (basis, settings = EMPTY_VALUATION_SETTINGS, fundamentals = TW_FUNDAMENTALS) =>
    buildValuationModel({ fundamentals, settings, price: 50, basis, todayIso: '2026-10-11' })

  it('values TW stocks on TTM and on the income model’s three projections', () => {
    const ttm = build('ttm')
    expect(ttm.autoBands.sampleSize).toBe(8)
    expect(ttm.byBasis.ttm.eps).toBeCloseTo(10.72, 4)
    expect(ttm.valuation.prices.fair).toBeCloseTo(10.72 * ttm.bands.fair, 1)

    const afterNext = build('ttmAfterNext')
    expect(afterNext.chosen).toEqual({
      eps: expect.closeTo(11.8, 4),
      formula: '2025 Q4–2026 Q2 實際 + 2026 Q3 推估 合計 11.80',
    })
    expect(build('thisYear').chosen.formula).toBe('2026 Q1–Q2 實際 + Q3–Q4 推估 合計 12.88')
    expect(build('nextYear').chosen.formula).toBe('2027 全年推估 合計 19.00')
  })

  it('uses a custom forward EPS for this year and next year', () => {
    const settings = { ...EMPTY_VALUATION_SETTINGS, forwardEps: 20 }
    expect(build('thisYear', settings).chosen).toEqual({ eps: 20, formula: '自訂預估 EPS 20.00' })
    expect(build('nextYear', settings).chosen.eps).toBe(20)
    expect(build('ttmAfterNext', settings).chosen.eps).toBeCloseTo(11.8, 4)
  })

  it('explains why a projection is unavailable', () => {
    const financial = { ...TW_FUNDAMENTALS, company: { ...TW_FUNDAMENTALS.company, statement: 'financial' } }
    const model = build('nextYear', EMPTY_VALUATION_SETTINGS, financial)
    expect(model.chosen).toEqual({ eps: null, reason: '金融股不適用損益表推估' })
    expect(model.valuation.status).toBe('no-eps')
  })

  it('reports a projected loss as loss', () => {
    const settings = { ...EMPTY_VALUATION_SETTINGS, model: { global: { grossMargin: 0.1 }, quarters: {} } }
    expect(build('nextYear', settings).valuation.status).toBe('loss')
  })

  it('keeps TTM and the consensus forward estimate for US stocks', () => {
    const us = {
      ...TW_FUNDAMENTALS,
      market: 'US',
      company: undefined,
      upcoming: [{ date: '2026-11-01', epsEstimate: 3 }],
    }
    const model = build('forward', EMPTY_VALUATION_SETTINGS, us)
    expect(model.income).toBeUndefined()
    expect(model.byBasis.forward.eps).toBeCloseTo(3 + 3.04 + 3.04 + 2.32, 4)
  })
})
```

（import 加 `TW_FUNDAMENTALS` from `'./incomeModel.fixture'`。`nextYear` 毛利率 10%：每季營業利益 = 營收 × (0.1 − 0.2) < 0，業外 20 抵不過，EPS 為負 → `loss`。）

`ValuationCard.test.jsx`：`labels the forward tab per market…` 改為：

```js
  it('offers four bases for TW stocks, two for US, and reports basis changes', () => {
    const onBasisChange = vi.fn()
    const { rerender } = render(
      <ValuationCard model={okModel} basis="ttm" onBasisChange={onBasisChange} market="TW" currency="TWD" />,
    )
    for (const label of ['近四季', '下季後', '今年', '明年']) expect(screen.getByText(label)).toBeInTheDocument()
    fireEvent.click(screen.getByText('下季後'))
    expect(onBasisChange).toHaveBeenCalledWith('ttmAfterNext')
    rerender(<ValuationCard model={okModel} basis="ttm" onBasisChange={onBasisChange} market="US" currency="USD" />)
    expect(screen.getByText('近四季 TTM')).toBeInTheDocument()
    expect(screen.getByText('未來四季預估')).toBeInTheDocument()
  })

  it('shows how the EPS in use is made up, or why there is none', () => {
    const withFormula = { ...okModel, chosen: { eps: 11.8, formula: '2025 Q4–2026 Q2 實際 + 2026 Q3 推估 合計 11.80' } }
    const { rerender } = render(
      <ValuationCard model={withFormula} basis="ttmAfterNext" onBasisChange={() => {}} market="TW" currency="TWD" />,
    )
    expect(screen.getByText('2025 Q4–2026 Q2 實際 + 2026 Q3 推估 合計 11.80')).toBeInTheDocument()
    const unavailable = { valuation: { status: 'no-eps' }, chosen: { eps: null, reason: '金融股不適用損益表推估' } }
    rerender(<ValuationCard model={unavailable} basis="nextYear" onBasisChange={() => {}} market="TW" currency="TWD" />)
    expect(screen.getByText('金融股不適用損益表推估')).toBeInTheDocument()
  })
```

（`okModel` 不帶 `chosen` 時不顯示說明行。）

`StockDetailSheet.test.jsx`：把檔內的 `cumulative`／`fundamentals` fixture 換成 `import { TW_FUNDAMENTALS } from '../utils/incomeModel.fixture'`（`fundamentals = TW_FUNDAMENTALS`），holding 的 `latestPrice` 改為 `50`、預期的 `$1,085.00` 改為 `$50.00`；把 `opens the valuation assumptions from a row showing the P/E in use` 中對摘要的斷言改為：

```js
    expect(entry).toHaveTextContent('2026 Q3 預估 EPS 3.40')
    expect(entry).toHaveTextContent('本益比')
```

`ValuationAssumptions.test.jsx`：頂部的 `model` 改為

```js
import { buildValuationModel, EMPTY_VALUATION_SETTINGS } from '../../utils/valuation'
import { TW_FUNDAMENTALS } from '../../utils/incomeModel.fixture'

const buildModel = (settings) =>
  buildValuationModel({ fundamentals: TW_FUNDAMENTALS, settings, price: 50, basis: 'ttm', todayIso: '2026-10-11' })
const model = buildModel(EMPTY_VALUATION_SETTINGS)
```

`renderOpen` 加傳 `buildModel={buildModel}`；`shows both EPS figures…` 改為斷言 `screen.getByText('10.72')` 與 `screen.getByText('12.88')`（近四季與今年預估），以及 `空白時使用過去 8 期本益比的低、中、高位置`；`resets an overridden field` 的 `model` 改為 `buildModel({ ...EMPTY_VALUATION_SETTINGS, peFair: 20 })`。US 測試改傳 `market="US"` 與一個 US model：`buildValuationModel({ fundamentals: { ...TW_FUNDAMENTALS, market: 'US', company: undefined }, settings: EMPTY_VALUATION_SETTINGS, price: 50, basis: 'ttm', todayIso: '2026-10-11' })`。

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/utils/valuation.forward.test.js src/components/stockDetail src/components/StockDetailSheet.test.jsx`
Expected: FAIL

- [ ] **Step 4: Implement `src/utils/valuation.js`**

- import 改為 `import { MODEL_FIELDS, projectIncome, UNAVAILABLE_REASONS } from './incomeModel'`。
- 刪除 `estimateTwForwardEps`、`formatPercent`（若已無人用）。保留 `quarterRangeLabel`。
- `buildValuationModel` 換成：

```js
export const TW_BASES = ['ttm', 'ttmAfterNext', 'thisYear', 'nextYear']
export const US_BASES = ['ttm', 'forward']

const NO_EPS = '資料不足，無法計算'

const epsOrReason = (eps, formula) =>
  Number.isFinite(eps) ? { eps, formula: formula(eps) } : { eps: null, reason: NO_EPS }

// 台股: TTM plus three projections from the income model; a custom
// forward EPS replaces this year's and next year's.
const twBasisEps = (income, ttm, settings) => {
  const custom = Number.isFinite(settings?.forwardEps)
    ? { eps: settings.forwardEps, formula: `自訂預估 EPS ${formatEps(settings.forwardEps)}` }
    : null
  const fromIncome = (pick) =>
    income.status === 'ok' ? pick(income) : { eps: null, reason: UNAVAILABLE_REASONS[income.reason] ?? NO_EPS }
  return {
    ttm,
    ttmAfterNext: fromIncome(({ ttmAfterNext, latest, nextQuarter }) =>
      epsOrReason(
        ttmAfterNext.eps,
        (eps) =>
          `${formatQuarter(ttmAfterNext.from)}–${formatQuarter(latest)} 實際 + ${formatQuarter(nextQuarter)} 推估 合計 ${formatEps(eps)}`,
      ),
    ),
    thisYear:
      custom ??
      fromIncome(({ thisYear }) =>
        epsOrReason(thisYear.eps, (eps) =>
          thisYear.reportedQuarters === 0
            ? `${thisYear.year} 全年推估 合計 ${formatEps(eps)}`
            : `${thisYear.year} Q1–Q${thisYear.reportedQuarters} 實際 + ${quarterRangeLabel(thisYear.reportedQuarters + 1)} 推估 合計 ${formatEps(eps)}`,
        ),
      ),
    nextYear:
      custom ??
      fromIncome(({ nextYear }) => epsOrReason(nextYear.eps, (eps) => `${nextYear.year} 全年推估 合計 ${formatEps(eps)}`)),
  }
}

export const buildValuationModel = ({ fundamentals, settings, price, basis, todayIso }) => {
  const autoBands = peBandsFromHistory(fundamentals.peSeries.map((point) => point.pe))
  const bands = resolvePeBands(autoBands, settings)
  const ttm = computeTtm(fundamentals.singles)
  const income =
    fundamentals.market === 'TW' ? projectIncome(fundamentals.company, settings?.model, { todayIso }) : undefined
  const byBasis =
    fundamentals.market === 'TW'
      ? twBasisEps(income, ttm, settings)
      : { ttm, forward: estimateUsForwardEps(fundamentals, settings) }
  const chosen = byBasis[basis] ?? byBasis.ttm
  return {
    basis,
    ttm,
    income,
    byBasis,
    chosen,
    autoBands,
    bands,
    valuation: computeValuation({ eps: chosen?.eps, bands, price }),
  }
}
```

（`ttm` 為 null 時 `chosen` 為 null，`computeValuation` 回 `no-eps`，與現在一致。`MODEL_FIELDS` 仍給 Task 6 的 `EMPTY_MODEL_ASSUMPTIONS` 用。）

- [ ] **Step 5: `ValuationCard.jsx`**

```jsx
const BASIS_OPTIONS = {
  TW: [
    { label: "近四季", value: "ttm" },
    { label: "下季後", value: "ttmAfterNext" },
    { label: "今年", value: "thisYear" },
    { label: "明年", value: "nextYear" },
  ],
  US: [
    { label: "近四季 TTM", value: "ttm" },
    { label: "未來四季預估", value: "forward" },
  ],
};
```

`<Segmented … options={BASIS_OPTIONS[market] ?? BASIS_OPTIONS.US} />`，Segmented 之後加：

```jsx
      {model.chosen?.formula && <span className="valuation-card-formula">{model.chosen.formula}</span>}
```

狀態訊息改為 `{model.chosen?.reason ?? STATUS_MESSAGES[valuation.status]}`。

`src/App.css` 在 `.valuation-card-message` 之前加：

```css
/* How the EPS in use is made up, under the basis switch. */
.valuation-card-formula {
  font-size: var(--fs-caption);
  color: var(--c-muted);
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 6: `StockDetailSheet.jsx`**

- import `dayjs from "dayjs"`、`formatEps, formatQuarter`（from `../utils/valuation`）。
- 在 hooks 之後：

```jsx
  const todayIso = dayjs().format("YYYY-MM-DD");
```

- `model` 改為：

```jsx
  const buildModel = (nextSettings) =>
    buildValuationModel({ fundamentals: data, settings: nextSettings, price: holding.latestPrice, basis, todayIso });
  const model = data ? buildModel(settings) : null;
```

- `describeBands` 改為 `describeEntry(model)`：

```jsx
// The 估價假設 row: next quarter's estimate (TW) and the P/E in use.
const describeEntry = (model) => {
  const values = [model.bands?.cheap, model.bands?.fair, model.bands?.expensive];
  const pe = values.every(Number.isFinite) ? `本益比 ${values.join("／")}` : "本益比尚未設定";
  const next = model.income?.status === "ok" ? model.income.nextQuarter : null;
  return next ? `${formatQuarter(next)} 預估 EPS ${formatEps(next.eps)} · ${pe}` : pe;
};
```

- `<ValuationAssumptions … buildModel={buildModel} />`。

- [ ] **Step 7: `ValuationAssumptions.jsx` 的 EPS 區塊**

`AssumptionsForm` 參數加 `buildModel`（Task 9 才用）。EPS 群組改為讀 `model.byBasis`：

```jsx
  const forwardKey = market === "US" ? "forward" : "thisYear";
  const forward = model.byBasis?.[forwardKey];
```

第二條 EPS 線的 label 為 `{market === "US" ? "未來四季預估" : "今年預估"}`，值 `Number.isFinite(forward?.eps) ? formatEps(forward.eps) : forward?.reason ?? "無預估資料"`，公式 `forward?.formula`。`model.forward` 的其他引用全部刪掉。`ValuationAssumptions` 外層把 `buildModel` 透過 `formProps` 傳入即可。

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run src/utils src/components/stockDetail src/components/StockDetailSheet.test.jsx`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/utils/valuation.js src/utils/valuation.forward.test.js src/utils/incomeModel.fixture.js src/components/stockDetail src/components/StockDetailSheet.jsx src/components/StockDetailSheet.test.jsx src/App.css
git commit -m "Value TW stocks on the income model's next-quarter TTM, this year and next year

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: 假設表單的純函式

**Files:**
- Create: `src/utils/incomeAssumptionForm.js`
- Test: `src/utils/incomeAssumptionForm.test.js`

**Interfaces:**
- Consumes: `MODEL_FIELDS`（Task 4）、`VALUATION_SETTING_FIELDS`、`EMPTY_VALUATION_SETTINGS`（Task 6）
- Produces（Task 9–11 使用）:
  - `THOUSANDS_PER_YI = 100_000`
  - `FIELD_META: {[field]: {label, unit, kind: 'percent'|'amount', signed: boolean}}`
  - `toInput(field, value)` → `number|null`（比率 → %；千元 → 億，兩位小數）
  - `fromInput(field, input)` → `number|null`
  - `formatAssumption(field, value)` → `string`（`'53.4'`、`'120.5'`、`'--'`）
  - `formatYi(thousands)` → `'6,012 億'`
  - `formatShares(thousandShares)` → `'259.3 億股'`
  - `formatPercent(ratio)` → `'53.4%'`
  - `diffSettings(settings, draft)` → `patch`
  - `setGlobalValue(draft, field, value)`、`setQuarterValue(draft, key, field, value)` → 新 draft
  - `snapshotOf(nextQuarter)` → `{quarter, eps, revenue, grossMargin, opexRatio}`

- [ ] **Step 1: Write the failing tests**

```js
import { describe, it, expect } from 'vitest'
import {
  diffSettings,
  formatAssumption,
  formatShares,
  formatYi,
  fromInput,
  setGlobalValue,
  setQuarterValue,
  snapshotOf,
  toInput,
} from './incomeAssumptionForm'
import { EMPTY_VALUATION_SETTINGS } from './valuation'

describe('input conversion', () => {
  it('shows ratios as percent and thousand NTD as 億', () => {
    expect(toInput('grossMargin', 0.5345)).toBe(53.45)
    expect(fromInput('grossMargin', 53.45)).toBeCloseTo(0.5345, 10)
    expect(toInput('nonOperating', 12_050_000)).toBe(120.5)
    expect(fromInput('nonOperating', -120.5)).toBe(-12_050_000)
    expect(fromInput('revenueYoy', -5)).toBeCloseTo(-0.05, 10)
    expect(toInput('taxRate', null)).toBeNull()
    expect(fromInput('taxRate', null)).toBeNull()
  })

  it('formats placeholders and amounts', () => {
    expect(formatAssumption('grossMargin', 0.5345)).toBe('53.5')
    expect(formatAssumption('nonOperating', 12_050_000)).toBe('120.5')
    expect(formatAssumption('taxRate', null)).toBe('--')
    expect(formatYi(601_200_000)).toBe('6,012 億')
    expect(formatShares(25_930_000)).toBe('259.3 億股')
  })
})

describe('draft editing', () => {
  it('sets and clears global and per-quarter values without touching the original', () => {
    const withGlobal = setGlobalValue(EMPTY_VALUATION_SETTINGS, 'grossMargin', 0.55)
    expect(withGlobal.model.global.grossMargin).toBe(0.55)
    expect(EMPTY_VALUATION_SETTINGS.model.global.grossMargin).toBeNull()

    const withQuarter = setQuarterValue(withGlobal, '2026Q4', 'taxRate', 0.18)
    expect(withQuarter.model.quarters).toEqual({ '2026Q4': { taxRate: 0.18 } })
    expect(setQuarterValue(withQuarter, '2026Q4', 'taxRate', null).model.quarters).toEqual({})
  })
})

describe('diffSettings', () => {
  it('returns only the changed leaves, null for cleared ones', () => {
    const settings = {
      ...EMPTY_VALUATION_SETTINGS,
      peFair: 18,
      model: { global: { ...EMPTY_VALUATION_SETTINGS.model.global, taxRate: 0.2 }, quarters: { '2026Q4': { grossMargin: 0.5 } } },
    }
    let draft = { ...settings, peFair: 20, forwardEps: null }
    draft = setGlobalValue(draft, 'taxRate', null)
    draft = setGlobalValue(draft, 'revenueYoy', -0.05)
    draft = setQuarterValue(draft, '2026Q4', 'grossMargin', null)
    draft = setQuarterValue(draft, '2027Q1', 'opexRatio', 0.1)
    expect(diffSettings(settings, draft)).toEqual({
      peFair: 20,
      model: {
        global: { taxRate: null, revenueYoy: -0.05 },
        quarters: { '2026Q4': { grossMargin: null }, '2027Q1': { opexRatio: 0.1 } },
      },
    })
    expect(diffSettings(settings, settings)).toEqual({})
  })
})

describe('snapshotOf', () => {
  it('keeps what the comparison needs from the next quarter', () => {
    const next = {
      key: '2026Q3', eps: 3.4, revenue: 1350,
      assumptions: { grossMargin: { value: 0.5, source: 'auto' }, opexRatio: { value: 0.2, source: 'global' } },
    }
    expect(snapshotOf(next)).toEqual({ quarter: '2026Q3', eps: 3.4, revenue: 1350, grossMargin: 0.5, opexRatio: 0.2 })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/utils/incomeAssumptionForm.test.js`
Expected: FAIL

- [ ] **Step 3: Implement `src/utils/incomeAssumptionForm.js`**

```js
// Conversions and draft helpers for the 估價假設 form. Settings keep ratios
// as fractions and amounts in thousand NTD; the form shows % and 億.
import { MODEL_FIELDS } from './incomeModel'
import { VALUATION_SETTING_FIELDS } from './valuation'

export const THOUSANDS_PER_YI = 100_000

export const FIELD_META = {
  revenueYoy: { label: '營收 YoY', unit: '%', kind: 'percent', signed: true },
  grossMargin: { label: '毛利率', unit: '%', kind: 'percent', signed: true },
  opexRatio: { label: '營業費用率', unit: '%', kind: 'percent', signed: false },
  nonOperating: { label: '業外', unit: '億/季', kind: 'amount', signed: true },
  taxRate: { label: '稅率', unit: '%', kind: 'percent', signed: false },
  nciRatio: { label: '非控制權益比', unit: '%', kind: 'percent', signed: false },
}

const round = (value, digits) => Math.round(value * 10 ** digits) / 10 ** digits

export const toInput = (field, value) => {
  if (!Number.isFinite(value)) return null
  return FIELD_META[field].kind === 'percent' ? round(value * 100, 2) : round(value / THOUSANDS_PER_YI, 2)
}

export const fromInput = (field, input) => {
  if (!Number.isFinite(input)) return null
  return FIELD_META[field].kind === 'percent' ? input / 100 : input * THOUSANDS_PER_YI
}

export const formatAssumption = (field, value) => {
  if (!Number.isFinite(value)) return '--'
  return FIELD_META[field].kind === 'percent' ? (value * 100).toFixed(1) : (value / THOUSANDS_PER_YI).toFixed(1)
}

export const formatPercent = (ratio) => (Number.isFinite(ratio) ? `${(ratio * 100).toFixed(1)}%` : '--')

export const formatYi = (thousands) =>
  `${Math.round(thousands / THOUSANDS_PER_YI).toLocaleString('en-US')} 億`

export const formatShares = (thousandShares) => `${(thousandShares / THOUSANDS_PER_YI).toFixed(1)} 億股`

export const setGlobalValue = (draft, field, value) => ({
  ...draft,
  model: { ...draft.model, global: { ...draft.model.global, [field]: value } },
})

export const setQuarterValue = (draft, key, field, value) => {
  const current = { ...(draft.model.quarters[key] ?? {}) }
  if (value === null) delete current[field]
  else current[field] = value
  const quarters = { ...draft.model.quarters }
  if (Object.keys(current).length > 0) quarters[key] = current
  else delete quarters[key]
  return { ...draft, model: { ...draft.model, quarters } }
}

const changed = (before, after) => (after ?? null) !== (before ?? null)

export const diffSettings = (settings, draft) => {
  const patch = {}
  for (const field of VALUATION_SETTING_FIELDS) {
    if (changed(settings[field], draft[field])) patch[field] = draft[field] ?? null
  }
  const global = {}
  for (const field of MODEL_FIELDS) {
    if (changed(settings.model.global[field], draft.model.global[field])) global[field] = draft.model.global[field] ?? null
  }
  const quarters = {}
  const keys = new Set([...Object.keys(settings.model.quarters), ...Object.keys(draft.model.quarters)])
  for (const key of keys) {
    const before = settings.model.quarters[key] ?? {}
    const after = draft.model.quarters[key] ?? {}
    const fields = MODEL_FIELDS.filter((field) => changed(before[field], after[field]))
    if (fields.length > 0) quarters[key] = Object.fromEntries(fields.map((field) => [field, after[field] ?? null]))
  }
  const model = {
    ...(Object.keys(global).length > 0 ? { global } : {}),
    ...(Object.keys(quarters).length > 0 ? { quarters } : {}),
  }
  if (Object.keys(model).length > 0) patch.model = model
  return patch
}

export const snapshotOf = (nextQuarter) => ({
  quarter: nextQuarter.key,
  eps: nextQuarter.eps,
  revenue: nextQuarter.revenue,
  grossMargin: nextQuarter.assumptions.grossMargin.value,
  opexRatio: nextQuarter.assumptions.opexRatio.value,
})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/utils/incomeAssumptionForm.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/incomeAssumptionForm.js src/utils/incomeAssumptionForm.test.js
git commit -m "Add conversions and draft helpers for the income-model assumptions form

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: 估價假設 sheet — 推估結果、全域假設、記下這次預估

**Files:**
- Create: `src/components/stockDetail/IncomeModelSummary.jsx`
- Create: `src/components/stockDetail/IncomeAssumptionFields.jsx`
- Create: `src/components/stockDetail/IncomeModelSections.jsx`
- Modify: `src/components/stockDetail/ValuationAssumptions.jsx`（整檔改寫，見下）
- Modify: `src/App.css`
- Test: `src/components/stockDetail/ValuationAssumptions.test.jsx`

**Interfaces:**
- Consumes: `buildModel(settings)`（Task 7）、`diffSettings`、`setGlobalValue`、`snapshotOf`、`FIELD_META`、`toInput`、`fromInput`、`formatAssumption`、`formatShares`（Task 8）、`UNAVAILABLE_REASONS`（Task 4）
- Produces（Task 10、11 擴充）:
  - `IncomeModelSections` props：`{income, draft, disabled, onGlobalChange(field, value), onGlobalReset(field), onQuarterChange(key, field, value), settings}`
  - `ValuationAssumptions` 的 `onSave(patch, snapshot|null)`

- [ ] **Step 1: Write the failing tests**（加到 `ValuationAssumptions.test.jsx`）

```js
describe('ValuationAssumptions — income model (TW)', () => {
  it('shows next quarter, this year and next year at the top', () => {
    renderOpen()
    const summary = screen.getByLabelText('推估結果')
    expect(summary).toHaveTextContent('下一季 2026 Q3 EPS')
    expect(summary).toHaveTextContent('3.40')
    expect(summary).toHaveTextContent('YoY ▲46.6%')
    expect(summary).toHaveTextContent('QoQ ▲11.8%')
    expect(summary).toHaveTextContent('今年 12.88 · 明年 19.00')
  })

  it('shows the automatic values as placeholders and updates the estimate live', () => {
    renderOpen()
    const margin = screen.getByLabelText('毛利率（%）')
    expect(margin).toHaveAttribute('placeholder', '自動 50.0')
    expect(screen.getByLabelText('業外（億/季）')).toHaveAttribute('placeholder', '自動 0.0')
    fireEvent.change(margin, { target: { value: '60' } })
    expect(screen.getByLabelText('推估結果')).toHaveTextContent('4.48')
  })

  it('records the estimate without changes when next quarter has no snapshot yet', async () => {
    const onSave = vi.fn().mockResolvedValue({})
    renderOpen({ onSave })
    fireEvent.click(screen.getByRole('button', { name: '記下這次預估' }))
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        {},
        { quarter: '2026Q3', eps: 3.4, revenue: 1350, grossMargin: expect.closeTo(0.5, 6), opexRatio: expect.closeTo(0.2, 6) },
      ),
    )
  })

  it('saves changed assumptions with a snapshot of the new estimate', async () => {
    const onSave = vi.fn().mockResolvedValue({})
    const settings = { ...EMPTY_VALUATION_SETTINGS, snapshots: { '2026Q3': { eps: 3.4, savedAt: '2026-10-01T00:00:00Z' } } }
    renderOpen({ onSave, settings, model: buildModel(settings) })
    expect(screen.getByRole('button', { name: /儲\s*存/ })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('毛利率（%）'), { target: { value: '60' } })
    fireEvent.click(screen.getByRole('button', { name: /儲\s*存/ }))
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        { model: { global: { grossMargin: 0.6 } } },
        expect.objectContaining({ quarter: '2026Q3', eps: expect.closeTo(4.48, 6), grossMargin: 0.6 }),
      ),
    )
  })

  it('resets a global override at once', () => {
    const onSave = vi.fn().mockResolvedValue({})
    const settings = { ...EMPTY_VALUATION_SETTINGS, model: { global: { ...EMPTY_VALUATION_SETTINGS.model.global, taxRate: 0.18 }, quarters: {} } }
    renderOpen({ onSave, settings, model: buildModel(settings) })
    fireEvent.click(screen.getByRole('button', { name: '重設稅率' }))
    expect(onSave).toHaveBeenCalledWith({ model: { global: { taxRate: null } } }, null)
  })

  it('keeps the sign key on fields that can be negative', () => {
    renderOpen()
    expect(screen.getByLabelText('營收 YoY（%）')).not.toHaveAttribute('inputmode')
    expect(screen.getByLabelText('業外（億/季）')).not.toHaveAttribute('inputmode')
    expect(screen.getByLabelText('稅率（%）')).toHaveAttribute('inputmode', 'decimal')
  })

  it('shows shares and calibration under 進階', () => {
    renderOpen()
    fireEvent.click(screen.getByRole('button', { name: '進階' }))
    expect(screen.getByLabelText('非控制權益比（%）')).toBeInTheDocument()
    expect(screen.getByText('0.0 億股')).toBeInTheDocument()
  })

  it('explains why the model is unavailable and keeps 直接指定 EPS', () => {
    const financial = { ...TW_FUNDAMENTALS, company: { ...TW_FUNDAMENTALS.company, statement: 'financial' } }
    const build = (settings) =>
      buildValuationModel({ fundamentals: financial, settings, price: 50, basis: 'ttm', todayIso: '2026-10-11' })
    renderOpen({ model: build(EMPTY_VALUATION_SETTINGS), buildModel: build })
    expect(screen.getByText('金融股不適用損益表推估')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '直接指定 EPS' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /儲\s*存/ })).toBeDisabled()
  })

  it('notes that a custom EPS takes over this year and next year', () => {
    renderOpen()
    fireEvent.change(screen.getByLabelText('預估 EPS'), { target: { value: '20' } })
    expect(screen.getByText('已使用自訂 EPS，模型結果僅供參考')).toBeInTheDocument()
  })
})
```

同時刪掉 Task 7 版本的 `shows both EPS figures…` 與 `groups the P/E range apart from the forward estimate` 對 TW 的斷言（TW 不再有「EPS」群組與「今年預估」標題），改為只對 US 斷言 `heading '本益比'` 與 `'未來四季預估'`。`closes after a successful save` 保持（改本益比後按「儲存」）。

（fixture 的股數是 100 千股 = 0.001 億股，所以顯示 `0.0 億股`；`業外` 20 千元 = 0.0002 億，顯示 `0.0`。）

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/stockDetail/ValuationAssumptions.test.jsx`
Expected: FAIL

- [ ] **Step 3: `IncomeModelSummary.jsx`**

```jsx
import { formatEps, formatQuarter } from "../../utils/valuation";

function Change({ label, value }) {
  if (!Number.isFinite(value)) return <span className="income-summary-change">{`${label} --`}</span>;
  const up = value >= 0;
  return (
    <span className={`income-summary-change income-summary-change--${up ? "up" : "down"}`}>
      {`${label} ${up ? "▲" : "▼"}${Math.abs(value * 100).toFixed(1)}%`}
    </span>
  );
}

const yearEps = (value) => (Number.isFinite(value) ? formatEps(value) : "--");

// Next quarter's EPS leads (title size, not display): the figure to hold
// against the coming report.
function IncomeModelSummary({ income }) {
  const { nextQuarter, thisYear, nextYear } = income;
  return (
    <section className="valuation-assumptions-group income-summary" aria-label="推估結果">
      <span className="income-summary-label">{`下一季 ${formatQuarter(nextQuarter)} EPS`}</span>
      <div className="income-summary-main">
        <span className="income-summary-eps">{formatEps(nextQuarter.eps)}</span>
        <Change label="YoY" value={nextQuarter.yoy} />
        <Change label="QoQ" value={nextQuarter.qoq} />
      </div>
      <span className="income-summary-years">{`今年 ${yearEps(thisYear.eps)} · 明年 ${yearEps(nextYear.eps)}`}</span>
    </section>
  );
}

export default IncomeModelSummary;
```

- [ ] **Step 4: `IncomeAssumptionFields.jsx`**

```jsx
import { useState } from "react";
import { Button, InputNumber } from "antd";
import { NavArrowDown, NavArrowRight } from "iconoir-react";
import { FIELD_META, formatAssumption, formatShares, fromInput, toInput } from "../../utils/incomeAssumptionForm";

const MAIN_FIELDS = ["revenueYoy", "grossMargin", "opexRatio", "nonOperating", "taxRate"];

// Applies to every projected quarter unless a quarter overrides it. Blank =
// the automatic value, shown as the placeholder.
function IncomeAssumptionFields({ income, values, stored, disabled, onChange, onReset }) {
  const [advanced, setAdvanced] = useState(false);

  const field = (name) => {
    const meta = FIELD_META[name];
    const label = `${meta.label}（${meta.unit}）`;
    return (
      <label key={name} className="valuation-assumption-field">
        <span className="valuation-assumption-label">{label}</span>
        <InputNumber
          aria-label={label}
          inputMode={meta.signed ? undefined : "decimal"}
          step={meta.kind === "percent" ? 0.5 : 1}
          value={toInput(name, values[name])}
          placeholder={`自動 ${formatAssumption(name, income.auto[name])}`}
          disabled={disabled}
          onChange={(value) => onChange(name, fromInput(name, value ?? null))}
        />
        {stored[name] !== null && (
          <Button
            type="link"
            size="small"
            className="valuation-assumption-reset"
            disabled={disabled}
            aria-label={`重設${meta.label}`}
            onClick={() => onReset(name)}
          >
            改回預設
          </Button>
        )}
      </label>
    );
  };

  return (
    <section className="valuation-assumptions-group">
      <h4 className="valuation-assumptions-title">全部季度的假設</h4>
      <div className="valuation-assumption-grid">{MAIN_FIELDS.map(field)}</div>
      <button
        type="button"
        className="income-advanced-toggle"
        aria-expanded={advanced}
        onClick={() => setAdvanced((value) => !value)}
      >
        {advanced ? <NavArrowDown aria-hidden /> : <NavArrowRight aria-hidden />}
        進階
      </button>
      {advanced && (
        <div className="income-advanced">
          <div className="valuation-assumption-grid">{field("nciRatio")}</div>
          <div className="income-ledger-row">
            <span className="income-ledger-label">股數</span>
            <span>{formatShares(income.shares)}</span>
          </div>
          <div className="income-ledger-row">
            <span className="income-ledger-label">營收校正</span>
            <span>{`× ${income.calibration.toFixed(2)}`}</span>
          </div>
          <span className="valuation-assumptions-hint">
            股數＝最新累計母公司淨利 ÷ 累計 EPS；營收校正＝近四季季報營收 ÷ 月營收合計（差距 3% 內視為 1）
          </span>
        </div>
      )}
    </section>
  );
}

export default IncomeAssumptionFields;
```

- [ ] **Step 5: `IncomeModelSections.jsx`**

```jsx
import { Typography } from "antd";
import { UNAVAILABLE_REASONS } from "../../utils/incomeModel";
import IncomeAssumptionFields from "./IncomeAssumptionFields";
import IncomeModelSummary from "./IncomeModelSummary";

const { Text } = Typography;

// The TW income model inside 估價假設: result, assumptions for every
// quarter, then each quarter on its own.
function IncomeModelSections({ income, draft, settings, disabled, onGlobalChange, onGlobalReset }) {
  if (income.status !== "ok") {
    return (
      <section className="valuation-assumptions-group">
        <Text type="secondary">{UNAVAILABLE_REASONS[income.reason]}</Text>
      </section>
    );
  }
  return (
    <>
      <IncomeModelSummary income={income} />
      <IncomeAssumptionFields
        income={income}
        values={draft.model.global}
        stored={settings.model.global}
        disabled={disabled}
        onChange={onGlobalChange}
        onReset={onGlobalReset}
      />
    </>
  );
}

export default IncomeModelSections;
```

- [ ] **Step 6: 改寫 `ValuationAssumptions.jsx`**

整檔：

```jsx
import { useState } from "react";
import { Alert, Button, Drawer, InputNumber, Modal, Typography } from "antd";
import { diffSettings, setGlobalValue, setQuarterValue, snapshotOf } from "../../utils/incomeAssumptionForm";
import { formatEps } from "../../utils/valuation";
import IncomeModelSections from "./IncomeModelSections";

const { Text } = Typography;

const PE_FIELDS = [
  { field: "peCheap", band: "cheap", label: "便宜本益比", short: "便宜" },
  { field: "peFair", band: "fair", label: "合理本益比", short: "合理" },
  { field: "peExpensive", band: "expensive", label: "昂貴本益比", short: "昂貴" },
];

function UsEpsGroup({ model }) {
  const forward = model.byBasis?.forward;
  return (
    <div className="valuation-assumptions-group">
      <h4 className="valuation-assumptions-title">EPS</h4>
      <div className="valuation-eps">
        <div className="valuation-eps-line">
          <span className="valuation-eps-label">近四季</span>
          <span>{Number.isFinite(model.ttm?.eps) ? formatEps(model.ttm.eps) : "資料不足"}</span>
        </div>
        {model.ttm?.formula && <span className="valuation-eps-formula">{model.ttm.formula}</span>}
      </div>
      <div className="valuation-eps">
        <div className="valuation-eps-line">
          <span className="valuation-eps-label">未來四季預估</span>
          <span>{Number.isFinite(forward?.eps) ? formatEps(forward.eps) : "無預估資料"}</span>
        </div>
        {forward?.formula && <span className="valuation-eps-formula">{forward.formula}</span>}
      </div>
    </div>
  );
}

// Remounted (key = settings) after a save or a synced change, so the draft
// always starts from the stored values. The TW estimate is rebuilt from the
// draft on every change, so the figures move as you type.
function AssumptionsForm({ model, buildModel, market, settings, disabled, onSave, onSaved }) {
  const [draft, setDraft] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const patch = diffSettings(settings, draft);
  const hasChanges = Object.keys(patch).length > 0;
  const live = hasChanges ? buildModel(draft) : model;
  const income = market === "TW" ? live.income : null;
  const next = income?.status === "ok" ? income.nextQuarter : null;
  const needsSnapshot = Boolean(next) && !settings.snapshots[next.key];
  const locked = disabled || saving;

  const runSave = async (values, snapshot, { close = false } = {}) => {
    setSaving(true);
    setError(null);
    try {
      await onSave(values, snapshot);
      if (close) onSaved?.();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  const setRoot = (field) => (value) => setDraft((previous) => ({ ...previous, [field]: value ?? null }));

  const rootField = ({ field, label, short, input }) => (
    <label key={field} className="valuation-assumption-field">
      <span className="valuation-assumption-label">{short}</span>
      {input}
      {settings[field] !== null && (
        <Button
          type="link"
          size="small"
          className="valuation-assumption-reset"
          disabled={locked}
          aria-label={`重設${label}`}
          onClick={() => runSave({ [field]: null }, null)}
        >
          改回預設
        </Button>
      )}
    </label>
  );

  return (
    <>
      <div className="sheet-content valuation-assumptions-body">
        {market === "TW" && Number.isFinite(draft.forwardEps) && (
          <Alert type="info" showIcon title="已使用自訂 EPS，模型結果僅供參考" />
        )}
        {market === "TW" ? (
          <IncomeModelSections
            income={income}
            draft={draft}
            settings={settings}
            disabled={locked}
            onGlobalChange={(field, value) => setDraft((previous) => setGlobalValue(previous, field, value))}
            onGlobalReset={(field) => runSave({ model: { global: { [field]: null } } }, null)}
            onQuarterChange={(key, field, value) => setDraft((previous) => setQuarterValue(previous, key, field, value))}
          />
        ) : (
          <UsEpsGroup model={live} />
        )}

        <div className="valuation-assumptions-group">
          <h4 className="valuation-assumptions-title">本益比</h4>
          <div className="valuation-assumption-grid valuation-assumption-grid--3">
            {PE_FIELDS.map(({ field, band, label, short }) =>
              rootField({
                field,
                label,
                short,
                input: (
                  <InputNumber
                    inputMode="decimal"
                    aria-label={label}
                    min={0}
                    step={0.5}
                    value={draft[field]}
                    placeholder={live.autoBands?.[band] != null ? String(live.autoBands[band]) : "未設定"}
                    disabled={locked}
                    onChange={setRoot(field)}
                  />
                ),
              }),
            )}
          </div>
          <span className="valuation-assumptions-hint">
            {live.autoBands
              ? `空白時使用過去 ${live.autoBands.sampleSize} 期本益比的低、中、高位置`
              : "歷史本益比資料不足，請自行填入"}
          </span>
        </div>

        <div className="valuation-assumptions-group">
          <h4 className="valuation-assumptions-title">{market === "US" ? "未來四季預估" : "直接指定 EPS"}</h4>
          <div className="valuation-assumption-grid">
            {rootField({
              field: "forwardEps",
              label: "預估 EPS",
              short: "預估 EPS",
              input: (
                <InputNumber
                  aria-label="預估 EPS"
                  step={0.1}
                  value={draft.forwardEps}
                  placeholder="自動"
                  disabled={locked}
                  onChange={setRoot("forwardEps")}
                />
              ),
            })}
          </div>
          {market === "TW" && (
            <span className="valuation-assumptions-hint">模型不適用時使用；填入後今年與明年估價改用這個數字</span>
          )}
        </div>

        {error && <Text type="danger">{error}</Text>}
      </div>
      <div className="sheet-footer valuation-assumptions-footer">
        {disabled ? (
          <Text type="secondary">登入後可調整估價假設</Text>
        ) : (
          <Button
            type="primary"
            block
            className="sheet-submit-btn"
            disabled={!hasChanges && !needsSnapshot}
            loading={saving}
            onClick={() => runSave(patch, next ? snapshotOf(next) : null, { close: true })}
          >
            {!hasChanges && needsSnapshot ? "記下這次預估" : "儲存"}
          </Button>
        )}
      </div>
    </>
  );
}

// 估價假設 in its own sheet over the stock detail sheet (a modal on desktop),
// with 儲存 fixed full width at the bottom so it stays reachable with the
// keyboard up. Saving closes it; 改回預設 applies at once and stays.
function ValuationAssumptions({ open, isMobile, title, onClose, settings, ...formProps }) {
  const form = (
    <AssumptionsForm key={JSON.stringify(settings)} settings={settings} onSaved={onClose} {...formProps} />
  );
  return isMobile ? (
    <Drawer
      placement="bottom"
      title={title}
      open={open}
      onClose={onClose}
      size="90vh"
      destroyOnHidden
      className="form-bottom-sheet sheet-layout valuation-assumptions-sheet"
      styles={{ body: { padding: 0 } }}
    >
      {form}
    </Drawer>
  ) : (
    <Modal
      title={title}
      open={open}
      onCancel={onClose}
      footer={null}
      destroyOnHidden
      className="valuation-assumptions-modal"
    >
      {form}
    </Modal>
  );
}

export default ValuationAssumptions;
```

（`onQuarterChange` 先傳下去，Task 10 才使用；`IncomeModelSections` 目前忽略它。）

- [ ] **Step 7: CSS**（`src/App.css`，接在 `.valuation-assumption-reset.ant-btn` 規則之後）

```css
/* Income model: next quarter's EPS leads the sheet at title size. */
.income-summary {
  gap: var(--space-1);
}

.income-summary-label,
.income-ledger-label {
  font-size: var(--fs-caption);
  color: var(--c-muted);
}

.income-summary-main {
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
  font-variant-numeric: tabular-nums;
}

.income-summary-eps {
  font-size: var(--fs-title);
  font-weight: 600;
  color: var(--c-ink);
}

.income-summary-change {
  font-size: var(--fs-body);
  font-weight: 600;
  color: var(--c-muted);
}

.income-summary-change--up {
  color: var(--c-up);
}

.income-summary-change--down {
  color: var(--c-down);
}

.income-summary-years {
  font-size: var(--fs-body);
  color: var(--c-muted);
  font-variant-numeric: tabular-nums;
}

.income-advanced-toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  align-self: flex-start;
  min-height: 44px;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  font-size: var(--fs-caption);
  color: var(--c-muted);
  cursor: pointer;
}

.income-advanced-toggle svg {
  font-size: var(--icon-sm);
}

.income-advanced {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.income-ledger-row {
  display: flex;
  justify-content: space-between;
  font-size: var(--fs-body);
  font-variant-numeric: tabular-nums;
  color: var(--c-ink);
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run src/components/stockDetail src/components/StockDetailSheet.test.jsx && npx eslint src/components/stockDetail`
Expected: PASS，lint 無錯誤

- [ ] **Step 9: Commit**

```bash
git add src/components/stockDetail src/App.css
git commit -m "Show next quarter's projected EPS and the assumptions behind it in 估價假設, with 記下這次預估

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: 逐季推估列表與單季覆寫

**Files:**
- Create: `src/components/stockDetail/IncomeQuarterList.jsx`
- Modify: `src/components/stockDetail/IncomeModelSections.jsx`
- Modify: `src/App.css`
- Test: `src/components/stockDetail/ValuationAssumptions.test.jsx`

**Interfaces:**
- Consumes: `income.quarters`、`income.thisYear`、`income.nextYear`、`income.shares`、`income.calibration`（Task 5）；`FIELD_META`、`toInput`、`fromInput`、`formatAssumption`、`formatYi`、`formatShares`（Task 8）；`onQuarterChange(key, field, value)`（Task 9）
- Produces: `IncomeQuarterList` props `{income, overrides, disabled, onChange(key, field, value)}`

- [ ] **Step 1: Write the failing tests**（加到 `describe('ValuationAssumptions — income model (TW)')`）

```js
  it('lists projected quarters by year with the yearly total', () => {
    renderOpen()
    const list = screen.getByLabelText('逐季推估')
    expect(list).toHaveTextContent('2026今年 12.88')
    expect(list).toHaveTextContent('2027明年 19.00')
    expect(screen.getByRole('button', { name: '2026 Q3 推估 EPS 3.40' })).toHaveTextContent('營收已全部公布')
    expect(screen.getByRole('button', { name: '2026 Q4 推估 EPS 3.40' })).not.toHaveTextContent('已公布')
  })

  it('opens one quarter’s statement and overrides it on its own', async () => {
    const onSave = vi.fn().mockResolvedValue({})
    const settings = { ...EMPTY_VALUATION_SETTINGS, snapshots: { '2026Q3': { eps: 3.4 } } }
    renderOpen({ onSave, settings, model: buildModel(settings) })
    fireEvent.click(screen.getByRole('button', { name: '2026 Q4 推估 EPS 3.40' }))
    expect(screen.getByLabelText('2026 Q4 營收 YoY（%）')).toHaveAttribute('placeholder', '50.0')
    expect(screen.queryByLabelText('2026 Q3 毛利率（%）')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('2026 Q4 毛利率（%）'), { target: { value: '55' } })
    expect(screen.getByRole('button', { name: '2026 Q4 推估 EPS 3.94' })).toHaveTextContent('已覆寫')
    fireEvent.click(screen.getByRole('button', { name: /儲\s*存/ }))
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({ model: { quarters: { '2026Q4': { grossMargin: 0.55 } } } }, expect.any(Object)),
    )
  })

  it('hides the revenue YoY input for a quarter whose revenue is all published', () => {
    renderOpen()
    fireEvent.click(screen.getByRole('button', { name: '2026 Q3 推估 EPS 3.40' }))
    expect(screen.queryByLabelText('2026 Q3 營收 YoY（%）')).not.toBeInTheDocument()
    expect(screen.getByLabelText('2026 Q3 毛利率（%）')).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/stockDetail/ValuationAssumptions.test.jsx`
Expected: FAIL

- [ ] **Step 3: `IncomeQuarterList.jsx`**

```jsx
import { useState } from "react";
import { InputNumber } from "antd";
import { NavArrowDown, NavArrowRight } from "iconoir-react";
import {
  FIELD_META,
  formatAssumption,
  formatShares,
  formatYi,
  fromInput,
  toInput,
} from "../../utils/incomeAssumptionForm";
import { formatEps, formatQuarter } from "../../utils/valuation";

const STATEMENT_STEPS = [
  { field: "grossMargin", result: "毛利", value: (q) => q.grossProfit },
  { field: "opexRatio", result: "營業利益", value: (q) => q.operatingIncome },
  { field: "nonOperating", result: "稅前", value: (q) => q.pretaxIncome },
  { field: "taxRate", result: "稅後", value: (q) => q.netIncome },
];

const firstMonth = (quarter) => (quarter - 1) * 3 + 1;

const monthsNote = ({ quarter, reportedMonths }) => {
  if (reportedMonths === 3) return "營收已全部公布";
  if (reportedMonths === 0) return null;
  const from = firstMonth(quarter);
  return reportedMonths === 1 ? `${from} 月已公布` : `${from}–${from + 1} 月已公布`;
};

const revenueNote = ({ quarter, reportedMonths }) => {
  const from = firstMonth(quarter);
  if (reportedMonths === 3) return `（${from}–${from + 2} 月實際）`;
  if (reportedMonths === 0) return "（推估）";
  return `（${from}${reportedMonths === 2 ? `–${from + 1}` : ""} 月實際，其餘推估）`;
};

function QuarterStatement({ quarter, overrides, shares, disabled, onChange }) {
  const input = (field) => {
    const meta = FIELD_META[field];
    return (
      <InputNumber
        aria-label={`${formatQuarter(quarter)} ${meta.label}（${meta.unit}）`}
        inputMode={meta.signed ? undefined : "decimal"}
        step={meta.kind === "percent" ? 0.5 : 1}
        value={toInput(field, overrides[field] ?? null)}
        placeholder={formatAssumption(field, quarter.assumptions[field].value)}
        disabled={disabled}
        onChange={(value) => onChange(field, fromInput(field, value ?? null))}
      />
    );
  };
  return (
    <div className="income-statement">
      <div className="income-statement-row">
        <span>營收</span>
        <span className="income-statement-result">{`${formatYi(quarter.revenue)} ${revenueNote(quarter)}`}</span>
      </div>
      {quarter.reportedMonths < 3 && (
        <div className="income-statement-row income-statement-row--input">
          <span>{`${FIELD_META.revenueYoy.label} %`}</span>
          {input("revenueYoy")}
          <span />
        </div>
      )}
      {STATEMENT_STEPS.map(({ field, result, value }) => (
        <div key={field} className="income-statement-row income-statement-row--input">
          <span>{FIELD_META[field].label}</span>
          {input(field)}
          <span className="income-statement-result">{`→ ${result} ${formatYi(value(quarter))}`}</span>
        </div>
      ))}
      <div className="income-statement-total">
        {`母公司淨利 ${formatYi(quarter.parentNetIncome)} ÷ 股數 ${formatShares(shares)} = EPS ${formatEps(quarter.eps)}`}
      </div>
    </div>
  );
}

const yearTotal = (income, year) => {
  if (year === income.thisYear.year) return { label: "今年", eps: income.thisYear.eps };
  if (year === income.nextYear.year) return { label: "明年", eps: income.nextYear.eps };
  return null;
};

// Grouped by year like the other lists; tapping a quarter shows its small
// income statement and overrides just that quarter. One open at a time.
function IncomeQuarterList({ income, overrides, disabled, onChange }) {
  const [openKey, setOpenKey] = useState(null);
  const years = [...new Set(income.quarters.map((quarter) => quarter.year))];
  return (
    <section className="valuation-assumptions-group" aria-label="逐季推估">
      <h4 className="valuation-assumptions-title">逐季推估</h4>
      {income.calibration !== 1 && (
        <span className="valuation-assumptions-hint">{`營收已依季報口徑校正 ×${income.calibration.toFixed(2)}`}</span>
      )}
      <div className="income-quarter-list">
        {years.map((year) => {
          const total = yearTotal(income, year);
          return (
            <div key={year} className="income-quarter-group">
              <div className="income-quarter-group-heading">
                <span>{year}</span>
                {total && Number.isFinite(total.eps) && <span>{`${total.label} ${formatEps(total.eps)}`}</span>}
              </div>
              {income.quarters
                .filter((quarter) => quarter.year === year)
                .map((quarter) => {
                  const open = openKey === quarter.key;
                  const note = monthsNote(quarter);
                  return (
                    <div key={quarter.key} className="income-quarter">
                      <button
                        type="button"
                        className="income-quarter-row"
                        aria-expanded={open}
                        aria-label={`${formatQuarter(quarter)} 推估 EPS ${formatEps(quarter.eps)}`}
                        onClick={() => setOpenKey(open ? null : quarter.key)}
                      >
                        <span className="income-quarter-name">{`Q${quarter.quarter}`}</span>
                        <span className="income-quarter-meta">
                          {note && <span>{note}</span>}
                          {quarter.overridden && <span className="income-quarter-tag">已覆寫</span>}
                        </span>
                        <span className="income-quarter-eps">{formatEps(quarter.eps)}</span>
                        {open ? <NavArrowDown aria-hidden /> : <NavArrowRight aria-hidden />}
                      </button>
                      {open && (
                        <QuarterStatement
                          quarter={quarter}
                          overrides={overrides[quarter.key] ?? {}}
                          shares={income.shares}
                          disabled={disabled}
                          onChange={(field, value) => onChange(quarter.key, field, value)}
                        />
                      )}
                    </div>
                  );
                })}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default IncomeQuarterList;
```

- [ ] **Step 4: 接進 `IncomeModelSections.jsx`**

import `IncomeQuarterList`，參數加 `onQuarterChange`，在 `<IncomeAssumptionFields …/>` 之後加：

```jsx
      <IncomeQuarterList
        income={income}
        overrides={draft.model.quarters}
        disabled={disabled}
        onChange={onQuarterChange}
      />
```

- [ ] **Step 5: CSS**（`src/App.css`，接在 Task 9 的規則之後）

```css
/* 逐季推估: a framed list grouped by year, like the other lists. */
.income-quarter-list {
  overflow: hidden;
  border: 1px solid var(--c-line);
  border-radius: var(--radius-lg);
  background: var(--c-surface);
}

.income-quarter-group + .income-quarter-group,
.income-quarter + .income-quarter {
  border-top: 1px solid var(--c-line);
}

.income-quarter-group-heading {
  display: flex;
  justify-content: space-between;
  padding: var(--space-1) var(--space-3);
  background: var(--c-neutral-fill);
  font-size: var(--fs-caption);
  color: var(--c-muted);
  font-variant-numeric: tabular-nums;
}

.income-quarter-group-heading span:last-child {
  font-weight: 600;
  color: var(--c-ink);
}

.income-quarter-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  min-height: 44px;
  padding: var(--space-3) var(--space-row-x);
  border: 0;
  background: none;
  font: inherit;
  text-align: left;
  color: var(--c-ink);
  cursor: pointer;
}

.income-quarter-row svg {
  font-size: var(--icon-sm);
  color: var(--c-muted);
}

.income-quarter-name,
.income-quarter-eps {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.income-quarter-meta {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
  font-size: var(--fs-caption);
  color: var(--c-muted);
}

.income-quarter-tag {
  padding: 0 var(--space-2);
  border-radius: var(--radius-pill);
  background: var(--c-neutral-fill);
  color: var(--c-ink);
}

.income-statement {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: 0 var(--space-row-x) var(--space-row-y);
}

.income-statement-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
  align-items: center;
  gap: var(--space-2);
  font-size: var(--fs-body);
  font-variant-numeric: tabular-nums;
}

.income-statement-row--input {
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.4fr);
}

.income-statement-row > span:first-child {
  color: var(--c-muted);
}

.income-statement-row .ant-input-number {
  width: 100%;
}

.income-statement-result {
  text-align: right;
  color: var(--c-ink);
}

.income-statement-total {
  padding-top: var(--space-2);
  border-top: 1px solid var(--c-line);
  font-size: var(--fs-caption);
  color: var(--c-muted);
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/components/stockDetail && npx eslint src/components/stockDetail`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/components/stockDetail src/App.css
git commit -m "List each projected quarter by year and let one quarter override the assumptions

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: 預估與實際的對照

**Files:**
- Create: `src/components/stockDetail/EstimateHistory.jsx`
- Modify: `src/components/stockDetail/IncomeModelSections.jsx`
- Modify: `src/App.css`
- Test: `src/components/stockDetail/ValuationAssumptions.test.jsx`

**Interfaces:**
- Consumes: `compareSnapshots(snapshots, income.reported)`（Task 5）；`formatYi`、`formatPercent`（Task 8）；`formatDateTime`（`src/utils/formatters.js`）
- Produces: `EstimateHistory` props `{comparisons}`

- [ ] **Step 1: Write the failing test**

```js
  it('compares past estimates with the published figures', () => {
    const settings = {
      ...EMPTY_VALUATION_SETTINGS,
      snapshots: {
        '2026Q2': { eps: 3.2, revenue: 1_250, grossMargin: 0.52, opexRatio: 0.19, savedAt: '2026-07-20T00:00:00Z' },
        '2026Q3': { eps: 3.4, savedAt: '2026-10-01T00:00:00Z' },
      },
    }
    renderOpen({ settings, model: buildModel(settings) })
    const row = screen.getByRole('button', { name: /2026 Q2/ })
    expect(row).toHaveTextContent('預估 3.20 → 實際 3.04')
    expect(row).toHaveTextContent('▼5.0%')
    expect(screen.queryByRole('button', { name: /^2026 Q3 預估/ })).not.toBeInTheDocument()
    fireEvent.click(row)
    expect(screen.getByText('52.0% → 50.0%')).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/stockDetail/ValuationAssumptions.test.jsx -t "compares past estimates"`
Expected: FAIL

- [ ] **Step 3: `EstimateHistory.jsx`**

```jsx
import { useState } from "react";
import { NavArrowDown, NavArrowRight } from "iconoir-react";
import { formatPercent, formatYi } from "../../utils/incomeAssumptionForm";
import { formatDateTime } from "../../utils/formatters";
import { formatEps, formatQuarter } from "../../utils/valuation";

function Diff({ value }) {
  if (!Number.isFinite(value)) return <span className="income-history-diff">--</span>;
  const up = value >= 0;
  return (
    <span className={`income-history-diff income-history-diff--${up ? "up" : "down"}`}>
      {`${up ? "▲" : "▼"}${Math.abs(value * 100).toFixed(1)}%`}
    </span>
  );
}

const pair = (estimate, actual, format) =>
  `${Number.isFinite(estimate) ? format(estimate) : "--"} → ${Number.isFinite(actual) ? format(actual) : "--"}`;

// What was expected before each report, against what came out.
function EstimateHistory({ comparisons }) {
  const [openKey, setOpenKey] = useState(null);
  if (comparisons.length === 0) return null;
  return (
    <section className="valuation-assumptions-group">
      <h4 className="valuation-assumptions-title">預估與實際</h4>
      <div className="income-quarter-list">
        {comparisons.map((item) => {
          const open = openKey === item.key;
          return (
            <div key={item.key} className="income-quarter">
              <button
                type="button"
                className="income-quarter-row"
                aria-expanded={open}
                onClick={() => setOpenKey(open ? null : item.key)}
              >
                <span className="income-quarter-name">{formatQuarter(item)}</span>
                <span className="income-quarter-meta">
                  {`預估 ${formatEps(item.estimate.eps)} → 實際 ${formatEps(item.actual.eps)}`}
                </span>
                <Diff value={item.epsDiff} />
                {open ? <NavArrowDown aria-hidden /> : <NavArrowRight aria-hidden />}
              </button>
              {open && (
                <div className="income-statement">
                  <div className="income-statement-row">
                    <span>營收</span>
                    <span className="income-statement-result">
                      {pair(item.estimate.revenue, item.actual.revenue, formatYi)}
                    </span>
                  </div>
                  <div className="income-statement-row">
                    <span>毛利率</span>
                    <span className="income-statement-result">
                      {pair(item.estimate.grossMargin, item.actual.grossMargin, formatPercent)}
                    </span>
                  </div>
                  <div className="income-statement-row">
                    <span>營業費用率</span>
                    <span className="income-statement-result">
                      {pair(item.estimate.opexRatio, item.actual.opexRatio, formatPercent)}
                    </span>
                  </div>
                  {item.savedAt && (
                    <div className="income-statement-total">{`記錄於 ${formatDateTime(item.savedAt)}`}</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default EstimateHistory;
```

- [ ] **Step 4: 接進 `IncomeModelSections.jsx`**

import `EstimateHistory` 與 `compareSnapshots`（from `../../utils/incomeModel`），在 `<IncomeModelSummary …/>` 之後加：

```jsx
      <EstimateHistory comparisons={compareSnapshots(settings.snapshots, income.reported)} />
```

- [ ] **Step 5: CSS**

```css
.income-history-diff {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--c-muted);
}

.income-history-diff--up {
  color: var(--c-up);
}

.income-history-diff--down {
  color: var(--c-down);
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/components/stockDetail && npx eslint src/components/stockDetail`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/components/stockDetail src/App.css
git commit -m "Compare each recorded estimate with the published quarter in 估價假設

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: 股價與 EPS 河流圖

**Files:**
- Create: `src/utils/peRiver.js`
- Create: `src/components/stockDetail/PeRiverChart.jsx`
- Modify: `src/components/StockDetailSheet.jsx`
- Modify: `src/App.css`
- Test: `src/utils/peRiver.test.js`、`src/components/stockDetail/charts.test.jsx`、`src/components/StockDetailSheet.test.jsx`

**Interfaces:**
- Consumes: `computeTtm`（`valuation.js`）、`income.quarters`、`model.bands`、`company.monthly`
- Produces:
  - `filingDeadline({year, quarter})` → `'YYYY-MM-DD'`
  - `buildRiverData({monthly, singles, projected, bands, price, todayIso})` → `{status: 'missing-pe'|'ok', points: Array<RiverPoint>, todayLabel}`；`RiverPoint = {label, close, ttmEps, cheap, fair, expensive, band: [low, high]|null, fairLine, bandFuture, fairFuture, future}`
  - `PeRiverChart` props `{river}`

- [ ] **Step 1: Write the failing tests `src/utils/peRiver.test.js`**

```js
import { describe, it, expect } from 'vitest'
import { buildRiverData, filingDeadline } from './peRiver'
import { MONTHLY_CLOSES, TW_FUNDAMENTALS } from './incomeModel.fixture'
import { buildValuationModel, EMPTY_VALUATION_SETTINGS } from './valuation'

const bands = { cheap: 10, fair: 15, expensive: 20 }
const projected = buildValuationModel({
  fundamentals: TW_FUNDAMENTALS,
  settings: EMPTY_VALUATION_SETTINGS,
  price: 55,
  basis: 'ttm',
  todayIso: '2026-10-11',
}).income.quarters

const build = (overrides = {}) =>
  buildRiverData({
    monthly: MONTHLY_CLOSES,
    singles: TW_FUNDAMENTALS.singles,
    projected,
    bands,
    price: 55,
    todayIso: '2026-10-11',
    ...overrides,
  })

const at = (river, label) => river.points.find((point) => point.label === label)

describe('filingDeadline', () => {
  it('uses the statutory deadlines, Q4 in the following March', () => {
    expect(filingDeadline({ year: 2026, quarter: 1 })).toBe('2026-05-15')
    expect(filingDeadline({ year: 2026, quarter: 3 })).toBe('2026-11-14')
    expect(filingDeadline({ year: 2026, quarter: 4 })).toBe('2027-03-31')
  })
})

describe('buildRiverData', () => {
  it('uses only the TTM that was public at each month end', () => {
    const river = build()
    expect(at(river, '2026-02').ttmEps).toBeNull()
    expect(at(river, '2026-02').band).toBeNull()
    expect(at(river, '2026-03').ttmEps).toBeCloseTo(9.28, 4)
    expect(at(river, '2026-05').ttmEps).toBeCloseTo(10.0, 4)
    expect(at(river, '2026-08')).toMatchObject({ close: 50, ttmEps: expect.closeTo(10.72, 4), future: false })
    expect(at(river, '2026-08').band).toEqual([expect.closeTo(107.2, 4), expect.closeTo(214.4, 4)])
    expect(at(river, '2026-08').fairLine).toBeCloseTo(160.8, 4)
  })

  it('leaves a gap for a month without a close', () => {
    expect(at(build(), '2026-09').close).toBeNull()
  })

  it('puts today’s price on the current month and joins it to the projection', () => {
    const river = build()
    expect(river.todayLabel).toBe('2026-10')
    const today = at(river, '2026-10')
    expect(today).toMatchObject({ close: 55, ttmEps: expect.closeTo(10.72, 4), future: false })
    expect(today.bandFuture).toEqual(today.band)
  })

  it('extends the bands with the projected TTM as each report becomes due, to next December', () => {
    const river = build()
    expect(at(river, '2026-11')).toMatchObject({ close: null, future: true, ttmEps: expect.closeTo(11.8, 4) })
    expect(at(river, '2026-11').band).toBeNull()
    expect(at(river, '2026-11').fairFuture).toBeCloseTo(177, 4)
    expect(at(river, '2027-03').ttmEps).toBeCloseTo(12.88, 4)
    expect(river.points.at(-1)).toMatchObject({ label: '2027-12', ttmEps: expect.closeTo(17.38, 4) })
  })

  it('stops at today without a projection, and needs all three P/E bands', () => {
    expect(build({ projected: [] }).points.at(-1).label).toBe('2026-10')
    expect(build({ bands: { cheap: 10, fair: null, expensive: 20 } })).toEqual({ status: 'missing-pe', points: [], todayLabel: null })
  })
})
```

`src/components/stockDetail/charts.test.jsx` 新增（import `PeRiverChart`）：

```js
  it('names the river chart and its series', () => {
    const river = { status: 'ok', todayLabel: '2026-10', points: [{ label: '2026-09' }, { label: '2026-10' }] }
    render(<PeRiverChart river={river} />)
    expect(screen.getByRole('heading', { name: '股價與 EPS' })).toBeInTheDocument()
    for (const label of ['股價', '便宜–昂貴', '推估']) expect(screen.getByText(label)).toBeInTheDocument()
  })

  it('asks for P/E bands, or says there is no price history', () => {
    const { rerender } = render(<PeRiverChart river={{ status: 'missing-pe', points: [], todayLabel: null }} />)
    expect(screen.getByText('請先在估價假設設定本益比')).toBeInTheDocument()
    rerender(<PeRiverChart river={{ status: 'ok', points: [{ label: '2026-10' }], todayLabel: '2026-10' }} />)
    expect(screen.getByText('尚無歷史股價資料')).toBeInTheDocument()
  })
```

`StockDetailSheet.test.jsx`：`renders header, valuation, charts and source` 中的 `expect(screen.getByText('本益比走勢'))` 改為 `expect(screen.getByText('股價與 EPS'))`，並新增一個 US 測試確認仍顯示 `本益比走勢`（`market: 'US'`、`company: undefined` 的 fundamentals 與 holding）。

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/utils/peRiver.test.js src/components/stockDetail/charts.test.jsx src/components/StockDetailSheet.test.jsx`
Expected: FAIL

- [ ] **Step 3: `src/utils/peRiver.js`**

```js
// Price against EPS × P/E bands (本益比河流圖). Each month uses the TTM that
// was public at its month end — the statutory filing deadline — so the past
// is not drawn with figures nobody had yet.
import { computeTtm } from './valuation'

const DEADLINES = { 1: [0, '05-15'], 2: [0, '08-14'], 3: [0, '11-14'], 4: [1, '03-31'] }

export const filingDeadline = ({ year, quarter }) => {
  const [yearOffset, monthDay] = DEADLINES[quarter]
  return `${year + yearOffset}-${monthDay}`
}

const pad2 = (value) => String(value).padStart(2, '0')

const monthEnd = (month) => {
  const [year, monthNumber] = month.split('-').map(Number)
  return `${month}-${pad2(new Date(Date.UTC(year, monthNumber, 0)).getUTCDate())}`
}

const nextMonth = (month) => {
  const [year, monthNumber] = month.split('-').map(Number)
  return monthNumber === 12 ? `${year + 1}-01` : `${year}-${pad2(monthNumber + 1)}`
}

const ttmKnownAt = (quarters, date) => computeTtm(quarters.filter((item) => filingDeadline(item) <= date))?.eps ?? null

const point = ({ label, close, ttm, bands, future }) => {
  const valued = Number.isFinite(ttm) && ttm > 0
  const prices = valued
    ? { cheap: ttm * bands.cheap, fair: ttm * bands.fair, expensive: ttm * bands.expensive }
    : { cheap: null, fair: null, expensive: null }
  const band = valued ? [prices.cheap, prices.expensive] : null
  return {
    label,
    close: Number.isFinite(close) ? close : null,
    ttmEps: Number.isFinite(ttm) ? ttm : null,
    ...prices,
    band: future ? null : band,
    fairLine: future ? null : prices.fair,
    bandFuture: future ? band : null,
    fairFuture: future ? prices.fair : null,
    future,
  }
}

export const buildRiverData = ({ monthly = [], singles = [], projected = [], bands, price, todayIso }) => {
  if (![bands?.cheap, bands?.fair, bands?.expensive].every(Number.isFinite)) {
    return { status: 'missing-pe', points: [], todayLabel: null }
  }
  const todayLabel = todayIso.slice(0, 7)
  const points = monthly
    .filter(({ month }) => month < todayLabel)
    .map(({ month, close }) =>
      point({ label: month, close, ttm: ttmKnownAt(singles, monthEnd(month)), bands, future: false }),
    )

  // Today: the current price on the latest published TTM; it also starts
  // the dashed projection so the two segments meet.
  const today = point({ label: todayLabel, close: price, ttm: computeTtm(singles)?.eps ?? null, bands, future: false })
  points.push({ ...today, bandFuture: today.band, fairFuture: today.fairLine })

  if (projected.length > 0) {
    const quarters = [...singles, ...projected.map(({ year, quarter, eps }) => ({ year, quarter, eps }))]
    const lastLabel = `${Number(todayIso.slice(0, 4)) + 1}-12`
    for (let month = nextMonth(todayLabel); month <= lastLabel; month = nextMonth(month)) {
      const ttm = ttmKnownAt(quarters, monthEnd(month)) ?? today.ttmEps
      points.push(point({ label: month, close: null, ttm, bands, future: true }))
    }
  }
  return { status: 'ok', points, todayLabel }
}
```

（`computeTtm` 要求最新 4 季連續且皆為有限數字；某月可用的季度若不連續就回 null → 該月不畫帶狀。）

- [ ] **Step 4: `PeRiverChart.jsx`**

```jsx
import { Typography } from "antd";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_STOCK, COLORS } from "../../theme/tokens";
import { formatPrice } from "../../utils/formatters";
import { formatEps } from "../../utils/valuation";

const { Text } = Typography;

const price = (value) => (Number.isFinite(value) ? formatPrice(value, "TWD") : "--");

function RiverTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  const impliedPe = Number.isFinite(item.close) && item.ttmEps > 0 ? (item.close / item.ttmEps).toFixed(1) : null;
  return (
    <div className="pe-river-tooltip">
      <div className="pe-river-tooltip-title">{item.future ? `${item.label}（推估）` : item.label}</div>
      {Number.isFinite(item.close) && <div>{`收盤 ${price(item.close)}`}</div>}
      <div>{`近四季 EPS ${Number.isFinite(item.ttmEps) ? formatEps(item.ttmEps) : "--"}`}</div>
      {impliedPe && <div>{`本益比 ${impliedPe}`}</div>}
      <div>{`便宜 ${price(item.cheap)}／合理 ${price(item.fair)}／昂貴 ${price(item.expensive)}`}</div>
    </div>
  );
}

// Price against EPS × the P/E bands in use: when the price runs above the
// band it has outpaced earnings. Past the dashed 今天 line the band follows
// the projected EPS.
function PeRiverChart({ river }) {
  let body;
  if (river.status === "missing-pe") {
    body = <Text type="secondary">請先在估價假設設定本益比</Text>;
  } else if (river.points.length < 2) {
    body = <Text type="secondary">尚無歷史股價資料</Text>;
  } else {
    body = (
      <div className="stock-detail-chart">
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={river.points} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
            <CartesianGrid stroke={COLORS.line} vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: COLORS.muted }} minTickGap={24} />
            <YAxis tick={{ fontSize: 11, fill: COLORS.muted }} domain={["auto", "auto"]} />
            <Tooltip content={<RiverTooltip />} />
            <Area dataKey="band" stroke="none" fill={CHART_STOCK.previous} fillOpacity={0.7} isAnimationActive={false} />
            <Area
              dataKey="bandFuture"
              stroke={CHART_STOCK.previous}
              strokeDasharray="4 4"
              fill={CHART_STOCK.previous}
              fillOpacity={0.35}
              isAnimationActive={false}
            />
            <Line dataKey="fairLine" stroke={CHART_STOCK.primary} strokeOpacity={0.5} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
            <Line dataKey="fairFuture" stroke={CHART_STOCK.primary} strokeOpacity={0.35} strokeDasharray="2 4" dot={false} isAnimationActive={false} />
            <Line dataKey="close" stroke={CHART_STOCK.primary} strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
            <ReferenceLine
              x={river.todayLabel}
              stroke={COLORS.line}
              label={{ value: "今天", position: "insideTopLeft", fontSize: 11, fill: COLORS.muted }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    );
  }
  return (
    <section className="stock-detail-section" aria-label="股價與 EPS">
      <div className="stock-detail-heading-row">
        <h3 className="stock-detail-heading">股價與 EPS</h3>
        <ul className="stock-detail-legend">
          <li>
            <span className="stock-detail-legend-swatch" style={{ background: CHART_STOCK.primary }} />
            股價
          </li>
          <li>
            <span className="stock-detail-legend-swatch" style={{ background: CHART_STOCK.previous }} />
            便宜–昂貴
          </li>
          <li>
            <span className="stock-detail-legend-swatch stock-detail-legend-swatch--outline" />
            推估
          </li>
        </ul>
      </div>
      {body}
    </section>
  );
}

export default PeRiverChart;
```

- [ ] **Step 5: `StockDetailSheet.jsx`**

import `PeRiverChart` 與 `buildRiverData`。把 `{isStock && <PeHistoryChart … />}` 換成：

```jsx
        {isStock &&
          (data.company ? (
            <PeRiverChart
              river={buildRiverData({
                monthly: data.company.monthly,
                singles: data.singles,
                projected: model.income?.status === "ok" ? model.income.quarters : [],
                bands: model.bands,
                price: holding.latestPrice,
                todayIso,
              })}
            />
          ) : (
            <PeHistoryChart peSeries={data.peSeries} bands={model.bands} />
          ))}
```

並把這段移到「估價假設」入口列之後、`<EpsTrendChart …/>` 之前（現在 `PeHistoryChart` 在 EPS 趨勢之後；spec 要求河流圖緊接估價假設入口）。US 的 `PeHistoryChart` 也一起移到同一位置。

- [ ] **Step 6: CSS**

```css
/* Outline swatch for projected series (推估). */
.stock-detail-legend-swatch--outline {
  border: 1px dashed var(--c-muted);
  background: transparent;
}

.pe-river-tooltip {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--c-line);
  border-radius: var(--radius-md);
  background: var(--c-surface);
  box-shadow: var(--shadow-float);
  font-size: var(--fs-caption);
  color: var(--c-ink);
  font-variant-numeric: tabular-nums;
}

.pe-river-tooltip-title {
  font-weight: 600;
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run src/utils/peRiver.test.js src/components && npx eslint src/utils/peRiver.js src/components/stockDetail src/components/StockDetailSheet.jsx`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/utils/peRiver.js src/utils/peRiver.test.js src/components/stockDetail src/components/StockDetailSheet.jsx src/components/StockDetailSheet.test.jsx src/App.css
git commit -m "Draw price against EPS × P/E bands, extended by the projected EPS, in place of the P/E history for TW stocks

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: EPS 趨勢圖加推估空心長條

**Files:**
- Modify: `src/utils/stockDetail.js`（`buildEpsChartData`）
- Modify: `src/components/stockDetail/EpsTrendChart.jsx`
- Modify: `src/components/StockDetailSheet.jsx`
- Test: `src/components/stockDetail/charts.test.jsx`

**Interfaces:**
- Consumes: `income.quarters`（Task 5）
- Produces: `buildEpsChartData({singles, surprises, projected})`；每列多一個 `projected: number|null`。`EpsTrendChart` props 加 `projected`（預設 `[]`）。

- [ ] **Step 1: Write the failing tests**

`charts.test.jsx` 的 `keeps the latest 8 quarters…` 預期物件都補上 `projected: null`，並新增：

```js
  it('adds projected quarters after the actual ones, keeping 12 bars at most', () => {
    const projected = [
      { year: 2026, quarter: 2, eps: 9.5 }, { year: 2026, quarter: 3, eps: 10 },
      { year: 2026, quarter: 4, eps: 10.5 }, { year: 2027, quarter: 1, eps: 11 },
      { year: 2027, quarter: 2, eps: 11.5 }, { year: 2027, quarter: 3, eps: 12 },
    ]
    const data = buildEpsChartData({ singles, surprises: [], projected })
    expect(data).toHaveLength(12)
    expect(data[5]).toMatchObject({ label: '26Q1', eps: 9, projected: null })
    expect(data[6]).toEqual({ label: '26Q2', eps: null, lastYearEps: 6, estimate: null, surprisePercent: null, projected: 9.5 })
    expect(data.at(-1)).toMatchObject({ label: '27Q3', lastYearEps: null, projected: 12 })
  })

  it('labels projected bars in the legend only when there are some', () => {
    const { rerender } = render(<EpsTrendChart fundamentals={{ singles, surprises: [], nextEarnings: null }} />)
    expect(screen.queryByText('推估')).not.toBeInTheDocument()
    rerender(
      <EpsTrendChart fundamentals={{ singles, surprises: [], nextEarnings: null }} projected={[{ year: 2026, quarter: 2, eps: 9.5 }]} />,
    )
    expect(screen.getByText('推估')).toBeInTheDocument()
  })
```

（`lastYearEps` 只取實際單季：27Q3 的去年同季 26Q3 是推估值，所以為 null。）

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/stockDetail/charts.test.jsx`
Expected: FAIL

- [ ] **Step 3: `buildEpsChartData`**

```js
const CHART_QUARTERS = 8
const MAX_BARS = 12
const MIN_ACTUAL = 4

const shortLabel = ({ year, quarter }) => `${String(year).slice(2)}Q${quarter}`

const lastYearOf = (singles, item) => {
  const lastYear = singles.find((other) => other.year === item.year - 1 && other.quarter === item.quarter)
  return Number.isFinite(lastYear?.eps) ? lastYear.eps : null
}

// Latest actual quarters (8, fewer when projections need the room) with
// last year's quarter and (US) the consensus estimate they were measured
// against, then (TW) the projected quarters as outlined bars.
export const buildEpsChartData = ({ singles = [], surprises = [], projected = [] }) => {
  const ahead = projected.slice(0, MAX_BARS - MIN_ACTUAL)
  const actualCount = Math.min(CHART_QUARTERS, MAX_BARS - ahead.length)
  const actual = singles.slice(-actualCount).map((item) => {
    const surprise = surprises.find((other) => other.year === item.year && other.quarter === item.quarter)
    return {
      label: shortLabel(item),
      eps: Number.isFinite(item.eps) ? item.eps : null,
      lastYearEps: lastYearOf(singles, item),
      estimate: Number.isFinite(surprise?.estimate) ? surprise.estimate : null,
      surprisePercent: Number.isFinite(surprise?.surprisePercent) ? surprise.surprisePercent : null,
      projected: null,
    }
  })
  return [
    ...actual,
    ...ahead.map((item) => ({
      label: shortLabel(item),
      eps: null,
      lastYearEps: lastYearOf(singles, item),
      estimate: null,
      surprisePercent: null,
      projected: item.eps,
    })),
  ]
}
```

- [ ] **Step 4: `EpsTrendChart.jsx`**

- 參數改為 `function EpsTrendChart({ fundamentals, projected = [] })`；`buildEpsChartData({ ...fundamentals, projected })`。
- `TOOLTIP_NAMES` 加 `projected: "推估"`。
- `const hasProjected = data.some((item) => item.projected !== null);`
- legend 在「去年同季」之後加：

```jsx
            {hasProjected && (
              <li>
                <span className="stock-detail-legend-swatch stock-detail-legend-swatch--outline" />
                推估
              </li>
            )}
```

- 在 `<Bar dataKey="eps" … />` 之後加：

```jsx
              {hasProjected && (
                <Bar
                  dataKey="projected"
                  fill="transparent"
                  stroke={CHART_STOCK.primary}
                  strokeDasharray="3 3"
                  radius={[3, 3, 0, 0]}
                />
              )}
```

- [ ] **Step 5: `StockDetailSheet.jsx`**

```jsx
        <EpsTrendChart
          fundamentals={data}
          projected={isStock && model.income?.status === "ok" ? model.income.quarters : []}
        />
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/components src/utils/stockDetail.test.js && npx eslint src/components/stockDetail src/utils/stockDetail.js`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/utils/stockDetail.js src/components/stockDetail src/components/StockDetailSheet.jsx
git commit -m "Show projected quarters as outlined bars after the actual EPS

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: 文件同步與整體驗證

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/技術導覽.md`
- Modify: `DESIGN.md`

- [ ] **Step 1: `CLAUDE.md`**

「TW fundamentals snapshot（個股細節頁估價用）」整段改寫為：

```markdown
### TW fundamentals snapshot（個股細節頁估價用）

`.github/workflows/update-tw-fundamentals.yml`（平日 12:00 UTC）跑 `scripts/update-tw-fundamentals.mjs`，維護三個全市場大檔（在 repo 的 `data/twse/`，**不部署**）：

- `eps_history.json`：TWSE openapi `t187ap06_L_*` 的最新一季損益表（**年度累計**；EPS、營收、毛利、營業利益、業外、稅前、所得稅、稅後、母公司淨利），公司另存 `statement`（`general` 有毛利欄位；`financial` 為金融業版面）。
- `pe_history.json`：每月補上月底的 `[month, 本益比, 收盤價]`（TWSE rwd `BWIBBU_d`）。
- `monthly_revenue.json`：MOPS `t21sc03`（Big5 HTML，`_0` 國內、`_1` KY）近兩個月月營收，每日 merge；**不要**換成 openapi `t187ap05_L`，它落後一個多月。

有變更才 commit，並以 `gh workflow run deploy.yml` 觸發部署（`GITHUB_TOKEN` 的 push 不會觸發 `deploy.yml`）。`predev`／`prebuild` 跑 `scripts/split-tw-fundamentals.mjs` 把大檔拆成 `public/data/tw/{code}.json`（gitignore），細節頁只載入該檔。`scripts/check-tw-fundamentals.mjs` 發現漏季會讓 job 失敗；修法是以 `backfill=true` 手動跑 workflow（`scripts/backfill-tw-fundamentals.mjs`，MOPS 用 `mopsov.twse.com.tw`）。純邏輯在 `src/utils/twFundamentalsMerge.js`。

估價推估在 `src/utils/incomeModel.js`（逐季損益表推估，台股上市非金融股）、`src/utils/valuation.js`（本益比與估價基準）、`src/utils/peRiver.js`（河流圖）；假設與預估快照存在 `app_config` 的 `valuation:<market>_<symbol>`（`model`、`snapshots`）。
```

- [ ] **Step 2: `docs/技術導覽.md`**

```bash
grep -n "tw_eps_history\|tw_pe_history\|成長率\|今年預估" docs/技術導覽.md
```

逐一把路徑改為 `data/twse/…`／`public/data/tw/{code}.json`，把「今年預估＝今年累計 + 去年剩餘季 × 成長率」的描述改為「損益表推估：營收（月營收錨點）→ 毛利率 → 營業費用率 → 業外 → 稅率 → EPS，可覆寫全域或單季假設」，並加一句「估價卡可切換 近四季／下季後／今年／明年」。

- [ ] **Step 3: `DESIGN.md`**

在 Colors → Data & Identity Palettes 的 `CHART_STOCK` 說明句後補：

```markdown
河流圖（`PeRiverChart`）：股價為 `primary` 實線 2px；便宜–昂貴帶為 `previous` 填色、合理線為半透明 `primary` 虛線；「今天」之後的推估段降低透明度、邊線改虛線，以 `line` 色直線分隔。推估值（EPS 趨勢圖的推估季、河流圖未來段）一律用空心或虛線表示，圖例用虛線外框色塊（`stock-detail-legend-swatch--outline`），不另用新色。
```

在 Components 加一小節：

```markdown
### Income Model（估價假設）

估價假設 sheet 的台股上市版：頂部「推估結果」以 title 級（不是 display）顯示下一季 EPS，旁邊 YoY／QoQ 用 ▲▼ + `up`／`down`；「預估與實際」與「逐季推估」用和其他列表相同的框線列表（`neutral-fill` 年份分組標題、右側年度小計 `ink` 600），列可點開該季的迷你損益表（每一層的結果都看得到）。覆寫的季顯示 `neutral-fill` 膠囊「已覆寫」。可能為負的欄位不加 `inputMode`。
```

- [ ] **Step 4: 全部測試、lint、build**

```bash
npm test
npm run lint
npm run build
```

Expected: 全部通過；build 輸出開頭印出 `Split TW fundamentals: … companies`；`ls dist/data/tw | wc -l` 約 1,000。

- [ ] **Step 5: 瀏覽器實際驗證**

```bash
npm run preview
```

在瀏覽器（手機寬度 390px 與桌面）打開預覽網址，登入後點台積電（2330）持股：

1. 細節頁載入，Network 面板只抓 `data/tw/2330.json`（約 10–20 KB），沒有抓 `tw_eps_history.json`。
2. 估價卡四個選項都能切換，說明行數字合理；「明年」比「今年」高（台積電成長中）。
3. 估價假設入口列顯示「2026 Q3 預估 EPS …」。
4. 打開估價假設：推估結果、全域假設 placeholder、逐季推估展開某季並改毛利率 → 數字即時變；按「記下這次預估」→ sheet 關閉；再打開，按鈕變成停用的「儲存」。
5. 河流圖：歷史帶狀、現價點、今天之後虛線帶延伸到明年 12 月；tooltip 正常。
6. EPS 趨勢圖：推估季為空心虛線長條，圖例出現「推估」。
7. 點一檔金融股（例如 2881）：估價假設顯示「金融股不適用損益表推估」，估價卡「下季後／明年」顯示原因。
8. 點一檔美股：估價卡仍為「近四季 TTM／未來四季預估」，仍顯示「本益比走勢」圖。
9. 點一檔上櫃股：仍顯示「目前僅支援上市股票」。

任何一項不符，回到對應 task 修正後再驗證。

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md docs/技術導覽.md DESIGN.md
git commit -m "Document the per-company TW snapshots, the income model and the river chart

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

完成後回報使用者：分支 `feat/income-model` 已就緒，合併到 `main` 前需要 push 讓 workflow 用新路徑運作（`deploy.yml` 的 build 會自動跑 split）。
