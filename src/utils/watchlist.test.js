import { describe, it, expect } from 'vitest'
import {
  WATCHLIST_REFRESH_INTERVAL_MS,
  buildWatchlistRemoteKey,
  buildWatchlistView,
  shouldAutoRefreshWatchlist,
  watchlistQuoteFields,
} from './watchlist'

const item = (overrides) => ({
  id: 1,
  remoteKey: 'TW_2330',
  market: 'TW',
  symbol: '2330',
  name: '台積電',
  latestPrice: 1010,
  previousClose: 1000,
  currency: 'TWD',
  priceUpdatedAt: '2026-10-13T06:00:00.000Z',
  createdAt: '2026-10-13T05:00:00.000Z',
  updatedAt: '2026-10-13T06:00:00.000Z',
  deletedAt: null,
  ...overrides,
})

describe('buildWatchlistRemoteKey', () => {
  it('joins market and symbol', () => {
    expect(buildWatchlistRemoteKey({ market: 'US', symbol: 'NVDA' })).toBe('US_NVDA')
  })
})

describe('watchlistQuoteFields', () => {
  it('copies the price fields and stamps the time', () => {
    expect(watchlistQuoteFields({ price: 10, previousClose: 9, currency: 'USD', name: 'X' }, 'T')).toEqual({
      latestPrice: 10,
      previousClose: 9,
      currency: 'USD',
      priceUpdatedAt: 'T',
    })
  })

  it('stores a missing previous close as null', () => {
    expect(watchlistQuoteFields({ price: 10, currency: 'TWD' }, 'T').previousClose).toBeNull()
  })
})

describe('buildWatchlistView', () => {
  it('drops removed items, groups TW before US, and orders by when they were added', () => {
    const view = buildWatchlistView([
      item({ id: 1, market: 'US', symbol: 'NVDA', remoteKey: 'US_NVDA', createdAt: '2026-10-13T01:00:00.000Z' }),
      item({ id: 2, symbol: '2454', remoteKey: 'TW_2454', createdAt: '2026-10-13T03:00:00.000Z' }),
      item({ id: 3, symbol: '2330', createdAt: '2026-10-13T02:00:00.000Z' }),
      item({ id: 4, symbol: '0050', remoteKey: 'TW_0050', deletedAt: '2026-10-13T04:00:00.000Z' }),
    ])
    expect(view.groups.map((group) => [group.market, group.rows.map((row) => row.symbol)])).toEqual([
      ['TW', ['2330', '2454']],
      ['US', ['NVDA']],
    ])
    expect(view.rows).toHaveLength(3)
  })

  it('omits an empty market group', () => {
    expect(buildWatchlistView([item({})]).groups.map((group) => group.market)).toEqual(['TW'])
    expect(buildWatchlistView([]).groups).toEqual([])
  })

  it('computes the change against the previous close', () => {
    const [row] = buildWatchlistView([item({})]).rows
    expect(row.change).toBe(10)
    expect(row.changePct).toBeCloseTo(0.01)
  })

  it('leaves the change empty without both prices', () => {
    const [row] = buildWatchlistView([item({ previousClose: null })]).rows
    expect(row.change).toBeNull()
    expect(row.changePct).toBeNull()
  })

  it('reports the latest successful update', () => {
    const view = buildWatchlistView([
      item({ id: 1, priceUpdatedAt: '2026-10-13T06:00:00.000Z' }),
      item({ id: 2, symbol: '2454', remoteKey: 'TW_2454', priceUpdatedAt: '2026-10-13T07:00:00.000Z' }),
      item({ id: 3, symbol: '2317', remoteKey: 'TW_2317', priceUpdatedAt: null }),
    ])
    expect(view.lastUpdatedAt).toBe('2026-10-13T07:00:00.000Z')
    expect(buildWatchlistView([item({ priceUpdatedAt: null })]).lastUpdatedAt).toBeNull()
  })
})

describe('shouldAutoRefreshWatchlist', () => {
  const now = Date.parse('2026-10-13T06:00:00.000Z')
  const at = (ms) => new Date(now - ms).toISOString()

  it('skips an empty list', () => {
    expect(shouldAutoRefreshWatchlist([], now)).toBe(false)
  })

  it('refreshes when any item has no price yet', () => {
    expect(shouldAutoRefreshWatchlist([{ priceUpdatedAt: at(1000) }, { priceUpdatedAt: null }], now)).toBe(true)
  })

  it('waits until the oldest price is older than the interval', () => {
    expect(shouldAutoRefreshWatchlist([{ priceUpdatedAt: at(WATCHLIST_REFRESH_INTERVAL_MS - 1000) }], now)).toBe(false)
    expect(
      shouldAutoRefreshWatchlist(
        [{ priceUpdatedAt: at(1000) }, { priceUpdatedAt: at(WATCHLIST_REFRESH_INTERVAL_MS + 1000) }],
        now,
      ),
    ).toBe(true)
  })
})
