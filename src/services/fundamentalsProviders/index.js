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
