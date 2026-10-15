# 低估個股篩選 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在研究 tab 加入「低估候選」：用現有 EPS × 本益比估價，把全部上市台股和現價比較，列出低於合理價的股票，並以可調門檻的品質標籤過濾雜訊。

**Architecture:** 建置時 (`scripts/split-tw-fundamentals.mjs`) 用現有的 `valuation.js` / `incomeModel.js` 為每家公司算出四種基準 EPS、自動本益比區間與品質原始值，寫成 `public/data/tw/screen.json`。前端 `useStockScreen` 載入它、抓 TWSE 全市場收盤價、讀門檻設定（`app_config` 的 `stock_screen:settings`）、對有自訂估價假設的股票個別重算，再交給純函式 `screenStocks` 分組、排序、加標籤。

**Tech Stack:** React 19、Ant Design 6、iconoir-react、Vitest + Testing Library、Node 20 ESM scripts、GitHub Actions。

**Spec:** `docs/superpowers/specs/2026-10-15-stock-screener-design.md`

## Global Constraints

- 所有 `npm` / `npx` 指令都在 `my-stock/` 下執行；分支 `feat/stock-screener`。
- 只做上市台股；不加新套件；不改 Firestore rules；不改 `peBandsFromHistory`。
- UI 只用 token：`var(--c-*)`、`var(--fs-*)`、`var(--radius-*)`、`var(--space-*)`；不寫死 hex / px（`1px` 邊框與 `44px` 觸控高度沿用既有寫法）；小字灰用 `--c-muted`；距合理價不用 `up`/`down` 色。
- 研究頁沒有 hero 與 display 數字；間距照支出頁樣板（`--space-section`、`--space-section-head`、`--space-row-x` / `--space-row-y`）。
- 不用 lint disable 註解。
- 會在 Node 執行的 `src/utils/*` 檔（被 `scripts/` import）相對 import 一律帶 `.js` 副檔名。
- 預設門檻：業外 > 30%、獲利季數 < 7、EPS 成長 > 2 倍、本益比樣本 < 36、股本偏離 > 30%、成交金額 < 10,000,000 元；營建業 = 產業別 `14`。
- 文案：section「低估候選」、組「低於便宜價」「合理偏低」、說明「依歷史本益比估價，便宜可能有原因」、資料未產生「篩選資料尚未產生」。
- 每個 task 結束跑 `npm test` 與 `npx eslint <改到的檔>` 全綠才 commit；commit message 結尾加 `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`。

## Review Focus

1. **`screen.json` 缺失或 dev server 回 `index.html`**：section 要顯示「篩選資料尚未產生」，觀察清單照常 — Task 7 測 `missing`。
2. **某檔沒有當日報價（停牌、MI_INDEX 沒列）**：用月底價並標「N 月底價」，且不觸發「成交量低」 — Task 4 測。
3. **細節頁只自訂了某一基準用不到的欄位**（例如只改明年假設、篩選選 TTM）：不該標「自訂」 — Task 4 `toOverride` 測。
4. **門檻設定存了舊版或壞值**（負數、字串、缺欄位、未知產業代碼型別）：讀取不壞、回預設 — Task 4 / Task 6 測。
5. **剛好等於門檻**（業外 = 30%、成長 = 2 倍、股本比值 = 1.3）：不觸發 — Task 4 邊界測試。

---

## File Structure

| 檔案 | 責任 |
|---|---|
| `src/utils/twIndustries.js` (new) | 產業代碼 → 名稱 |
| `src/utils/stockScreen.js` (new) | 建置期 `buildScreenRow(s)`、前端 `screenStocks`、標籤、設定正規化、顯示用字串 |
| `src/utils/valuation.js` (modify) | import 加 `.js`，讓 Node 可 import |
| `src/utils/twFundamentalsMerge.js` (modify) | `parseCompanyProfileRows` |
| `scripts/lib/twse.mjs` (modify) | `PROFILE_PATH`、`updateCompanyProfile` |
| `scripts/update-tw-fundamentals.mjs` (modify) | 呼叫 `updateCompanyProfile` |
| `scripts/split-tw-fundamentals.mjs` (modify) | 寫 `screen.json` |
| `.github/workflows/update-tw-fundamentals.yml` (modify) | commit `company_profile.json` |
| `data/twse/company_profile.json` (new, data) | 產業別、已發行股數快照 |
| `src/services/priceProviders/twseDailyProvider.js` (modify) | `tradeValue` |
| `src/services/firebase/firestoreMappers.js` (modify) | `app_config.screen` |
| `src/services/portfolioService.js` (modify) | `getScreenSettings` / `saveScreenSettings` / `listValuationOverrideSymbols` |
| `src/hooks/useStockScreen.js` (new) | 載入、抓價、設定、override、結果 |
| `src/components/research/ResearchSheet.jsx` (new) | 研究頁的 bottom / right sheet 外框 |
| `src/components/research/ScreenList.jsx` (new) | 組標題 + 列 |
| `src/components/research/ScreenSection.jsx` (new) | 研究頁 section |
| `src/components/research/ScreenListSheet.jsx` (new) | 完整清單 |
| `src/components/research/ScreenSettingsSheet.jsx` (new) | 門檻設定 |
| `src/components/research/ScreenIndustrySheet.jsx` (new) | 產業多選 |
| `src/components/WatchlistDetailSheet.jsx` (modify) | 未加入狀態、`initialBasis`、`quoteNote` |
| `src/App.jsx` (modify) | 掛載 |
| `src/App.css` (modify) | 樣式 |
| `PRODUCT.md`、`DESIGN.md`、`CLAUDE.md` (modify) | 文件 |

---

### Task 1: 產業對照表

**Files:**
- Create: `src/utils/twIndustries.js`
- Test: `src/utils/twIndustries.test.js`

**Interfaces:**
- Produces: `TW_INDUSTRIES: Record<string,string>`、`TW_INDUSTRY_CODES: string[]`（排序後）、`CONSTRUCTION_INDUSTRY = '14'`、`industryName(code: string|null): string`

- [ ] **Step 1: Write the failing test**

```js
// src/utils/twIndustries.test.js
import { describe, it, expect } from 'vitest'
import { CONSTRUCTION_INDUSTRY, TW_INDUSTRY_CODES, industryName } from './twIndustries.js'

describe('industryName', () => {
  it('names known codes', () => {
    expect(industryName('24')).toBe('半導體')
    expect(industryName(CONSTRUCTION_INDUSTRY)).toBe('建材營造')
  })

  it('reads unknown or missing codes as 其他', () => {
    expect(industryName('99')).toBe('其他')
    expect(industryName(null)).toBe('其他')
  })

  it('lists codes in order', () => {
    expect(TW_INDUSTRY_CODES[0]).toBe('01')
    expect(TW_INDUSTRY_CODES).toHaveLength(33)
    expect([...TW_INDUSTRY_CODES].sort()).toEqual(TW_INDUSTRY_CODES)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/twIndustries.test.js`
Expected: FAIL（找不到 `./twIndustries.js`）

- [ ] **Step 3: Write minimal implementation**

```js
// src/utils/twIndustries.js
// TWSE 上市產業別 (t187ap03_L「產業別」) → short names for the screener.
// Unknown codes read as 其他 rather than failing.
export const TW_INDUSTRIES = {
  '01': '水泥',
  '02': '食品',
  '03': '塑膠',
  '04': '紡織纖維',
  '05': '電機機械',
  '06': '電器電纜',
  '08': '玻璃陶瓷',
  '09': '造紙',
  '10': '鋼鐵',
  '11': '橡膠',
  '12': '汽車',
  '14': '建材營造',
  '15': '航運',
  '16': '觀光餐旅',
  '17': '金融保險',
  '18': '貿易百貨',
  '20': '其他',
  '21': '化學',
  '22': '生技醫療',
  '23': '油電燃氣',
  '24': '半導體',
  '25': '電腦及週邊',
  '26': '光電',
  '27': '通信網路',
  '28': '電子零組件',
  '29': '電子通路',
  '30': '資訊服務',
  '31': '其他電子',
  '35': '綠能環保',
  '36': '數位雲端',
  '37': '運動休閒',
  '38': '居家生活',
  '91': '存託憑證',
}

export const TW_INDUSTRY_CODES = Object.keys(TW_INDUSTRIES).sort()

export const CONSTRUCTION_INDUSTRY = '14'

export const industryName = (code) => TW_INDUSTRIES[code] ?? '其他'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/twIndustries.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/twIndustries.js src/utils/twIndustries.test.js
git commit -m "feat(screen): TWSE industry names"
```

---

### Task 2: `twseDailyProvider` 解析成交金額

**Files:**
- Modify: `src/services/priceProviders/twseDailyProvider.js`（`parseDailyTable`）
- Test: `src/services/priceProviders/twseDailyProvider.test.js`

**Interfaces:**
- Produces: `getTwseDailyQuotes()` 的 `quotes[symbol]` 多一個 `tradeValue: number | undefined`（元）。

- [ ] **Step 1: Write the failing test**

在 `twseDailyProvider.test.js` 把 `row` helper 加上成交金額參數（第 5 欄），並更新 `0050` 的 `toEqual`、新增一個 test：

```js
const row = (code, name, close, sign, change, tradeValue = '0') => (
  [code, name, '0', '0', tradeValue, '0', '0', '0', close, sign, change, '0', '0', '0', '0', '0']
)
```

`dailyBody` 的 `0050` 列改成 `row('0050', '元大台灣50', '112.05', '<p style= color:red>+</p>', '0.75', '12,345,678,901')`，並把原本的斷言改為：

```js
    expect(quotes['0050']).toEqual({
      price: 112.05, name: '元大台灣50', currency: 'TWD', previousClose: 111.3, tradeValue: 12345678901,
    })
```

新增：

```js
  it('leaves tradeValue undefined when the column is missing', async () => {
    const fields = FIELDS.filter((field) => field !== '成交金額')
    const body = {
      stat: 'OK',
      date: '20260930',
      tables: [{ fields, data: [['2330', '台積電', '0', '0', '0', '0', '0', '1,000.00', '<p> </p>', '0.00', '0', '0', '0', '0', '0']] }],
    }
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(body)))
    const { quotes } = await getTwseDailyQuotes()
    expect(quotes['2330'].price).toBe(1000)
    expect(quotes['2330'].tradeValue).toBeUndefined()
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/priceProviders/twseDailyProvider.test.js`
Expected: FAIL（`0050` 缺 `tradeValue`）

- [ ] **Step 3: Write minimal implementation**

在 `parseDailyTable` 取欄位處加 `const tradeValueIdx = col('成交金額')`，組 quote 時：

```js
    const tradeValue = tradeValueIdx >= 0 ? parseNumber(row[tradeValueIdx]) : null

    quotes[symbol] = {
      price,
      name: String(row[nameIdx] ?? '').trim() || symbol,
      currency: 'TWD',
      previousClose,
      // 成交金額 (NTD), for the screener's 成交量低 flag.
      tradeValue: tradeValue ?? undefined,
    }
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: 全部 PASS（`quoteBatch` / `refreshPrices` 測試 mock 了 provider，不受影響；若有其他 `toEqual` 因多出欄位失敗，改成 `toMatchObject` 或補上 `tradeValue`）。

- [ ] **Step 5: Commit**

```bash
git add src/services/priceProviders/twseDailyProvider.js src/services/priceProviders/twseDailyProvider.test.js
git commit -m "feat(screen): parse 成交金額 from MI_INDEX"
```

---

### Task 3: 建置期資料列 `buildScreenRow`

**Files:**
- Modify: `src/utils/valuation.js:4`（`'./incomeModel'` → `'./incomeModel.js'`）
- Create: `src/utils/stockScreen.js`（建置期部分）
- Test: `src/utils/stockScreen.build.test.js`

**Interfaces:**
- Consumes: `buildValuationModel`、`computeTtm`、`cumulativeToSingles`、`peBandsFromHistory`、`quarterIndex`、`TW_BASES`（valuation.js）；`toSingleStatements`（incomeModel.js）
- Produces:
  - `SCREEN_BASES = ['ttm','ttmAfterNext','thisYear','nextYear']`
  - `toTwFundamentals(file) → fundamentals`（與 `loadStockFundamentals('TW')` 同形，少了 `nextEarnings` 等 UI 欄位）
  - `buildScreenRow(file, profile, todayIso) → ScreenRow | null`
  - `buildScreenFile({ files, profiles, todayIso, generatedAt }) → { generatedAt, todayIso, rows: ScreenRow[] }`
  - `ScreenRow = { code, name, industry, statement, eps: {ttm,ttmAfterNext,thisYear,nextYear}, bands: {cheap,fair,expensive,sampleSize}|null, nonOpRatio, profitQuarters, epsGrowth, coreEps, shareRatio, fallbackClose, fallbackMonth }`
  - `file` 是 `buildCompanyFiles` 的單檔：`{ code, name, statement, quarters, monthlyRevenue, monthly: [month, pe, close][] (新→舊) }`；`profile = { industry, sharesIssued } | undefined`

- [ ] **Step 1: Write the failing test**

```js
// src/utils/stockScreen.build.test.js
import { describe, it, expect } from 'vitest'
import { CUMULATIVE, MONTHLY_REVENUE } from './incomeModel.fixture.js'
import { buildScreenFile, buildScreenRow, toTwFundamentals } from './stockScreen.js'
import { buildValuationModel } from './valuation.js'

const TODAY = '2026-10-15'

// Fixture company: 2025 quarters EPS 2.32, 2026 Q1–Q2 EPS 3.04, 100 thousand
// shares (see incomeModel.fixture.js).
const FILE = {
  code: '9999',
  name: '測試',
  statement: 'general',
  quarters: CUMULATIVE,
  monthlyRevenue: MONTHLY_REVENUE,
  monthly: [
    ['2026-09', null, null],
    ['2026-08', 22, 50],
    ['2026-07', 20, 48],
    ['2026-06', 18, 47],
    ['2026-05', 16, 45],
    ['2026-04', 15, 44],
    ['2026-03', 14, 42],
    ['2026-02', 12, 40],
    ['2026-01', 10, 39],
  ],
}
const PROFILE = { industry: '24', sharesIssued: 100000 }

