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
