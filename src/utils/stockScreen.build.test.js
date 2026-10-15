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

  it('has no projections or core EPS for financial companies', () => {
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