// Year-to-date EPS from single-quarter EPS, oldest first from 2024 Q1.
const epsOnly = (singles) => {
  const quarters = {}
  let running = 0
  singles.forEach((eps, index) => {
    const year = 2024 + Math.floor(index / 4)
    const quarter = (index % 4) + 1
    running = quarter === 1 ? eps : running + eps
    quarters[`${year}Q${quarter}`] = { eps: Math.round(running * 100) / 100 }
  })
  return quarters
}

describe('buildScreenRow', () => {
  it('derives every field from the company file and profile', () => {
    const row = buildScreenRow(FILE, PROFILE, TODAY)
    expect(row).toMatchObject({
      code: '9999',
      name: '測試',
      industry: '24',
      statement: 'general',
      bands: { cheap: 13.5, fair: 15.5, expensive: 18.5, sampleSize: 8 },
      nonOpRatio: 0.0597, // 80 / 1340
      profitQuarters: 6,
      epsGrowth: null, // no 2024 quarters
      coreEps: 10.08, // 1260 × 0.8 ÷ 100
      shareRatio: 1,
      fallbackClose: 50,
      fallbackMonth: '2026-08',
    })
    expect(row.eps.ttm).toBe(10.72)
  })

  it('uses the same projections as the detail sheet', () => {
    const row = buildScreenRow(FILE, PROFILE, TODAY)
    const fundamentals = toTwFundamentals(FILE)
    for (const basis of ['ttmAfterNext', 'thisYear', 'nextYear']) {
      const expected = buildValuationModel({ fundamentals, settings: null, price: null, basis, todayIso: TODAY }).chosen.eps
      expect(Number.isFinite(expected)).toBe(true)
      expect(row.eps[basis]).toBe(expected)
    }
  })

  it('has no projections, core EPS or non-operating ratio for financial companies', () => {
    const row = buildScreenRow({ ...FILE, statement: 'financial' }, PROFILE, TODAY)
    expect(row.eps.ttm).toBe(10.72)
    expect(row.eps.thisYear).toBeNull()
    expect(row.coreEps).toBeNull()
  })

  it('compares TTM EPS with the year before', () => {
    const quarters = epsOnly([1, 1, 1, 1, 2.32, 2.32, 2.32, 2.32])
    expect(buildScreenRow({ ...FILE, quarters }, PROFILE, TODAY).epsGrowth).toBe(2.32)
    const turnaround = epsOnly([-1, -1, 1, 0.5, 1, 1, 1, 1])
    expect(buildScreenRow({ ...FILE, quarters: turnaround }, PROFILE, TODAY).epsGrowth).toBeNull()
  })

  it('counts profitable quarters among the latest eight', () => {
    const quarters = epsOnly([-1, 1, 1, 1, 1, 1, -0.5, 1, 1])
    expect(buildScreenRow({ ...FILE, quarters }, PROFILE, TODAY).profitQuarters).toBe(7)
  })

  it('flags a share count that no longer matches the statements', () => {
    expect(buildScreenRow(FILE, { ...PROFILE, sharesIssued: 300000 }, TODAY).shareRatio).toBe(3)
    expect(buildScreenRow(FILE, undefined, TODAY)).toMatchObject({ shareRatio: null, industry: null })
  })

  it('drops a company with no EPS and no P/E history', () => {
    expect(buildScreenRow({ ...FILE, quarters: {}, monthly: [] }, PROFILE, TODAY)).toBeNull()
  })
})

