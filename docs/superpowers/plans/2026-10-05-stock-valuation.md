# 個股細節頁與 EPS 估價 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 點擊持股打開個股細節頁，以 EPS × 歷史本益比算出便宜 / 合理 / 昂貴價並與現價比較，附單季 EPS 與本益比走勢；台股資料由 GitHub Actions 每日累積。

**Architecture:** 台股（上市）EPS 與月底本益比由 `scripts/*.mjs` 抓 TWSE openapi / MOPS / TWSE rwd，累積成 `public/data/tw_{eps,pe}_history.json`（same-origin，前端 lazy fetch）；美股前端直接打 Finnhub 並以 localStorage 快取 24h。兩邊都正規化成同一個 `fundamentals` 形狀，交給純函式 `buildValuationModel` 計算；UI 是新的 `StockDetailSheet`（手機 bottom sheet、桌機右側 Drawer）。使用者覆寫值存在既有的 `app_config` 表（key `valuation:<market>_<symbol>`），沿用 `mirrorToCloud` 同步。

**Tech Stack:** React 19、Ant Design 6、Recharts 3、Vitest + Testing Library、Node 20（scripts，內建 `fetch`）、GitHub Actions。

**Spec:** `docs/superpowers/specs/2026-10-05-stock-valuation-design.md`

## Global Constraints

- 所有 `npm` / `npx` / `node` 指令都在 `my-stock/` 下執行。
- 不新增任何 npm dependency。
- UI 文案一律繁體中文；數字格式沿用 `src/utils/formatters.js` 的 `formatPrice` / `formatTwd` / `formatDateTime`。
- 寫入（覆寫估價假設）需登入：service 端呼叫 `ensureCloudWritable()`，UI 端以 `isWriteDisabled` 傳入 `disabled`。
- 前端讀 snapshot 一律用 `${import.meta.env.BASE_URL}data/<file>.json`（GitHub Pages 的 base 是 `/<repo>/`）。
- 對 TWSE 的連續請求間隔 ≥ 1,200 ms；對 MOPS 間隔 ≥ 3,000 ms。
- MOPS 用 `https://mopsov.twse.com.tw/mops/web/ajax_t163sb04`（`mops.twse.com.tw` 會回安全性錯誤頁，已實測）。
- 台股估價第一版只支援**上市**；上櫃顯示「目前僅支援上市股票」。
- 色彩用 `src/index.css` 的 CSS 變數（`--c-up` 便宜、`--c-down` 昂貴、`--c-neutral-fill` 合理）與 `src/theme/tokens.js` 的 `COLORS`。
- 每個 commit message 結尾加上：`Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`
- 在 `feat/stock-valuation` 分支上工作，不要 push 到 `main`。

## Review Focus

- 使用者把本益比覆寫成不單調（例如便宜 20、合理 15）→ 不能畫出錯亂的價位尺，應提示「本益比需符合 便宜 ≤ 合理 ≤ 昂貴」（Task 4 測試）。
- 台股公司只有今年資料、缺去年同期（新上市或資料剛開始累積）→ TTM 顯示資料不足、預估顯示「缺少 … 資料，無法推估」，不可出現 `NaN`（Task 5 測試）。
- TWSE openapi 同一公司同一季出現兩次（重編或跨產業檔）→ 以後讀到的為準、只保留一筆（Task 1 測試）。
- 同一檔股票分屬多個 `holder` → 細節頁股數與市值為加總，估價覆寫值共用（Task 9 測試）。
- localStorage 不可用（無痕模式、quota 滿）→ 美股資料仍能載入，只是不快取（Task 6 測試）。

---

### Task 1: 台股 snapshot 的純函式（normalize / merge / gap / PE / MOPS parser）

**Files:**
- Create: `src/utils/twFundamentalsMerge.js`
- Test: `src/utils/twFundamentalsMerge.test.js`

**Interfaces:**
- Consumes: 無。
- Produces（Task 2、3 的 scripts 使用）:
  - `rocToYear(roc: string|number): number`
  - `parseTwNumber(value: unknown): number|null`
  - `quarterKey(year: number, quarter: number): string` → `"2026Q2"`
  - `normalizeIncomeRow(row: Record<string,string>, period?: {year, quarter}): {code, name, year, quarter, eps, revenue, operatingIncome, netIncome}|null`
  - `mergeEpsRows(history, rows): {history, changed: boolean}`；`history` 形狀：`{basis: 'cumulative', updatedAt, companies: {[code]: {name, quarters: {[quarterKey]: {eps, revenue, operatingIncome, netIncome}}}}}`
  - `findRecentGaps(history): Array<{code, missing: string}>`
  - `parseBwibbuRows(json): Array<{code, pe: number|null}>|null`
  - `mergePeMonth(history, month: 'YYYY-MM', rows): history`；`history` 形狀：`{updatedAt, companies: {[code]: Array<[month, pe|null]>}}`（新到舊）
  - `hasPeMonth(history, month): boolean`
  - `previousMonth(date: Date): 'YYYY-MM'`
  - `monthDaysDescending(month: 'YYYY-MM'): string[]`（`YYYYMMDD`）
  - `parseMopsIncomeTables(html: string): Array<Record<string,string>>`

- [ ] **Step 1: Write the failing tests**

`src/utils/twFundamentalsMerge.test.js`:

```js
import { describe, it, expect } from 'vitest'
import {
  findRecentGaps,
  hasPeMonth,
  mergeEpsRows,
  mergePeMonth,
  monthDaysDescending,
  normalizeIncomeRow,
  parseBwibbuRows,
  parseMopsIncomeTables,
  parseTwNumber,
  previousMonth,
  quarterKey,
  rocToYear,
} from './twFundamentalsMerge'

const tsmcOpenApiRow = {
  年度: '115',
  季別: '2',
  公司代號: '2330',
  公司名稱: '台灣積體電路製造股份有限公司',
  營業收入: '2404483690.00',
  '營業利益（損失）': '1425568793.00',
  '本期淨利（淨損）': '1279582227.00',
  '基本每股盈餘（元）': '49.33',
}

describe('number helpers', () => {
  it('converts ROC years and TW number strings', () => {
    expect(rocToYear('115')).toBe(2026)
    expect(parseTwNumber('1,773,045,533')).toBe(1773045533)
    expect(parseTwNumber('-565,473')).toBe(-565473)
    expect(parseTwNumber('--')).toBeNull()
    expect(parseTwNumber('-')).toBeNull()
    expect(parseTwNumber('')).toBeNull()
    expect(parseTwNumber(undefined)).toBeNull()
    expect(quarterKey(2026, 2)).toBe('2026Q2')
  })
})

describe('normalizeIncomeRow', () => {
  it('reads an openapi general-industry row', () => {
    expect(normalizeIncomeRow(tsmcOpenApiRow)).toEqual({
      code: '2330',
      name: '台灣積體電路製造股份有限公司',
      year: 2026,
      quarter: 2,
      eps: 49.33,
      revenue: 2404483690,
      operatingIncome: 1425568793,
      netIncome: 1279582227,
    })
  })

  it('reads a financial-holding row with different field names', () => {
    const row = normalizeIncomeRow({
      年度: '115',
      季別: '2',
      公司代號: '2881',
      公司名稱: '富邦金',
      淨收益: '1,000',
      '本期稅後淨利（淨損）': '500',
      '基本每股盈餘（元）': '6.1',
    })
    expect(row).toMatchObject({ code: '2881', revenue: 1000, operatingIncome: null, netIncome: 500, eps: 6.1 })
  })

  it('takes year / quarter from the period argument for MOPS rows', () => {
    const row = normalizeIncomeRow(
      { 公司代號: '2330', 公司名稱: '台積電', 營業收入: '1,773,045,533', '基本每股盈餘（元）': '29.31' },
      { year: 2025, quarter: 2 },
    )
    expect(row).toMatchObject({ code: '2330', year: 2025, quarter: 2, eps: 29.31, revenue: 1773045533 })
  })

  it('drops rows without a usable EPS or period', () => {
    expect(normalizeIncomeRow({ ...tsmcOpenApiRow, '基本每股盈餘（元）': '--' })).toBeNull()
    expect(normalizeIncomeRow({ ...tsmcOpenApiRow, 季別: '5' })).toBeNull()
    expect(normalizeIncomeRow({ ...tsmcOpenApiRow, 公司代號: '' })).toBeNull()
  })
})

describe('mergeEpsRows', () => {
  const empty = { basis: 'cumulative', updatedAt: null, companies: {} }
  const row = normalizeIncomeRow(tsmcOpenApiRow)

  it('adds new quarters and reports a change', () => {
    const { history, changed } = mergeEpsRows(empty, [row])
    expect(changed).toBe(true)
    expect(history.companies['2330'].quarters['2026Q2'].eps).toBe(49.33)
    expect(history.basis).toBe('cumulative')
  })

  it('reports no change when the same values arrive again', () => {
    const { history } = mergeEpsRows(empty, [row])
    expect(mergeEpsRows(history, [row]).changed).toBe(false)
  })

  it('lets the later row win for the same company and quarter (restatement)', () => {
    const restated = { ...row, eps: 49.5 }
    const { history } = mergeEpsRows(empty, [row, restated])
    expect(history.companies['2330'].quarters['2026Q2'].eps).toBe(49.5)
    expect(Object.keys(history.companies['2330'].quarters)).toEqual(['2026Q2'])
  })

  it('does not mutate the input history', () => {
    const { history } = mergeEpsRows(empty, [row])
    mergeEpsRows(history, [{ ...row, quarter: 3 }])
    expect(Object.keys(history.companies['2330'].quarters)).toEqual(['2026Q2'])
  })
})

describe('findRecentGaps', () => {
  const withQuarters = (keys) => ({
    companies: { 1101: { name: '台泥', quarters: Object.fromEntries(keys.map((k) => [k, { eps: 1 }])) } },
  })

  it('flags a missing quarter right before the latest one', () => {
    expect(findRecentGaps(withQuarters(['2025Q4', '2026Q2']))).toEqual([{ code: '1101', missing: '2026Q1' }])
  })

  it('treats Q4 of last year as the predecessor of Q1', () => {
    expect(findRecentGaps(withQuarters(['2025Q3', '2026Q1']))).toEqual([{ code: '1101', missing: '2025Q4' }])
  })

  it('ignores companies whose history starts at the latest quarter', () => {
    expect(findRecentGaps(withQuarters(['2026Q2']))).toEqual([])
  })

  it('ignores contiguous histories', () => {
    expect(findRecentGaps(withQuarters(['2026Q1', '2026Q2']))).toEqual([])
  })
})

describe('P/E history helpers', () => {
  const bwibbu = {
    stat: 'OK',
    fields: ['證券代號', '證券名稱', '收盤價', '殖利率(%)', '股利年度', '本益比', '股價淨值比', '財報年/季'],
    data: [
      ['1101', '台泥', '26.30', '3.04', 114, '-', '0.85', '115/2'],
      ['2330', '台積電', '1085.00', '0.90', 114, '28.28', '9.84', '115/2'],
    ],
  }

  it('parses BWIBBU_d rows, mapping "-" to null', () => {
    expect(parseBwibbuRows(bwibbu)).toEqual([
      { code: '1101', pe: null },
      { code: '2330', pe: 28.28 },
    ])
  })

  it('returns null for a non-trading day response', () => {
    expect(parseBwibbuRows({ stat: '很抱歉，沒有符合條件的資料!', total: 0 })).toBeNull()
  })

  it('merges a month, replacing an existing entry and keeping newest first', () => {
    let history = { updatedAt: null, companies: { 2330: [['2026-08', 27]] } }
    history = mergePeMonth(history, '2026-09', [{ code: '2330', pe: 28.28 }])
    history = mergePeMonth(history, '2026-09', [{ code: '2330', pe: 28.5 }])
    expect(history.companies['2330']).toEqual([
      ['2026-09', 28.5],
      ['2026-08', 27],
    ])
    expect(hasPeMonth(history, '2026-09')).toBe(true)
    expect(hasPeMonth(history, '2026-07')).toBe(false)
  })

  it('computes the previous month and its days, last day first', () => {
    expect(previousMonth(new Date('2026-10-05T12:00:00Z'))).toBe('2026-09')
    expect(previousMonth(new Date('2026-01-10T12:00:00Z'))).toBe('2025-12')
    const days = monthDaysDescending('2026-02')
    expect(days[0]).toBe('20260228')
    expect(days).toHaveLength(28)
    expect(days.at(-1)).toBe('20260201')
  })
})

describe('parseMopsIncomeTables', () => {
  it('turns each hasBorder table row into a header-keyed object', () => {
    const html = `
      <html><body>
      <table class='hasBorder'>
        <tr class='tblHead'><th>公司代號</th><th>公司名稱</th><th>基本每股盈餘（元）</th></tr>
        <tr class='even'><td>2330</td><td>台積電</td><td style='text-align:right !important;'>29.31&nbsp;</td></tr>
        <tr class='odd'><td>2303</td><td>聯電</td><td>1.85</td></tr>
      </table>
      <table class='hasBorder'>
        <tr class='tblHead'><th>公司代號</th><th>公司名稱</th><th>淨收益</th><th>基本每股盈餘（元）</th></tr>
        <tr class='even'><td>2881</td><td>富邦金</td><td>1,000</td><td>6.10</td></tr>
      </table>
      </body></html>`
    expect(parseMopsIncomeTables(html)).toEqual([
      { 公司代號: '2330', 公司名稱: '台積電', '基本每股盈餘（元）': '29.31' },
      { 公司代號: '2303', 公司名稱: '聯電', '基本每股盈餘（元）': '1.85' },
      { 公司代號: '2881', 公司名稱: '富邦金', 淨收益: '1,000', '基本每股盈餘（元）': '6.10' },
    ])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/utils/twFundamentalsMerge.test.js`
Expected: FAIL（`Failed to resolve import "./twFundamentalsMerge"`）

- [ ] **Step 3: Write the implementation**

`src/utils/twFundamentalsMerge.js`:

```js
// Pure helpers for the TW fundamentals snapshot pipeline
// (scripts/update-tw-fundamentals.mjs, scripts/backfill-tw-fundamentals.mjs).
// Kept under src/ so Vitest covers them; no browser- or Node-only imports.

export const rocToYear = (roc) => Number(roc) + 1911

export const parseTwNumber = (value) => {
  if (value === null || value === undefined) return null
  const text = String(value).replaceAll(',', '').trim()
  if (text === '' || text === '-' || text === '--') return null
  const number = Number(text)
  return Number.isFinite(number) ? number : null
}

export const quarterKey = (year, quarter) => `${year}Q${quarter}`

const quarterIndexOfKey = (key) => {
  const [year, quarter] = key.split('Q').map(Number)
  return year * 4 + (quarter - 1)
}

const keyOfQuarterIndex = (index) => quarterKey(Math.floor(index / 4), (index % 4) + 1)

// Field names differ per industry file (一般業 / 金控 / 證券 …); the first
// one present wins.
const REVENUE_FIELDS = ['營業收入', '淨收益', '收益', '利息淨收益']
const OPERATING_INCOME_FIELDS = ['營業利益（損失）', '營業利益']
const NET_INCOME_FIELDS = ['本期淨利（淨損）', '本期稅後淨利（淨損）']
const EPS_FIELDS = ['基本每股盈餘（元）']

const pickNumber = (row, names) => {
  for (const name of names) {
    if (row[name] !== undefined) return parseTwNumber(row[name])
  }
  return null
}

// One income-statement row (TWSE openapi t187ap06_L_* or a MOPS t163sb04
// table row) → our record. MOPS rows carry no 年度 / 季別, so the caller
// passes the period it queried.
export const normalizeIncomeRow = (row, period = {}) => {
  const code = String(row['公司代號'] ?? '').trim()
  const year = period.year ?? (row['年度'] ? rocToYear(row['年度']) : null)
  const quarter = period.quarter ?? (row['季別'] ? Number(row['季別']) : null)
  const eps = pickNumber(row, EPS_FIELDS)
  if (!code || !year || !(quarter >= 1 && quarter <= 4) || eps === null) return null
  return {
    code,
    name: String(row['公司名稱'] ?? '').trim(),
    year,
    quarter,
    eps,
    revenue: pickNumber(row, REVENUE_FIELDS),
    operatingIncome: pickNumber(row, OPERATING_INCOME_FIELDS),
    netIncome: pickNumber(row, NET_INCOME_FIELDS),
  }
}

const VALUE_FIELDS = ['eps', 'revenue', 'operatingIncome', 'netIncome']

const sameValues = (a, b) => Boolean(a && b) && VALUE_FIELDS.every((field) => a[field] === b[field])

// Values are year-to-date as published; a later row for the same company and
// quarter replaces the earlier one (restatements).
export const mergeEpsRows = (history, rows) => {
  const companies = { ...(history?.companies ?? {}) }
  let changed = false
  for (const row of rows) {
    const previous = companies[row.code] ?? { name: row.name, quarters: {} }
    const key = quarterKey(row.year, row.quarter)
    const value = Object.fromEntries(VALUE_FIELDS.map((field) => [field, row[field]]))
    const name = row.name || previous.name
    if (sameValues(previous.quarters[key], value) && name === previous.name) continue
    companies[row.code] = { name, quarters: { ...previous.quarters, [key]: value } }
    changed = true
  }
  return {
    history: { basis: 'cumulative', updatedAt: history?.updatedAt ?? null, companies },
    changed,
  }
}

// A company whose latest quarter is present but whose previous quarter is
// missing, while it has older data, means a daily run missed a filing.
export const findRecentGaps = (history) => {
  const gaps = []
  for (const [code, company] of Object.entries(history?.companies ?? {})) {
    const indexes = Object.keys(company.quarters ?? {}).map(quarterIndexOfKey).sort((a, b) => a - b)
    if (indexes.length < 2) continue
    const latest = indexes.at(-1)
    const previous = latest - 1
    if (!indexes.includes(previous) && indexes[0] < previous) {
      gaps.push({ code, missing: keyOfQuarterIndex(previous) })
    }
  }
  return gaps
}

// TWSE rwd BWIBBU_d (selectType=ALL). Non-trading days come back with a
// non-OK stat; "-" means no P/E (loss-making).
export const parseBwibbuRows = (json) => {
  if (json?.stat !== 'OK' || !Array.isArray(json.fields) || !Array.isArray(json.data)) return null
  const codeIndex = json.fields.indexOf('證券代號')
  const peIndex = json.fields.indexOf('本益比')
  if (codeIndex < 0 || peIndex < 0) return null
  return json.data.map((row) => {
    const pe = parseTwNumber(row[peIndex])
    return { code: String(row[codeIndex]).trim(), pe: pe !== null && pe > 0 ? pe : null }
  })
}

export const mergePeMonth = (history, month, rows) => {
  const companies = { ...(history?.companies ?? {}) }
  for (const { code, pe } of rows) {
    const series = (companies[code] ?? []).filter(([existing]) => existing !== month)
    series.push([month, pe])
    series.sort((a, b) => (a[0] < b[0] ? 1 : -1))
    companies[code] = series
  }
  return { updatedAt: history?.updatedAt ?? null, companies }
}

export const hasPeMonth = (history, month) =>
  Object.values(history?.companies ?? {}).some((series) => series.some(([existing]) => existing === month))

const pad2 = (value) => String(value).padStart(2, '0')

export const previousMonth = (date) => {
  const first = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1))
  return `${first.getUTCFullYear()}-${pad2(first.getUTCMonth() + 1)}`
}

export const monthDaysDescending = (month) => {
  const [year, monthNumber] = month.split('-').map(Number)
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  return Array.from({ length: lastDay }, (_, index) => `${year}${pad2(monthNumber)}${pad2(lastDay - index)}`)
}

const stripTags = (html) =>
  html.replace(/<[^>]+>/g, '').replaceAll('&nbsp;', ' ').replace(/\s+/g, ' ').trim()

const rowCells = (tr) => [...tr.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((match) => stripTags(match[1]))

// MOPS t163sb04 renders one <table class='hasBorder'> per industry layout;
// the first row of each is its header.
export const parseMopsIncomeTables = (html) => {
  const rows = []
  for (const table of html.match(/<table class=.hasBorder[\s\S]*?<\/table>/g) ?? []) {
    const trs = table.match(/<tr[\s\S]*?<\/tr>/g) ?? []
    if (trs.length < 2) continue
    const header = rowCells(trs[0])
    for (const tr of trs.slice(1)) {
      const values = rowCells(tr)
      if (values.length !== header.length) continue
      rows.push(Object.fromEntries(header.map((name, index) => [name, values[index]])))
    }
  }
  return rows
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/utils/twFundamentalsMerge.test.js`
Expected: PASS（全部）

