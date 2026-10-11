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
