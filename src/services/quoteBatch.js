import { getTwseDailyQuotes } from './priceProviders/twseDailyProvider'
import { getHoldingQuote, sleepForRateLimit } from './priceProviders/finnhubProvider'
import { mapWithConcurrency } from '../utils/concurrency'

// Finnhub free tier: 60 calls/min, 30/sec — a few in flight is safe.
const US_QUOTE_CONCURRENCY = 4

export const quoteTargetKey = ({ market, symbol }) => `${market}:${symbol}`

const settleQuote = (promise) =>
  promise.then(
    (quote) => ({ quote }),
    (error) => ({ error }),
  )

// Quotes for holdings and watched stocks alike, one request per
// market:symbol (the first target's companyName is the one passed on).
// TW and US quotes hit different hosts, so both lanes run at once.
// TW: one MI_INDEX request covers every TWSE-listed symbol; only misses
// (TPEX symbols, no trade today, or MI_INDEX down) go per-symbol, paced
// because TWSE rate-limits per IP. US: Finnhub allows short bursts →
// small parallel batches. A failed symbol becomes { error }, never a
// rejection, so one bad symbol doesn't discard the others.
export const fetchQuotes = async (targets) => {
  const unique = new Map()
  for (const target of targets) {
    const key = quoteTargetKey(target)
    if (!unique.has(key)) unique.set(key, target)
  }
  const list = [...unique.values()]
  const twTargets = list.filter((target) => target.market !== 'US')
  const usTargets = list.filter((target) => target.market === 'US')

  const fetchTwQuotes = async () => {
    let daily = null
    if (twTargets.length > 0) {
      try {
        daily = await getTwseDailyQuotes()
      } catch (error) {
        console.warn('[fetchQuotes] MI_INDEX batch failed, falling back per symbol', error)
      }
    }

    const quotes = []
    for (const target of twTargets) {
      const hit = daily?.quotes[target.symbol]
      if (hit) {
        quotes.push({ quote: hit })
        continue
      }
      // Not TWSE-listed at all → it's a TPEX symbol; the same-origin TPEX
      // snapshot needs no pacing. Anything else hits TWSE again.
      const tpexFirst = Boolean(daily) && !daily.listedSymbols.has(target.symbol)
      if (!tpexFirst) {
        await sleepForRateLimit(1_200)
      }
      quotes.push(await settleQuote(getHoldingQuote(target, { tpexFirst })))
    }
    return quotes
  }

  const [twQuotes, usQuotes] = await Promise.all([
    fetchTwQuotes(),
    mapWithConcurrency(usTargets, US_QUOTE_CONCURRENCY, (target) =>
      settleQuote(getHoldingQuote(target)),
    ),
  ])

  return new Map([
    ...twTargets.map((target, i) => [quoteTargetKey(target), twQuotes[i]]),
    ...usTargets.map((target, i) => [quoteTargetKey(target), usQuotes[i]]),
  ])
}