- [ ] **Step 5: Lint and commit**

```bash
npx eslint src/utils/twFundamentalsMerge.js src/utils/twFundamentalsMerge.test.js
git add src/utils/twFundamentalsMerge.js src/utils/twFundamentalsMerge.test.js
git commit -m "feat(fundamentals): pure helpers for the TW EPS / P/E snapshot" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 每日更新 script、gap 檢查 script 與 GitHub Actions workflow

**Files:**
- Create: `scripts/lib/twse.mjs`
- Create: `scripts/update-tw-fundamentals.mjs`
- Create: `scripts/check-tw-fundamentals.mjs`
- Create: `.github/workflows/update-tw-fundamentals.yml`
- Modify: `CLAUDE.md`（Price providers 段落後新增一小段）

**Interfaces:**
- Consumes: Task 1 全部 export。
- Produces:
  - `scripts/lib/twse.mjs`：`EPS_PATH`、`PE_PATH`、`sleep(ms)`、`readJson(path, fallback)`、`writeJson(path, data)`、`fetchJson(url, init?)`、`fetchBwibbuMonth(month): Promise<Array<{code, pe}>|null>`
  - `public/data/tw_eps_history.json`、`public/data/tw_pe_history.json`（形狀見 Task 1）
  - Workflow 支援 `workflow_dispatch` 的 `backfill` boolean input（Task 3 的 script 由它呼叫）

- [ ] **Step 1: Write `scripts/lib/twse.mjs`**

```js
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { monthDaysDescending, parseBwibbuRows } from '../../src/utils/twFundamentalsMerge.js'

export const EPS_PATH = 'public/data/tw_eps_history.json'
export const PE_PATH = 'public/data/tw_pe_history.json'
export const TWSE_DELAY_MS = 1_200

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export const readJson = async (path, fallback) => {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return fallback
  }
}

export const writeJson = async (path, data) => {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(data)}\n`)
}

const HEADERS = { 'User-Agent': 'Mozilla/5.0 (my-stock snapshot bot)' }

export const fetchJson = async (url, init = {}) => {
  const response = await fetch(url, { ...init, headers: { ...HEADERS, ...init.headers } })
  if (!response.ok) throw new Error(`${url} → HTTP ${response.status}`)
  return response.json()
}

// Walks back from the month's last day until TWSE returns a trading day.
// 15 days covers the longest holiday (Lunar New Year).
export const fetchBwibbuMonth = async (month) => {
  for (const day of monthDaysDescending(month).slice(0, 15)) {
    const json = await fetchJson(
      `https://www.twse.com.tw/rwd/zh/afterTrading/BWIBBU_d?date=${day}&selectType=ALL&response=json`,
    )
    const rows = parseBwibbuRows(json)
    await sleep(TWSE_DELAY_MS)
    if (rows?.length) return rows
  }
  return null
}
```

- [ ] **Step 2: Write `scripts/update-tw-fundamentals.mjs`**

```js
// Daily: merge the latest quarter from TWSE openapi into tw_eps_history.json
// and, once a month, add last month's month-end P/E to tw_pe_history.json.
// Files are only rewritten when something changed, so the workflow commits
// only real updates.
import {
  hasPeMonth,
  mergeEpsRows,
  mergePeMonth,
  normalizeIncomeRow,
  previousMonth,
} from '../src/utils/twFundamentalsMerge.js'
import { EPS_PATH, PE_PATH, TWSE_DELAY_MS, fetchBwibbuMonth, fetchJson, readJson, sleep, writeJson } from './lib/twse.mjs'

const INDUSTRIES = ['ci', 'basi', 'bd', 'fh', 'ins', 'mim']

const rows = []
for (const industry of INDUSTRIES) {
  const data = await fetchJson(`https://openapi.twse.com.tw/v1/opendata/t187ap06_L_${industry}`)
  rows.push(...data.map((row) => normalizeIncomeRow(row)).filter(Boolean))
  await sleep(TWSE_DELAY_MS)
}
if (rows.length === 0) throw new Error('TWSE openapi returned no income-statement rows')

const epsHistory = await readJson(EPS_PATH, { basis: 'cumulative', updatedAt: null, companies: {} })
const { history, changed } = mergeEpsRows(epsHistory, rows)
if (changed) {
  await writeJson(EPS_PATH, { ...history, updatedAt: new Date().toISOString() })
}
console.log(`EPS: ${rows.length} rows read, ${changed ? 'updated' : 'unchanged'}`)

const month = previousMonth(new Date())
const peHistory = await readJson(PE_PATH, { updatedAt: null, companies: {} })
if (hasPeMonth(peHistory, month)) {
  console.log(`P/E: ${month} already stored`)
} else {
  const peRows = await fetchBwibbuMonth(month)
  if (!peRows) throw new Error(`No TWSE P/E data found for ${month}`)
  await writeJson(PE_PATH, { ...mergePeMonth(peHistory, month, peRows), updatedAt: new Date().toISOString() })
  console.log(`P/E: stored ${peRows.length} rows for ${month}`)
}
```

- [ ] **Step 3: Write `scripts/check-tw-fundamentals.mjs`**

```js
// Fails (exit 1) when a company's latest quarter has no predecessor although
// it has older data — i.e. a daily run missed a filing. GitHub then e-mails
// the failure; fix it by running the workflow with backfill=true.
import { findRecentGaps } from '../src/utils/twFundamentalsMerge.js'
import { EPS_PATH, readJson } from './lib/twse.mjs'

const history = await readJson(EPS_PATH, null)
if (!history) {
  console.error(`${EPS_PATH} not found`)
  process.exit(1)
}
const gaps = findRecentGaps(history)
if (gaps.length > 0) {
  console.error(`Quarter gaps in ${gaps.length} companies:`)
  for (const { code, missing } of gaps) console.error(`  ${code} missing ${missing}`)
  process.exit(1)
}
console.log('No quarter gaps')
```

- [ ] **Step 4: Run the daily script locally (real network) and inspect the output**

Run: `node scripts/update-tw-fundamentals.mjs && node scripts/check-tw-fundamentals.mjs`
Expected: 印出 `EPS: <約 1080> rows read, updated`、`P/E: stored <約 1080> rows for 2026-09`、`No quarter gaps`。

Run: `node -e "const h=require('./public/data/tw_eps_history.json');console.log(h.companies['2330'])"`
Expected: `{ name: '台灣積體電路製造股份有限公司', quarters: { '2026Q2': { eps: 49.33, ... } } }`

再跑一次 `node scripts/update-tw-fundamentals.mjs`，Expected：`EPS: … unchanged`、`P/E: 2026-09 already stored`，且 `git status --porcelain public/data` 與第一次跑完相同（第二次沒有改檔）。

這一步產生的 `public/data/tw_*.json` **先不要 commit**（Task 3 回補後一起 commit）。

- [ ] **Step 5: Write `.github/workflows/update-tw-fundamentals.yml`**

```yaml
name: Update TW Fundamentals

on:
  schedule:
    # 20:00 Asia/Taipei, weekdays
    - cron: '0 12 * * 1-5'
  workflow_dispatch:
    inputs:
      backfill:
        description: 'Run the historical backfill (MOPS EPS + 60 months of P/E) instead of the daily update'
        type: boolean
        default: false

permissions:
  contents: write
  actions: write

concurrency:
  group: tw-fundamentals
  cancel-in-progress: false

jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Update snapshot
        run: |
          if [ "${{ inputs.backfill }}" = "true" ]; then
            node scripts/backfill-tw-fundamentals.mjs
          fi
          node scripts/update-tw-fundamentals.mjs

      - name: Commit and deploy
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          FILES="public/data/tw_eps_history.json public/data/tw_pe_history.json"
          if [ -z "$(git status --porcelain -- $FILES)" ]; then
            echo "No snapshot changes"
            exit 0
          fi
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add $FILES
          git commit -m "chore: update TW fundamentals snapshot"
          git pull --rebase
          git push
          # Pushes made with GITHUB_TOKEN do not trigger deploy.yml's push
          # event, so start the deploy explicitly.
          gh workflow run deploy.yml --ref main

      - name: Check for quarter gaps
        run: node scripts/check-tw-fundamentals.mjs
