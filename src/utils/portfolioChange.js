// Daily gain/loss ("漲跌") using each holding's previous close as the unified
// baseline, plus price-data freshness helpers. Pure and framework-free so the
// logic can be unit-tested without rendering the app.
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import { parseNumericLike } from './number'

dayjs.extend(utc)
dayjs.extend(timezone)

const MARKET_TIME_ZONE = 'Asia/Taipei'

const toFiniteNumber = (value, context) => {
  const parsed = parseNumericLike(value, { fallback: Number.NaN, context })
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

// Daily change for one holding, measured from its previous close.
// Returns null when price or previous close is unavailable (e.g. a pre-Plan-A
// snapshot that never stored previousClose), so callers can show "—".
export const computeHoldingDailyChange = ({
  market,
  price,
  previousClose,
  shares,
  fxRateToTwd,
} = {}) => {
  const priceNum = toFiniteNumber(price, 'computeHoldingDailyChange.price')
  const prevNum = toFiniteNumber(
    previousClose,
    'computeHoldingDailyChange.previousClose',
  )
  if (!Number.isFinite(priceNum) || !Number.isFinite(prevNum)) {
    return null
  }

  const sharesNum = toFiniteNumber(shares, 'computeHoldingDailyChange.shares')
  const safeShares = Number.isFinite(sharesNum) ? sharesNum : 0
  const fx =
    market === 'US'
      ? (() => {
          const rate = toFiniteNumber(
            fxRateToTwd,
            'computeHoldingDailyChange.fxRateToTwd',
          )
          return Number.isFinite(rate) ? rate : 1
        })()
      : 1

  const currentValueTwd = priceNum * safeShares * fx
  const prevValueTwd = prevNum * safeShares * fx
  const changeTwd = currentValueTwd - prevValueTwd
  const changePct =
    prevValueTwd !== 0 ? (changeTwd / prevValueTwd) * 100 : null

  return { changeTwd, prevValueTwd, currentValueTwd, changePct }
}

// Portfolio-wide daily change: sum over holdings that have a previous close
// (cash is intentionally excluded — it has no market price). coveredCount /
// missingCount let the UI flag partial coverage.
export const computePortfolioDailyChange = (holdings = []) => {
  let changeTwd = 0
  let prevValueTwd = 0
  let coveredCount = 0
  let missingCount = 0

  for (const holding of holdings) {
    const result = computeHoldingDailyChange(holding)
    if (!result) {
      missingCount += 1
      continue
    }
    changeTwd += result.changeTwd
    prevValueTwd += result.prevValueTwd
    coveredCount += 1
  }

  const changePct =
    coveredCount > 0 && prevValueTwd !== 0
      ? (changeTwd / prevValueTwd) * 100
      : null

  return { changeTwd, prevValueTwd, changePct, coveredCount, missingCount }
}

// Calendar date (YYYY-MM-DD) of an instant in the market's time zone.
export const getMarketDateKey = (iso, timeZone = MARKET_TIME_ZONE) =>
  dayjs(iso).tz(timeZone).format('YYYY-MM-DD')

// Price data is stale when its captured date (market tz) is before "now"'s
// date — i.e. it wasn't refreshed yet on the current calendar day. Missing
// capturedAt counts as stale.
export const isPriceDataStale = ({
  capturedAt,
  now = new Date().toISOString(),
  timeZone = MARKET_TIME_ZONE,
} = {}) => {
  if (!capturedAt) {
    return true
  }
  return getMarketDateKey(capturedAt, timeZone) < getMarketDateKey(now, timeZone)
}
