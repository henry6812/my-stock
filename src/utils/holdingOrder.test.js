import { describe, it, expect } from 'vitest'
import { compareHoldingsForDisplay } from './holdingOrder'

const sortIds = (holdings) =>
  holdings.slice().sort(compareHoldingsForDisplay).map((h) => h.id)

describe('compareHoldingsForDisplay', () => {
  it('orders TW before US, then ETF → 個股 → 債券 within a market', () => {
    const holdings = [
      { id: 'us-bond', market: 'US', assetTag: 'BOND', sortOrder: 1 },
      { id: 'us-stock', market: 'US', assetTag: 'STOCK', sortOrder: 2 },
      { id: 'tw-bond', market: 'TW', assetTag: 'BOND', sortOrder: 3 },
      { id: 'us-etf', market: 'US', assetTag: 'ETF', sortOrder: 4 },
      { id: 'tw-stock', market: 'TW', assetTag: 'STOCK', sortOrder: 5 },
      { id: 'tw-etf', market: 'TW', assetTag: 'ETF', sortOrder: 6 },
    ]
    expect(sortIds(holdings)).toEqual([
      'tw-etf', 'tw-stock', 'tw-bond', 'us-etf', 'us-stock', 'us-bond',
    ])
  })

  it('treats missing or unknown tags as 個股', () => {
    const holdings = [
      { id: 'bond', market: 'TW', assetTag: 'BOND', sortOrder: 1 },
      { id: 'custom', market: 'TW', assetTag: 'growth', sortOrder: 2 },
      { id: 'none', market: 'TW', sortOrder: 3 },
      { id: 'etf', market: 'TW', assetTag: 'etf', sortOrder: 4 },
    ]
    expect(sortIds(holdings)).toEqual(['etf', 'custom', 'none', 'bond'])
  })

  it('keeps the legacy sortOrder within the same group', () => {
    const holdings = [
      { id: 'b', market: 'TW', assetTag: 'STOCK', sortOrder: 7 },
      { id: 'a', market: 'TW', assetTag: 'STOCK', sortOrder: 2 },
    ]
    expect(sortIds(holdings)).toEqual(['a', 'b'])
  })
})