```

- [ ] **Step 6: Document the pipeline in `CLAUDE.md`**

在 `CLAUDE.md` 的 `FX (\`fxProvider.js\`) …` 那一段之後插入：

```markdown
### TW fundamentals snapshot（個股細節頁估價用）

`.github/workflows/update-tw-fundamentals.yml`（平日 12:00 UTC）跑 `scripts/update-tw-fundamentals.mjs`：把 TWSE openapi `t187ap06_L_*` 的最新一季（**年度累計** EPS）合併進 `public/data/tw_eps_history.json`，每月補一次上月底本益比（TWSE rwd `BWIBBU_d`）到 `public/data/tw_pe_history.json`，有變更才 commit，並以 `gh workflow run deploy.yml` 觸發部署（`GITHUB_TOKEN` 的 push 不會觸發 `deploy.yml`）。`scripts/check-tw-fundamentals.mjs` 發現漏季會讓 job 失敗；修法是以 `backfill=true` 手動跑 workflow（`scripts/backfill-tw-fundamentals.mjs`，MOPS 用 `mopsov.twse.com.tw`）。純邏輯在 `src/utils/twFundamentalsMerge.js`。
```

- [ ] **Step 7: Commit（不含 data 檔）**

```bash
git add scripts/lib/twse.mjs scripts/update-tw-fundamentals.mjs scripts/check-tw-fundamentals.mjs .github/workflows/update-tw-fundamentals.yml CLAUDE.md
git commit -m "feat(fundamentals): daily TW EPS / P/E snapshot workflow" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 一次性歷史回補 script，並 commit 初始資料

**Files:**
- Create: `scripts/backfill-tw-fundamentals.mjs`
- Create（產出）: `public/data/tw_eps_history.json`、`public/data/tw_pe_history.json`

**Interfaces:**
- Consumes: Task 1 的 `normalizeIncomeRow`、`parseMopsIncomeTables`、`mergeEpsRows`、`mergePeMonth`、`hasPeMonth`、`previousMonth`；Task 2 的 `scripts/lib/twse.mjs`。
- Produces: 含近 13 季 EPS 與近 60 個月本益比的兩個 data 檔（Task 6 前端讀取）。

- [ ] **Step 1: Write `scripts/backfill-tw-fundamentals.mjs`**

```js
// One-off (re-runnable) backfill: 13 quarters of year-to-date EPS from MOPS
// and 60 month-end P/E snapshots from TWSE. Writes after every period so an
// interrupted run keeps its progress; already-stored months are skipped.
import {
  hasPeMonth,
  mergeEpsRows,
  mergePeMonth,
  normalizeIncomeRow,
  parseMopsIncomeTables,
  previousMonth,
} from '../src/utils/twFundamentalsMerge.js'
import { EPS_PATH, PE_PATH, fetchBwibbuMonth, readJson, sleep, writeJson } from './lib/twse.mjs'

const MOPS_URL = 'https://mopsov.twse.com.tw/mops/web/ajax_t163sb04'
const MOPS_DELAY_MS = 3_000
const EPS_QUARTERS = 13
const PE_MONTHS = 60

const fetchMopsSeason = async (year, quarter) => {
  const body = new URLSearchParams({
    encodeURIComponent: '1',
    step: '1',
    firstin: '1',
    off: '1',
    isQuery: 'Y',
    TYPEK: 'sii',
    year: String(year - 1911),
    season: String(quarter).padStart(2, '0'),
  })
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(MOPS_URL, {
      method: 'POST',
      body,
      headers: { 'User-Agent': 'Mozilla/5.0', 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    if (!response.ok) throw new Error(`MOPS ${year}Q${quarter} → HTTP ${response.status}`)
    const html = await response.text()
    const rows = parseMopsIncomeTables(html).map((row) => normalizeIncomeRow(row, { year, quarter })).filter(Boolean)
    if (rows.length > 0 || !html.includes('頻繁')) return rows
    // "查詢過於頻繁": back off and retry.
    await sleep(10_000)
  }
  throw new Error(`MOPS ${year}Q${quarter}: rate limited`)
}

const now = new Date()
const currentIndex = now.getUTCFullYear() * 4 + Math.floor(now.getUTCMonth() / 3)

let epsHistory = await readJson(EPS_PATH, { basis: 'cumulative', updatedAt: null, companies: {} })
for (let offset = EPS_QUARTERS; offset >= 1; offset -= 1) {
  const index = currentIndex - offset
  const year = Math.floor(index / 4)
  const quarter = (index % 4) + 1
  const rows = await fetchMopsSeason(year, quarter)
  if (rows.length === 0) {
    console.log(`EPS ${year}Q${quarter}: no data (not filed yet)`)
  } else {
    const { history, changed } = mergeEpsRows(epsHistory, rows)
    epsHistory = changed ? { ...history, updatedAt: new Date().toISOString() } : history
    await writeJson(EPS_PATH, epsHistory)
    console.log(`EPS ${year}Q${quarter}: ${rows.length} rows`)
  }
  await sleep(MOPS_DELAY_MS)
}

let peHistory = await readJson(PE_PATH, { updatedAt: null, companies: {} })
let monthDate = now
for (let count = 0; count < PE_MONTHS; count += 1) {
  const month = previousMonth(monthDate)
  monthDate = new Date(`${month}-15T00:00:00Z`)
  if (hasPeMonth(peHistory, month)) continue
  const rows = await fetchBwibbuMonth(month)
  if (!rows) {
    console.log(`P/E ${month}: no data`)
    continue
  }
  peHistory = { ...mergePeMonth(peHistory, month, rows), updatedAt: new Date().toISOString() }
  await writeJson(PE_PATH, peHistory)
  console.log(`P/E ${month}: ${rows.length} rows`)
}
```

- [ ] **Step 2: Run the backfill locally（約 5–10 分鐘）**

Run: `node scripts/backfill-tw-fundamentals.mjs && node scripts/update-tw-fundamentals.mjs && node scripts/check-tw-fundamentals.mjs`
Expected：每季印出 `EPS 20xxQn: <約 1000> rows`（尚未申報的季印 `no data`）、每月印出 `P/E yyyy-mm: <約 900–1080> rows`、最後 `No quarter gaps`。若 check 失敗，把列出的代號與缺漏季貼到 commit message 說明裡，不要改 check 的邏輯。

- [ ] **Step 3: Spot-check against known values**

Run:

```bash
node -e "const h=require('./public/data/tw_eps_history.json');const q=h.companies['2330'].quarters;console.log(q['2025Q2'].eps,q['2026Q2'].eps,Object.keys(q).length)"
node -e "const h=require('./public/data/tw_pe_history.json');console.log(h.companies['2330'].length,h.companies['2330'][0])"
ls -lh public/data/tw_*.json
```

Expected：`29.31 49.33 <12 或 13>`（114Q2 累計 29.31 已在規劃時實測）、`60 [ '2026-09', <約 28> ]`、兩檔各 < 1.5 MB。

- [ ] **Step 4: Commit script 與資料**

```bash
git add scripts/backfill-tw-fundamentals.mjs public/data/tw_eps_history.json public/data/tw_pe_history.json
git commit -m "feat(fundamentals): backfill TW EPS (MOPS) and month-end P/E history" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 估價核心數學（單季 / TTM / 百分位 / 價位判斷）

**Files:**
- Create: `src/utils/valuation.js`
- Test: `src/utils/valuation.test.js`

**Interfaces:**
- Consumes: 無。
- Produces:
  - `VALUATION_SETTING_FIELDS = ['peCheap','peFair','peExpensive','growthRate','forwardEps']`
  - `EMPTY_VALUATION_SETTINGS`（五個欄位皆 `null` 的 frozen object）
  - `quarterIndex({year, quarter}): number`
  - `cumulativeToSingles(cumulative: {[quarterKey]: {eps}}): Array<{year, quarter, eps: number|null}>`（由舊到新）
  - `computeTtm(singles): {eps, quarters, formula}|null`
  - `MIN_PE_SAMPLES = 8`
  - `peBandsFromHistory(values: number[]): {cheap, fair, expensive, sampleSize}|null`
  - `resolvePeBands(auto, settings): {cheap, fair, expensive, overridden: {cheap, fair, expensive}}`
  - `computeValuation({eps, bands, price}): {status: 'ok'|'no-eps'|'loss'|'missing-pe'|'invalid-pe', prices?, zone?, distanceToFair?, scale?, price?}`
  - `positionOnScale(value, scale): number`（0–1）
  - `ZONE_LABELS`

- [ ] **Step 1: Write the failing tests**

`src/utils/valuation.test.js`:

```js
import { describe, it, expect } from 'vitest'
import {
  computeTtm,
  computeValuation,
  cumulativeToSingles,
  EMPTY_VALUATION_SETTINGS,
  peBandsFromHistory,
  positionOnScale,
  resolvePeBands,
} from './valuation'

// Year-to-date EPS as TWSE publishes it.
export const TSMC_CUMULATIVE = {
  '2025Q1': { eps: 13.94 },
  '2025Q2': { eps: 29.31 },
  '2025Q3': { eps: 46.36 },
  '2025Q4': { eps: 66.25 },
  '2026Q1': { eps: 16.0 },
  '2026Q2': { eps: 35.17 },
}

describe('cumulativeToSingles', () => {
  it('subtracts the previous year-to-date value, Q1 as is', () => {
    const singles = cumulativeToSingles(TSMC_CUMULATIVE)
    expect(singles.map((s) => `${s.year}Q${s.quarter}`)).toEqual([
      '2025Q1', '2025Q2', '2025Q3', '2025Q4', '2026Q1', '2026Q2',
    ])
    const eps = singles.map((s) => s.eps)
    expect(eps[0]).toBeCloseTo(13.94, 4)
    expect(eps[1]).toBeCloseTo(15.37, 4)
    expect(eps[3]).toBeCloseTo(19.89, 4)
    expect(eps[4]).toBeCloseTo(16.0, 4)
    expect(eps[5]).toBeCloseTo(19.17, 4)
  })

  it('returns null for a quarter whose previous year-to-date value is missing', () => {
    const singles = cumulativeToSingles({ '2026Q2': { eps: 35.17 } })
    expect(singles).toEqual([{ year: 2026, quarter: 2, eps: null }])
  })
})

describe('computeTtm', () => {
  it('sums the latest four consecutive quarters', () => {
    const ttm = computeTtm(cumulativeToSingles(TSMC_CUMULATIVE))
    expect(ttm.eps).toBeCloseTo(72.11, 2)
    expect(ttm.quarters).toHaveLength(4)
    expect(ttm.formula).toContain('2025 Q3')
    expect(ttm.formula).toContain('72.11')
  })

  it('returns null with fewer than four quarters, a gap, or a null quarter', () => {
    expect(computeTtm([])).toBeNull()
    expect(computeTtm(cumulativeToSingles({ '2026Q1': { eps: 1 }, '2026Q2': { eps: 2 } }))).toBeNull()
    const gap = [
      { year: 2025, quarter: 1, eps: 1 },
      { year: 2025, quarter: 2, eps: 1 },
      { year: 2025, quarter: 4, eps: 1 },
      { year: 2026, quarter: 1, eps: 1 },
    ]
    expect(computeTtm(gap)).toBeNull()
    const withNull = cumulativeToSingles({ ...TSMC_CUMULATIVE, '2025Q4': { eps: null } })
    expect(computeTtm(withNull.slice(-4))).toBeNull()
  })
})

describe('peBandsFromHistory', () => {
  it('takes P25 / P50 / P75 with linear interpolation, ignoring invalid values', () => {
    const bands = peBandsFromHistory([9, 1, 8, 2, 7, 3, 6, 4, 5, null, -3, 0, Number.NaN])
    expect(bands).toEqual({ cheap: 3, fair: 5, expensive: 7, sampleSize: 9 })
  })

  it('returns null with fewer than 8 valid samples', () => {
    expect(peBandsFromHistory([10, 11, 12, 13, 14, 15, 16])).toBeNull()
  })
})

describe('resolvePeBands', () => {
  it('prefers positive overrides and flags them', () => {
    const resolved = resolvePeBands(
      { cheap: 12, fair: 15, expensive: 18 },
      { ...EMPTY_VALUATION_SETTINGS, peFair: 16 },
    )
    expect(resolved).toEqual({
      cheap: 12,
      fair: 16,
      expensive: 18,
      overridden: { cheap: false, fair: true, expensive: false },
    })
  })

  it('leaves bands null when there is neither history nor override', () => {
    expect(resolvePeBands(null, EMPTY_VALUATION_SETTINGS)).toMatchObject({ cheap: null, fair: null, expensive: null })
  })
})

describe('computeValuation', () => {
  const bands = { cheap: 12, fair: 15, expensive: 18 }

  it('prices the three bands and places the current price', () => {
    const result = computeValuation({ eps: 10, bands, price: 140 })
    expect(result.status).toBe('ok')
    expect(result.prices).toEqual({ cheap: 120, fair: 150, expensive: 180 })
    expect(result.zone).toBe('fair-low')
    expect(result.distanceToFair).toBeCloseTo(-0.0667, 4)
    expect(result.scale.min).toBeCloseTo(108, 6)
    expect(result.scale.max).toBeCloseTo(198, 6)
  })

  it('classifies all four zones at their boundaries', () => {
    expect(computeValuation({ eps: 10, bands, price: 119 }).zone).toBe('below')
    expect(computeValuation({ eps: 10, bands, price: 120 }).zone).toBe('fair-low')
    expect(computeValuation({ eps: 10, bands, price: 150 }).zone).toBe('fair-high')
    expect(computeValuation({ eps: 10, bands, price: 180 }).zone).toBe('above')
  })

  it('widens the scale to include a price outside the bands', () => {
    const result = computeValuation({ eps: 10, bands, price: 250 })
    expect(result.scale.max).toBeCloseTo(275, 6)
    expect(positionOnScale(250, result.scale)).toBeCloseTo(142 / 167, 6)
  })

  it('omits zone and distance without a price', () => {
    const result = computeValuation({ eps: 10, bands, price: undefined })
    expect(result.status).toBe('ok')
    expect(result.zone).toBeNull()
    expect(result.distanceToFair).toBeNull()
  })

  it('reports why it cannot value the stock', () => {
    expect(computeValuation({ eps: null, bands, price: 100 }).status).toBe('no-eps')
    expect(computeValuation({ eps: -1.2, bands, price: 100 }).status).toBe('loss')
    expect(computeValuation({ eps: 0, bands, price: 100 }).status).toBe('loss')
    expect(computeValuation({ eps: 10, bands: { cheap: 12, fair: null, expensive: 18 }, price: 100 }).status).toBe('missing-pe')
  })

  it('rejects non-monotonic P/E bands instead of drawing a broken ruler', () => {
    expect(computeValuation({ eps: 10, bands: { cheap: 20, fair: 15, expensive: 18 }, price: 100 }).status).toBe('invalid-pe')
  })
})

describe('positionOnScale', () => {
  it('clamps to 0..1', () => {
    expect(positionOnScale(50, { min: 100, max: 200 })).toBe(0)
    expect(positionOnScale(150, { min: 100, max: 200 })).toBe(0.5)
    expect(positionOnScale(300, { min: 100, max: 200 })).toBe(1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/utils/valuation.test.js`
Expected: FAIL（`Failed to resolve import "./valuation"`）

- [ ] **Step 3: Write the implementation**

`src/utils/valuation.js`:

```js
// EPS × P/E valuation maths for the stock detail sheet. Pure functions; see
// docs/superpowers/specs/2026-10-05-stock-valuation-design.md for the rules.

export const VALUATION_SETTING_FIELDS = ['peCheap', 'peFair', 'peExpensive', 'growthRate', 'forwardEps']

export const EMPTY_VALUATION_SETTINGS = Object.freeze(
  Object.fromEntries(VALUATION_SETTING_FIELDS.map((field) => [field, null])),
)

export const MIN_PE_SAMPLES = 8

export const ZONE_LABELS = {
  below: '低於便宜價',
  'fair-low': '合理偏低',
  'fair-high': '合理偏高',
  above: '高於昂貴價',
}

const round = (value, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits

export const formatEps = (value) => value.toFixed(2)

export const quarterIndex = ({ year, quarter }) => year * 4 + (quarter - 1)

export const formatQuarter = ({ year, quarter }) => `${year} Q${quarter}`

const parseQuarterKey = (key) => {
  const [year, quarter] = key.split('Q').map(Number)
  return { year, quarter }
}

// TWSE publishes year-to-date EPS: Qn = cum(n) − cum(n−1), Q1 = cum(1).
export const cumulativeToSingles = (cumulative) => {
  const entries = Object.entries(cumulative ?? {})
    .map(([key, value]) => ({ ...parseQuarterKey(key), cum: Number.isFinite(value?.eps) ? value.eps : null }))
    .sort((a, b) => quarterIndex(a) - quarterIndex(b))
  const byIndex = new Map(entries.map((entry) => [quarterIndex(entry), entry]))
  return entries.map(({ year, quarter, cum }) => {
    if (cum === null) return { year, quarter, eps: null }
    if (quarter === 1) return { year, quarter, eps: cum }
    const previous = byIndex.get(quarterIndex({ year, quarter }) - 1)
    return { year, quarter, eps: Number.isFinite(previous?.cum) ? round(cum - previous.cum, 4) : null }
  })
}

// `singles` must be sorted oldest → newest.
export const computeTtm = (singles) => {
  if (!Array.isArray(singles) || singles.length < 4) return null
  const quarters = singles.slice(-4)
  for (let i = 1; i < quarters.length; i += 1) {
    if (quarterIndex(quarters[i]) !== quarterIndex(quarters[i - 1]) + 1) return null
  }
  if (quarters.some((item) => !Number.isFinite(item.eps))) return null
  const eps = round(quarters.reduce((sum, item) => sum + item.eps, 0), 4)
  return {
    eps,
    quarters,
    formula: `近四季 ${formatQuarter(quarters[0])}–${formatQuarter(quarters[3])} 合計 ${formatEps(eps)}`,
  }
}

const percentile = (sorted, p) => {
  const position = (sorted.length - 1) * p
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower)
}

export const peBandsFromHistory = (values) => {
  const valid = (values ?? []).filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b)
  if (valid.length < MIN_PE_SAMPLES) return null
  return {
    cheap: round(percentile(valid, 0.25)),
    fair: round(percentile(valid, 0.5)),
    expensive: round(percentile(valid, 0.75)),
    sampleSize: valid.length,
  }
}

const BAND_FIELDS = { cheap: 'peCheap', fair: 'peFair', expensive: 'peExpensive' }

export const resolvePeBands = (auto, settings) => {
  const result = { overridden: {} }
  for (const [band, field] of Object.entries(BAND_FIELDS)) {
    const override = settings?.[field]
    const isOverride = Number.isFinite(override) && override > 0
    result[band] = isOverride ? override : auto?.[band] ?? null
    result.overridden[band] = isOverride
  }
  return result
}

const isPositive = (value) => Number.isFinite(value) && value > 0

export const computeValuation = ({ eps, bands, price }) => {
  if (!Number.isFinite(eps)) return { status: 'no-eps' }
  if (eps <= 0) return { status: 'loss' }
  const { cheap, fair, expensive } = bands ?? {}
  if (![cheap, fair, expensive].every(isPositive)) return { status: 'missing-pe' }
  if (!(cheap <= fair && fair <= expensive)) return { status: 'invalid-pe' }

  const prices = { cheap: round(eps * cheap), fair: round(eps * fair), expensive: round(eps * expensive) }
  const hasPrice = isPositive(price)
  const scale = {
    min: Math.min(prices.cheap, hasPrice ? price : Infinity) * 0.9,
    max: Math.max(prices.expensive, hasPrice ? price : -Infinity) * 1.1,
  }
  let zone = null
  if (hasPrice) {
    if (price < prices.cheap) zone = 'below'
    else if (price < prices.fair) zone = 'fair-low'
    else if (price < prices.expensive) zone = 'fair-high'
    else zone = 'above'
  }
  return {
    status: 'ok',
    prices,
    zone,
    distanceToFair: hasPrice ? price / prices.fair - 1 : null,
    scale,
    price: hasPrice ? price : null,
  }
}

export const positionOnScale = (value, scale) =>
  Math.min(1, Math.max(0, (value - scale.min) / (scale.max - scale.min)))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/utils/valuation.test.js`
Expected: PASS

- [ ] **Step 5: Lint and commit**

```bash
npx eslint src/utils/valuation.js src/utils/valuation.test.js
git add src/utils/valuation.js src/utils/valuation.test.js
git commit -m "feat(valuation): TTM, P/E percentile bands and price zones" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: 預估 EPS（台股成長率 / 美股 consensus）、法定截止日、`buildValuationModel`

**Files:**
- Modify: `src/utils/valuation.js`（append）
- Test: `src/utils/valuation.forward.test.js`

**Interfaces:**
- Consumes: Task 4 的 `cumulativeToSingles`、`computeTtm`、`peBandsFromHistory`、`resolvePeBands`、`computeValuation`、`formatEps`。
- Produces:
  - `estimateTwForwardEps(cumulative, settings): {eps: number|null, targetYear, growthRate, autoGrowthRate: number|null, growthNote, overridden: {forwardEps, growthRate}, formula}|null`
  - `estimateUsForwardEps({upcoming, singles}, settings): {eps, overridden: {forwardEps, growthRate: false}, formula}|null`
  - `nextTwFilingDeadline(todayIso: 'YYYY-MM-DD'): {date, label}`
  - `buildValuationModel({fundamentals, settings, price, basis: 'ttm'|'forward'}): {basis, ttm, forward, autoBands, bands, valuation}`
  - `fundamentals` 形狀（Task 7 產出，這裡先定義）：`{market: 'TW'|'US', singles, cumulative: object|null, surprises: Array<{year, quarter, period, actual, estimate, surprisePercent}>, upcoming: Array<{date, hour, epsEstimate}>, peSeries: Array<{label, pe}>, nextEarnings: {date, label}|null, updatedAt: string|null}`

- [ ] **Step 1: Write the failing tests**

`src/utils/valuation.forward.test.js`:

```js
import { describe, it, expect } from 'vitest'
import {
  buildValuationModel,
  cumulativeToSingles,
  EMPTY_VALUATION_SETTINGS,
  estimateTwForwardEps,
  estimateUsForwardEps,
  nextTwFilingDeadline,
} from './valuation'

const TSMC_CUMULATIVE = {
  '2025Q1': { eps: 13.94 },
  '2025Q2': { eps: 29.31 },
  '2025Q3': { eps: 46.36 },
  '2025Q4': { eps: 66.25 },
  '2026Q1': { eps: 16.0 },
  '2026Q2': { eps: 35.17 },
}

describe('estimateTwForwardEps', () => {
  it('grows last year’s remaining quarters by this year’s YTD growth', () => {
    const result = estimateTwForwardEps(TSMC_CUMULATIVE, EMPTY_VALUATION_SETTINGS)
    // g = 35.17 / 29.31 − 1 ≈ 19.99%; 35.17 + (17.05 + 19.89) × 1.1999
    expect(result.autoGrowthRate).toBeCloseTo(0.19993, 4)
    expect(result.eps).toBeCloseTo(79.5, 1)
    expect(result.targetYear).toBe(2026)
    expect(result.formula).toContain('今年 Q1–Q2 累計 35.17')
    expect(result.formula).toContain('去年 Q3–Q4 36.94')
    expect(result.overridden).toEqual({ forwardEps: false, growthRate: false })
  })

  it('uses an overridden growth rate', () => {
    const result = estimateTwForwardEps(TSMC_CUMULATIVE, { ...EMPTY_VALUATION_SETTINGS, growthRate: 0.1 })
    expect(result.eps).toBeCloseTo(75.8, 2)
    expect(result.growthRate).toBe(0.1)
    expect(result.overridden.growthRate).toBe(true)
  })

  it('uses an overridden forward EPS above everything else', () => {
    const result = estimateTwForwardEps(TSMC_CUMULATIVE, { ...EMPTY_VALUATION_SETTINGS, growthRate: 0.1, forwardEps: 80 })
    expect(result.eps).toBe(80)
    expect(result.overridden.forwardEps).toBe(true)
  })

  it('projects next year from the annual figure once Q4 is out', () => {
    const result = estimateTwForwardEps({ '2024Q4': { eps: 50 }, '2025Q4': { eps: 60 } }, EMPTY_VALUATION_SETTINGS)
    expect(result.targetYear).toBe(2026)
    expect(result.eps).toBeCloseTo(72, 6)
  })

  it('labels a single remaining quarter without a range', () => {
    const result = estimateTwForwardEps(
      { ...TSMC_CUMULATIVE, '2026Q3': { eps: 55 } },
      EMPTY_VALUATION_SETTINGS,
    )
    expect(result.formula).toContain('去年 Q4 19.89')
  })

  it('falls back to 0% growth and reports missing data without NaN', () => {
    const result = estimateTwForwardEps({ '2026Q1': { eps: 4 }, '2026Q2': { eps: 10 } }, EMPTY_VALUATION_SETTINGS)
    expect(result.autoGrowthRate).toBeNull()
    expect(result.eps).toBeNull()
    expect(result.formula).toContain('缺少 2025 年 Q3–Q4 資料')
    expect(result.formula).not.toContain('NaN')
  })

  it('returns null without any data', () => {
    expect(estimateTwForwardEps({}, EMPTY_VALUATION_SETTINGS)).toBeNull()
  })
})

describe('estimateUsForwardEps', () => {
  const singles = [
    { year: 2026, quarter: 1, eps: 2.0 },
    { year: 2026, quarter: 2, eps: 2.02 },
  ]
  const upcoming = [
    { date: '2027-01-27', hour: '', epsEstimate: 2.95 },
    { date: '2026-10-29', hour: 'amc', epsEstimate: 2.02 },
    { date: '2027-04-28', hour: '', epsEstimate: 2.29 },
  ]

  it('adds up to 4 upcoming estimates and fills with the latest actuals', () => {
    const result = estimateUsForwardEps({ upcoming, singles }, EMPTY_VALUATION_SETTINGS)
    expect(result.eps).toBeCloseTo(9.28, 6)
    expect(result.formula).toContain('未來 3 季預估')
    expect(result.formula).toContain('最近 1 季實際')
    expect(result.formula).toContain('調整後 EPS')
  })

  it('needs no actuals when 4 estimates exist', () => {
    const four = [...upcoming, { date: '2027-07-28', hour: '', epsEstimate: 2.5 }]
    const result = estimateUsForwardEps({ upcoming: four, singles: [] }, EMPTY_VALUATION_SETTINGS)
    expect(result.eps).toBeCloseTo(9.76, 6)
    expect(result.formula).not.toContain('實際')
  })

  it('returns null without estimates, or without enough actuals', () => {
    expect(estimateUsForwardEps({ upcoming: [], singles }, EMPTY_VALUATION_SETTINGS)).toBeNull()
    expect(estimateUsForwardEps({ upcoming: upcoming.slice(0, 1), singles }, EMPTY_VALUATION_SETTINGS)).toBeNull()
  })

  it('honours a forward EPS override', () => {
    expect(estimateUsForwardEps({ upcoming: [], singles: [] }, { ...EMPTY_VALUATION_SETTINGS, forwardEps: 9 }).eps).toBe(9)
  })
})

describe('nextTwFilingDeadline', () => {
  it('returns the next statutory deadline, inclusive of today', () => {
    expect(nextTwFilingDeadline('2026-10-05')).toEqual({ date: '2026-11-14', label: 'Q3 財報' })
    expect(nextTwFilingDeadline('2026-11-14')).toEqual({ date: '2026-11-14', label: 'Q3 財報' })
    expect(nextTwFilingDeadline('2026-11-15')).toEqual({ date: '2027-03-31', label: '年報' })
  })
})

describe('buildValuationModel', () => {
  const peSeries = [10, 12, 14, 15, 16, 18, 20, 22].map((pe, i) => ({ label: `m${i}`, pe }))
  const fundamentals = {
    market: 'TW',
    singles: cumulativeToSingles(TSMC_CUMULATIVE),
    cumulative: TSMC_CUMULATIVE,
    surprises: [],
    upcoming: [],
    peSeries,
    nextEarnings: null,
    updatedAt: null,
  }

  it('values on TTM by default and on the forward estimate when asked', () => {
    const ttm = buildValuationModel({ fundamentals, settings: EMPTY_VALUATION_SETTINGS, price: 1000, basis: 'ttm' })
    expect(ttm.autoBands.sampleSize).toBe(8)
    expect(ttm.valuation.status).toBe('ok')
    expect(ttm.valuation.prices.fair).toBeCloseTo(72.11 * ttm.bands.fair, 1)

    const forward = buildValuationModel({ fundamentals, settings: EMPTY_VALUATION_SETTINGS, price: 1000, basis: 'forward' })
    expect(forward.valuation.prices.fair).toBeCloseTo(forward.forward.eps * forward.bands.fair, 1)
  })

  it('reports no-eps on the TTM tab when history is too short', () => {
    const short = { ...fundamentals, singles: fundamentals.singles.slice(-2) }
    expect(buildValuationModel({ fundamentals: short, settings: EMPTY_VALUATION_SETTINGS, price: 1000, basis: 'ttm' }).valuation.status).toBe('no-eps')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/utils/valuation.forward.test.js`
Expected: FAIL（`estimateTwForwardEps is not a function` 之類）

- [ ] **Step 3: Append the implementation to `src/utils/valuation.js`**

```js
const formatPercent = (value) => `${(value * 100).toFixed(1)}%`

const quarterRangeLabel = (from) => (from === 4 ? 'Q4' : `Q${from}–Q4`)

// 台股今年預估: YTD + last year's remaining quarters × (1 + YTD growth).
// After Q4 (annual) is out, projects next year from the annual figure.
export const estimateTwForwardEps = (cumulative, settings) => {
  const singles = cumulativeToSingles(cumulative)
  const latest = [...singles].reverse().find((item) => Number.isFinite(cumulative?.[`${item.year}Q${item.quarter}`]?.eps))
  if (!latest) return null
  const { year, quarter } = latest
  const cumOf = (y, q) => cumulative?.[`${y}Q${q}`]?.eps
  const latestCum = cumOf(year, quarter)
  const base = cumOf(year - 1, quarter)
  const autoGrowthRate = Number.isFinite(base) && base > 0 ? latestCum / base - 1 : null
  const overrideGrowth = Number.isFinite(settings?.growthRate) ? settings.growthRate : null
  const growthRate = overrideGrowth ?? autoGrowthRate ?? 0
  let growthNote = '今年累計 YoY'
  if (overrideGrowth !== null) growthNote = '自訂成長率'
  else if (autoGrowthRate === null) growthNote = '無法計算成長率，以 0% 計'
  const targetYear = quarter === 4 ? year + 1 : year
  const common = { targetYear, growthRate, autoGrowthRate, growthNote }

  if (Number.isFinite(settings?.forwardEps)) {
    return {
      ...common,
      eps: settings.forwardEps,
      overridden: { forwardEps: true, growthRate: overrideGrowth !== null },
      formula: `自訂預估 EPS ${formatEps(settings.forwardEps)}`,
    }
  }
  const overridden = { forwardEps: false, growthRate: overrideGrowth !== null }

  if (quarter === 4) {
    return {
      ...common,
      overridden,
      eps: round(latestCum * (1 + growthRate)),
      formula: `${year} 全年 ${formatEps(latestCum)} × (1 + ${formatPercent(growthRate)})`,
    }
  }

  const range = quarterRangeLabel(quarter + 1)
  const rest = []
  for (let q = quarter + 1; q <= 4; q += 1) {
    rest.push(singles.find((item) => item.year === year - 1 && item.quarter === q)?.eps)
  }
  if (rest.some((value) => !Number.isFinite(value))) {
    return { ...common, overridden, eps: null, formula: `缺少 ${year - 1} 年 ${range} 資料，無法推估` }
  }
  const restSum = rest.reduce((sum, value) => sum + value, 0)
  return {
    ...common,
    overridden,
    eps: round(latestCum + restSum * (1 + growthRate)),
    formula: `今年 Q1–Q${quarter} 累計 ${formatEps(latestCum)} + 去年 ${range} ${formatEps(restSum)} × (1 + ${formatPercent(growthRate)})`,
  }
}

// 美股未來四季: up to 4 upcoming consensus estimates, topped up with the
// most recent actual quarters.
export const estimateUsForwardEps = ({ upcoming = [], singles = [] }, settings) => {
  if (Number.isFinite(settings?.forwardEps)) {
    return {
      eps: settings.forwardEps,
      overridden: { forwardEps: true, growthRate: false },
      formula: `自訂預估 EPS ${formatEps(settings.forwardEps)}`,
    }
  }
  const estimates = upcoming
    .filter((item) => Number.isFinite(item.epsEstimate))
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .slice(0, 4)
  if (estimates.length === 0) return null
  const need = 4 - estimates.length
  const actuals = need > 0 ? singles.filter((item) => Number.isFinite(item.eps)).slice(-need) : []
  if (actuals.length < need) return null
  const estimateSum = estimates.reduce((sum, item) => sum + item.epsEstimate, 0)
  const actualSum = actuals.reduce((sum, item) => sum + item.eps, 0)
  const parts = [`未來 ${estimates.length} 季預估 ${formatEps(estimateSum)}`]
  if (need > 0) parts.push(`最近 ${need} 季實際 ${formatEps(actualSum)}`)
  return {
    eps: round(estimateSum + actualSum, 4),
    overridden: { forwardEps: false, growthRate: false },
    formula: `${parts.join(' + ')}（分析師 consensus，調整後 EPS）`,
  }
}

// 一般業法定申報期限.
const TW_DEADLINES = [
  { month: '03', day: '31', label: '年報' },
  { month: '05', day: '15', label: 'Q1 財報' },
  { month: '08', day: '14', label: 'Q2 財報' },
  { month: '11', day: '14', label: 'Q3 財報' },
]

export const nextTwFilingDeadline = (todayIso) => {
  const year = Number(todayIso.slice(0, 4))
  for (const candidateYear of [year, year + 1]) {
    for (const { month, day, label } of TW_DEADLINES) {
      const date = `${candidateYear}-${month}-${day}`
      if (date >= todayIso) return { date, label }
    }
  }
  return null
}

export const buildValuationModel = ({ fundamentals, settings, price, basis }) => {
  const autoBands = peBandsFromHistory(fundamentals.peSeries.map((point) => point.pe))
  const bands = resolvePeBands(autoBands, settings)
  const ttm = computeTtm(fundamentals.singles)
  const forward =
    fundamentals.market === 'TW'
      ? estimateTwForwardEps(fundamentals.cumulative, settings)
      : estimateUsForwardEps(fundamentals, settings)
  const chosen = basis === 'forward' ? forward : ttm
  return {
    basis,
    ttm,
    forward,
    autoBands,
    bands,
    valuation: computeValuation({ eps: chosen?.eps, bands, price }),
  }
}
```

- [ ] **Step 4: Run both valuation test files**

Run: `npx vitest run src/utils/valuation`
Expected: PASS（兩個檔案）

- [ ] **Step 5: Lint and commit**

```bash
npx eslint src/utils/valuation.js src/utils/valuation.forward.test.js
git add src/utils/valuation.js src/utils/valuation.forward.test.js
git commit -m "feat(valuation): forward EPS estimates, filing deadlines and model builder" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: 資料 provider（Finnhub 美股 / 台股 snapshot）與 PWA runtime caching

**Files:**
- Modify: `src/services/priceProviders/finnhubProvider.js:22`（`const requestFinnhub` → `export const requestFinnhub`）
- Create: `src/services/fundamentalsProviders/finnhubFundamentalsProvider.js`
- Create: `src/services/fundamentalsProviders/twFundamentalsProvider.js`
- Test: `src/services/fundamentalsProviders/finnhubFundamentalsProvider.test.js`
- Test: `src/services/fundamentalsProviders/twFundamentalsProvider.test.js`
- Modify: `vite.config.js`（`workbox.runtimeCaching` 新增一筆）

**Interfaces:**
- Consumes: `requestFinnhub(path, params)`（既有，改為 export）。
- Produces:
  - `periodToQuarter(period: 'YYYY-MM-DD'): {year, quarter}`
  - `US_CACHE_TTL_MS`
  - `getUsFundamentals(symbol, {now?}): Promise<{fetchedAt, singles: Array<{year, quarter, period, eps}>, peSeries: Array<{label, pe}>, surprises: Array<{year, quarter, period, actual, estimate, surprisePercent}>, upcoming: Array<{date, hour, epsEstimate}>}>`
  - `getTwFundamentals(symbol): Promise<{name, cumulative, peSeries: Array<{label, pe}>, epsUpdatedAt, peUpdatedAt}|null>`
  - `resetTwFundamentalsCache(): void`（測試用）

- [ ] **Step 1: Export `requestFinnhub`**

在 `src/services/priceProviders/finnhubProvider.js` 把 `const requestFinnhub = async (path, params) => {` 改成 `export const requestFinnhub = async (path, params) => {`。

- [ ] **Step 2: Write the failing tests**

`src/services/fundamentalsProviders/finnhubFundamentalsProvider.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('../priceProviders/finnhubProvider', () => ({ requestFinnhub: vi.fn() }))

import { requestFinnhub } from '../priceProviders/finnhubProvider'
import { getUsFundamentals, periodToQuarter, US_CACHE_TTL_MS } from './finnhubFundamentalsProvider'

const NOW = Date.parse('2026-10-05T12:00:00Z')

const responses = {
  '/stock/metric': {
    series: {
      quarterly: {
        eps: [
          { period: '2026-06-27', v: 2.0244 },
          { period: '2026-03-28', v: 2.0086 },
          { period: '2025-12-27', v: 2.8424 },
        ],
        peTTM: [
          { period: '2026-06-27', v: 32.1 },
          { period: '2026-03-28', v: 29.5 },
        ],
      },
    },
  },
  '/stock/earnings': [
    { period: '2026-06-30', actual: 1.91, estimate: 1.9271, surprisePercent: -0.8873, year: 2026, quarter: 3 },
  ],
  '/calendar/earnings': {
    earningsCalendar: [
      { date: '2027-01-27', hour: '', epsEstimate: 2.9512, epsActual: null },
      { date: '2026-10-29', hour: 'amc', epsEstimate: 2.0214, epsActual: null },
    ],
  },
}

beforeEach(() => {
  window.localStorage.clear()
  requestFinnhub.mockReset()
  requestFinnhub.mockImplementation(async (path) => responses[path])
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('periodToQuarter', () => {
  it('files fiscal period ends under the calendar quarter they mostly cover', () => {
    expect(periodToQuarter('2026-06-27')).toEqual({ year: 2026, quarter: 2 })
    expect(periodToQuarter('2025-12-27')).toEqual({ year: 2025, quarter: 4 })
    expect(periodToQuarter('2026-01-02')).toEqual({ year: 2025, quarter: 4 })
  })
})

describe('getUsFundamentals', () => {
  it('normalises Finnhub data oldest → newest', async () => {
    const data = await getUsFundamentals('AAPL', { now: NOW })
    expect(data.singles.map((s) => [s.year, s.quarter, s.eps])).toEqual([
      [2025, 4, 2.8424],
      [2026, 1, 2.0086],
      [2026, 2, 2.0244],
    ])
    expect(data.peSeries).toEqual([
      { label: '2026-03-28', pe: 29.5 },
      { label: '2026-06-27', pe: 32.1 },
    ])
    expect(data.upcoming.map((u) => u.date)).toEqual(['2026-10-29', '2027-01-27'])
    expect(data.surprises[0]).toMatchObject({ year: 2026, quarter: 2, actual: 1.91, surprisePercent: -0.8873 })
    expect(requestFinnhub).toHaveBeenCalledWith('/calendar/earnings', { symbol: 'AAPL', from: '2026-10-05', to: '2028-01-05' })
  })

  it('serves from cache within the TTL and refetches after it', async () => {
    await getUsFundamentals('AAPL', { now: NOW })
    await getUsFundamentals('AAPL', { now: NOW + US_CACHE_TTL_MS - 1 })
    expect(requestFinnhub).toHaveBeenCalledTimes(3)
    await getUsFundamentals('AAPL', { now: NOW + US_CACHE_TTL_MS + 1 })
    expect(requestFinnhub).toHaveBeenCalledTimes(6)
  })

  it('still works when localStorage throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    const data = await getUsFundamentals('AAPL', { now: NOW })
    expect(data.singles).toHaveLength(3)
  })

  it('treats a corrupted cache entry as a miss', async () => {
    window.localStorage.setItem('my-stock:fundamentals:US:AAPL', '{not json')
    const data = await getUsFundamentals('AAPL', { now: NOW })
    expect(data.singles).toHaveLength(3)
  })

  it('propagates Finnhub errors', async () => {
    requestFinnhub.mockRejectedValue(new Error('Finnhub API error: 401 (invalid API key).'))
    await expect(getUsFundamentals('AAPL', { now: NOW })).rejects.toThrow('401')
  })
})
```

`src/services/fundamentalsProviders/twFundamentalsProvider.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getTwFundamentals, resetTwFundamentalsCache } from './twFundamentalsProvider'

const epsFile = {
  basis: 'cumulative',
  updatedAt: '2026-10-05T12:03:11Z',
  companies: { 2330: { name: '台積電', quarters: { '2026Q2': { eps: 49.33 } } } },
}
const peFile = {
  updatedAt: '2026-10-01T12:02:40Z',
  companies: { 2330: [['2026-09', 28.1], ['2026-08', 27.4], ['2026-07', null]] },
}

const mockFetch = (status = 200) =>
  vi.fn(async (url) => ({
    ok: status === 200,
    status,
    json: async () => (String(url).includes('tw_eps_history') ? epsFile : peFile),
  }))

beforeEach(() => {
  resetTwFundamentalsCache()
})

describe('getTwFundamentals', () => {
  it('reads both snapshot files once and returns the company, P/E oldest first', async () => {
    globalThis.fetch = mockFetch()
    const data = await getTwFundamentals('2330')
    expect(data).toEqual({
      name: '台積電',
      cumulative: { '2026Q2': { eps: 49.33 } },
      peSeries: [
        { label: '2026-07', pe: null },
        { label: '2026-08', pe: 27.4 },
        { label: '2026-09', pe: 28.1 },
      ],
      epsUpdatedAt: '2026-10-05T12:03:11Z',
      peUpdatedAt: '2026-10-01T12:02:40Z',
    })
    await getTwFundamentals('2330')
    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
    expect(globalThis.fetch.mock.calls[0][0]).toMatch(/data\/tw_eps_history\.json$/)
  })

  it('returns null for a code that is not in the snapshot (e.g. 上櫃)', async () => {
    globalThis.fetch = mockFetch()
    expect(await getTwFundamentals('6488')).toBeNull()
  })

  it('throws a readable error and retries on the next call after a failure', async () => {
    globalThis.fetch = mockFetch(404)
    await expect(getTwFundamentals('2330')).rejects.toThrow('無法載入台股財報資料')
    globalThis.fetch = mockFetch()
    expect(await getTwFundamentals('2330')).not.toBeNull()
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/services/fundamentalsProviders`
Expected: FAIL（模組不存在）

- [ ] **Step 4: Write `finnhubFundamentalsProvider.js`**

```js
import { requestFinnhub } from '../priceProviders/finnhubProvider'

const CACHE_PREFIX = 'my-stock:fundamentals:US:'
export const US_CACHE_TTL_MS = 24 * 60 * 60 * 1000
const PE_POINTS = 20

const readCache = (symbol, now) => {
  try {
    const raw = window.localStorage.getItem(CACHE_PREFIX + symbol)
    if (!raw) return null
    const cached = JSON.parse(raw)
    return now - cached.fetchedAt < US_CACHE_TTL_MS ? cached : null
  } catch {
    return null
  }
}

const writeCache = (symbol, data) => {
  try {
    window.localStorage.setItem(CACHE_PREFIX + symbol, JSON.stringify(data))
  } catch {
    // Private mode / quota: skip caching, the data is still returned.
  }
}

// Fiscal period ends drift around quarter boundaries (2026-01-02 closes Q4);
// shifting back 15 days files each period under the quarter it mostly covers.
export const periodToQuarter = (period) => {
  const date = new Date(`${period}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() - 15)
  return { year: date.getUTCFullYear(), quarter: Math.floor(date.getUTCMonth() / 3) + 1 }
}

const isoDate = (ms) => new Date(ms).toISOString().slice(0, 10)

const addMonths = (iso, months) => {
  const date = new Date(`${iso}T00:00:00Z`)
  date.setUTCMonth(date.getUTCMonth() + months)
  return isoDate(date.getTime())
}

const byPeriodAsc = (a, b) => (a.period < b.period ? -1 : 1)

export const getUsFundamentals = async (symbol, { now = Date.now() } = {}) => {
  const cached = readCache(symbol, now)
  if (cached) return cached

  const today = isoDate(now)
  const [metric, earnings, calendar] = await Promise.all([
    requestFinnhub('/stock/metric', { symbol, metric: 'all' }),
    requestFinnhub('/stock/earnings', { symbol }),
    requestFinnhub('/calendar/earnings', { symbol, from: today, to: addMonths(today, 15) }),
  ])

  const quarterly = metric?.series?.quarterly ?? {}
  const singles = (quarterly.eps ?? [])
    .filter((point) => point?.period && Number.isFinite(point.v))
    .map((point) => ({ ...periodToQuarter(point.period), period: point.period, eps: point.v }))
    .sort(byPeriodAsc)
  // Finnhub series are newest first.
  const peSeries = (quarterly.peTTM ?? [])
    .slice(0, PE_POINTS)
    .map((point) => ({ label: point.period, pe: Number.isFinite(point.v) ? point.v : null }))
    .reverse()
  const surprises = (Array.isArray(earnings) ? earnings : [])
    .filter((item) => item?.period)
    .map((item) => ({
      ...periodToQuarter(item.period),
      period: item.period,
      actual: Number.isFinite(item.actual) ? item.actual : null,
      estimate: Number.isFinite(item.estimate) ? item.estimate : null,
      surprisePercent: Number.isFinite(item.surprisePercent) ? item.surprisePercent : null,
    }))
    .sort(byPeriodAsc)
  const upcoming = (calendar?.earningsCalendar ?? [])
    .filter((item) => item?.date && item.date >= today && item.epsActual == null)
    .map((item) => ({
      date: item.date,
      hour: item.hour || '',
      epsEstimate: Number.isFinite(item.epsEstimate) ? item.epsEstimate : null,
    }))
    .sort((a, b) => (a.date < b.date ? -1 : 1))

  const data = { fetchedAt: now, singles, peSeries, surprises, upcoming }
  writeCache(symbol, data)
  return data
}
```

- [ ] **Step 5: Write `twFundamentalsProvider.js`**

```js
// Reads the same-origin snapshots built by .github/workflows/update-tw-fundamentals.yml.
const EPS_URL = `${import.meta.env.BASE_URL}data/tw_eps_history.json`
const PE_URL = `${import.meta.env.BASE_URL}data/tw_pe_history.json`
const PE_POINTS = 60

let filesPromise = null

const fetchJson = async (url) => {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`無法載入台股財報資料（HTTP ${response.status}）`)
  return response.json()
}

const loadFiles = () => {
  if (!filesPromise) {
    filesPromise = Promise.all([fetchJson(EPS_URL), fetchJson(PE_URL)]).catch((error) => {
      filesPromise = null
      throw error
    })
  }
  return filesPromise
}

export const resetTwFundamentalsCache = () => {
  filesPromise = null
}

// null = the code is not in the snapshot (上櫃, newly listed, ETF …).
export const getTwFundamentals = async (symbol) => {
  const [eps, pe] = await loadFiles()
  const company = eps?.companies?.[symbol]
  if (!company) return null
  const peSeries = (pe?.companies?.[symbol] ?? [])
    .slice(0, PE_POINTS)
    .map(([label, value]) => ({ label, pe: value }))
    .reverse()
  return {
    name: company.name,
    cumulative: company.quarters ?? {},
    peSeries,
    epsUpdatedAt: eps.updatedAt ?? null,
    peUpdatedAt: pe.updatedAt ?? null,
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/services/fundamentalsProviders src/services/priceProviders`
Expected: PASS（含既有的 `finnhubProvider.test.js`）

- [ ] **Step 7: Add PWA runtime caching**

在 `vite.config.js` 的 `runtimeCaching` 陣列中，既有 `twse-api-cache` 那筆之後加上：

```js
          {
            // TW fundamentals snapshots (public/data/tw_*.json): fresh when
            // online, last copy when offline. Not precached (globPatterns
            // excludes json).
            urlPattern: /\/data\/tw_(eps|pe)_history\.json$/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'tw-fundamentals',
              networkTimeoutSeconds: 8,
              expiration: {
                maxEntries: 4,
                maxAgeSeconds: 60 * 60 * 24 * 14,
              },
            },
          },
```

- [ ] **Step 8: Lint, build and commit**

```bash
npx eslint src/services/fundamentalsProviders src/services/priceProviders/finnhubProvider.js vite.config.js
npm run build
git add src/services/fundamentalsProviders src/services/priceProviders/finnhubProvider.js vite.config.js
git commit -m "feat(fundamentals): Finnhub and TW snapshot providers" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

Expected：build 成功，且 `dist/data/tw_eps_history.json` 存在（`public/` 會被複製進 `dist/`）。

---

### Task 7: `loadStockFundamentals` 正規化與 `useStockFundamentals` hook

**Files:**
- Create: `src/services/fundamentalsProviders/index.js`
- Create: `src/hooks/useStockFundamentals.js`
- Test: `src/services/fundamentalsProviders/index.test.js`
- Test: `src/hooks/useStockFundamentals.test.jsx`

**Interfaces:**
- Consumes: Task 6 的 `getUsFundamentals`、`getTwFundamentals`；Task 4/5 的 `cumulativeToSingles`、`nextTwFilingDeadline`。
- Produces:
  - `loadStockFundamentals(market, symbol, {todayIso}): Promise<fundamentals|null>`（形狀見 Task 5 Interfaces；`null` = 不支援）
  - `useStockFundamentals(market|null, symbol|null): {status: 'idle'|'loading'|'ready'|'unsupported'|'error', data?, error?, reload()}`

- [ ] **Step 1: Write the failing tests**

`src/services/fundamentalsProviders/index.test.js`:

```js
import { describe, it, expect, vi } from 'vitest'

vi.mock('./finnhubFundamentalsProvider', () => ({ getUsFundamentals: vi.fn() }))
vi.mock('./twFundamentalsProvider', () => ({ getTwFundamentals: vi.fn() }))

import { getUsFundamentals } from './finnhubFundamentalsProvider'
import { getTwFundamentals } from './twFundamentalsProvider'
import { loadStockFundamentals } from './index'

describe('loadStockFundamentals', () => {
  it('normalises TW data and uses the statutory deadline as next earnings', async () => {
    getTwFundamentals.mockResolvedValue({
      name: '台積電',
      cumulative: { '2026Q1': { eps: 16 }, '2026Q2': { eps: 35.17 } },
      peSeries: [{ label: '2026-09', pe: 28.1 }],
      epsUpdatedAt: '2026-10-05T12:03:11Z',
      peUpdatedAt: '2026-10-01T12:02:40Z',
    })
    const data = await loadStockFundamentals('TW', '2330', { todayIso: '2026-10-05' })
    expect(data.market).toBe('TW')
    expect(data.singles.map((s) => s.eps)).toEqual([16, 19.17])
    expect(data.nextEarnings).toEqual({ date: '2026-11-14', label: 'Q3 財報法定截止日' })
    expect(data.updatedAt).toBe('2026-10-05T12:03:11Z')
    expect(data.surprises).toEqual([])
  })

  it('returns null for a TW code missing from the snapshot', async () => {
    getTwFundamentals.mockResolvedValue(null)
    expect(await loadStockFundamentals('TW', '6488', { todayIso: '2026-10-05' })).toBeNull()
  })

  it('normalises US data with the next earnings date and session', async () => {
    getUsFundamentals.mockResolvedValue({
      fetchedAt: Date.parse('2026-10-05T12:00:00Z'),
      singles: [{ year: 2026, quarter: 2, period: '2026-06-27', eps: 2.02 }],
      peSeries: [],
      surprises: [],
      upcoming: [{ date: '2026-10-29', hour: 'amc', epsEstimate: 2.02 }],
    })
    const data = await loadStockFundamentals('US', 'AAPL', { todayIso: '2026-10-05' })
    expect(data.cumulative).toBeNull()
    expect(data.nextEarnings).toEqual({ date: '2026-10-29', label: '財報公布（盤後）' })
    expect(data.updatedAt).toBe('2026-10-05T12:00:00.000Z')
  })
})
```

`src/hooks/useStockFundamentals.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'

vi.mock('../services/fundamentalsProviders', () => ({ loadStockFundamentals: vi.fn() }))

import { loadStockFundamentals } from '../services/fundamentalsProviders'
import useStockFundamentals from './useStockFundamentals'

beforeEach(() => {
  loadStockFundamentals.mockReset()
})

describe('useStockFundamentals', () => {
  it('is idle without a symbol', () => {
    const { result } = renderHook(() => useStockFundamentals(null, null))
    expect(result.current.status).toBe('idle')
    expect(loadStockFundamentals).not.toHaveBeenCalled()
  })

  it('goes loading → ready', async () => {
    loadStockFundamentals.mockResolvedValue({ market: 'US' })
    const { result } = renderHook(() => useStockFundamentals('US', 'AAPL'))
    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.data).toEqual({ market: 'US' })
  })

  it('reports unsupported for null data', async () => {
    loadStockFundamentals.mockResolvedValue(null)
    const { result } = renderHook(() => useStockFundamentals('TW', '6488'))
    await waitFor(() => expect(result.current.status).toBe('unsupported'))
  })

  it('reports errors and retries on reload', async () => {
    loadStockFundamentals.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({ market: 'US' })
    const { result } = renderHook(() => useStockFundamentals('US', 'AAPL'))
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.error.message).toBe('boom')
    act(() => result.current.reload())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(loadStockFundamentals).toHaveBeenCalledTimes(2)
  })

  it('ignores a stale response after the symbol changes', async () => {
    let resolveFirst
    loadStockFundamentals
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve }))
      .mockResolvedValueOnce({ market: 'US', symbol: 'MSFT' })
    const { result, rerender } = renderHook(({ symbol }) => useStockFundamentals('US', symbol), {
      initialProps: { symbol: 'AAPL' },
    })
    rerender({ symbol: 'MSFT' })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    resolveFirst({ market: 'US', symbol: 'AAPL' })
    await Promise.resolve()
    expect(result.current.data.symbol).toBe('MSFT')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/services/fundamentalsProviders/index.test.js src/hooks/useStockFundamentals.test.jsx`
Expected: FAIL（模組不存在）

- [ ] **Step 3: Write `src/services/fundamentalsProviders/index.js`**

```js
import { cumulativeToSingles, nextTwFilingDeadline } from '../../utils/valuation'
import { getUsFundamentals } from './finnhubFundamentalsProvider'
import { getTwFundamentals } from './twFundamentalsProvider'

const SESSION_LABELS = { bmo: '盤前', amc: '盤後' }

// Both markets → one `fundamentals` shape for buildValuationModel and the
// detail sheet. null = no data for this stock (unsupported).
export const loadStockFundamentals = async (market, symbol, { todayIso }) => {
  if (market === 'TW') {
    const raw = await getTwFundamentals(symbol)
    if (!raw) return null
    const deadline = nextTwFilingDeadline(todayIso)
    return {
      market,
      singles: cumulativeToSingles(raw.cumulative),
      cumulative: raw.cumulative,
      surprises: [],
      upcoming: [],
      peSeries: raw.peSeries,
      nextEarnings: deadline ? { date: deadline.date, label: `${deadline.label}法定截止日` } : null,
      updatedAt: raw.epsUpdatedAt,
    }
  }
  const raw = await getUsFundamentals(symbol)
  const next = raw.upcoming[0]
  const session = SESSION_LABELS[next?.hour]
  return {
    market,
    singles: raw.singles,
    cumulative: null,
    surprises: raw.surprises,
    upcoming: raw.upcoming,
    peSeries: raw.peSeries,
    nextEarnings: next ? { date: next.date, label: session ? `財報公布（${session}）` : '財報公布' } : null,
    updatedAt: new Date(raw.fetchedAt).toISOString(),
  }
}
```

- [ ] **Step 4: Write `src/hooks/useStockFundamentals.js`**

```js
import { useCallback, useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { loadStockFundamentals } from '../services/fundamentalsProviders'

// Results are tagged with the request key, so a response for a previous
// symbol (or attempt) is never shown and no state is set synchronously in
// the effect.
export default function useStockFundamentals(market, symbol) {
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState({ key: null })
  const key = market && symbol ? `${market}:${symbol}:${attempt}` : null

  useEffect(() => {
    if (!key) return undefined
    let cancelled = false
    loadStockFundamentals(market, symbol, { todayIso: dayjs().format('YYYY-MM-DD') })
      .then((data) => {
        if (!cancelled) setResult({ key, status: data ? 'ready' : 'unsupported', data })
      })
      .catch((error) => {
        if (!cancelled) setResult({ key, status: 'error', error })
      })
    return () => {
      cancelled = true
    }
  }, [key, market, symbol])

  const reload = useCallback(() => setAttempt((value) => value + 1), [])

  if (!key) return { status: 'idle', reload }
  if (result.key !== key) return { status: 'loading', reload }
  return { status: result.status, data: result.data, error: result.error, reload }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/services/fundamentalsProviders src/hooks/useStockFundamentals.test.jsx`
Expected: PASS

- [ ] **Step 6: Lint and commit**

```bash
npx eslint src/services/fundamentalsProviders src/hooks/useStockFundamentals.js src/hooks/useStockFundamentals.test.jsx
git add src/services/fundamentalsProviders/index.js src/services/fundamentalsProviders/index.test.js src/hooks/useStockFundamentals.js src/hooks/useStockFundamentals.test.jsx
git commit -m "feat(fundamentals): normalised loader and useStockFundamentals hook" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: 估價覆寫值的儲存與同步（`app_config`）

> **與 spec 的差異（需在本 task 一併更新 spec）**：spec 寫的是新開 `valuationSettings` 表。實作改用既有的 `app_config` 表（primary key 為字串 `key`，已完整接好 sync / realtime / 匯出），以 `key = valuation:<market>_<symbol>`、欄位 `valuation: {...}` 存放。效果相同（以股票為 key、跨裝置同步、寫入需登入），但不必在 `database.js`、`cloudSyncService.js` 的 6 處 collection 分支各加一份。`firestore.rules` 的 `users/{userId}/{document=**}` 已涵蓋，不需修改。

**Files:**
- Modify: `src/services/firebase/firestoreMappers.js:197-210`（`appConfigToRemote`）與 `:380-392`（`remoteToAppConfig`）
- Modify: `src/services/portfolioService.js`（在 `removeIncomeOverride` 之後新增兩個 export）
- Create: `src/hooks/useValuationSettings.js`
- Test: `src/services/portfolioService.valuation.test.js`
- Test: `src/services/firebase/firestoreMappers.test.js`（append）
- Modify: `docs/superpowers/specs/2026-10-05-stock-valuation-design.md`（「覆寫值同步」一節）

**Interfaces:**
- Consumes: Task 4 的 `VALUATION_SETTING_FIELDS`、`EMPTY_VALUATION_SETTINGS`。
- Produces:
  - `getValuationSettings({market, symbol}): Promise<{peCheap, peFair, peExpensive, growthRate, forwardEps}>`（缺值為 `null`）
  - `saveValuationSettings({market, symbol, patch}): Promise<settings>`（`patch` 的值為 `null` = 重設該欄）
  - `useValuationSettings(market|null, symbol|null): {settings, save(patch): Promise<settings>}`

- [ ] **Step 1: Write the failing tests**

Append to `src/services/firebase/firestoreMappers.test.js`（同時把 `appConfigToRemote`、`remoteToAppConfig` 加進檔案頂端的 import）:

```js
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
```

`src/services/portfolioService.valuation.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('./firebase/cloudSyncService', async (importOriginal) => ({
  ...(await importOriginal()),
  assertCloudWriteReady: vi.fn(),
  writeCollectionRecord: vi.fn(),
}))

import { db } from '../db/database'
import { assertCloudWriteReady, writeCollectionRecord } from './firebase/cloudSyncService'
import { getValuationSettings, saveValuationSettings } from './portfolioService'

beforeEach(async () => {
  await db.app_config.clear()
  assertCloudWriteReady.mockReset()
  writeCollectionRecord.mockReset()
})

describe('valuation settings', () => {
  it('returns all-null settings when nothing is stored', async () => {
    expect(await getValuationSettings({ market: 'TW', symbol: '2330' })).toEqual({
      peCheap: null,
      peFair: null,
      peExpensive: null,
      growthRate: null,
      forwardEps: null,
    })
  })

  it('merges a patch, mirrors it to the cloud and reads it back', async () => {
    await saveValuationSettings({ market: 'TW', symbol: '2330', patch: { peFair: 18 } })
    await saveValuationSettings({ market: 'TW', symbol: '2330', patch: { growthRate: '0.15' } })
    expect(writeCollectionRecord).toHaveBeenCalledTimes(2)
    expect(writeCollectionRecord.mock.calls[1][0]).toMatchObject({
      collectionName: 'app_config',
      record: { key: 'valuation:TW_2330', valuation: { peFair: 18, growthRate: 0.15 } },
    })
    expect(await getValuationSettings({ market: 'TW', symbol: '2330' })).toMatchObject({ peFair: 18, growthRate: 0.15 })
  })

  it('resets a field with null and keeps settings per stock', async () => {
    await saveValuationSettings({ market: 'TW', symbol: '2330', patch: { peFair: 18, peCheap: 12 } })
    await saveValuationSettings({ market: 'TW', symbol: '2330', patch: { peFair: null } })
    expect(await getValuationSettings({ market: 'TW', symbol: '2330' })).toMatchObject({ peFair: null, peCheap: 12 })
    expect(await getValuationSettings({ market: 'US', symbol: '2330' })).toMatchObject({ peCheap: null })
  })

  it('rejects invalid values and unknown fields', async () => {
    await expect(saveValuationSettings({ market: 'TW', symbol: '2330', patch: { peFair: 0 } })).rejects.toThrow('本益比必須大於 0')
    await expect(saveValuationSettings({ market: 'TW', symbol: '2330', patch: { growthRate: -1 } })).rejects.toThrow('成長率')
    await expect(saveValuationSettings({ market: 'TW', symbol: '2330', patch: { forwardEps: 'abc' } })).rejects.toThrow('數字')
    await expect(saveValuationSettings({ market: 'TW', symbol: '2330', patch: { foo: 1 } })).rejects.toThrow('foo')
    expect(writeCollectionRecord).not.toHaveBeenCalled()
  })

  it('refuses to write when the cloud is not writable (not signed in)', async () => {
    assertCloudWriteReady.mockImplementation(() => {
      throw new Error('請先登入')
    })
    await expect(saveValuationSettings({ market: 'TW', symbol: '2330', patch: { peFair: 18 } })).rejects.toThrow('請先登入')
    expect(writeCollectionRecord).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/services/portfolioService.valuation.test.js src/services/firebase/firestoreMappers.test.js`
Expected: FAIL（`getValuationSettings is not a function`；mapper 測試 `valuation` 為 undefined）

- [ ] **Step 3: Update the mappers**

`appConfigToRemote`：在 `monthOverrides: …,` 之後加入

```js
  ...(config.valuation && typeof config.valuation === 'object'
    ? { valuation: config.valuation }
    : {}),
```

`remoteToAppConfig`：在 `monthOverrides: …,` 之後加入

```js
  valuation:
    data.valuation && typeof data.valuation === 'object' ? data.valuation : undefined,
```

- [ ] **Step 4: Add the service functions**

在 `src/services/portfolioService.js` 頂端 import 區加入：

```js
import {
  EMPTY_VALUATION_SETTINGS,
  VALUATION_SETTING_FIELDS,
} from "../utils/valuation";
```

在 `removeIncomeOverride` 之後加入：

```js
// Per-stock overrides for the detail sheet's valuation, shared by every
// holder of the same stock. Stored in app_config so they sync like the
// other settings.
const valuationConfigKey = (market, symbol) => `valuation:${market}_${symbol}`;

const normalizeValuationValue = (field, value) => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`${field} 必須是數字`);
  }
  if (field.startsWith("pe") && number <= 0) {
    throw new Error("本益比必須大於 0");
  }
  if (field === "growthRate" && number <= -1) {
    throw new Error("成長率必須大於 -100%");
  }
  return number;
};

export const getValuationSettings = async ({ market, symbol }) => {
  const config = await db.app_config.get(valuationConfigKey(market, symbol));
  const stored = config && !config.deletedAt ? config.valuation ?? {} : {};
  return Object.fromEntries(
    VALUATION_SETTING_FIELDS.map((field) => [
      field,
      Number.isFinite(stored[field]) ? stored[field] : EMPTY_VALUATION_SETTINGS[field],
    ]),
  );
};

export const saveValuationSettings = async ({ market, symbol, patch }) => {
  ensureCloudWritable();
  if (!market || !symbol) {
    throw new Error("Missing market / symbol");
  }
  const next = await getValuationSettings({ market, symbol });
  for (const [field, value] of Object.entries(patch ?? {})) {
    if (!VALUATION_SETTING_FIELDS.includes(field)) {
      throw new Error(`Unknown valuation field: ${field}`);
    }
    next[field] = normalizeValuationValue(field, value);
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

- [ ] **Step 5: Write `src/hooks/useValuationSettings.js`**

```js
import { useCallback, useEffect, useState } from 'react'
import { CLOUD_SYNC_UPDATED_EVENT } from '../services/firebase/cloudSyncService'
import { getValuationSettings, saveValuationSettings } from '../services/portfolioService'
import { EMPTY_VALUATION_SETTINGS } from '../utils/valuation'

// Reloads on cloud sync so an override saved on another device shows up.
export default function useValuationSettings(market, symbol) {
  const key = market && symbol ? `${market}_${symbol}` : null
  const [state, setState] = useState({ key: null, settings: EMPTY_VALUATION_SETTINGS })

  useEffect(() => {
    if (!key) return undefined
    let cancelled = false
    const load = () => {
      getValuationSettings({ market, symbol }).then((settings) => {
        if (!cancelled) setState({ key, settings })
      })
    }
    load()
    window.addEventListener(CLOUD_SYNC_UPDATED_EVENT, load)
    return () => {
      cancelled = true
      window.removeEventListener(CLOUD_SYNC_UPDATED_EVENT, load)
    }
  }, [key, market, symbol])

  const save = useCallback(
    async (patch) => {
      const settings = await saveValuationSettings({ market, symbol, patch })
      setState({ key, settings })
      return settings
    },
    [key, market, symbol],
  )

  return { settings: state.key === key ? state.settings : EMPTY_VALUATION_SETTINGS, save }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/services`
Expected: PASS（含既有 service / mapper / cloudSync 測試）

- [ ] **Step 7: Update the spec**

把 spec 中「## 覆寫值同步：`valuationSettings`」整節（含表格與「需要同步修改」清單）替換為：

```markdown
## 覆寫值同步（存於 `app_config`）

覆寫值存在既有的 `app_config` 表（primary key 為字串），doc key 為 `valuation:<market>_<symbol>`，欄位：

| 欄位 | 型別 | 說明 |
|---|---|---|
| `valuation.peCheap` / `peFair` / `peExpensive` | number \| null | null = 用自動值；必須 > 0 |
| `valuation.growthRate` | number \| null | 小數（0.2 = 20%），> −1，僅台股 |
| `valuation.forwardEps` | number \| null | 直接指定預估 EPS |

- 實作時改用 `app_config` 而非新表：sync、realtime listener、清除與匯出已完整支援，效果相同（以股票為 key、跨裝置同步、寫入需登入）。
- `firestoreMappers.js` 的 `appConfigToRemote` / `remoteToAppConfig` 多帶 `valuation` 欄位。
- `portfolioService.js`：`getValuationSettings({ market, symbol })`、`saveValuationSettings({ market, symbol, patch })`（patch 值為 null 即重設）。
- `firestore.rules` 的 `users/{userId}/{document=**}` 已涵蓋，不需修改。
```

- [ ] **Step 8: Lint and commit**

```bash
npx eslint src/services/portfolioService.js src/services/portfolioService.valuation.test.js src/services/firebase/firestoreMappers.js src/services/firebase/firestoreMappers.test.js src/hooks/useValuationSettings.js
git add src/services/portfolioService.js src/services/portfolioService.valuation.test.js src/services/firebase/firestoreMappers.js src/services/firebase/firestoreMappers.test.js src/hooks/useValuationSettings.js docs/superpowers/specs/2026-10-05-stock-valuation-design.md
git commit -m "feat(valuation): per-stock valuation overrides synced via app_config" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: 估價結論卡與估價假設元件

**Files:**
- Create: `src/components/stockDetail/ValuationCard.jsx`
- Create: `src/components/stockDetail/ValuationAssumptions.jsx`
- Create: `src/utils/stockDetail.js`
- Test: `src/components/stockDetail/ValuationCard.test.jsx`
- Test: `src/components/stockDetail/ValuationAssumptions.test.jsx`
- Test: `src/utils/stockDetail.test.js`
- Modify: `src/App.css`（append 樣式）

**Interfaces:**
- Consumes: Task 4/5 的 `buildValuationModel` 輸出（`model`）、`positionOnScale`、`ZONE_LABELS`；Task 8 的 settings 形狀。
- Produces:
  - `<ValuationCard model basis onBasisChange market currency />`
  - `<ValuationAssumptions model market settings disabled open onToggle onSave />`（`onSave(patch) => Promise`）
  - `formatSignedPercent(value): string`（`src/utils/stockDetail.js`）
  - `buildStockDetailHolding(rows, id): (row & {totalShares, totalValueTwd})|null`（Task 11 使用）
  - `isInteractiveTarget(target: Element|null): boolean`（Task 11 使用）

- [ ] **Step 1: Write the failing tests**

`src/utils/stockDetail.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { buildStockDetailHolding, formatSignedPercent, isInteractiveTarget } from './stockDetail'

describe('formatSignedPercent', () => {
  it('formats with sign and one decimal', () => {
    expect(formatSignedPercent(-0.0423)).toBe('−4.2%')
    expect(formatSignedPercent(0.1)).toBe('+10.0%')
    expect(formatSignedPercent(null)).toBe('--')
  })
})

describe('buildStockDetailHolding', () => {
  const rows = [
    { id: 1, market: 'TW', symbol: '2330', holder: 'Po', shares: 1000, latestValueTwd: 1085000 },
    { id: 2, market: 'TW', symbol: '2330', holder: 'Mia', shares: 500, latestValueTwd: 542500 },
    { id: 3, market: 'US', symbol: '2330', holder: 'Po', shares: 1, latestValueTwd: 100 },
  ]

  it('sums shares and value across holders of the same stock', () => {
    expect(buildStockDetailHolding(rows, 2)).toMatchObject({ id: 2, totalShares: 1500, totalValueTwd: 1627500 })
  })

  it('returns null for an unknown id', () => {
    expect(buildStockDetailHolding(rows, 99)).toBeNull()
  })

  it('leaves the total value undefined when no row has a price', () => {
    expect(buildStockDetailHolding([{ id: 1, market: 'TW', symbol: '1101', shares: 10 }], 1).totalValueTwd).toBeUndefined()
  })
})

describe('isInteractiveTarget', () => {
  it('detects buttons, inputs and selects inside a row', () => {
    document.body.innerHTML = `
      <table><tr><td id="cell">x</td><td><button id="btn"><span id="icon">i</span></button></td>
      <td><div class="ant-select"><span id="sel">s</span></div></td><td><input id="in" /></td></tr></table>`
    expect(isInteractiveTarget(document.getElementById('cell'))).toBe(false)
    expect(isInteractiveTarget(document.getElementById('icon'))).toBe(true)
    expect(isInteractiveTarget(document.getElementById('sel'))).toBe(true)
    expect(isInteractiveTarget(document.getElementById('in'))).toBe(true)
    expect(isInteractiveTarget(null)).toBe(false)
  })
})
```

`src/components/stockDetail/ValuationCard.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import ValuationCard from './ValuationCard'

const okModel = {
  valuation: {
    status: 'ok',
    prices: { cheap: 120, fair: 150, expensive: 180 },
    zone: 'fair-low',
    distanceToFair: -0.0667,
    scale: { min: 108, max: 198 },
    price: 140,
  },
}

describe('ValuationCard', () => {
  it('shows the three prices and the verdict', () => {
    render(<ValuationCard model={okModel} basis="ttm" onBasisChange={() => {}} market="TW" currency="TWD" />)
    expect(screen.getByText('便宜價')).toBeInTheDocument()
    expect(screen.getByText('$120')).toBeInTheDocument()
    expect(screen.getByText('$150')).toBeInTheDocument()
    expect(screen.getByText('$180')).toBeInTheDocument()
    expect(screen.getByText('目前合理偏低，距合理價 −6.7%')).toBeInTheDocument()
    expect(screen.getByLabelText('現價 $140')).toBeInTheDocument()
  })

  it('labels the forward tab per market and reports basis changes', () => {
    const onBasisChange = vi.fn()
    const { rerender } = render(
      <ValuationCard model={okModel} basis="ttm" onBasisChange={onBasisChange} market="TW" currency="TWD" />,
    )
    fireEvent.click(screen.getByText('今年預估'))
    expect(onBasisChange).toHaveBeenCalledWith('forward')
    rerender(<ValuationCard model={okModel} basis="ttm" onBasisChange={onBasisChange} market="US" currency="USD" />)
    expect(screen.getByText('未來四季預估')).toBeInTheDocument()
  })

  it.each([
    ['loss', '虧損中，無法用本益比估價'],
    ['no-eps', '資料不足，無法計算'],
    ['missing-pe', '歷史本益比不足，請在估價假設填入本益比'],
    ['invalid-pe', '本益比需符合 便宜 ≤ 合理 ≤ 昂貴'],
  ])('explains status %s', (status, text) => {
    render(<ValuationCard model={{ valuation: { status } }} basis="ttm" onBasisChange={() => {}} market="TW" currency="TWD" />)
    expect(screen.getByText(text)).toBeInTheDocument()
  })

  it('hides the verdict and marker without a price', () => {
    const noPrice = { valuation: { ...okModel.valuation, zone: null, distanceToFair: null, price: null } }
    render(<ValuationCard model={noPrice} basis="ttm" onBasisChange={() => {}} market="TW" currency="TWD" />)
    expect(screen.queryByText(/距合理價/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/現價/)).not.toBeInTheDocument()
  })
})
```

`src/components/stockDetail/ValuationAssumptions.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import ValuationAssumptions from './ValuationAssumptions'
import { EMPTY_VALUATION_SETTINGS } from '../../utils/valuation'

const model = {
  ttm: { eps: 72.11, formula: '近四季 2025 Q3–2026 Q2 合計 72.11' },
  forward: { eps: 79.5, growthRate: 0.2, autoGrowthRate: 0.2, formula: '今年 Q1–Q2 累計 35.17 + …' },
  autoBands: { cheap: 15, fair: 18, expensive: 22, sampleSize: 60 },
  bands: { cheap: 15, fair: 18, expensive: 22, overridden: { cheap: false, fair: false, expensive: false } },
}

const renderOpen = (props = {}) =>
  render(
    <ValuationAssumptions
      model={model}
      market="TW"
      settings={EMPTY_VALUATION_SETTINGS}
      disabled={false}
      open
      onToggle={() => {}}
      onSave={vi.fn().mockResolvedValue({})}
      {...props}
    />,
  )

describe('ValuationAssumptions', () => {
  it('shows both EPS formulas and where the default P/E comes from', () => {
    renderOpen()
    expect(screen.getByText('近四季 2025 Q3–2026 Q2 合計 72.11')).toBeInTheDocument()
    expect(screen.getByText('今年 Q1–Q2 累計 35.17 + …')).toBeInTheDocument()
    expect(screen.getByText('預設：近 60 期本益比的 P25 / P50 / P75')).toBeInTheDocument()
  })

  it('saves only the changed fields, converting growth % to a ratio', async () => {
    const onSave = vi.fn().mockResolvedValue({})
    renderOpen({ onSave })
    fireEvent.change(screen.getByLabelText('合理本益比'), { target: { value: '20' } })
    fireEvent.change(screen.getByLabelText('成長率 (%)'), { target: { value: '15' } })
    fireEvent.click(screen.getByRole('button', { name: '儲存' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ peFair: 20, growthRate: 0.15 }))
  })

  it('resets an overridden field', () => {
    const onSave = vi.fn().mockResolvedValue({})
    renderOpen({
      onSave,
      settings: { ...EMPTY_VALUATION_SETTINGS, peFair: 20 },
      model: { ...model, bands: { ...model.bands, fair: 20, overridden: { cheap: false, fair: true, expensive: false } } },
    })
    expect(screen.getByText('已覆寫')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '重設合理本益比' }))
    expect(onSave).toHaveBeenCalledWith({ peFair: null })
  })

  it('is read-only with a hint when writes are disabled', () => {
    renderOpen({ disabled: true })
    expect(screen.getByText('登入後可調整估價假設')).toBeInTheDocument()
    expect(screen.getByLabelText('合理本益比')).toBeDisabled()
  })

  it('warns about an extreme growth rate (TW only)', () => {
    renderOpen({ model: { ...model, forward: { ...model.forward, growthRate: 0.8 } } })
    expect(screen.getByText('成長率異常，建議覆寫')).toBeInTheDocument()
  })

  it('hides growth rate for US stocks', () => {
    renderOpen({ market: 'US' })
    expect(screen.queryByLabelText('成長率 (%)')).not.toBeInTheDocument()
    expect(screen.getByLabelText('預估 EPS')).toBeInTheDocument()
  })

  it('shows a save error inline', async () => {
    renderOpen({ onSave: vi.fn().mockRejectedValue(new Error('本益比必須大於 0')) })
    fireEvent.change(screen.getByLabelText('合理本益比'), { target: { value: '20' } })
    fireEvent.click(screen.getByRole('button', { name: '儲存' }))
    expect(await screen.findByText('本益比必須大於 0')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/utils/stockDetail.test.js src/components/stockDetail`
Expected: FAIL（模組不存在）

- [ ] **Step 3: Write `src/utils/stockDetail.js`**

```js
export const formatSignedPercent = (value) => {
  if (!Number.isFinite(value)) return '--'
  const sign = value >= 0 ? '+' : '−'
  return `${sign}${Math.abs(value * 100).toFixed(1)}%`
}

// The sheet shows one stock; the same stock may be held under several
// holders (separate holding rows), so shares and value are summed.
export const buildStockDetailHolding = (rows, id) => {
  const row = rows.find((item) => item.id === id)
  if (!row) return null
  const sameStock = rows.filter((item) => item.market === row.market && item.symbol === row.symbol)
  const values = sameStock.map((item) => item.latestValueTwd).filter(Number.isFinite)
  return {
    ...row,
    totalShares: sameStock.reduce((sum, item) => sum + (Number(item.shares) || 0), 0),
    totalValueTwd: values.length ? values.reduce((sum, value) => sum + value, 0) : undefined,
  }
}

const INTERACTIVE_SELECTOR = [
  'button',
  'a',
  'input',
  'textarea',
  'select',
  '[role="button"]',
  '[role="combobox"]',
  '.ant-select',
  '.ant-input-number',
  '.ant-popover',
].join(',')

// Desktop rows open the detail sheet on click, except clicks that land on
// the row's own controls (edit, delete, drag handle, inline editors).
export const isInteractiveTarget = (target) => Boolean(target?.closest?.(INTERACTIVE_SELECTOR))
```

- [ ] **Step 4: Write `src/components/stockDetail/ValuationCard.jsx`**

```jsx
import { Segmented, Typography } from "antd";
import { formatPrice } from "../../utils/formatters";
import { formatSignedPercent } from "../../utils/stockDetail";
import { positionOnScale, ZONE_LABELS } from "../../utils/valuation";

const { Text } = Typography;

const STATUS_MESSAGES = {
  "no-eps": "資料不足，無法計算",
  loss: "虧損中，無法用本益比估價",
  "missing-pe": "歷史本益比不足，請在估價假設填入本益比",
  "invalid-pe": "本益比需符合 便宜 ≤ 合理 ≤ 昂貴",
};

const PRICE_ITEMS = [
  { key: "cheap", label: "便宜價" },
  { key: "fair", label: "合理價" },
  { key: "expensive", label: "昂貴價" },
];

const percent = (value) => `${(value * 100).toFixed(2)}%`;

// Three bands on one axis: cheap (green) up to 便宜價, fair (grey) up to
// 昂貴價, expensive (red) beyond; ▼ marks the current price.
function PriceRuler({ valuation, currency }) {
  const { prices, scale, price } = valuation;
  const cheapAt = positionOnScale(prices.cheap, scale);
  const fairAt = positionOnScale(prices.fair, scale);
  const expensiveAt = positionOnScale(prices.expensive, scale);
  return (
    <div className="valuation-ruler">
      <div className="valuation-ruler-track">
        <span className="valuation-ruler-band valuation-ruler-band--cheap" style={{ width: percent(cheapAt) }} />
        <span
          className="valuation-ruler-band valuation-ruler-band--fair"
          style={{ left: percent(cheapAt), width: percent(expensiveAt - cheapAt) }}
        />
        <span
          className="valuation-ruler-band valuation-ruler-band--expensive"
          style={{ left: percent(expensiveAt), width: percent(1 - expensiveAt) }}
        />
        <span className="valuation-ruler-tick" style={{ left: percent(fairAt) }} />
      </div>
      {price !== null && (
        <span
          className="valuation-ruler-marker"
          style={{ left: percent(positionOnScale(price, scale)) }}
          aria-label={`現價 ${formatPrice(price, currency)}`}
        >
          ▼
        </span>
      )}
    </div>
  );
}

function ValuationCard({ model, basis, onBasisChange, market, currency }) {
  const { valuation } = model;
  return (
    <section className="stock-detail-section valuation-card" aria-label="估價">
      <Segmented
        block
        value={basis}
        onChange={onBasisChange}
        options={[
          { label: "近四季 TTM", value: "ttm" },
          { label: market === "US" ? "未來四季預估" : "今年預估", value: "forward" },
        ]}
      />
      {valuation.status !== "ok" ? (
        <Text type="secondary" className="valuation-card-message">
          {STATUS_MESSAGES[valuation.status]}
        </Text>
      ) : (
        <>
          <PriceRuler valuation={valuation} currency={currency} />
          <div className="valuation-card-prices">
            {PRICE_ITEMS.map(({ key, label }) => (
              <div key={key} className={`valuation-card-price valuation-card-price--${key}`}>
                <Text type="secondary">{label}</Text>
                <span className="valuation-card-price-value">
                  {formatPrice(valuation.prices[key], currency)}
                </span>
              </div>
            ))}
          </div>
          {valuation.zone && (
            <div className={`valuation-card-verdict valuation-card-verdict--${valuation.zone}`}>
              {`目前${ZONE_LABELS[valuation.zone]}，距合理價 ${formatSignedPercent(valuation.distanceToFair)}`}
            </div>
          )}
        </>
      )}
    </section>
  );
}

export default ValuationCard;
```

- [ ] **Step 5: Write `src/components/stockDetail/ValuationAssumptions.jsx`**

```jsx
import { useState } from "react";
import { Alert, Button, InputNumber, Tag, Typography } from "antd";
import { DownOutlined, RightOutlined } from "@ant-design/icons";
import Collapsible from "../Collapsible";

const { Text } = Typography;

const PE_FIELDS = [
  { field: "peCheap", band: "cheap", label: "便宜本益比" },
  { field: "peFair", band: "fair", label: "合理本益比" },
  { field: "peExpensive", band: "expensive", label: "昂貴本益比" },
];

const GROWTH_WARNING_THRESHOLD = 0.5;

const toDraft = (settings) => ({
  peCheap: settings.peCheap,
  peFair: settings.peFair,
  peExpensive: settings.peExpensive,
  growthPercent: Number.isFinite(settings.growthRate) ? Math.round(settings.growthRate * 1000) / 10 : null,
  forwardEps: settings.forwardEps,
});

const draftToSettings = (draft) => ({
  peCheap: draft.peCheap,
  peFair: draft.peFair,
  peExpensive: draft.peExpensive,
  growthRate: Number.isFinite(draft.growthPercent) ? draft.growthPercent / 100 : null,
  forwardEps: draft.forwardEps,
});

// Parent remounts this (key = settings) after a save or a synced change, so
// the draft always starts from the stored values.
function ValuationAssumptions({ model, market, settings, disabled, open, onToggle, onSave }) {
  const [draft, setDraft] = useState(() => toDraft(settings));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const nextSettings = draftToSettings(draft);
  const patch = Object.fromEntries(
    Object.entries(nextSettings).filter(([field, value]) => (value ?? null) !== (settings[field] ?? null)),
  );
  const hasChanges = Object.keys(patch).length > 0;

  const runSave = async (values) => {
    setSaving(true);
    setError(null);
    try {
      await onSave(values);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  const setField = (field) => (value) => setDraft((previous) => ({ ...previous, [field]: value ?? null }));

  const overrideTag = (field, label) =>
    settings[field] !== null && (
      <span className="valuation-assumption-override">
        <Tag color="processing">已覆寫</Tag>
        <Button
          type="link"
          size="small"
          disabled={disabled || saving}
          aria-label={`重設${label}`}
          onClick={() => runSave({ [field]: null })}
        >
          重設
        </Button>
      </span>
    );

  const growthRate = model.forward?.growthRate;
  const showGrowthWarning =
    market === "TW" && Number.isFinite(growthRate) && Math.abs(growthRate) > GROWTH_WARNING_THRESHOLD;

  return (
    <section className="stock-detail-section valuation-assumptions" aria-label="估價假設">
      <button type="button" className="valuation-assumptions-toggle" onClick={onToggle} aria-expanded={open}>
        {open ? <DownOutlined /> : <RightOutlined />}
        <span>估價假設</span>
      </button>
      <Collapsible open={open}>
        <div className="valuation-assumptions-body">
          <div className="valuation-assumptions-formulas">
            <Text type="secondary">近四季 TTM</Text>
            <Text>{model.ttm?.formula ?? "資料不足"}</Text>
            <Text type="secondary">{market === "US" ? "未來四季預估" : "今年預估"}</Text>
            <Text>{model.forward?.formula ?? "無預估資料"}</Text>
          </div>

          <Text type="secondary" className="valuation-assumptions-hint">
            {model.autoBands
              ? `預設：近 ${model.autoBands.sampleSize} 期本益比的 P25 / P50 / P75`
              : "歷史本益比資料不足，請自行填入"}
          </Text>

          {PE_FIELDS.map(({ field, band, label }) => (
            <div key={field} className="valuation-assumption-row">
              <span>{label}</span>
              <InputNumber
                aria-label={label}
                min={0}
                step={0.5}
                value={draft[field]}
                placeholder={model.autoBands?.[band] != null ? String(model.autoBands[band]) : "未設定"}
                disabled={disabled || saving}
                onChange={setField(field)}
              />
              {overrideTag(field, label)}
            </div>
          ))}

          {market === "TW" && (
            <div className="valuation-assumption-row">
              <span>成長率 (%)</span>
              <InputNumber
                aria-label="成長率 (%)"
                step={1}
                value={draft.growthPercent}
                placeholder={
                  Number.isFinite(model.forward?.autoGrowthRate)
                    ? (model.forward.autoGrowthRate * 100).toFixed(1)
                    : "0"
                }
                disabled={disabled || saving}
                onChange={setField("growthPercent")}
              />
              {overrideTag("growthRate", "成長率")}
            </div>
          )}

          <div className="valuation-assumption-row">
            <span>預估 EPS</span>
            <InputNumber
              aria-label="預估 EPS"
              step={0.1}
              value={draft.forwardEps}
              placeholder="自動"
              disabled={disabled || saving}
              onChange={setField("forwardEps")}
            />
            {overrideTag("forwardEps", "預估 EPS")}
          </div>

          {showGrowthWarning && <Alert type="warning" showIcon title="成長率異常，建議覆寫" />}
          {error && <Text type="danger">{error}</Text>}

          {disabled ? (
            <Text type="secondary">登入後可調整估價假設</Text>
          ) : (
            <Button type="primary" disabled={!hasChanges} loading={saving} onClick={() => runSave(patch)}>
              儲存
            </Button>
          )}
        </div>
      </Collapsible>
    </section>
  );
}

export default ValuationAssumptions;
```

- [ ] **Step 6: Append styles to `src/App.css`**

```css
/* ---- Stock detail sheet ---- */
.stock-detail-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 0;
  border-bottom: 1px solid var(--c-line);
}

.valuation-card-message {
  padding: 12px 0;
}

.valuation-ruler {
  position: relative;
  padding-top: 18px;
}

.valuation-ruler-track {
  position: relative;
  height: 10px;
  border-radius: var(--radius-pill);
  background: var(--c-track);
  overflow: hidden;
}

.valuation-ruler-band {
  position: absolute;
  top: 0;
  bottom: 0;
}

.valuation-ruler-band--cheap {
  left: 0;
  background: var(--c-up);
  opacity: 0.55;
}

.valuation-ruler-band--fair {
  background: var(--c-line-strong);
}

.valuation-ruler-band--expensive {
  background: var(--c-down);
  opacity: 0.55;
}

.valuation-ruler-tick {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--c-ink);
}

.valuation-ruler-marker {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  font-size: var(--fs-caption);
  color: var(--c-ink);
  line-height: 1;
}

.valuation-card-prices {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  text-align: center;
}

.valuation-card-price {
  display: flex;
  flex-direction: column;
}

.valuation-card-price-value {
  font-size: var(--fs-subhead);
  font-variant-numeric: tabular-nums;
  color: var(--c-ink);
}

.valuation-card-price--cheap .valuation-card-price-value {
  color: var(--c-up);
}

.valuation-card-price--expensive .valuation-card-price-value {
  color: var(--c-down);
}

.valuation-card-verdict {
  font-size: var(--fs-subhead);
  font-weight: 600;
  text-align: center;
}

.valuation-card-verdict--below {
  color: var(--c-up);
}

.valuation-card-verdict--above {
  color: var(--c-down);
}

.valuation-assumptions-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0;
  border: 0;
  background: none;
  font-size: var(--fs-subhead);
  color: var(--c-ink);
  cursor: pointer;
}

.valuation-assumptions-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 12px;
}

.valuation-assumptions-formulas {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 12px;
}

.valuation-assumption-row {
  display: grid;
  grid-template-columns: 96px 1fr auto;
  align-items: center;
  gap: 8px;
}

.valuation-assumption-row .ant-input-number {
  width: 100%;
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run src/utils/stockDetail.test.js src/components/stockDetail`
Expected: PASS。若 `getByText('$120')` 因 `formatPrice` 實際輸出不同而失敗，先用 `node -e "console.log(new Intl.NumberFormat('zh-TW',{style:'currency',currency:'TWD',maximumFractionDigits:4}).format(120))"` 確認實際字串，再把**測試的期望值**改成該字串（不要改 `formatPrice`）。

- [ ] **Step 8: Lint and commit**

```bash
npx eslint src/utils/stockDetail.js src/utils/stockDetail.test.js src/components/stockDetail
git add src/utils/stockDetail.js src/utils/stockDetail.test.js src/components/stockDetail/ValuationCard.jsx src/components/stockDetail/ValuationCard.test.jsx src/components/stockDetail/ValuationAssumptions.jsx src/components/stockDetail/ValuationAssumptions.test.jsx src/App.css
git commit -m "feat(stock-detail): valuation card and editable assumptions" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: EPS 趨勢圖與本益比走勢圖

**Files:**
- Create: `src/components/stockDetail/EpsTrendChart.jsx`
- Create: `src/components/stockDetail/PeHistoryChart.jsx`
- Test: `src/components/stockDetail/charts.test.jsx`

**Interfaces:**
- Consumes: `fundamentals`（Task 7 形狀）、`model.bands`（Task 4）。
- Produces:
  - `buildEpsChartData(fundamentals): Array<{label, eps, lastYearEps, estimate, surprisePercent}>`（最多 8 筆，舊到新）
  - `<EpsTrendChart fundamentals />`
  - `<PeHistoryChart peSeries bands />`

- [ ] **Step 1: Write the failing tests**

`src/components/stockDetail/charts.test.jsx`:

```jsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import EpsTrendChart, { buildEpsChartData } from './EpsTrendChart'
import PeHistoryChart from './PeHistoryChart'

const singles = [
  { year: 2024, quarter: 1, eps: 1 },
  { year: 2024, quarter: 2, eps: 2 },
  { year: 2024, quarter: 3, eps: 3 },
  { year: 2024, quarter: 4, eps: 4 },
  { year: 2025, quarter: 1, eps: 5 },
  { year: 2025, quarter: 2, eps: 6 },
  { year: 2025, quarter: 3, eps: 7 },
  { year: 2025, quarter: 4, eps: 8 },
  { year: 2026, quarter: 1, eps: 9 },
]

describe('buildEpsChartData', () => {
  it('keeps the latest 8 quarters with last year’s quarter and estimates', () => {
    const data = buildEpsChartData({
      singles,
      surprises: [{ year: 2026, quarter: 1, estimate: 8.5, surprisePercent: 5.9 }],
    })
    expect(data).toHaveLength(8)
    expect(data[0]).toEqual({ label: '24Q2', eps: 2, lastYearEps: null, estimate: null, surprisePercent: null })
    expect(data.at(-1)).toEqual({ label: '26Q1', eps: 9, lastYearEps: 5, estimate: 8.5, surprisePercent: 5.9 })
  })
})

describe('chart components', () => {
  it('shows the next earnings line', () => {
    render(
      <EpsTrendChart
        fundamentals={{ singles, surprises: [], nextEarnings: { date: '2026-11-14', label: 'Q3 財報法定截止日' } }}
      />,
    )
    expect(screen.getByText('Q3 財報法定截止日：2026-11-14')).toBeInTheDocument()
  })

  it('shows an empty state without EPS data', () => {
    render(<EpsTrendChart fundamentals={{ singles: [], surprises: [], nextEarnings: null }} />)
    expect(screen.getByText('尚無 EPS 資料')).toBeInTheDocument()
  })

  it('shows an empty state with fewer than two P/E points', () => {
    render(<PeHistoryChart peSeries={[{ label: '2026-09', pe: 28 }]} bands={{}} />)
    expect(screen.getByText('尚無歷史本益比資料')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/stockDetail/charts.test.jsx`
Expected: FAIL（模組不存在）

- [ ] **Step 3: Write `EpsTrendChart.jsx`**

```jsx
import { Typography } from "antd";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { COLORS } from "../../theme/tokens";

const { Text } = Typography;

const CHART_QUARTERS = 8;

const shortLabel = ({ year, quarter }) => `${String(year).slice(2)}Q${quarter}`;

export const buildEpsChartData = ({ singles = [], surprises = [] }) =>
  singles.slice(-CHART_QUARTERS).map((item) => {
    const lastYear = singles.find((other) => other.year === item.year - 1 && other.quarter === item.quarter);
    const surprise = surprises.find((other) => other.year === item.year && other.quarter === item.quarter);
    return {
      label: shortLabel(item),
      eps: Number.isFinite(item.eps) ? item.eps : null,
      lastYearEps: Number.isFinite(lastYear?.eps) ? lastYear.eps : null,
      estimate: Number.isFinite(surprise?.estimate) ? surprise.estimate : null,
      surprisePercent: Number.isFinite(surprise?.surprisePercent) ? surprise.surprisePercent : null,
    };
  });

const TOOLTIP_NAMES = { eps: "單季 EPS", lastYearEps: "去年同季", estimate: "預估" };

const formatTooltip = (value, name, { payload }) => {
  const text = Number.isFinite(value) ? value.toFixed(2) : "--";
  if (name === "estimate" && Number.isFinite(payload.surprisePercent)) {
    return [`${text}（surprise ${payload.surprisePercent.toFixed(1)}%）`, TOOLTIP_NAMES[name]];
  }
  return [text, TOOLTIP_NAMES[name] ?? name];
};

function EpsTrendChart({ fundamentals }) {
  const data = buildEpsChartData(fundamentals);
  const hasEstimates = data.some((item) => item.estimate !== null);
  return (
    <section className="stock-detail-section" aria-label="EPS 趨勢">
      <Text strong>EPS 趨勢</Text>
      {data.length === 0 ? (
        <Text type="secondary">尚無 EPS 資料</Text>
      ) : (
        <div className="stock-detail-chart">
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid stroke={COLORS.line} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: COLORS.muted }} />
              <YAxis tick={{ fontSize: 11, fill: COLORS.muted }} />
              <Tooltip formatter={formatTooltip} />
              <Bar dataKey="lastYearEps" fill={COLORS.lineStrong} radius={[3, 3, 0, 0]} />
              <Bar dataKey="eps" fill={COLORS.teal} radius={[3, 3, 0, 0]} />
              {hasEstimates && <Scatter dataKey="estimate" fill={COLORS.warn} />}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
      {fundamentals.nextEarnings && (
        <Text type="secondary">{`${fundamentals.nextEarnings.label}：${fundamentals.nextEarnings.date}`}</Text>
      )}
    </section>
  );
}

export default EpsTrendChart;
```

- [ ] **Step 4: Write `PeHistoryChart.jsx`**

```jsx
import { Typography } from "antd";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { COLORS } from "../../theme/tokens";

const { Text } = Typography;

const BAND_LINES = [
  { key: "cheap", label: "便宜", color: COLORS.up },
  { key: "fair", label: "合理", color: COLORS.muted },
  { key: "expensive", label: "昂貴", color: COLORS.down },
];

// Explains where the three P/E bands come from: the stock's own P/E history
// with the bands in use (including overrides) drawn across it.
function PeHistoryChart({ peSeries, bands }) {
  const validCount = peSeries.filter((point) => Number.isFinite(point.pe)).length;
  return (
    <section className="stock-detail-section" aria-label="本益比走勢">
      <Text strong>本益比走勢</Text>
      {validCount < 2 ? (
        <Text type="secondary">尚無歷史本益比資料</Text>
      ) : (
        <div className="stock-detail-chart">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={peSeries} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid stroke={COLORS.line} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: COLORS.muted }} minTickGap={24} />
              <YAxis tick={{ fontSize: 11, fill: COLORS.muted }} domain={["auto", "auto"]} />
              <Tooltip formatter={(value) => [Number.isFinite(value) ? value.toFixed(1) : "--", "本益比"]} />
              <Line dataKey="pe" stroke={COLORS.teal} dot={false} connectNulls={false} strokeWidth={2} />
              {BAND_LINES.map(({ key, label, color }) =>
                Number.isFinite(bands?.[key]) ? (
                  <ReferenceLine
                    key={key}
                    y={bands[key]}
                    stroke={color}
                    strokeDasharray="4 4"
                    label={{ value: `${label} ${bands[key]}`, position: "insideTopRight", fontSize: 11, fill: color }}
                  />
                ) : null,
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

export default PeHistoryChart;
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/components/stockDetail`
Expected: PASS

- [ ] **Step 6: Lint and commit**

```bash
npx eslint src/components/stockDetail
git add src/components/stockDetail/EpsTrendChart.jsx src/components/stockDetail/PeHistoryChart.jsx src/components/stockDetail/charts.test.jsx
git commit -m "feat(stock-detail): EPS trend and P/E history charts" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: `StockDetailSheet` 組裝與 `App.jsx` 接線

**Files:**
- Create: `src/components/StockDetailSheet.jsx`
- Test: `src/components/StockDetailSheet.test.jsx`
- Modify: `src/App.jsx`
  - import 區（`BudgetDetailSheet` import 附近，約 `:113`）
  - state（`budgetDetailId` 附近，約 `:484`）
  - `MobileSwipeRow`（約 `:341-350`）加 `onTap`
  - 手機持股列 `MobileSwipeRow`（約 `:2735`）傳 `onTap`
  - 桌機持股 `Table`（約 `:6466`）加 `onRow`
  - 在 `BudgetDetailSheet` 渲染處（約 `:7741`）旁渲染 `StockDetailSheet`
- Modify: `src/App.css`（append `.holding-row--clickable`、sheet header 樣式）

**Interfaces:**
- Consumes: Task 7 `useStockFundamentals`；Task 8 `useValuationSettings`；Task 5 `buildValuationModel`；Task 9 `ValuationCard`、`ValuationAssumptions`、`buildStockDetailHolding`、`isInteractiveTarget`、`formatSignedPercent`；Task 10 `EpsTrendChart`、`PeHistoryChart`。
- Produces: `<StockDetailSheet open holding isMobile disabled onClose />`，其中 `holding` 為 `buildStockDetailHolding` 的輸出。

- [ ] **Step 1: Write the failing test**

`src/components/StockDetailSheet.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

vi.mock('../hooks/useStockFundamentals', () => ({ default: vi.fn() }))
vi.mock('../hooks/useValuationSettings', () => ({ default: vi.fn() }))

import useStockFundamentals from '../hooks/useStockFundamentals'
import useValuationSettings from '../hooks/useValuationSettings'
import StockDetailSheet from './StockDetailSheet'
import { cumulativeToSingles, EMPTY_VALUATION_SETTINGS } from '../utils/valuation'

const cumulative = {
  '2025Q1': { eps: 13.94 },
  '2025Q2': { eps: 29.31 },
  '2025Q3': { eps: 46.36 },
  '2025Q4': { eps: 66.25 },
  '2026Q1': { eps: 16.0 },
  '2026Q2': { eps: 35.17 },
}

const fundamentals = {
  market: 'TW',
  singles: cumulativeToSingles(cumulative),
  cumulative,
  surprises: [],
  upcoming: [],
  peSeries: [10, 12, 14, 15, 16, 18, 20, 22].map((pe, i) => ({ label: `2026-0${i + 1}`, pe })),
  nextEarnings: { date: '2026-11-14', label: 'Q3 財報法定截止日' },
  updatedAt: '2026-10-05T12:03:11Z',
}

const holding = {
  id: 1,
  market: 'TW',
  symbol: '2330',
  companyName: '台積電',
  assetTag: 'STOCK',
  latestPrice: 1085,
  priceChangePct: 1.2,
  latestCurrency: 'TWD',
  totalShares: 2000,
  totalValueTwd: 2170000,
}

const reload = vi.fn()

beforeEach(() => {
  reload.mockReset()
  useValuationSettings.mockReturnValue({ settings: EMPTY_VALUATION_SETTINGS, save: vi.fn() })
})

const renderSheet = (props = {}) =>
  render(<StockDetailSheet open holding={holding} isMobile disabled={false} onClose={() => {}} {...props} />)

describe('StockDetailSheet', () => {
  it('renders header, valuation, charts and source when data is ready', () => {
    useStockFundamentals.mockReturnValue({ status: 'ready', data: fundamentals, reload })
    renderSheet()
    expect(screen.getByText('台積電')).toBeInTheDocument()
    expect(screen.getByText('2330')).toBeInTheDocument()
    expect(screen.getByText(/持有 2,000 股/)).toBeInTheDocument()
    expect(screen.getByLabelText('估價')).toBeInTheDocument()
    expect(screen.getByText(/目前.+距合理價/)).toBeInTheDocument()
    expect(screen.getByText('EPS 趨勢')).toBeInTheDocument()
    expect(screen.getByText('本益比走勢')).toBeInTheDocument()
    expect(screen.getByText(/資料來源：TWSE/)).toBeInTheDocument()
  })

  it('switches to the forward estimate', () => {
    useStockFundamentals.mockReturnValue({ status: 'ready', data: fundamentals, reload })
    renderSheet()
    fireEvent.click(screen.getByText('今年預估'))
    expect(screen.getByText(/目前.+距合理價/)).toBeInTheDocument()
  })

  it('shows a skeleton while loading', () => {
    useStockFundamentals.mockReturnValue({ status: 'loading', reload })
    const { baseElement } = renderSheet()
    expect(baseElement.querySelector('.ant-skeleton')).not.toBeNull()
  })

  it('shows the error with a retry button', () => {
    useStockFundamentals.mockReturnValue({ status: 'error', error: new Error('Finnhub API error: 401'), reload })
    renderSheet()
    expect(screen.getByText('Finnhub API error: 401')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '重試' }))
    expect(reload).toHaveBeenCalled()
  })

  it('explains unsupported TW stocks', () => {
    useStockFundamentals.mockReturnValue({ status: 'unsupported', reload })
    renderSheet()
    expect(screen.getByText('目前僅支援上市股票，查無這檔的 EPS 資料')).toBeInTheDocument()
  })

  it('skips valuation for non-stock holdings', () => {
    useStockFundamentals.mockReturnValue({ status: 'ready', data: fundamentals, reload })
    renderSheet({ holding: { ...holding, assetTag: 'ETF' } })
    expect(screen.queryByLabelText('估價')).not.toBeInTheDocument()
    expect(screen.queryByText('本益比走勢')).not.toBeInTheDocument()
    expect(screen.getByText('EPS 趨勢')).toBeInTheDocument()
  })

  it('renders nothing without a holding', () => {
    useStockFundamentals.mockReturnValue({ status: 'idle', reload })
    const { container } = renderSheet({ holding: null })
    expect(container).toBeEmptyDOMElement()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/StockDetailSheet.test.jsx`
Expected: FAIL（模組不存在）

- [ ] **Step 3: Write `src/components/StockDetailSheet.jsx`**

```jsx
import { useState } from "react";
import { Alert, Button, Drawer, Skeleton, Typography } from "antd";
import useBodyScrollLock from "../hooks/useBodyScrollLock";
import useStockFundamentals from "../hooks/useStockFundamentals";
import useValuationSettings from "../hooks/useValuationSettings";
import { formatDateTime, formatPrice, formatTwd } from "../utils/formatters";
import { formatSignedPercent } from "../utils/stockDetail";
import { buildValuationModel } from "../utils/valuation";
import EpsTrendChart from "./stockDetail/EpsTrendChart";
import PeHistoryChart from "./stockDetail/PeHistoryChart";
import ValuationAssumptions from "./stockDetail/ValuationAssumptions";
import ValuationCard from "./stockDetail/ValuationCard";

const { Text } = Typography;

const SOURCE_LABELS = { TW: "TWSE / 公開資訊觀測站", US: "Finnhub" };

// One stock: price, EPS × P/E valuation, EPS trend and P/E history. Mobile
// shows a bottom sheet, desktop a right-hand drawer. The parent keys this by
// stock so basis / fold state reset when another stock opens.
function StockDetailSheet({ open, holding, isMobile, disabled, onClose }) {
  const active = Boolean(open && holding);
  useBodyScrollLock(active && isMobile);
  const fundamentals = useStockFundamentals(active ? holding.market : null, active ? holding.symbol : null);
  const { settings, save } = useValuationSettings(active ? holding.market : null, active ? holding.symbol : null);
  const [basis, setBasis] = useState("ttm");
  const [assumptionsOpen, setAssumptionsOpen] = useState(false);

  if (!holding) return null;

  const isStock = (holding.assetTag || "STOCK") === "STOCK";
  const currency = holding.latestCurrency || (holding.market === "US" ? "USD" : "TWD");
  const data = fundamentals.status === "ready" ? fundamentals.data : null;
  const model = data
    ? buildValuationModel({ fundamentals: data, settings, price: holding.latestPrice, basis })
    : null;

  let body;
  if (fundamentals.status === "loading" || fundamentals.status === "idle") {
    body = <Skeleton active paragraph={{ rows: 6 }} />;
  } else if (fundamentals.status === "error") {
    body = (
      <Alert
        type="error"
        showIcon
        title={fundamentals.error?.message || "載入失敗"}
        action={<Button size="small" onClick={fundamentals.reload}>重試</Button>}
      />
    );
  } else if (fundamentals.status === "unsupported") {
    body = <Text type="secondary">目前僅支援上市股票，查無這檔的 EPS 資料</Text>;
  } else {
    body = (
      <>
        {isStock && (
          <>
            <ValuationCard
              model={model}
              basis={basis}
              onBasisChange={setBasis}
              market={holding.market}
              currency={currency}
            />
            <ValuationAssumptions
              key={JSON.stringify(settings)}
              model={model}
              market={holding.market}
              settings={settings}
              disabled={disabled}
              open={assumptionsOpen}
              onToggle={() => setAssumptionsOpen((value) => !value)}
              onSave={save}
            />
          </>
        )}
        <EpsTrendChart fundamentals={data} />
        {isStock && <PeHistoryChart peSeries={data.peSeries} bands={model.bands} />}
        <Text type="secondary" className="stock-detail-source">
          {`資料來源：${SOURCE_LABELS[holding.market]} · 更新於 ${formatDateTime(data.updatedAt)}`}
        </Text>
      </>
    );
  }

  const title = (
    <div className="stock-detail-title">
      <span>{holding.companyName || holding.symbol}</span>
      <Text type="secondary">{holding.symbol}</Text>
    </div>
  );

  const content = (
    <>
      <header className="stock-detail-header">
        <span className="stock-detail-price">{formatPrice(holding.latestPrice, currency)}</span>
        {Number.isFinite(holding.priceChangePct) && (
          <span className={holding.priceChangePct >= 0 ? "stock-detail-change--up" : "stock-detail-change--down"}>
            {formatSignedPercent(holding.priceChangePct / 100)}
          </span>
        )}
        <Text type="secondary" className="stock-detail-holding">
          {`持有 ${Number(holding.totalShares).toLocaleString("zh-TW", { maximumFractionDigits: 4 })} 股 · 市值 ${formatTwd(holding.totalValueTwd)}`}
        </Text>
      </header>
      {body}
    </>
  );

  return isMobile ? (
    <Drawer
      placement="bottom"
      title={title}
      open={open}
      onClose={onClose}
      size="90vh"
      destroyOnHidden
      className="form-bottom-sheet stock-detail-sheet"
    >
      {content}
    </Drawer>
  ) : (
    <Drawer
      placement="right"
      title={title}
      open={open}
      onClose={onClose}
      size={520}
      destroyOnHidden
      className="stock-detail-sheet"
    >
      {content}
    </Drawer>
  );
}

export default StockDetailSheet;
```

注意：`priceChangePct` 是「百分比數字」（`src/utils/portfolioChange.js` 以 `× 100` 計算，`1.2` 代表 1.2%），所以這裡除以 100 再交給 `formatSignedPercent`。Ant Design 6 的 `Alert` 用 `title`（`message` 已 deprecated）。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/StockDetailSheet.test.jsx`
Expected: PASS

- [ ] **Step 5: Wire into `App.jsx`**

(a) import（`import BudgetDetailSheet …` 之後）：

```jsx
import StockDetailSheet from "./components/StockDetailSheet";
import { buildStockDetailHolding, isInteractiveTarget } from "./utils/stockDetail";
```

(b) state（`const [budgetDetailId, setBudgetDetailId] = useState(null);` 之後）：

```jsx
  const [stockDetailId, setStockDetailId] = useState(null);
```

(c) 在 `filteredRows` 的 `useMemo` 之後：

```jsx
  const stockDetail = useMemo(
    () => (stockDetailId === null ? null : buildStockDetailHolding(rows, stockDetailId)),
    [rows, stockDetailId],
  );
```

(d) `MobileSwipeRow` 改為接受 `onTap`：

```jsx
function MobileSwipeRow({ actions, disabled = false, main, side = null, onTap }) {
  return (
    <SwipeActions actions={actions} disabled={disabled}>
      <div
        className="mobile-swipe-row"
        onClick={onTap}
        role={onTap ? "button" : undefined}
        tabIndex={onTap ? 0 : undefined}
        onKeyDown={
          onTap
            ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onTap();
                }
              }
            : undefined
        }
      >
        <div className="mobile-swipe-row-main">{main}</div>
        {side !== null && <div className="mobile-swipe-row-side">{side}</div>}
      </div>
    </SwipeActions>
  );
}
```

（`SwipeActions` 的 `handleClickCapture` 已經會吞掉滑動後的 click，所以滑動不會誤開細節頁。）

(e) 手機持股列（`render: (_, record) => {` 內 `return ( <MobileSwipeRow` 那段）加上：

```jsx
              onTap={() => setStockDetailId(record.id)}
```

並把 `setStockDetailId` 加進該 `useMemo` / `useCallback` 的 dependency array（若該欄位定義在有 dependency list 的 hook 裡；`setState` 是穩定的，加不加都不會出錯，但 lint 可能要求）。

(f) 桌機持股 `Table`（`dataSource={filteredRows}` 那個）加上：

```jsx
                          onRow={(record) => ({
                            className: "holding-row--clickable",
                            onClick: (event) => {
                              if (editingHoldingId === record.id || isInteractiveTarget(event.target)) return;
                              setStockDetailId(record.id);
                            },
                          })}
```

(g) 在 `{isMobileViewport && ( <BudgetDetailSheet … /> )}` 之後：

```jsx
          <StockDetailSheet
            key={stockDetail ? `${stockDetail.market}_${stockDetail.symbol}` : "none"}
            open={Boolean(stockDetail)}
            holding={stockDetail}
            isMobile={isMobileViewport}
            disabled={isWriteDisabled}
            onClose={() => setStockDetailId(null)}
          />
```

(h) Append 到 `src/App.css`：

```css
.holding-row--clickable {
  cursor: pointer;
}

.stock-detail-title {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.stock-detail-header {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--c-line);
}

.stock-detail-price {
  font-size: var(--fs-title);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.stock-detail-change--up {
  color: var(--c-up);
}

.stock-detail-change--down {
  color: var(--c-down);
}

.stock-detail-holding {
  flex-basis: 100%;
}

.stock-detail-chart {
  width: 100%;
  min-width: 0;
}

.stock-detail-source {
  display: block;
  padding: 16px 0 8px;
  font-size: var(--fs-caption);
}
```

- [ ] **Step 6: Run the full suite, lint and build**

```bash
npm test
npm run lint
npm run build
```

Expected：全部測試 PASS、lint 無 error、build 成功。

- [ ] **Step 7: Commit**

```bash
git add src/components/StockDetailSheet.jsx src/components/StockDetailSheet.test.jsx src/App.jsx src/App.css
git commit -m "feat(stock-detail): open a stock detail sheet from the holdings list" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: 瀏覽器驗證（memory：build 成功不等於 runtime 正常）

**Files:** 無新增；發現問題時修改對應檔案並補測試。

**Interfaces:**
- Consumes: 全部前面 task 的成果。
- Produces: 驗證紀錄（貼在最後回報裡）。

- [ ] **Step 1: 啟動 preview**

```bash
npm run build && npm run preview
```

在瀏覽器開 preview 網址（預設 `http://localhost:4173/`）。依 `superpowers:verification-before-completion`，每一項都要實際看到才打勾。

- [ ] **Step 2: 桌機（寬 ≥ 1024px）驗證**

- [ ] 點一檔台股上市持股（例如 2330）的列 → 右側 Drawer 開啟，頁首有名稱、代號、現價、持有股數與市值。
- [ ] 估價卡顯示三個價位、價位尺與 ▼、結論文字；切到「今年預估」數字會變。
- [ ] 點列上的編輯按鈕、拖曳把手、刪除按鈕 → **不會**開啟 Drawer。
- [ ] 展開「估價假設」，看得到兩條算式與「預設：近 60 期…」。
- [ ] EPS 趨勢圖顯示 8 根長條與淡色去年同季；本益比走勢有三條參考線。
- [ ] 點一檔美股 → 顯示「未來四季預估」、下次財報日（含盤前 / 盤後）；DevTools Network 中三個 Finnhub 請求；關閉再開同一檔，**沒有**新的 Finnhub 請求（快取）。
- [ ] 點一檔上櫃股（若有）→「目前僅支援上市股票，查無這檔的 EPS 資料」。
- [ ] 登入狀態下覆寫「合理本益比」→ 儲存後價位改變、出現「已覆寫」；按「重設」回到自動值。登出後欄位為唯讀並顯示「登入後可調整估價假設」。

- [ ] **Step 3: 手機（DevTools 390×844）驗證**

- [ ] 點持股列 → bottom sheet 開啟，背景不會捲動。
- [ ] 在持股列上**左滑**露出編輯 / 移除 → 細節頁**不會**開啟；再點一下空白處收回，然後點列 → 才開啟。
- [ ] 頁面在 390px 寬沒有水平捲動，三個價位不換行擠壓。

- [ ] **Step 4: 修正與收尾**

發現的每個問題：先補一個能重現的測試，修好，跑 `npm test`，再 commit（`fix(stock-detail): …`，附 Co-Authored-By 行）。全部通過後，記錄驗證結果並回報；**不要** merge 或 push 到 `main`，由使用者決定（`superpowers:finishing-a-development-branch`）。
