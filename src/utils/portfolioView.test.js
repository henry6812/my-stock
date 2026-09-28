import { describe, it, expect } from 'vitest'
import {
  formatSignedPrice,
  formatSignedTwd,
  formatChangePercent,
  floorToTenThousand,
  formatNetWorthScaleLabel,
  getStableTagColor,
  getStableChartColor,
  createHolderDraftRow,
  createHolderDraftRows,
  getHolderTabKey,
  filterRowsByHolderTab,
  createHoldingsCsvContent,
  formatRecurringScheduleText,
  formatBudgetModeLabel,
  formatBudgetCycleLabel,
  getProgressDisplayTargets,
  buildProgressStops,
} from './portfolioView'

describe('formatChangePercent', () => {
  it('adds a leading + for positive values', () => {
    expect(formatChangePercent(1.5)).toBe('+1.50%')
  })
  it('keeps the native - for negatives and rounds to 2dp', () => {
    expect(formatChangePercent(-2.345)).toBe('-2.35%')
  })
  it('returns -- for non-numbers', () => {
    expect(formatChangePercent(undefined)).toBe('--')
    expect(formatChangePercent(Number.NaN)).toBe('--')
  })
})

describe('formatSignedTwd', () => {
  it('rounds to a whole TWD amount with a sign and thousands separator', () => {
    const out = formatSignedTwd(1234.6)
    expect(out).toContain('1,235')
    expect(out).toContain('+')
  })
  it('shows a minus sign for negatives', () => {
    expect(formatSignedTwd(-5000)).toContain('-')
    expect(formatSignedTwd(-5000)).toContain('5,000')
  })
  it('returns -- for non-numbers', () => {
    expect(formatSignedTwd('x')).toBe('--')
  })
})

describe('formatSignedPrice', () => {
  it('formats a signed USD price up to 4dp', () => {
    const out = formatSignedPrice(12.3456, 'USD')
    expect(out).toContain('12.3456')
    expect(out).toContain('+')
  })
  it('returns -- for non-numbers', () => {
    expect(formatSignedPrice(null)).toBe('--')
  })
})

describe('floorToTenThousand', () => {
  it('floors down to the nearest 10,000', () => {
    expect(floorToTenThousand(55000)).toBe(50000)
    expect(floorToTenThousand(9999)).toBe(0)
  })
  it('accepts numeric-like strings', () => {
    expect(floorToTenThousand('123456')).toBe(120000)
  })
  it('clamps non-positive / invalid input to 0', () => {
    expect(floorToTenThousand(-1)).toBe(0)
    expect(floorToTenThousand('abc')).toBe(0)
  })
})

describe('formatNetWorthScaleLabel', () => {
  it('labels values under 1億 in 萬', () => {
    expect(formatNetWorthScaleLabel(50000)).toBe('5萬')
  })
  it('labels an exact 億 without a 萬 remainder', () => {
    expect(formatNetWorthScaleLabel(100000000)).toBe('1億')
  })
  it('labels a 億 + 萬 remainder', () => {
    expect(formatNetWorthScaleLabel(123450000)).toBe('1億2345萬')
  })
  it('labels 0 for non-positive input', () => {
    expect(formatNetWorthScaleLabel(0)).toBe('0')
    expect(formatNetWorthScaleLabel(-10)).toBe('0')
  })
})

describe('stable color helpers', () => {
  it('are deterministic for the same seed', () => {
    expect(getStableTagColor('台積電')).toBe(getStableTagColor('台積電'))
    expect(getStableChartColor('2330')).toBe(getStableChartColor('2330'))
  })
  it('fall back for empty seeds', () => {
    expect(getStableTagColor('')).toBe('blue')
    expect(getStableChartColor('   ')).toBe('#1677ff')
  })
  it('return a value from the pool', () => {
    const tag = getStableTagColor('anything')
    expect(typeof tag).toBe('string')
    expect(tag.length).toBeGreaterThan(0)
  })
})