describe('buildScreenFile', () => {
  it('keeps rows sorted by code and skips empty companies', () => {
    const files = {
      9999: FILE,
      1101: { ...FILE, code: '1101', name: '台泥' },
      2000: { ...FILE, code: '2000', quarters: {}, monthly: [] },
    }
    const screen = buildScreenFile({ files, profiles: { companies: { 9999: PROFILE } }, todayIso: TODAY, generatedAt: 'now' })
    expect(screen.generatedAt).toBe('now')
    expect(screen.todayIso).toBe(TODAY)
    expect(screen.rows.map((row) => row.code)).toEqual(['1101', '9999'])
    expect(screen.rows[0].industry).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/stockScreen.build.test.js`
Expected: FAIL（找不到 `./stockScreen.js`）

- [ ] **Step 3: Write minimal implementation**

先改 `src/utils/valuation.js` 第 4 行：

```js
import { MODEL_FIELDS, projectIncome, UNAVAILABLE_REASONS } from './incomeModel.js'
```

再建立 `src/utils/stockScreen.js`：

```js
// 低估篩選. Build time (scripts/split-tw-fundamentals.mjs): one row of raw
// valuation inputs per listed company → public/data/tw/screen.json. In the
// app: live prices, thresholds and the user's valuation overrides turn the
// rows into the 低估候選 list. Pure functions; see
// docs/superpowers/specs/2026-10-15-stock-screener-design.md.
// Imported by Node scripts too, so relative imports carry .js.
import { toSingleStatements } from './incomeModel.js'
import {
  buildValuationModel,
  computeTtm,
  cumulativeToSingles,
  peBandsFromHistory,
  quarterIndex,
  TW_BASES,
} from './valuation.js'

export const SCREEN_BASES = TW_BASES

// Same month-end window as twFundamentalsProvider (which cannot be imported
// here: it reads import.meta.env).
const PE_MONTHS = 60
const DEFAULT_TAX_RATE = 0.2
const MAX_TAX_RATE = 0.4
const TTM_FIELDS = ['operatingIncome', 'nonOperating', 'pretaxIncome', 'tax', 'netIncome', 'parentNetIncome']

const round = (value, digits = 4) => Math.round(value * 10 ** digits) / 10 ** digits
const sum = (values) => values.reduce((total, value) => total + value, 0)
const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

// A split company file → the fundamentals buildValuationModel expects
// (the TW half of loadStockFundamentals).
export const toTwFundamentals = (file) => {
  const cumulative = file.quarters ?? {}
  const monthly = (file.monthly ?? [])
    .slice(0, PE_MONTHS)
    .map(([month, pe, close]) => ({ month, pe: pe ?? null, close: close ?? null }))
    .reverse()
  return {
    market: 'TW',
    singles: cumulativeToSingles(cumulative),
    cumulative,
    company: { statement: file.statement ?? null, cumulative, monthlyRevenue: file.monthlyRevenue ?? {}, monthly },
    peSeries: monthly.map(({ month, pe }) => ({ label: month, pe })),
  }
}

// The latest `count` items when they are consecutive quarters, else null.
const latestConsecutive = (items, count) => {
  const tail = items.slice(-count)
  if (tail.length < count) return null
  for (let i = 1; i < tail.length; i += 1) {
    if (quarterIndex(tail[i]) !== quarterIndex(tail[i - 1]) + 1) return null
  }
  return tail
}

// Latest four quarters' income-statement totals (thousand NTD).
const statementTtm = (cumulative) => {
  const quarters = latestConsecutive(toSingleStatements(cumulative), 4)
  if (!quarters) return null
  const totals = {}
  for (const field of TTM_FIELDS) {
    if (quarters.some((quarter) => !Number.isFinite(quarter[field]))) return null
    totals[field] = sum(quarters.map((quarter) => quarter[field]))
  }
  return totals
}

const epsGrowthOf = (singles) => {
  const eight = latestConsecutive(singles, 8)
  if (!eight || eight.some((quarter) => !Number.isFinite(quarter.eps))) return null
  const previous = sum(eight.slice(0, 4).map((quarter) => quarter.eps))
  const current = sum(eight.slice(4).map((quarter) => quarter.eps))
  return previous > 0 ? round(current / previous) : null
}

// Operating income after tax and minority interest, per share: the EPS
// without 業外.
const coreEpsOf = (statement, totals, ttmEps) => {
  if (statement !== 'general' || !totals || !(ttmEps > 0) || !(totals.parentNetIncome > 0)) return null
  const taxRate =
    totals.pretaxIncome > 0 ? clamp(totals.tax / totals.pretaxIncome, 0, MAX_TAX_RATE) : DEFAULT_TAX_RATE
  const parentShare = totals.netIncome > 0 ? totals.parentNetIncome / totals.netIncome : 1
  const shares = totals.parentNetIncome / ttmEps
  return round((totals.operatingIncome * (1 - taxRate) * parentShare) / shares)
}

// Issued shares ÷ the shares implied by the latest statement: far from 1
// after a split or capital change the EPS history does not reflect.
const shareRatioOf = (cumulative, sharesIssued) => {
  const latestKey = Object.keys(cumulative).sort().at(-1)
  const latest = latestKey ? cumulative[latestKey] : null
  if (!(sharesIssued > 0) || !(latest?.eps > 0.05) || !Number.isFinite(latest?.parentNetIncome)) return null
  return round(sharesIssued / ((latest.parentNetIncome * 1000) / latest.eps))
}

export const buildScreenRow = (file, profile, todayIso) => {
  const fundamentals = toTwFundamentals(file)
  const eps = Object.fromEntries(
    SCREEN_BASES.map((basis) => {
      const value = buildValuationModel({ fundamentals, settings: null, price: null, basis, todayIso }).chosen?.eps
      return [basis, Number.isFinite(value) ? value : null]
    }),
  )
  const bands = peBandsFromHistory(fundamentals.peSeries.map((point) => point.pe))
  if (!bands && SCREEN_BASES.every((basis) => eps[basis] === null)) return null

  const totals = statementTtm(fundamentals.cumulative)
  const ttmEps = computeTtm(fundamentals.singles)?.eps ?? null
  const fallback = (file.monthly ?? []).find(([, , close]) => Number.isFinite(close) && close > 0)
  return {
    code: file.code,
    name: file.name,
    industry: profile?.industry ?? null,
    statement: file.statement ?? null,
    eps,
    bands,
    nonOpRatio: totals && totals.pretaxIncome > 0 ? round(totals.nonOperating / totals.pretaxIncome) : null,
    profitQuarters: fundamentals.singles.slice(-8).filter((quarter) => quarter.eps > 0).length,
    epsGrowth: epsGrowthOf(fundamentals.singles),
    coreEps: coreEpsOf(file.statement, totals, ttmEps),
    shareRatio: shareRatioOf(fundamentals.cumulative, profile?.sharesIssued),
    fallbackClose: fallback ? fallback[2] : null,
    fallbackMonth: fallback ? fallback[0] : null,
  }
}

export const buildScreenFile = ({ files, profiles, todayIso, generatedAt }) => ({
  generatedAt,
  todayIso,
  rows: Object.values(files ?? {})
    .map((file) => buildScreenRow(file, profiles?.companies?.[file.code], todayIso))
    .filter(Boolean)
    .sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0)),
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/stockScreen.build.test.js && npm test`
Expected: PASS。若 `nonOpRatio` / `coreEps` 因浮點差一位，檢查 `round` 是否用 4 位；不要改測試期望值去遷就（數字是手算的）。

- [ ] **Step 5: Commit**

```bash
git add src/utils/valuation.js src/utils/stockScreen.js src/utils/stockScreen.build.test.js
git commit -m "feat(screen): build-time valuation rows"
```

---

### Task 4: 前端篩選 `screenStocks`、標籤、設定、顯示字串

**Files:**
- Modify: `src/utils/stockScreen.js`（附加）
- Test: `src/utils/stockScreen.test.js`

**Interfaces:**
- Consumes: Task 1 `CONSTRUCTION_INDUSTRY`、`industryName`；valuation.js `computeValuation`、`VALUATION_SETTING_FIELDS`
- Produces:
  - `SCREEN_FLAG_KEYS: string[]`、`FLAG_DEFINITIONS: Record<key,{label,description,generalOnly?,field?:{key,label,unit:'percent'|'count'|'times'|'wan'}}>`
  - `DEFAULT_SCREEN_SETTINGS`、`normalizeScreenSettings(stored) → Settings`
  - `computeFlags(row, { price, tradeValue, fair }, flagSettings) → string[]`
  - `screenStocks({ rows, quotes, settings, basis, overrides, owned, watched }) → { below, fairLow, flagged, counts: { listed, flagged } }`
    - `quotes`: `getTwseDailyQuotes().quotes`（`{ [code]: { price, tradeValue } }`）
    - `overrides`: `{ [code]: { [basis]: { eps, bands:{cheap,fair,expensive}, custom } } }`
    - `owned` / `watched`: `Set<string>` of TW codes
    - item: `{ code, name, industry, industryName, price, priceSource:'daily'|'month-end', fallbackMonth, eps, prices, zone, distanceToFair, flags, custom, owned, watched }`
  - `hasCustomValuation(settings) → boolean`
  - `toOverride(customModel, autoModel) → { eps, bands, custom }`
  - `SCREEN_BASIS_OPTIONS: {value,label}[]`
  - `formatDistance(d) → '距合理價 −32%'`
  - `describeRowMeta(item) → string[]`（「持有」「觀察」「自訂」「8 月底價」＋標籤名稱）
  - `formatQuotesDate('20261014') → '10/14'`
  - `industrySummary(codes) → '全部產業' | '半導體' | '半導體 等 2 類'`

- [ ] **Step 1: Write the failing test**

```js
// src/utils/stockScreen.test.js
import { describe, it, expect } from 'vitest'
import {
  DEFAULT_SCREEN_SETTINGS,
  computeFlags,
  describeRowMeta,
  formatDistance,
  formatQuotesDate,
  hasCustomValuation,
  industrySummary,
  normalizeScreenSettings,
  screenStocks,
  toOverride,
} from './stockScreen.js'
import { EMPTY_VALUATION_SETTINGS } from './valuation.js'

// EPS 10 × P/E 10 / 15 / 20 → 便宜價 100、合理價 150、昂貴價 200.
const row = (overrides = {}) => ({
  code: '1234',
  name: '測試',
  industry: '24',
  statement: 'general',
  eps: { ttm: 10, ttmAfterNext: 12, thisYear: 12, nextYear: 14 },
  bands: { cheap: 10, fair: 15, expensive: 20, sampleSize: 60 },
  nonOpRatio: 0.05,
  profitQuarters: 8,
  epsGrowth: 1.2,
  coreEps: 10,
  shareRatio: 1,
  fallbackClose: 95,
  fallbackMonth: '2026-08',
  ...overrides,
})
const settings = DEFAULT_SCREEN_SETTINGS
const run = (rows, extra = {}) =>
  screenStocks({ rows, quotes: {}, settings, basis: 'ttm', overrides: {}, owned: new Set(), watched: new Set(), ...extra })
const quote = (price, tradeValue = 50_000_000) => ({ price, tradeValue })

describe('screenStocks', () => {
  it('groups below 便宜價 and 合理偏低, cheapest first, and drops the rest', () => {
    const rows = [
      row({ code: 'A' }),
      row({ code: 'B' }),
      row({ code: 'C' }),
      row({ code: 'D' }),
    ]
    const quotes = { A: quote(90), B: quote(60), C: quote(120), D: quote(160) }
    const result = run(rows, { quotes })
    expect(result.below.map((item) => item.code)).toEqual(['B', 'A'])
    expect(result.fairLow.map((item) => item.code)).toEqual(['C'])
    expect(result.below[1]).toMatchObject({ price: 90, priceSource: 'daily', distanceToFair: -0.4, zone: 'below' })
    expect(result.counts).toEqual({ listed: 3, flagged: 0 })
  })

  it('uses the chosen basis', () => {
    const result = run([row({ eps: { ttm: 10, ttmAfterNext: null, thisYear: 5, nextYear: null } })], {
      quotes: { 1234: quote(90) },
      basis: 'thisYear',
    })
    expect(result.counts.listed).toBe(0) // 合理價 75 < 90
  })

  it('skips losses and missing EPS', () => {
    const result = run([row({ eps: { ttm: -1 } }), row({ code: 'X', eps: { ttm: null } })], {
      quotes: { 1234: quote(90), X: quote(90) },
    })
    expect(result.counts).toEqual({ listed: 0, flagged: 0 })
  })

  it('falls back to the month-end close without a daily quote, and then ignores turnover', () => {
    const result = run([row()], {
      settings: normalizeScreenSettings({ flags: { lowTurnover: { enabled: true, minTradeValue: 1e12 } } }),
    })
    expect(result.below[0]).toMatchObject({ price: 95, priceSource: 'month-end', fallbackMonth: '2026-08', flags: [] })
  })

  it('filters by industry', () => {
    const rows = [row({ code: 'A', industry: '24' }), row({ code: 'B', industry: '14' })]
    const quotes = { A: quote(90), B: quote(90) }
    const result = run(rows, { quotes, settings: normalizeScreenSettings({ industries: ['24'] }) })
    expect([...result.below, ...result.flagged].map((item) => item.code)).toEqual(['A'])
  })

  it('moves flagged stocks aside unless they are held or watched', () => {
    const rows = [row({ code: 'A', nonOpRatio: 0.5 }), row({ code: 'B', nonOpRatio: 0.5 }), row({ code: 'C', nonOpRatio: 0.5 })]
    const quotes = { A: quote(90), B: quote(90), C: quote(90) }
    const result = run(rows, { quotes, owned: new Set(['B']), watched: new Set(['C']) })
    expect(result.flagged.map((item) => item.code)).toEqual(['A'])
    expect(result.below.map((item) => [item.code, item.owned, item.watched, item.flags])).toEqual([
      ['B', true, false, ['nonOperating']],
      ['C', false, true, ['nonOperating']],
    ])
  })

  it('uses an override for its basis and marks it custom', () => {
    const overrides = { 1234: { ttm: { eps: 10, bands: { cheap: 5, fair: 6, expensive: 7 }, custom: true } } }
    const result = run([row()], { quotes: { 1234: quote(90) }, overrides })
    expect(result.counts.listed).toBe(0) // 合理價 60 < 90
    const cheap = run([row()], { quotes: { 1234: quote(40) }, overrides })
    expect(cheap.below[0]).toMatchObject({ custom: true, prices: { cheap: 50, fair: 60, expensive: 70 } })
    // The override is for TTM only: 今年 still uses the row's EPS 12 (便宜價 120).
    const otherBasis = run([row()], { quotes: { 1234: quote(90) }, overrides, basis: 'thisYear' })
    expect(otherBasis.below[0]).toMatchObject({ custom: false, prices: { cheap: 120 } })
  })
})

describe('computeFlags', () => {
  const context = { price: 90, tradeValue: 50_000_000, fair: 15 }
  const flags = settings.flags
  const only = (key, overrides, extra = {}) =>
    computeFlags(row(overrides), { ...context, ...extra }, flags).includes(key)

  it('業外占比高 above the limit or unknown, general companies only', () => {
    expect(only('nonOperating', { nonOpRatio: 0.3 })).toBe(false)
    expect(only('nonOperating', { nonOpRatio: 0.31 })).toBe(true)
    expect(only('nonOperating', { nonOpRatio: null })).toBe(true)
    expect(only('nonOperating', { nonOpRatio: 0.9, statement: 'financial' })).toBe(false)
  })

  it('獲利不穩 below the minimum', () => {
    expect(only('unstableProfit', { profitQuarters: 7 })).toBe(false)
    expect(only('unstableProfit', { profitQuarters: 6 })).toBe(true)
  })

  it('EPS 暴增 above the limit or unknown (turnaround)', () => {
    expect(only('epsSpike', { epsGrowth: 2 })).toBe(false)
    expect(only('epsSpike', { epsGrowth: 2.01 })).toBe(true)
    expect(only('epsSpike', { epsGrowth: null })).toBe(true)
  })

  it('本業不便宜 when the price is at or above core EPS × fair P/E', () => {
    expect(only('coreNotCheap', { coreEps: 6.1 })).toBe(false) // 91.5 > 90
    expect(only('coreNotCheap', { coreEps: 6 })).toBe(true) // 90
    expect(only('coreNotCheap', { coreEps: -1 })).toBe(true)
    expect(only('coreNotCheap', { coreEps: null })).toBe(false)
    expect(only('coreNotCheap', { coreEps: 1, statement: 'financial' })).toBe(false)
  })

  it('本益比樣本少 below the minimum', () => {
    expect(only('fewPeSamples', { bands: { cheap: 10, fair: 15, expensive: 20, sampleSize: 36 } })).toBe(false)
    expect(only('fewPeSamples', { bands: { cheap: 10, fair: 15, expensive: 20, sampleSize: 35 } })).toBe(true)
  })

  it('股本變動 beyond the deviation, not at it', () => {
    expect(only('shareChange', { shareRatio: 1.3 })).toBe(false)
    expect(only('shareChange', { shareRatio: 0.7 })).toBe(false)
    expect(only('shareChange', { shareRatio: 1.31 })).toBe(true)
    expect(only('shareChange', { shareRatio: null })).toBe(false)
  })

  it('營建業 by industry', () => {
    expect(only('construction', { industry: '14' })).toBe(true)
    expect(only('construction', { industry: null })).toBe(false)
  })

  it('成交量低 only with a known trade value', () => {
    expect(only('lowTurnover', {}, { tradeValue: 10_000_000 })).toBe(false)
    expect(only('lowTurnover', {}, { tradeValue: 9_999_999 })).toBe(true)
    expect(only('lowTurnover', {}, { tradeValue: undefined })).toBe(false)
  })

  it('skips disabled flags', () => {
    const off = normalizeScreenSettings({ flags: { nonOperating: { enabled: false } } }).flags
    expect(computeFlags(row({ nonOpRatio: 0.9 }), context, off)).toEqual([])
  })
})

describe('normalizeScreenSettings', () => {
  it('returns the defaults for nothing stored', () => {
    expect(normalizeScreenSettings(null)).toEqual(DEFAULT_SCREEN_SETTINGS)
  })

  it('keeps valid values, repairs the rest', () => {
    const next = normalizeScreenSettings({
      industries: ['24', 24, '24', '14'],
      flags: {
        nonOperating: { enabled: false, max: 0.5 },
        epsSpike: { enabled: 'yes', maxGrowth: -1 },
        lowTurnover: { minTradeValue: 'abc' },
        unknown: { enabled: true },
      },
    })
    expect(next.industries).toEqual(['24', '14'])
    expect(next.flags.nonOperating).toEqual({ enabled: false, max: 0.5 })
    expect(next.flags.epsSpike).toEqual({ enabled: true, maxGrowth: 2 })
    expect(next.flags.lowTurnover).toEqual({ enabled: true, minTradeValue: 10_000_000 })
    expect(next.flags).not.toHaveProperty('unknown')
  })
})

describe('overrides', () => {
  const model = (eps, fair) => ({ chosen: { eps }, bands: { cheap: fair - 2, fair, expensive: fair + 2 } })

  it('detects settings that change something', () => {
    expect(hasCustomValuation(EMPTY_VALUATION_SETTINGS)).toBe(false)
    expect(hasCustomValuation({ ...EMPTY_VALUATION_SETTINGS, peFair: 18 })).toBe(true)
    expect(
      hasCustomValuation({ ...EMPTY_VALUATION_SETTINGS, model: { global: { revenueYoy: 0.1 }, quarters: {} } }),
    ).toBe(true)
    expect(
      hasCustomValuation({ ...EMPTY_VALUATION_SETTINGS, model: { global: {}, quarters: { '2026Q3': { taxRate: 0.2 } } } }),
    ).toBe(true)
  })

  it('is custom only when the basis result differs from the automatic one', () => {
    expect(toOverride(model(10, 15), model(10, 15))).toEqual({
      eps: 10,
      bands: { cheap: 13, fair: 15, expensive: 17 },
      custom: false,
    })
    expect(toOverride(model(12, 15), model(10, 15)).custom).toBe(true)
    expect(toOverride(model(10, 18), model(10, 15)).custom).toBe(true)
    expect(toOverride(model(undefined, 15), model(undefined, 15)).eps).toBeNull()
  })
})

describe('display helpers', () => {
  it('formats the distance to 合理價', () => {
    expect(formatDistance(-0.324)).toBe('距合理價 −32%')
    expect(formatDistance(0)).toBe('距合理價 0%')
  })

  it('lists a row’s marks', () => {
    expect(
      describeRowMeta({ owned: true, watched: true, custom: true, priceSource: 'month-end', fallbackMonth: '2026-08', flags: ['nonOperating', 'construction'] }),
    ).toEqual(['持有', '觀察', '自訂', '8 月底價', '業外占比高', '營建業'])
    expect(describeRowMeta({ owned: false, watched: false, custom: false, priceSource: 'daily', flags: [] })).toEqual([])
  })

  it('formats the quotes date and the industry choice', () => {
    expect(formatQuotesDate('20261014')).toBe('10/14')
    expect(formatQuotesDate(null)).toBeNull()
    expect(industrySummary([])).toBe('全部產業')
    expect(industrySummary(['24'])).toBe('半導體')
    expect(industrySummary(['24', '28'])).toBe('半導體 等 2 類')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/stockScreen.test.js`
Expected: FAIL（`screenStocks` 等未匯出）

- [ ] **Step 3: Write minimal implementation**

在 `src/utils/stockScreen.js` 頂部 import 補上：

```js
import { CONSTRUCTION_INDUSTRY, industryName } from './twIndustries.js'
```

並把 valuation.js 的 import 改為同時帶入 `computeValuation`、`VALUATION_SETTING_FIELDS`：

```js
import {
  buildValuationModel,
  computeTtm,
  computeValuation,
  cumulativeToSingles,
  peBandsFromHistory,
  quarterIndex,
  TW_BASES,
  VALUATION_SETTING_FIELDS,
} from './valuation.js'
```

在檔尾附加：

```js
// ── In the app ──────────────────────────────────────────────────────────

export const SCREEN_BASIS_OPTIONS = [
  { value: 'ttm', label: '近四季' },
  { value: 'ttmAfterNext', label: '下季後' },
  { value: 'thisYear', label: '今年' },
  { value: 'nextYear', label: '明年（參考）' },
]

export const SCREEN_FLAG_KEYS = [
  'nonOperating',
  'unstableProfit',
  'epsSpike',
  'coreNotCheap',
  'fewPeSamples',
  'shareChange',
  'construction',
  'lowTurnover',
]

// field.unit: how the settings sheet shows the threshold — percent (0.3 ↔
// 30), wan (10,000,000 ↔ 1,000 萬), count / times as stored.
export const FLAG_DEFINITIONS = {
  nonOperating: {
    label: '業外占比高',
    description: '近四季業外損益占稅前淨利超過上限，獲利可能是一次性的',
    generalOnly: true,
    field: { key: 'max', label: '業外占比上限', unit: 'percent' },
  },
  unstableProfit: {
    label: '獲利不穩',
    description: '近 8 季中獲利的季數少於門檻',
    field: { key: 'minProfitQuarters', label: '至少獲利季數', unit: 'count' },
  },
  epsSpike: {
    label: 'EPS 暴增',
    description: '近四季 EPS 超過前一年的倍數上限，含轉虧為盈',
    field: { key: 'maxGrowth', label: '成長倍數上限', unit: 'times' },
  },
  coreNotCheap: {
    label: '本業不便宜',
    description: '只用營業利益換算 EPS 估價時，現價不低於合理價',
    generalOnly: true,
  },
  fewPeSamples: {
    label: '本益比樣本少',
    description: '歷史本益比的月份數少於門檻，區間不可靠',
    field: { key: 'minSamples', label: '至少月份數', unit: 'count' },
  },
  shareChange: {
    label: '股本變動',
    description: '目前股數與財報隱含股數差距超過上限，EPS 可能還沒反映',
    field: { key: 'maxDeviation', label: '差距上限', unit: 'percent' },
  },
  construction: {
    label: '營建業',
    description: '建材營造業交屋才認列，EPS 起伏大',
  },
  lowTurnover: {
    label: '成交量低',
    description: '當日成交金額低於門檻',
    field: { key: 'minTradeValue', label: '最低成交金額', unit: 'wan' },
  },
}

export const DEFAULT_SCREEN_SETTINGS = Object.freeze({
  version: 1,
  industries: Object.freeze([]),
  flags: Object.freeze({
    nonOperating: Object.freeze({ enabled: true, max: 0.3 }),
    unstableProfit: Object.freeze({ enabled: true, minProfitQuarters: 7 }),
    epsSpike: Object.freeze({ enabled: true, maxGrowth: 2 }),
    coreNotCheap: Object.freeze({ enabled: true }),
    fewPeSamples: Object.freeze({ enabled: true, minSamples: 36 }),
    shareChange: Object.freeze({ enabled: true, maxDeviation: 0.3 }),
    construction: Object.freeze({ enabled: true }),
    lowTurnover: Object.freeze({ enabled: true, minTradeValue: 10_000_000 }),
  }),
})

const isNonNegative = (value) => Number.isFinite(value) && value >= 0

// Stored settings (any version, possibly partial or broken) → complete,
// valid settings; bad values fall back to the defaults field by field.
export const normalizeScreenSettings = (stored) => ({
  version: 1,
  industries: Array.isArray(stored?.industries)
    ? [...new Set(stored.industries.filter((code) => typeof code === 'string'))]
    : [],
  flags: Object.fromEntries(
    SCREEN_FLAG_KEYS.map((key) => {
      const defaults = DEFAULT_SCREEN_SETTINGS.flags[key]
      const saved = stored?.flags?.[key] ?? {}
      const next = { enabled: typeof saved.enabled === 'boolean' ? saved.enabled : defaults.enabled }
      const fieldKey = FLAG_DEFINITIONS[key].field?.key
      if (fieldKey) next[fieldKey] = isNonNegative(saved[fieldKey]) ? saved[fieldKey] : defaults[fieldKey]
      return [key, next]
    }),
  ),
})

// Thresholds are inclusive: a value exactly at the limit does not flag.
// `fair` is the P/E the row is valued at (an override's when present);
// tradeValue is undefined on a month-end price.
export const computeFlags = (row, { price, tradeValue, fair }, flags) => {
  const general = row.statement === 'general'
  const on = (key) => flags[key]?.enabled === true
  const result = []
  if (on('nonOperating') && general && !(row.nonOpRatio !== null && row.nonOpRatio <= flags.nonOperating.max)) {
    result.push('nonOperating')
  }
  if (on('unstableProfit') && row.profitQuarters < flags.unstableProfit.minProfitQuarters) {
    result.push('unstableProfit')
  }
  if (on('epsSpike') && !(row.epsGrowth !== null && row.epsGrowth <= flags.epsSpike.maxGrowth)) {
    result.push('epsSpike')
  }
  if (on('coreNotCheap') && general && row.coreEps !== null && (row.coreEps <= 0 || price >= round(row.coreEps * fair, 6))) {
    result.push('coreNotCheap')
  }
  if (on('fewPeSamples') && (row.bands?.sampleSize ?? 0) < flags.fewPeSamples.minSamples) {
    result.push('fewPeSamples')
  }
  if (on('shareChange') && row.shareRatio !== null && round(Math.abs(row.shareRatio - 1), 6) > flags.shareChange.maxDeviation) {
    result.push('shareChange')
  }
  if (on('construction') && row.industry === CONSTRUCTION_INDUSTRY) {
    result.push('construction')
  }
  if (on('lowTurnover') && Number.isFinite(tradeValue) && tradeValue < flags.lowTurnover.minTradeValue) {
    result.push('lowTurnover')
  }
  return result
}

const byDistance = (a, b) => a.distanceToFair - b.distanceToFair

export const screenStocks = ({ rows, quotes = {}, settings, basis, overrides = {}, owned = new Set(), watched = new Set() }) => {
  const industries = new Set(settings.industries)
  const below = []
  const fairLow = []
  const flagged = []
  for (const row of rows) {
    if (industries.size > 0 && !industries.has(row.industry)) continue
    const override = overrides[row.code]?.[basis]
    const eps = override ? override.eps : row.eps?.[basis] ?? null
    const bands = override ? override.bands : row.bands
    const quote = quotes[row.code]
    const daily = Number.isFinite(quote?.price) && quote.price > 0
    const price = daily ? quote.price : row.fallbackClose
    const valuation = computeValuation({ eps, bands, price })
    if (valuation.status !== 'ok' || (valuation.zone !== 'below' && valuation.zone !== 'fair-low')) continue
    const item = {
      code: row.code,
      name: row.name,
      industry: row.industry,
      industryName: industryName(row.industry),
      price,
      priceSource: daily ? 'daily' : 'month-end',
      fallbackMonth: daily ? null : row.fallbackMonth,
      eps,
      prices: valuation.prices,
      zone: valuation.zone,
      distanceToFair: valuation.distanceToFair,
      flags: computeFlags(row, { price, tradeValue: daily ? quote.tradeValue : undefined, fair: bands.fair }, settings.flags),
      custom: Boolean(override?.custom),
      owned: owned.has(row.code),
      watched: watched.has(row.code),
    }
    if (item.flags.length > 0 && !item.owned && !item.watched) flagged.push(item)
    else if (item.zone === 'below') below.push(item)
    else fairLow.push(item)
  }
  below.sort(byDistance)
  fairLow.sort(byDistance)
  flagged.sort(byDistance)
  return { below, fairLow, flagged, counts: { listed: below.length + fairLow.length, flagged: flagged.length } }
}

// ── Valuation overrides (細節頁的自訂假設) ────────────────────────────────

export const hasCustomValuation = (settings) =>
  VALUATION_SETTING_FIELDS.some((field) => Number.isFinite(settings?.[field])) ||
  Object.values(settings?.model?.global ?? {}).some(Number.isFinite) ||
  Object.keys(settings?.model?.quarters ?? {}).length > 0

const pickBasis = (model) => ({
  eps: Number.isFinite(model.chosen?.eps) ? model.chosen.eps : null,
  bands: {
    cheap: model.bands?.cheap ?? null,
    fair: model.bands?.fair ?? null,
    expensive: model.bands?.expensive ?? null,
  },
})

// Both models are built from the same fundamentals and basis, with and
// without the user's settings, so 自訂 means the settings change this
// basis's result — not that the data moved since the build.
export const toOverride = (customModel, autoModel) => {
  const mine = pickBasis(customModel)
  const auto = pickBasis(autoModel)
  const custom = mine.eps !== auto.eps || ['cheap', 'fair', 'expensive'].some((key) => mine.bands[key] !== auto.bands[key])
  return { ...mine, custom }
}

// ── Display ─────────────────────────────────────────────────────────────

export const formatDistance = (distance) => {
  const percent = Math.round(distance * 100)
  return `距合理價 ${percent < 0 ? '−' : ''}${Math.abs(percent)}%`
}

export const monthEndLabel = (month) => `${Number(month.slice(5))} 月底價`

export const describeRowMeta = (item) => [
  ...(item.owned ? ['持有'] : []),
  ...(item.watched ? ['觀察'] : []),
  ...(item.custom ? ['自訂'] : []),
  ...(item.priceSource === 'month-end' && item.fallbackMonth ? [monthEndLabel(item.fallbackMonth)] : []),
  ...item.flags.map((key) => FLAG_DEFINITIONS[key].label),
]

// MI_INDEX date (YYYYMMDD) → MM/DD.
export const formatQuotesDate = (date) => (date ? `${date.slice(4, 6)}/${date.slice(6, 8)}` : null)

export const industrySummary = (codes) => {
  if (!codes?.length) return '全部產業'
  const first = industryName(codes[0])
  return codes.length === 1 ? first : `${first} 等 ${codes.length} 類`
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/utils/stockScreen.test.js src/utils/stockScreen.build.test.js && npx eslint src/utils/stockScreen.js`
Expected: PASS、lint 無錯

- [ ] **Step 5: Commit**

```bash
git add src/utils/stockScreen.js src/utils/stockScreen.test.js
git commit -m "feat(screen): screen rows with live prices, flags and settings"
```

---

### Task 5: 資料管線（公司基本資料 + `screen.json`）

**Files:**
- Modify: `src/utils/twFundamentalsMerge.js`（新增 `parseCompanyProfileRows`）
- Test: `src/utils/twFundamentalsMerge.test.js`（附加）
- Modify: `scripts/lib/twse.mjs`、`scripts/update-tw-fundamentals.mjs`、`scripts/split-tw-fundamentals.mjs`、`.github/workflows/update-tw-fundamentals.yml`
- Create (data): `data/twse/company_profile.json`

**Interfaces:**
- Consumes: Task 3 `buildScreenFile`
- Produces: `parseCompanyProfileRows(rows) → { [code]: { industry, sharesIssued } }`（依代碼排序）；`PROFILE_PATH = 'data/twse/company_profile.json'`；`updateCompanyProfile()`；`public/data/tw/screen.json`

- [ ] **Step 1: Write the failing test**

附加到 `src/utils/twFundamentalsMerge.test.js`（在檔頂 import 加上 `parseCompanyProfileRows`）：

```js
describe('parseCompanyProfileRows', () => {
  it('keeps 產業別 and issued shares by company code, sorted', () => {
    const rows = [
      { 公司代號: '2330', 產業別: '24', '已發行普通股數或TDR原股發行股數': '25,932,070,992' },
      { 公司代號: '1101 ', 產業別: '01', '已發行普通股數或TDR原股發行股數': '' },
      { 公司代號: '', 產業別: '24' },
      { 公司代號: '9999', 產業別: '' },
    ]
    const companies = parseCompanyProfileRows(rows)
    expect(Object.keys(companies)).toEqual(['1101', '2330'])
    expect(companies['2330']).toEqual({ industry: '24', sharesIssued: 25932070992 })
    expect(companies['1101']).toEqual({ industry: '01', sharesIssued: null })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/twFundamentalsMerge.test.js -t parseCompanyProfileRows`
Expected: FAIL

- [ ] **Step 3: Implement**

`src/utils/twFundamentalsMerge.js` 附加：

```js
// t187ap03_L (上市公司基本資料) → { code: { industry, sharesIssued } } for
// the screener, sorted by code so an unchanged day writes identical JSON.
export const parseCompanyProfileRows = (rows) => {
  const entries = []
  for (const row of rows ?? []) {
    const code = String(row['公司代號'] ?? '').trim()
    const industry = String(row['產業別'] ?? '').trim()
    if (!code || !industry) continue
    const shares = parseTwNumber(row['已發行普通股數或TDR原股發行股數'])
    entries.push([code, { industry, sharesIssued: shares > 0 ? shares : null }])
  }
  return Object.fromEntries(entries.sort(([a], [b]) => (a < b ? -1 : 1)))
}
```

`scripts/lib/twse.mjs`：import 加 `parseCompanyProfileRows`，常數區加 `export const PROFILE_PATH = 'data/twse/company_profile.json'`，檔尾加：

```js
// 產業別 and issued shares for the screener: a snapshot, rewritten whole.
// A failure keeps the old file so the day's other updates still commit.
export const updateCompanyProfile = async () => {
  try {
    const companies = parseCompanyProfileRows(await fetchJson('https://openapi.twse.com.tw/v1/opendata/t187ap03_L'))
    if (Object.keys(companies).length === 0) throw new Error('t187ap03_L returned no rows')
    const previous = await readJson(PROFILE_PATH, null)
    if (JSON.stringify(previous?.companies) === JSON.stringify(companies)) {
      console.log('Profile: unchanged')
      return
    }
    await writeJson(PROFILE_PATH, { updatedAt: new Date().toISOString(), companies })
    console.log(`Profile: ${Object.keys(companies).length} companies`)
  } catch (error) {
    console.warn(`::warning::Company profile update failed: ${error.message}`)
  }
}
```

`scripts/update-tw-fundamentals.mjs`：import 清單加 `updateCompanyProfile`，檔尾加：

```js

await updateCompanyProfile()
```

`scripts/split-tw-fundamentals.mjs` 改為：

```js
// Runs before `vite` / `vite build`: splits the market-wide snapshots in
// data/twse/ into public/data/tw/{code}.json (gitignored), plus the
// screener's screen.json.
import { rm } from 'node:fs/promises'
import { buildScreenFile } from '../src/utils/stockScreen.js'
import { buildCompanyFiles } from '../src/utils/twFundamentalsMerge.js'
import { EPS_PATH, PE_PATH, PROFILE_PATH, REVENUE_PATH, readJson, writeJson } from './lib/twse.mjs'

const OUT_DIR = 'public/data/tw'

const [eps, pe, revenue, profiles] = await Promise.all([
  readJson(EPS_PATH, null),
  readJson(PE_PATH, null),
  readJson(REVENUE_PATH, null),
  readJson(PROFILE_PATH, null),
])
if (!eps) throw new Error(`${EPS_PATH} not found`)

const files = buildCompanyFiles({ eps, pe, revenue })
await rm(OUT_DIR, { recursive: true, force: true })
await Promise.all(Object.entries(files).map(([code, file]) => writeJson(`${OUT_DIR}/${code}.json`, file)))
console.log(`Split TW fundamentals: ${Object.keys(files).length} companies → ${OUT_DIR}`)

// Projections are dated by the build (Taipei time); deploys run every weekday.
const todayIso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date())
const screen = buildScreenFile({ files, profiles, todayIso, generatedAt: new Date().toISOString() })
await writeJson(`${OUT_DIR}/screen.json`, screen)
console.log(`Screen: ${screen.rows.length} rows${profiles ? '' : ' (no company profile)'}`)
```

`.github/workflows/update-tw-fundamentals.yml` 的 `FILES=` 改為：

```yaml
          FILES="data/twse/eps_history.json data/twse/pe_history.json data/twse/monthly_revenue.json data/twse/company_profile.json"
```

- [ ] **Step 4: Generate data and verify**

Run:
```bash
npx vitest run src/utils/twFundamentalsMerge.test.js
node -e "import('./scripts/lib/twse.mjs').then((m) => m.updateCompanyProfile())"
node scripts/split-tw-fundamentals.mjs
node -e "const s=require('./public/data/tw/screen.json');const r=s.rows.find(x=>x.code==='6669');console.log(s.rows.length, r.industry, r.shareRatio);console.log((require('fs').statSync('public/data/tw/screen.json').size/1024).toFixed(0)+' KB')"
```
Expected: 測試 PASS；`Profile: 10xx companies`；`Screen: 10xx rows`；`6669` 印出 industry `25`、`shareRatio` ≈ 3；檔案大小 < 400 KB。

- [ ] **Step 5: Commit**

```bash
git add src/utils/twFundamentalsMerge.js src/utils/twFundamentalsMerge.test.js scripts/lib/twse.mjs scripts/update-tw-fundamentals.mjs scripts/split-tw-fundamentals.mjs .github/workflows/update-tw-fundamentals.yml data/twse/company_profile.json
git commit -m "feat(screen): company profile snapshot and screen.json"
```

---

### Task 6: 設定的儲存與同步

**Files:**
- Modify: `src/services/firebase/firestoreMappers.js`（`appConfigToRemote`、`remoteToAppConfig`）
- Test: `src/services/firebase/firestoreMappers.test.js`（附加）
- Modify: `src/services/portfolioService.js`（在 `saveValuationSettings` 之後）
- Test: `src/services/portfolioService.screen.test.js` (new)

**Interfaces:**
- Consumes: Task 4 `normalizeScreenSettings`
- Produces: `getScreenSettings() → Promise<Settings>`；`saveScreenSettings(settings) → Promise<Settings>`（需可寫入雲端，否則丟 `ensureCloudWritable` 的錯）；`listValuationOverrideSymbols(market) → Promise<string[]>`；app_config 文件欄位 `screen`

- [ ] **Step 1: Write the failing tests**

`firestoreMappers.test.js` 附加（import 若尚未有 `appConfigToRemote`、`remoteToAppConfig` 就加上）：

```js
describe('app_config screen settings', () => {
  it('round-trips the screen map', () => {
    const screen = { version: 1, industries: ['24'], flags: { nonOperating: { enabled: true, max: 0.3 } } }
    const remote = appConfigToRemote({ key: 'stock_screen:settings', screen, updatedAt: '2026-10-15T00:00:00.000Z' })
    expect(remote.screen).toEqual(screen)
    expect(remoteToAppConfig(remote).screen).toEqual(screen)
    expect(appConfigToRemote({ key: 'x', updatedAt: 't' })).not.toHaveProperty('screen')
  })
})
```

`src/services/portfolioService.screen.test.js`：

```js
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('./firebase/cloudSyncService', async (importOriginal) => ({
  ...(await importOriginal()),
  assertCloudWriteReady: vi.fn(),
  writeCollectionRecord: vi.fn(),
}))

import { db } from '../db/database'
import { writeCollectionRecord } from './firebase/cloudSyncService'
import { getScreenSettings, listValuationOverrideSymbols, saveScreenSettings, saveValuationSettings } from './portfolioService'
import { DEFAULT_SCREEN_SETTINGS } from '../utils/stockScreen'

let clock = Date.parse('2026-10-15T00:00:00.000Z')
const tick = () => {
  clock += 1000
  vi.setSystemTime(clock)
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  await db.app_config.clear()
  writeCollectionRecord.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('screen settings', () => {
  it('reads the defaults when nothing is stored', async () => {
    expect(await getScreenSettings()).toEqual(DEFAULT_SCREEN_SETTINGS)
  })

  it('saves normalized settings, mirrors them and reads them back', async () => {
    tick()
    await saveScreenSettings({ industries: ['24'], flags: { epsSpike: { enabled: false, maxGrowth: -3 } } })
    expect(writeCollectionRecord.mock.calls[0][0]).toMatchObject({
      collectionName: 'app_config',
      record: { key: 'stock_screen:settings', screen: { industries: ['24'] } },
    })
    const stored = await getScreenSettings()
    expect(stored.industries).toEqual(['24'])
    expect(stored.flags.epsSpike).toEqual({ enabled: false, maxGrowth: 2 })
  })

  it('lists stocks with valuation overrides for a market', async () => {
    tick()
    await saveValuationSettings({ market: 'TW', symbol: '2330', patch: { peFair: 18 } })
    tick()
    await saveValuationSettings({ market: 'US', symbol: 'AAPL', patch: { peFair: 30 } })
    expect(await listValuationOverrideSymbols('TW')).toEqual(['2330'])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/services/firebase/firestoreMappers.test.js src/services/portfolioService.screen.test.js`
Expected: FAIL

- [ ] **Step 3: Implement**

`firestoreMappers.js` — `appConfigToRemote` 在 `valuation` 那段後加：

```js
  ...(config.screen && typeof config.screen === 'object'
    ? { screen: config.screen }
    : {}),
```

`remoteToAppConfig` 在 `valuation:` 後加：

```js
  screen:
    data.screen && typeof data.screen === 'object' ? data.screen : undefined,
```

`portfolioService.js`：import 區加 `import { normalizeScreenSettings } from "../utils/stockScreen";`，在 `saveValuationSettings` 函式之後加：

```js
// 低估候選 thresholds and industry choice, synced like other settings.
const SCREEN_SETTINGS_KEY = "stock_screen:settings";

export const getScreenSettings = async () => {
  const config = await db.app_config.get(SCREEN_SETTINGS_KEY);
  return normalizeScreenSettings(config && !config.deletedAt ? config.screen : null);
};

export const saveScreenSettings = async (settings) => {
  ensureCloudWritable();
  const next = normalizeScreenSettings(settings);
  await mirrorToCloud(CLOUD_COLLECTION.APP_CONFIG, {
    key: SCREEN_SETTINGS_KEY,
    screen: next,
    updatedAt: getNowIso(),
    deletedAt: null,
    syncState: SYNC_PENDING,
  });
  return next;
};

// Symbols with a saved valuation override; the screener recomputes these.
export const listValuationOverrideSymbols = async (market) => {
  const prefix = `${valuationConfigKey(market, "")}`;
  const configs = await db.app_config.toArray();
  return configs
    .filter((config) => !config.deletedAt && config.key?.startsWith(prefix))
    .map((config) => config.key.slice(prefix.length));
};
```

- [ ] **Step 4: Run tests**

Run: `npm test && npx eslint src/services/portfolioService.js src/services/firebase/firestoreMappers.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/firebase/firestoreMappers.js src/services/firebase/firestoreMappers.test.js src/services/portfolioService.js src/services/portfolioService.screen.test.js
git commit -m "feat(screen): store screen settings in app_config"
```

---

### Task 7: `useStockScreen` hook

**Files:**
- Create: `src/hooks/useStockScreen.js`
- Test: `src/hooks/useStockScreen.test.jsx`

**Interfaces:**
- Consumes: Task 2 `getTwseDailyQuotes`；Task 4 `screenStocks`、`normalizeScreenSettings`、`DEFAULT_SCREEN_SETTINGS`、`hasCustomValuation`、`toOverride`；Task 6 service functions；`loadStockFundamentals`；`buildValuationModel`
- Produces: `useStockScreen({ enabled, active, canWrite, owned, watched }) → { status:'idle'|'ready'|'missing'|'error', basis, setBasis, settings, saveSettings(next)→Promise, setIndustries(codes), result|null, quotesDate, quotesFailed }`；`SCREEN_QUOTES_INTERVAL_MS`

- [ ] **Step 1: Write the failing test**

```jsx
// src/hooks/useStockScreen.test.jsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'

vi.mock('../services/portfolioService', () => ({
  getScreenSettings: vi.fn(),
  saveScreenSettings: vi.fn(),
  getValuationSettings: vi.fn(),
  listValuationOverrideSymbols: vi.fn(),
}))
vi.mock('../services/priceProviders/twseDailyProvider', () => ({ getTwseDailyQuotes: vi.fn() }))
vi.mock('../services/fundamentalsProviders', () => ({ loadStockFundamentals: vi.fn() }))

import {
  getScreenSettings,
  getValuationSettings,
  listValuationOverrideSymbols,
  saveScreenSettings,
} from '../services/portfolioService'
import { getTwseDailyQuotes } from '../services/priceProviders/twseDailyProvider'
import { loadStockFundamentals } from '../services/fundamentalsProviders'
import { DEFAULT_SCREEN_SETTINGS } from '../utils/stockScreen'
import { EMPTY_VALUATION_SETTINGS } from '../utils/valuation'
import { TW_FUNDAMENTALS } from '../utils/incomeModel.fixture'
import useStockScreen from './useStockScreen'

const ROW = {
  code: '1234',
  name: '測試',
  industry: '24',
  statement: 'general',
  eps: { ttm: 10, ttmAfterNext: null, thisYear: null, nextYear: null },
  bands: { cheap: 10, fair: 15, expensive: 20, sampleSize: 60 },
  nonOpRatio: 0.05,
  profitQuarters: 8,
  epsGrowth: 1.2,
  coreEps: 10,
  shareRatio: 1,
  fallbackClose: 95,
  fallbackMonth: '2026-08',
}
const jsonResponse = (body) => ({ ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }), json: async () => body })
const htmlResponse = () => ({ ok: true, status: 200, headers: new Headers({ 'content-type': 'text/html' }), json: async () => ({}) })
const props = { enabled: true, active: true, canWrite: true, owned: new Set(), watched: new Set() }

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ rows: [ROW] })))
  vi.mocked(getScreenSettings).mockResolvedValue(DEFAULT_SCREEN_SETTINGS)
  vi.mocked(saveScreenSettings).mockImplementation(async (next) => next)
  vi.mocked(listValuationOverrideSymbols).mockResolvedValue([])
  vi.mocked(getValuationSettings).mockResolvedValue(EMPTY_VALUATION_SETTINGS)
  vi.mocked(getTwseDailyQuotes).mockResolvedValue({ date: '20261014', quotes: { 1234: { price: 90, tradeValue: 5e7 } } })
  vi.mocked(loadStockFundamentals).mockResolvedValue(TW_FUNDAMENTALS)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useStockScreen', () => {
  it('screens the rows with the daily quotes', async () => {
    const { result } = renderHook(() => useStockScreen(props))
    await waitFor(() => expect(result.current.result?.below[0]?.priceSource).toBe('daily'))
    expect(result.current.status).toBe('ready')
    expect(result.current.quotesDate).toBe('20261014')
    expect(result.current.result.below[0]).toMatchObject({ code: '1234', price: 90 })
  })

  it('reports a missing screen.json (dev server answers with HTML)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => htmlResponse()))
    const { result } = renderHook(() => useStockScreen(props))
    await waitFor(() => expect(result.current.status).toBe('missing'))
    expect(result.current.result).toBeNull()
  })

  it('falls back to month-end prices when the quotes fail', async () => {
    vi.mocked(getTwseDailyQuotes).mockRejectedValue(new Error('down'))
    const { result } = renderHook(() => useStockScreen(props))
    await waitFor(() => expect(result.current.quotesFailed).toBe(true))
    expect(result.current.result.below[0]).toMatchObject({ price: 95, priceSource: 'month-end' })
  })

  it('fetches quotes once per interval while active', async () => {
    const { result, rerender } = renderHook((p) => useStockScreen(p), { initialProps: props })
    await waitFor(() => expect(result.current.quotesDate).toBe('20261014'))
    rerender({ ...props, active: false })
    rerender({ ...props, active: true })
    expect(getTwseDailyQuotes).toHaveBeenCalledTimes(1)
  })

  it('applies a stock’s own valuation settings', async () => {
    vi.mocked(listValuationOverrideSymbols).mockResolvedValue(['1234'])
    vi.mocked(getValuationSettings).mockResolvedValue({ ...EMPTY_VALUATION_SETTINGS, peCheap: 1, peFair: 2, peExpensive: 3 })
    const { result } = renderHook(() => useStockScreen(props))
    // TTM EPS 10.72 × P/E 2 = 合理價 21.44 < 90 → no longer listed.
    await waitFor(() => expect(result.current.result?.counts.listed).toBe(0))
  })

  it('keeps an industry choice locally when it cannot write', async () => {
    const { result } = renderHook(() => useStockScreen({ ...props, canWrite: false }))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    act(() => result.current.setIndustries(['14']))
    expect(result.current.settings.industries).toEqual(['14'])
    expect(result.current.result.counts.listed).toBe(0)
    expect(saveScreenSettings).not.toHaveBeenCalled()
  })

  it('does nothing while disabled', () => {
    renderHook(() => useStockScreen({ ...props, enabled: false }))
    expect(fetch).not.toHaveBeenCalled()
    expect(getTwseDailyQuotes).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/useStockScreen.test.jsx`
Expected: FAIL（找不到 `./useStockScreen`）

- [ ] **Step 3: Implement**

```js
// src/hooks/useStockScreen.js
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dayjs from 'dayjs'
import { CLOUD_SYNC_UPDATED_EVENT } from '../services/firebase/cloudSyncService'
import { loadStockFundamentals } from '../services/fundamentalsProviders'
import {
  getScreenSettings,
  getValuationSettings,
  listValuationOverrideSymbols,
  saveScreenSettings,
} from '../services/portfolioService'
import { getTwseDailyQuotes } from '../services/priceProviders/twseDailyProvider'
import {
  DEFAULT_SCREEN_SETTINGS,
  hasCustomValuation,
  normalizeScreenSettings,
  screenStocks,
  toOverride,
} from '../utils/stockScreen'
import { buildValuationModel } from '../utils/valuation'

export const SCREEN_QUOTES_INTERVAL_MS = 10 * 60 * 1000

// GitHub Pages answers a missing file with 404; the Vite dev server answers
// with index.html, so anything that is not JSON also means "not built".
const loadScreenFile = async () => {
  const response = await fetch(`${import.meta.env.BASE_URL}data/tw/screen.json`)
  const isJson = (response.headers.get('content-type') ?? '').includes('json')
  if (response.status === 404 || (response.ok && !isJson)) return null
  if (!response.ok) throw new Error(`無法載入篩選資料（HTTP ${response.status}）`)
  return response.json()
}

// The stocks whose detail-sheet settings change this basis: their own
// eps / bands, keyed by code then basis.
const loadOverrides = async (codes, basis) => {
  const todayIso = dayjs().format('YYYY-MM-DD')
  const overrides = {}
  for (const symbol of await listValuationOverrideSymbols('TW')) {
    if (!codes.has(symbol)) continue
    try {
      const settings = await getValuationSettings({ market: 'TW', symbol })
      if (!hasCustomValuation(settings)) continue
      const fundamentals = await loadStockFundamentals('TW', symbol, { todayIso })
      if (!fundamentals) continue
      const build = (nextSettings) =>
        buildValuationModel({ fundamentals, settings: nextSettings, price: null, basis, todayIso })
      overrides[symbol] = { [basis]: toOverride(build(settings), build(null)) }
    } catch (error) {
      console.warn(`[stockScreen] override ${symbol} failed`, error)
    }
  }
  return overrides
}

// 研究 › 低估候選: screen.json, today's TWSE closes (once per interval while
// the tab is active), the thresholds (reloaded on cloud sync) and the
// user's per-stock valuation settings, screened for the chosen basis.
export default function useStockScreen({ enabled, active, canWrite, owned, watched }) {
  const [file, setFile] = useState({ status: 'idle', rows: [] })
  const [quotes, setQuotes] = useState({ quotes: {}, date: null, failed: false })
  const [settings, setSettings] = useState(DEFAULT_SCREEN_SETTINGS)
  const [basis, setBasis] = useState('ttm')
  const [overrides, setOverrides] = useState({})
  const [syncVersion, setSyncVersion] = useState(0)
  const lastQuotesAtRef = useRef(0)

  useEffect(() => {
    if (!enabled) return undefined
    let cancelled = false
    loadScreenFile()
      .then((screen) => {
        if (cancelled) return
        setFile(screen ? { status: 'ready', rows: screen.rows ?? [] } : { status: 'missing', rows: [] })
      })
      .catch((error) => {
        console.warn('[stockScreen] screen.json failed', error)
        if (!cancelled) setFile({ status: 'error', rows: [] })
      })
    return () => {
      cancelled = true
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) return undefined
    let cancelled = false
    // Reloading the settings also re-reads the valuation overrides, which
    // sync the same way.
    const load = () => {
      getScreenSettings().then((next) => {
        if (cancelled) return
        setSettings(next)
        setSyncVersion((version) => version + 1)
      })
    }
    load()
    window.addEventListener(CLOUD_SYNC_UPDATED_EVENT, load)
    return () => {
      cancelled = true
      window.removeEventListener(CLOUD_SYNC_UPDATED_EVENT, load)
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled || !active || file.status !== 'ready') return
    if (Date.now() - lastQuotesAtRef.current < SCREEN_QUOTES_INTERVAL_MS) return
    lastQuotesAtRef.current = Date.now()
    getTwseDailyQuotes()
      .then(({ date, quotes: next }) => setQuotes({ quotes: next, date, failed: false }))
      .catch((error) => {
        console.warn('[stockScreen] quotes failed', error)
        setQuotes((current) => ({ ...current, failed: true }))
      })
  }, [enabled, active, file.status])

  useEffect(() => {
    if (file.status !== 'ready') return undefined
    let cancelled = false
    loadOverrides(new Set(file.rows.map((row) => row.code)), basis).then((next) => {
      if (!cancelled) setOverrides(next)
    })
    return () => {
      cancelled = true
    }
  }, [file, basis, syncVersion])

  const saveSettings = useCallback(async (next) => {
    const saved = await saveScreenSettings(next)
    setSettings(saved)
    return saved
  }, [])

  // Applies at once; saved (and synced) only when signed in.
  const setIndustries = useCallback(
    (industries) => {
      const next = normalizeScreenSettings({ ...settings, industries })
      setSettings(next)
      if (canWrite) {
        saveScreenSettings(next).catch((error) => console.warn('[stockScreen] save industries failed', error))
      }
    },
    [settings, canWrite],
  )

  const result = useMemo(
    () =>
      file.status === 'ready'
        ? screenStocks({ rows: file.rows, quotes: quotes.quotes, settings, basis, overrides, owned, watched })
        : null,
    [file, quotes.quotes, settings, basis, overrides, owned, watched],
  )

  return {
    status: file.status,
    basis,
    setBasis,
    settings,
    saveSettings,
    setIndustries,
    result,
    quotesDate: quotes.date,
    quotesFailed: quotes.failed,
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/hooks/useStockScreen.test.jsx && npx eslint src/hooks/useStockScreen.js`
Expected: PASS。`eslint-plugin-react-hooks` v7 的 `set-state-in-effect` 不允許 effect 內同步 `setState`；上面的寫法只在 promise callback 裡 set，若仍被擋，比照 `useWatchlist.js` 調整（不要加 disable 註解）。`status` 起始為 `'idle'`，UI 把 idle 當載入中。

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useStockScreen.js src/hooks/useStockScreen.test.jsx
git commit -m "feat(screen): useStockScreen hook"
```

---

### Task 8: 研究頁 section 與列表

**Files:**
- Create: `src/components/research/ScreenList.jsx`、`src/components/research/ScreenSection.jsx`
- Test: `src/components/research/ScreenSection.test.jsx`
- Modify: `src/App.css`（`.watchlist-header-end` 規則之後）

**Interfaces:**
- Consumes: Task 4 `SCREEN_BASIS_OPTIONS`、`formatDistance`、`describeRowMeta`、`formatQuotesDate`、`industrySummary`；Task 7 hook 回傳值
- Produces:
  - `ScreenList({ groups: {key,title,rows}[], onOpen(item) })`
  - `ScreenSection({ status, result, basis, onBasisChange, industries, quotesDate, quotesFailed, onOpen(item), onOpenAll(), onOpenSettings(), onOpenIndustries() })`
  - `SCREEN_PREVIEW_ROWS = 5`

- [ ] **Step 1: Write the failing test**

```jsx
// src/components/research/ScreenSection.test.jsx
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import ScreenSection from './ScreenSection'

const item = (code, distance, extra = {}) => ({
  code,
  name: `股${code}`,
  industryName: '半導體',
  price: 90,
  priceSource: 'daily',
  fallbackMonth: null,
  distanceToFair: distance,
  zone: 'below',
  flags: [],
  custom: false,
  owned: false,
  watched: false,
  ...extra,
})
const result = {
  below: Array.from({ length: 7 }, (_, index) => item(String(1000 + index), -0.5 + index * 0.01)),
  fairLow: [item('2000', -0.1, { zone: 'fair-low', owned: true, priceSource: 'month-end', fallbackMonth: '2026-08' })],
  flagged: [item('3000', -0.6, { flags: ['construction'] })],
  counts: { listed: 8, flagged: 1 },
}
const handlers = () => ({
  onBasisChange: vi.fn(),
  onOpen: vi.fn(),
  onOpenAll: vi.fn(),
  onOpenSettings: vi.fn(),
  onOpenIndustries: vi.fn(),
})
const renderSection = (props = {}) => {
  const h = handlers()
  render(
    <ScreenSection
      status="ready"
      result={result}
      basis="ttm"
      industries={[]}
      quotesDate="20261014"
      quotesFailed={false}
      {...h}
      {...props}
    />,
  )
  return h
}

describe('ScreenSection', () => {
  it('previews five rows per group and links to the full list', () => {
    const h = renderSection()
    expect(screen.getByText('低估候選')).toBeInTheDocument()
    expect(screen.getByText('低於便宜價')).toBeInTheDocument()
    expect(screen.getByText('7 檔')).toBeInTheDocument()
    expect(screen.getByText('股1004')).toBeInTheDocument()
    expect(screen.queryByText('股1005')).not.toBeInTheDocument()
    expect(screen.getByText('1000 · 半導體')).toBeInTheDocument()
    expect(screen.getByText('距合理價 −50%')).toBeInTheDocument()
    expect(screen.getByText('2000 · 半導體 · 持有 · 8 月底價')).toBeInTheDocument()
    expect(screen.getByText('10/14 收盤')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '查看全部 8 檔 · 另有 1 檔被標記' }))
    expect(h.onOpenAll).toHaveBeenCalled()
  })

  it('switches basis, opens industries, settings and a stock', () => {
    const h = renderSection()
    fireEvent.click(screen.getByRole('button', { name: '今年' }))
    expect(h.onBasisChange).toHaveBeenCalledWith('thisYear')
    fireEvent.click(screen.getByRole('button', { name: '全部產業' }))
    expect(h.onOpenIndustries).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '篩選門檻' }))
    expect(h.onOpenSettings).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '股1000 1000，查看個股' }))
    expect(h.onOpen).toHaveBeenCalledWith(result.below[0])
  })

  it('says when the data has not been built', () => {
    renderSection({ status: 'missing', result: null })
    expect(screen.getByText('篩選資料尚未產生')).toBeInTheDocument()
  })

  it('says when nothing is below 合理價, noting an industry filter', () => {
    renderSection({ result: { below: [], fairLow: [], flagged: [], counts: { listed: 0, flagged: 0 } }, industries: ['24'] })
    expect(screen.getByText('目前沒有低於合理價的股票（已篩選產業）')).toBeInTheDocument()
  })

  it('shows a failed price update', () => {
    renderSection({ quotesFailed: true })
    expect(screen.getByText('價格更新失敗，使用月底價')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/research/ScreenSection.test.jsx`
Expected: FAIL

- [ ] **Step 3: Implement**

```jsx
// src/components/research/ScreenList.jsx
import MobileSwipeRow from "../MobileSwipeRow";
import { formatPrice } from "../../utils/formatters";
import { describeRowMeta, formatDistance } from "../../utils/stockScreen";

// 低估候選 rows under group titles; shared by the section and the sheet.
// Under-valued is not a price move, so no up / down colours.
function ScreenList({ groups, onOpen }) {
  return groups
    .filter((group) => group.rows.length > 0)
    .map((group) => (
      <div key={group.key} className="screen-group">
        <div className="screen-group-head">
          <span>{group.title}</span>
          <span className="screen-group-count">{group.count ?? `${group.rows.length} 檔`}</span>
        </div>
        {group.rows.map((item) => (
          <MobileSwipeRow
            key={item.code}
            onTap={() => onOpen(item)}
            label={`${item.name} ${item.code}，查看個股`}
            main={
              <div className="watchlist-row-main">
                <span className="watchlist-row-name">{item.name}</span>
                <span className="watchlist-row-symbol">
                  {[`${item.code}`, item.industryName, ...describeRowMeta(item)].join(" · ")}
                </span>
              </div>
            }
            side={
              <div className="watchlist-row-price">
                <div className="watchlist-row-price-main">{formatPrice(item.price, "TWD")}</div>
                <div className="screen-row-distance">{formatDistance(item.distanceToFair)}</div>
              </div>
            }
          />
        ))}
      </div>
    ));
}

export default ScreenList;
```

```jsx
// src/components/research/ScreenSection.jsx
import { Button, Skeleton, Typography } from "antd";
import { Settings } from "iconoir-react";
import ScreenList from "./ScreenList";
import { SCREEN_BASIS_OPTIONS, formatQuotesDate, industrySummary } from "../../utils/stockScreen";

const { Text } = Typography;

export const SCREEN_PREVIEW_ROWS = 5;

const updatedTextOf = ({ quotesFailed, quotesDate }) => {
  if (quotesFailed) return "價格更新失敗，使用月底價";
  return quotesDate ? `${formatQuotesDate(quotesDate)} 收盤` : null;
};

// 研究 tab's 低估候選: listed stocks below 合理價 for the chosen EPS basis,
// a few rows per group; the rest (and flagged stocks) in the full sheet.
function ScreenSection({
  status,
  result,
  basis,
  onBasisChange,
  industries,
  quotesDate,
  quotesFailed,
  onOpen,
  onOpenAll,
  onOpenSettings,
  onOpenIndustries,
}) {
  const updatedText = updatedTextOf({ quotesFailed, quotesDate });

  let body;
  if (status === "missing" || status === "error") {
    body = <p className="screen-message">{status === "missing" ? "篩選資料尚未產生" : "篩選資料載入失敗"}</p>;
  } else if (!result) {
    body = <Skeleton active paragraph={{ rows: 4 }} />;
  } else if (result.counts.listed === 0 && result.counts.flagged === 0) {
    body = (
      <p className="screen-message">
        {`目前沒有低於合理價的股票${industries.length > 0 ? "（已篩選產業）" : ""}`}
      </p>
    );
  } else {
    const footer = [
      `查看全部 ${result.counts.listed} 檔`,
      ...(result.counts.flagged > 0 ? [`另有 ${result.counts.flagged} 檔被標記`] : []),
    ].join(" · ");
    body = (
      <>
        <ScreenList
          groups={[
            { key: "below", title: "低於便宜價", count: `${result.below.length} 檔`, rows: result.below.slice(0, SCREEN_PREVIEW_ROWS) },
            { key: "fairLow", title: "合理偏低", count: `${result.fairLow.length} 檔`, rows: result.fairLow.slice(0, SCREEN_PREVIEW_ROWS) },
          ]}
          onOpen={onOpen}
        />
        <div className="price-refresh-footer">
          <button type="button" className="price-refresh-link" onClick={onOpenAll}>
            {footer}
          </button>
        </div>
      </>
    );
  }

  return (
    <section className="mobile-list-section screen-section" aria-label="低估候選">
      <div className="mobile-list-header">
        <span className="mobile-list-title">低估候選</span>
        <span className="watchlist-header-end">
          {updatedText && <Text className="watchlist-updated">{updatedText}</Text>}
          <Button type="text" size="small" icon={<Settings />} aria-label="篩選門檻" onClick={onOpenSettings} />
        </span>
      </div>
      <div className="screen-controls" role="group" aria-label="EPS 基準與產業">
        {SCREEN_BASIS_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`screen-chip${basis === option.value ? " is-active" : ""}`}
            aria-pressed={basis === option.value}
            onClick={() => onBasisChange(option.value)}
          >
            {option.label}
          </button>
        ))}
        <button
          type="button"
          className={`screen-chip${industries.length > 0 ? " is-active" : ""}`}
          onClick={onOpenIndustries}
        >
          {industrySummary(industries)}
        </button>
      </div>
      <p className="screen-note">依歷史本益比估價，便宜可能有原因</p>
      <div className="mobile-list-body">{body}</div>
    </section>
  );
}

export default ScreenSection;
```

`src/App.css` 在 `.watchlist-header-end { … }` 之後加：

```css
/* 研究 › 低估候選: basis / industry chips, then rows grouped by zone. */
.screen-controls {
  display: flex;
  gap: var(--space-2);
  overflow-x: auto;
  padding-bottom: var(--space-1);
  scrollbar-width: none;
}

.screen-chip {
  flex: 0 0 auto;
  min-height: 36px;
  padding: 0 var(--space-3);
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

.screen-chip.is-active {
  border-color: var(--c-action);
  background: var(--c-action);
  color: var(--c-surface);
}

.screen-note,
.screen-message {
  margin: var(--space-2) 0 var(--space-section-head);
  font-size: var(--fs-caption);
  color: var(--c-muted);
}

.screen-message {
  padding: var(--space-row-y) var(--space-row-x);
  font-size: var(--fs-body);
}

.screen-group .mobile-swipe-row {
  min-height: 72px;
  padding-block: var(--space-row-y);
}

.screen-group-head {
  display: flex;
  justify-content: space-between;
  padding: var(--space-2) var(--space-row-x);
  background: var(--c-group-heading);
  font-size: var(--fs-caption);
  font-weight: 600;
  color: var(--c-ink);
}

.screen-group-count,
.screen-row-distance {
  font-size: var(--fs-caption);
  color: var(--c-muted);
}

.watchlist-row-symbol {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

（`--c-group-heading` 是持股分組標題已在用的 token。）

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/components/research/ScreenSection.test.jsx && npx eslint src/components/research/ScreenList.jsx src/components/research/ScreenSection.jsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/research/ScreenList.jsx src/components/research/ScreenSection.jsx src/components/research/ScreenSection.test.jsx src/App.css
git commit -m "feat(screen): 低估候選 section"
```

---

### Task 9: 完整清單、門檻設定、產業篩選 sheets

**Files:**
- Create: `src/components/research/ResearchSheet.jsx`、`ScreenListSheet.jsx`、`ScreenSettingsSheet.jsx`、`ScreenIndustrySheet.jsx`
- Test: `src/components/research/ScreenSheets.test.jsx`
- Modify: `src/App.css`（附加在 Task 8 樣式後）

**Interfaces:**
- Consumes: Task 1 `TW_INDUSTRY_CODES`、`industryName`；Task 4 `FLAG_DEFINITIONS`、`SCREEN_FLAG_KEYS`、`DEFAULT_SCREEN_SETTINGS`；Task 8 `ScreenList`
- Produces:
  - `ResearchSheet({ open, isMobile, title, onClose, footer, children })`
  - `ScreenListSheet({ open, isMobile, result, onClose, onOpen(item) })`
  - `ScreenSettingsSheet({ open, isMobile, settings, disabled, saving, onClose, onSave(next) })`
  - `ScreenIndustrySheet({ open, isMobile, industries, onClose, onChange(codes) })`

- [ ] **Step 1: Write the failing test**

```jsx
// src/components/research/ScreenSheets.test.jsx
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import ScreenListSheet from './ScreenListSheet'
import ScreenSettingsSheet from './ScreenSettingsSheet'
import ScreenIndustrySheet from './ScreenIndustrySheet'
import { DEFAULT_SCREEN_SETTINGS, normalizeScreenSettings } from '../../utils/stockScreen'

const item = (code, extra = {}) => ({
  code, name: `股${code}`, industryName: '半導體', price: 90, priceSource: 'daily', fallbackMonth: null,
  distanceToFair: -0.4, zone: 'below', flags: [], custom: false, owned: false, watched: false, ...extra,
})

describe('ScreenListSheet', () => {
  it('lists every row and folds the flagged ones', () => {
    const result = {
      below: Array.from({ length: 7 }, (_, i) => item(String(1000 + i))),
      fairLow: [],
      flagged: [item('3000', { flags: ['construction'] })],
      counts: { listed: 7, flagged: 1 },
    }
    render(<ScreenListSheet open isMobile result={result} onClose={() => {}} onOpen={vi.fn()} />)
    expect(screen.getByText('股1006')).toBeInTheDocument()
    expect(screen.queryByText('股3000')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '被標記 1 檔' }))
    expect(screen.getByText('3000 · 半導體 · 營建業')).toBeInTheDocument()
  })
})

describe('ScreenSettingsSheet', () => {
  it('edits thresholds in display units and saves stored units', () => {
    const onSave = vi.fn()
    render(
      <ScreenSettingsSheet open isMobile settings={DEFAULT_SCREEN_SETTINGS} disabled={false} saving={false} onClose={() => {}} onSave={onSave} />,
    )
    const percent = screen.getByLabelText('業外占比上限')
    expect(percent).toHaveValue('30')
    fireEvent.change(percent, { target: { value: '40' } })
    fireEvent.change(screen.getByLabelText('最低成交金額'), { target: { value: '500' } })
    fireEvent.click(screen.getByRole('switch', { name: '營建業' }))
    fireEvent.click(screen.getByRole('button', { name: '儲存' }))
    const saved = onSave.mock.calls[0][0]
    expect(saved.flags.nonOperating.max).toBeCloseTo(0.4)
    expect(saved.flags.lowTurnover.minTradeValue).toBe(5_000_000)
    expect(saved.flags.construction.enabled).toBe(false)
  })

  it('falls back to the default for a blank threshold', () => {
    const onSave = vi.fn()
    render(<ScreenSettingsSheet open isMobile settings={DEFAULT_SCREEN_SETTINGS} disabled={false} saving={false} onClose={() => {}} onSave={onSave} />)
    fireEvent.change(screen.getByLabelText('至少月份數'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: '儲存' }))
    expect(onSave.mock.calls[0][0].flags.fewPeSamples.minSamples).toBe(36)
  })

  it('resets to the defaults', () => {
    const onSave = vi.fn()
    const custom = normalizeScreenSettings({ flags: { epsSpike: { enabled: true, maxGrowth: 5 } } })
    render(<ScreenSettingsSheet open isMobile settings={custom} disabled={false} saving={false} onClose={() => {}} onSave={onSave} />)
    fireEvent.click(screen.getByRole('button', { name: '恢復預設' }))
    fireEvent.click(screen.getByRole('button', { name: '儲存' }))
    expect(onSave.mock.calls[0][0].flags.epsSpike.maxGrowth).toBe(2)
  })

  it('is read-only when signed out', () => {
    render(<ScreenSettingsSheet open isMobile settings={DEFAULT_SCREEN_SETTINGS} disabled saving={false} onClose={() => {}} onSave={vi.fn()} />)
    expect(screen.getByText('登入後可修改')).toBeInTheDocument()
    expect(screen.getByLabelText('業外占比上限')).toBeDisabled()
    expect(screen.getByRole('button', { name: '儲存' })).toBeDisabled()
  })
})

describe('ScreenIndustrySheet', () => {
  it('toggles industries and clears back to all', () => {
    const onChange = vi.fn()
    const { rerender } = render(<ScreenIndustrySheet open isMobile industries={[]} onClose={() => {}} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: '半導體' }))
    expect(onChange).toHaveBeenLastCalledWith(['24'])
    rerender(<ScreenIndustrySheet open isMobile industries={['24']} onClose={() => {}} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: '半導體' }))
    expect(onChange).toHaveBeenLastCalledWith([])
    fireEvent.click(screen.getByRole('button', { name: '全部產業' }))
    expect(onChange).toHaveBeenLastCalledWith([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/research/ScreenSheets.test.jsx`
Expected: FAIL

- [ ] **Step 3: Implement**

```jsx
// src/components/research/ResearchSheet.jsx
import { Drawer } from "antd";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";

// 研究 tab's sheets: a bottom sheet on mobile, a right-hand drawer on
// desktop (like StockSheetShell), with an optional fixed footer.
function ResearchSheet({ open, isMobile, title, onClose, footer = null, children }) {
  useBodyScrollLock(Boolean(open) && isMobile);
  return (
    <Drawer
      placement={isMobile ? "bottom" : "right"}
      size={isMobile ? "90vh" : 520}
      title={title}
      open={open}
      onClose={onClose}
      footer={footer}
      destroyOnHidden
      className={isMobile ? "form-bottom-sheet research-sheet" : "research-sheet"}
    >
      {children}
    </Drawer>
  );
}

export default ResearchSheet;
```

```jsx
// src/components/research/ScreenListSheet.jsx
import { useState } from "react";
import ResearchSheet from "./ResearchSheet";
import ScreenList from "./ScreenList";

// Every 低估候選 row; the flagged ones folded at the bottom.
function ScreenListSheet({ open, isMobile, result, onClose, onOpen }) {
  const [showFlagged, setShowFlagged] = useState(false);
  if (!result) return null;
  return (
    <ResearchSheet open={open} isMobile={isMobile} title="低估候選" onClose={onClose}>
      <div className="mobile-list-body">
        <ScreenList
          groups={[
            { key: "below", title: "低於便宜價", rows: result.below },
            { key: "fairLow", title: "合理偏低", rows: result.fairLow },
          ]}
          onOpen={onOpen}
        />
        {result.flagged.length > 0 && (
          <>
            <div className="price-refresh-footer">
              <button
                type="button"
                className="price-refresh-link"
                aria-expanded={showFlagged}
                onClick={() => setShowFlagged((value) => !value)}
              >
                {`被標記 ${result.flagged.length} 檔`}
              </button>
            </div>
            {showFlagged && (
              <ScreenList groups={[{ key: "flagged", title: "被標記", rows: result.flagged }]} onOpen={onOpen} />
            )}
          </>
        )}
      </div>
    </ResearchSheet>
  );
}

export default ScreenListSheet;
```

```jsx
// src/components/research/ScreenSettingsSheet.jsx
import { useState } from "react";
import { Button, Input, Switch } from "antd";
import ResearchSheet from "./ResearchSheet";
import {
  DEFAULT_SCREEN_SETTINGS,
  FLAG_DEFINITIONS,
  SCREEN_FLAG_KEYS,
  normalizeScreenSettings,
} from "../../utils/stockScreen";

// Stored ↔ shown: ratios as %, 成交金額 in 萬.
const UNIT_SCALE = { percent: 100, wan: 1 / 10_000, count: 1, times: 1 };
const SUFFIX_BY_KEY = {
  max: "%",
  maxDeviation: "%",
  minTradeValue: "萬",
  minProfitQuarters: "季",
  maxGrowth: "倍",
  minSamples: "個月",
};
const toDisplay = (value, unit) => String(Math.round(value * UNIT_SCALE[unit] * 100) / 100);
// Blank → NaN, which normalizeScreenSettings replaces with the default.
const fromDisplay = (text, unit) => (String(text).trim() === "" ? NaN : Number(text) / UNIT_SCALE[unit]);

const toDraft = (settings) =>
  Object.fromEntries(
    SCREEN_FLAG_KEYS.map((key) => {
      const field = FLAG_DEFINITIONS[key].field;
      const flag = settings.flags[key];
      return [key, { enabled: flag.enabled, text: field ? toDisplay(flag[field.key], field.unit) : null }];
    }),
  );

// 低估候選 thresholds: one row per flag (switch + optional number).
function ScreenSettingsSheet({ open, isMobile, settings, disabled, saving, onClose, onSave }) {
  const [draft, setDraft] = useState(() => toDraft(settings));
  const update = (key, patch) => setDraft((current) => ({ ...current, [key]: { ...current[key], ...patch } }));

  const save = () => {
    const flags = Object.fromEntries(
      SCREEN_FLAG_KEYS.map((key) => {
        const field = FLAG_DEFINITIONS[key].field;
        const next = { enabled: draft[key].enabled };
        if (field) next[field.key] = fromDisplay(draft[key].text, field.unit);
        return [key, next];
      }),
    );
    // normalize: an empty or invalid number falls back to its default.
    onSave(normalizeScreenSettings({ ...settings, flags }));
  };

  const footer = (
    <div className="screen-settings-footer">
      <Button disabled={disabled || saving} onClick={() => setDraft(toDraft(DEFAULT_SCREEN_SETTINGS))}>
        恢復預設
      </Button>
      <Button type="primary" loading={saving} disabled={disabled} onClick={save}>
        儲存
      </Button>
    </div>
  );

  return (
    <ResearchSheet open={open} isMobile={isMobile} title="篩選門檻" onClose={onClose} footer={footer}>
      {disabled && <p className="screen-message">登入後可修改</p>}
      <div className="screen-settings">
        {SCREEN_FLAG_KEYS.map((key) => {
          const definition = FLAG_DEFINITIONS[key];
          const field = definition.field;
          const inputId = `screen-flag-${key}`;
          return (
            <div key={key} className="screen-settings-row">
              <div className="screen-settings-head">
                <div>
                  <div className="screen-settings-label">{definition.label}</div>
                  <div className="screen-settings-description">{definition.description}</div>
                </div>
                <Switch
                  aria-label={definition.label}
                  checked={draft[key].enabled}
                  disabled={disabled}
                  onChange={(enabled) => update(key, { enabled })}
                />
              </div>
              {field && (
                <label className="screen-settings-field" htmlFor={inputId}>
                  <span>{field.label}</span>
                  <Input
                    id={inputId}
                    inputMode="decimal"
                    value={draft[key].text}
                    suffix={SUFFIX_BY_KEY[field.key]}
                    disabled={disabled || !draft[key].enabled}
                    onChange={(event) => update(key, { text: event.target.value })}
                  />
                </label>
              )}
            </div>
          );
        })}
      </div>
    </ResearchSheet>
  );
}

export default ScreenSettingsSheet;
```

```jsx
// src/components/research/ScreenIndustrySheet.jsx
import ResearchSheet from "./ResearchSheet";
import { TW_INDUSTRY_CODES, industryName } from "../../utils/twIndustries";

// Multi-select industries for 低估候選; none selected = all. Applies at once.
function ScreenIndustrySheet({ open, isMobile, industries, onClose, onChange }) {
  const selected = new Set(industries);
  const toggle = (code) =>
    onChange(selected.has(code) ? industries.filter((item) => item !== code) : [...industries, code]);
  return (
    <ResearchSheet open={open} isMobile={isMobile} title="產業" onClose={onClose}>
      <div className="screen-industries" role="group" aria-label="產業">
        <button
          type="button"
          className={`screen-chip${industries.length === 0 ? " is-active" : ""}`}
          aria-pressed={industries.length === 0}
          onClick={() => onChange([])}
        >
          全部產業
        </button>
        {TW_INDUSTRY_CODES.map((code) => (
          <button
            key={code}
            type="button"
            className={`screen-chip${selected.has(code) ? " is-active" : ""}`}
            aria-pressed={selected.has(code)}
            onClick={() => toggle(code)}
          >
            {industryName(code)}
          </button>
        ))}
      </div>
    </ResearchSheet>
  );
}

export default ScreenIndustrySheet;
```

`src/App.css` 附加：

```css
.screen-industries {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.screen-settings {
  display: flex;
  flex-direction: column;
}

.screen-settings-row {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-row-y) 0;
  border-bottom: 1px solid var(--c-line);
}

.screen-settings-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
}

.screen-settings-label {
  font-size: var(--fs-body);
  font-weight: 600;
  color: var(--c-ink);
}

.screen-settings-description {
  font-size: var(--fs-caption);
  color: var(--c-muted);
}

.screen-settings-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  font-size: var(--fs-body);
  color: var(--c-ink);
}

.screen-settings-field .ant-input-affix-wrapper {
  max-width: 160px;
  min-height: 44px;
}

.screen-settings-footer {
  display: flex;
  gap: var(--space-2);
}

.screen-settings-footer .ant-btn {
  flex: 1;
  min-height: 44px;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/components/research/ScreenSheets.test.jsx && npx eslint src/components/research`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/research src/App.css
git commit -m "feat(screen): list, threshold and industry sheets"
```

---

### Task 10: `WatchlistDetailSheet` 支援未加入的股票

**Files:**
- Modify: `src/components/WatchlistDetailSheet.jsx`
- Test: `src/components/WatchlistDetailSheet.test.jsx`（附加）

**Interfaces:**
- Produces: 新 props `inWatchlist = true`、`onAdd()`、`adding = false`、`initialBasis = "ttm"`；`item.quoteNote?: string` 取代「更新於 …」。

- [ ] **Step 1: Write the failing test**

附加到 `WatchlistDetailSheet.test.jsx` 的 `describe`：

```jsx
  it('offers to add a stock that is not watched yet', () => {
    const onAdd = vi.fn()
    renderSheet({
      item: { ...item, id: undefined, priceUpdatedAt: null, change: null, changePct: null, quoteNote: '10/14 收盤' },
      inWatchlist: false,
      onAdd,
    })
    expect(screen.getByText('10/14 收盤')).toBeInTheDocument()
    expect(screen.queryByText('從觀察清單移除')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '加入觀察清單' }))
    expect(onAdd).toHaveBeenCalled()
  })

  it('opens at the basis it is given', () => {
    renderSheet({ initialBasis: 'thisYear' })
    expect(screen.getByRole('radio', { name: '今年' })).toBeChecked()
  })
```

（若 antd `Segmented` 的選項不是 radio role，改用 `screen.getByTitle('今年').closest('.ant-segmented-item')` 檢查有 `ant-segmented-item-selected` class。）

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/WatchlistDetailSheet.test.jsx`
Expected: FAIL

- [ ] **Step 3: Implement**

修改 `WatchlistDetailSheet.jsx`：

```jsx
import { useState } from "react";
import { Button } from "antd";
// …既有 imports 不變

// A watched stock — or one opened from 低估候選 that is not watched yet:
// its last quote, then the same research as a holding — no position, no
// buy / sell. The parent keys this by stock.
function WatchlistDetailSheet({
  open,
  item,
  isMobile,
  disabled,
  onClose,
  onRemove,
  inWatchlist = true,
  onAdd,
  adding = false,
  initialBasis = "ttm",
}) {
  const [basis, setBasis] = useState(initialBasis);
```

報價時間那行改為：

```jsx
        <span className="watchlist-quote-time">
          {item.quoteNote ??
            (item.priceUpdatedAt ? `更新於 ${formatDateTime(item.priceUpdatedAt)}` : "尚未取得報價")}
        </span>
```

管理 section 改為：

```jsx
      <section className="stock-detail-section" aria-label="管理觀察">
        <h3 className="stock-detail-heading">管理</h3>
        {inWatchlist ? (
          <div className="stock-detail-manage">
            <button
              type="button"
              className="stock-detail-manage-row stock-detail-manage-row--danger"
              disabled={disabled}
              onClick={onRemove}
            >
              <span>從觀察清單移除</span>
            </button>
          </div>
        ) : (
          <Button type="primary" block className="sheet-submit-btn" loading={adding} disabled={disabled} onClick={onAdd}>
            加入觀察清單
          </Button>
        )}
      </section>
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/components/WatchlistDetailSheet.test.jsx && npx eslint src/components/WatchlistDetailSheet.jsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/WatchlistDetailSheet.jsx src/components/WatchlistDetailSheet.test.jsx
git commit -m "feat(screen): research sheet for stocks not yet watched"
```

---

### Task 11: 掛進 App、文件、瀏覽器驗證

**Files:**
- Modify: `src/App.jsx`（imports ~152-155、hook 區 ~516、handlers ~4026、research page ~5921、sheets ~7243）
- Modify: `PRODUCT.md`、`DESIGN.md`、`CLAUDE.md`

**Interfaces:**
- Consumes: Task 7 hook；Task 8–10 components；`stockScreen.monthEndLabel`、`formatQuotesDate`

- [ ] **Step 1: Wire imports and state**

imports 區（`useWatchlist` import 之後）加：

```jsx
import ScreenSection from "./components/research/ScreenSection";
import ScreenListSheet from "./components/research/ScreenListSheet";
import ScreenSettingsSheet from "./components/research/ScreenSettingsSheet";
import ScreenIndustrySheet from "./components/research/ScreenIndustrySheet";
import useStockScreen from "./hooks/useStockScreen";
import { formatQuotesDate, monthEndLabel } from "./utils/stockScreen";
```

在 `const watchlist = useWatchlist({...});` 之後加：

```jsx
  // 低估候選 marks held / watched TW stocks and always lists them.
  const ownedTwSymbols = useMemo(
    () => new Set(rows.filter((row) => row.market === "TW").map((row) => row.symbol)),
    [rows],
  );
  const watchedTwSymbols = useMemo(
    () => new Set(watchlist.view.rows.filter((row) => row.market === "TW").map((row) => row.symbol)),
    [watchlist.view.rows],
  );
  const stockScreen = useStockScreen({
    enabled: Boolean(authUser) && bootPhase === "ready",
    active: activeMainTab === "research",
    canWrite: !isWriteDisabled,
    owned: ownedTwSymbols,
    watched: watchedTwSymbols,
  });
  // 'list' | 'settings' | 'industries' | null
  const [screenSheet, setScreenSheet] = useState(null);
  const [screenSelection, setScreenSelection] = useState(null);
  const [savingScreenSettings, setSavingScreenSettings] = useState(false);
  const [addingScreenWatch, setAddingScreenWatch] = useState(false);
```

（`useMemo` 若尚未從 react import，補上。）

- [ ] **Step 2: Handlers**

在 `handleRemoveWatch` 之後加：

```jsx
  const handleSaveScreenSettings = async (next) => {
    setSavingScreenSettings(true);
    try {
      await stockScreen.saveSettings(next);
      setScreenSheet(null);
      message.success("已儲存篩選門檻");
    } catch (error) {
      message.error(toUserMessage(error, "儲存篩選門檻失敗"));
    } finally {
      setSavingScreenSettings(false);
    }
  };

  const handleAddScreenWatch = async (code) => {
    setAddingScreenWatch(true);
    try {
      await addWatchlistItem({ market: "TW", symbol: code });
      await watchlist.reload();
      message.success("已加入觀察清單");
    } catch (error) {
      message.error(toUserMessage(error, "加入觀察清單失敗"));
    } finally {
      setAddingScreenWatch(false);
    }
  };

  // The screen row opened in the research sheet: its watchlist entry once
  // watched, else a quote-only item from the screen.
  const screenWatchItem = screenSelection
    ? watchlist.view.rows.find((row) => row.market === "TW" && row.symbol === screenSelection.code) ?? null
    : null;
  const screenSheetItem = screenSelection
    ? screenWatchItem ?? {
        market: "TW",
        symbol: screenSelection.code,
        name: screenSelection.name,
        latestPrice: screenSelection.price,
        currency: "TWD",
        priceUpdatedAt: null,
        change: null,
        changePct: null,
        quoteNote:
          screenSelection.priceSource === "daily"
            ? `${formatQuotesDate(stockScreen.quotesDate)} 收盤`
            : monthEndLabel(screenSelection.fallbackMonth),
      }
    : null;
```

- [ ] **Step 3: Render**

research page 在 `<WatchlistSection … />` 之後加：

```jsx
              <ScreenSection
                status={stockScreen.status}
                result={stockScreen.result}
                basis={stockScreen.basis}
                onBasisChange={stockScreen.setBasis}
                industries={stockScreen.settings.industries}
                quotesDate={stockScreen.quotesDate}
                quotesFailed={stockScreen.quotesFailed}
                onOpen={setScreenSelection}
                onOpenAll={() => setScreenSheet("list")}
                onOpenSettings={() => setScreenSheet("settings")}
                onOpenIndustries={() => setScreenSheet("industries")}
              />
```

在 `<WatchlistDetailSheet … />`（watchlist 那個）之後加：

```jsx
          <ScreenListSheet
            open={screenSheet === "list"}
            isMobile={isMobileViewport}
            result={stockScreen.result}
            onClose={() => setScreenSheet(null)}
            onOpen={setScreenSelection}
          />
          <ScreenSettingsSheet
            key={screenSheet === "settings" ? "settings-open" : "settings-closed"}
            open={screenSheet === "settings"}
            isMobile={isMobileViewport}
            settings={stockScreen.settings}
            disabled={isWriteDisabled}
            saving={savingScreenSettings}
            onClose={() => setScreenSheet(null)}
            onSave={handleSaveScreenSettings}
          />
          <ScreenIndustrySheet
            open={screenSheet === "industries"}
            isMobile={isMobileViewport}
            industries={stockScreen.settings.industries}
            onClose={() => setScreenSheet(null)}
            onChange={stockScreen.setIndustries}
          />
          <WatchlistDetailSheet
            key={screenSelection ? `screen-${screenSelection.code}` : "screen-none"}
            open={Boolean(screenSheetItem)}
            item={screenSheetItem}
            isMobile={isMobileViewport}
            disabled={isWriteDisabled}
            inWatchlist={Boolean(screenWatchItem)}
            adding={addingScreenWatch}
            initialBasis={stockScreen.basis}
            onClose={() => setScreenSelection(null)}
            onAdd={() => handleAddScreenWatch(screenSelection.code)}
            onRemove={() => handleRemoveWatch(screenWatchItem)}
          />
```

（研究 sheet 從完整清單 sheet 上方打開：兩個都是 Drawer，後渲染者在上層；關閉研究 sheet 會回到清單。）

- [ ] **Step 4: Docs**

`PRODUCT.md`：
- Operating Context 的「例外：研究 tab 的觀察清單在進入時自動刷新…」後補一句：「研究 tab 的『低估候選』在進入時抓一次 TWSE 全市場收盤價（10 分鐘內不重抓）。」
- 主要分頁一行改為「投資研究（觀察清單、低估候選；之後放總經指標、重大日程）」。

`DESIGN.md` 的 Lists 段落（觀察清單那句之後）加：「研究頁的『低估候選』在觀察清單下方：標題列右側是收盤日期與齒輪（門檻設定）；下面一排可橫向捲動的 chips（EPS 基準四選一＋產業）、一行 `muted` 說明；列表依『低於便宜價／合理偏低』分組，每組最多 5 列，最後一行是仿 `PriceRefreshFooter` 的『查看全部』連結。列的左側是名稱，下一行 `muted`：代號 · 產業 · 持有／觀察／自訂／月底價／標籤；右側是現價與『距合理價 −N%』（`muted`，不用漲跌色——低估不是漲跌）。點列開與觀察清單相同的研究 sheet，未加入時底部是『加入觀察清單』。」

`CLAUDE.md` 的「TW fundamentals snapshot」段：三個大檔的清單後加一項：

```markdown
- `company_profile.json`：TWSE openapi `t187ap03_L` 的產業別與已發行股數（整份快照，不累積；抓取失敗只 warning）。供研究 tab「低估候選」用。
```

並在 `predev`／`prebuild` 那句後補：「同一步也會用 `src/utils/stockScreen.js` 的 `buildScreenFile` 產生 `public/data/tw/screen.json`（每家一列的估價原始值；前端 `useStockScreen` 套現價與門檻）。`src/utils/` 中被 scripts import 的檔案，相對 import 必須帶 `.js`。」

- [ ] **Step 5: Verify**

Run:
```bash
npm test
npm run lint
npm run build
npm run preview
```
Expected: 測試與 lint 全綠；build 成功且 log 有 `Screen: 10xx rows`。

開瀏覽器（手機寬度 390px 與桌面各一次）、登入後到「研究」tab，確認：
1. 「低估候選」出現在觀察清單下方，標題右側是「MM/DD 收盤」。
2. 切換「近四季／下季後／今年／明年（參考）」，列表會變。
3. 產業 chip → 選「半導體」→ 只剩半導體；chip 顯示「半導體」；重新整理後仍保留（已同步）。
4. 齒輪 → 把「業外占比上限」改 50% → 儲存 → 被標記數變少；「恢復預設」→ 儲存 → 回復。
5. 「查看全部」→ 完整清單 → 展開「被標記」→ 看得到標籤文字。
6. 點一列 → 研究 sheet 打開、估價卡的基準與篩選一致 → 「加入觀察清單」→ 觀察清單出現該股、sheet 底部變「從觀察清單移除」。
7. 在某檔細節頁自訂本益比後回到研究 tab，該列出現「自訂」。
8. Console 沒有錯誤。

任何一項不符，修正後再跑一次 Step 5。

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx PRODUCT.md DESIGN.md CLAUDE.md
git commit -m "feat(screen): 低估候選 on the research tab"
```