describe('holder draft rows', () => {
  it('creates rows with monotonically unique ids', () => {
    const a = createHolderDraftRow('Po')
    const b = createHolderDraftRow('Wei')
    expect(a.id).not.toBe(b.id)
    expect(a.value).toBe('Po')
    expect(a.originalValue).toBe('Po')
  })
  it('maps an options array preserving values', () => {
    const rows = createHolderDraftRows(['Po', 'Wei'])
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.value)).toEqual(['Po', 'Wei'])
  })
})

describe('filterRowsByHolderTab', () => {
  const rows = [
    { symbol: 'A', holder: 'Po', holderName: 'Po' },
    { symbol: 'B', holder: 'Wei', holderName: 'Wei' },
    { symbol: 'C', holder: '', holderName: '未設定' },
  ]
  it('filters by a specific holder tab key', () => {
    const out = filterRowsByHolderTab(rows, getHolderTabKey('Po'))
    expect(out.map((r) => r.symbol)).toEqual(['A'])
  })
  it('returns all rows for the "all" tab', () => {
    expect(filterRowsByHolderTab(rows, 'all')).toHaveLength(3)
  })
  it('returns unset holders for the "unset" tab', () => {
    const out = filterRowsByHolderTab(rows, 'unset')
    expect(out.map((r) => r.symbol)).toEqual(['C'])
  })
})

describe('createHoldingsCsvContent', () => {
  it('emits a quoted CSV with a header row', () => {
    const csv = createHoldingsCsvContent([
      { companyName: '台積電', symbol: '2330', shares: 100 },
    ])
    expect(csv).toBe(
      '"股票名稱","代號","持股股數"\r\n"台積電","2330","100"',
    )
  })
  it('falls back to symbol when companyName is missing and escapes quotes', () => {
    const csv = createHoldingsCsvContent([
      { companyName: '', symbol: 'AB"C', shares: 1 },
    ])
    expect(csv).toContain('"AB""C"')
  })
})

describe('formatRecurringScheduleText', () => {
  it('formats a monthly schedule', () => {
    expect(
      formatRecurringScheduleText({ recurrenceType: 'MONTHLY', monthlyDay: 5 }),
    ).toBe('每月 5 日扣款')
  })
  it('formats a yearly schedule', () => {
    expect(
      formatRecurringScheduleText({
        recurrenceType: 'YEARLY',
        yearlyMonth: 3,
        yearlyDay: 15,
      }),
    ).toBe('每年 3 月15 日扣款')
  })
  it('returns -- for missing / unknown rows', () => {
    expect(formatRecurringScheduleText(null)).toBe('--')
    expect(formatRecurringScheduleText({ recurrenceType: 'WEEKLY' })).toBe('--')
  })
})

describe('budget label helpers', () => {
  it('labels budget mode', () => {
    expect(formatBudgetModeLabel('SPECIAL')).toBe('特別預算')
    expect(formatBudgetModeLabel('RESIDENT')).toBe('常駐預算')
  })
  it('labels budget cycle', () => {
    expect(formatBudgetCycleLabel('QUARTERLY')).toBe('季度')
    expect(formatBudgetCycleLabel('YEARLY')).toBe('年度')
    expect(formatBudgetCycleLabel('MONTHLY')).toBe('月度')
  })
})

describe('progress bar math', () => {
  it('computes ratios and a rounded-up max in 10M units', () => {
    const t = getProgressDisplayTargets(5_000_000, 3_000_000)
    expect(t.progressMaxTwd).toBe(20_000_000)
    expect(t.currentRatio).toBeCloseTo(0.25)
    expect(t.baselineRatio).toBeCloseTo(0.15)
    expect(t.deltaLeftRatio).toBeCloseTo(0.15)
    expect(t.deltaWidthRatio).toBeCloseTo(0.1)
  })
  it('builds inclusive stops in 10M steps', () => {
    expect(buildProgressStops(20_000_000)).toEqual([0, 10_000_000, 20_000_000])
  })
})
