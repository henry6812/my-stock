import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getTwFundamentals, resetTwFundamentalsCache } from './twFundamentalsProvider'

const epsFile = {
  basis: 'cumulative',
  updatedAt: '2026-10-05T12:03:11Z',
  companies: { 2330: { name: '台積電', quarters: { '2026Q2': { eps: 49.33 } } } },
}
const peFile = {
  updatedAt: '2026-10-01T12:02:40Z',
  companies: { 2330: [['2026-09', 28.1], ['2026-08', 27.4], ['2026-07', null]] },
}

const mockFetch = (status = 200) =>
  vi.fn(async (url) => ({
    ok: status === 200,
    status,
    json: async () => (String(url).includes('tw_eps_history') ? epsFile : peFile),
  }))

beforeEach(() => {
  resetTwFundamentalsCache()
})

describe('getTwFundamentals', () => {
  it('reads both snapshot files once and returns the company, P/E oldest first', async () => {
    globalThis.fetch = mockFetch()
    const data = await getTwFundamentals('2330')
    expect(data).toEqual({
      name: '台積電',
      cumulative: { '2026Q2': { eps: 49.33 } },
      peSeries: [
        { label: '2026-07', pe: null },
        { label: '2026-08', pe: 27.4 },
        { label: '2026-09', pe: 28.1 },
      ],
      epsUpdatedAt: '2026-10-05T12:03:11Z',
      peUpdatedAt: '2026-10-01T12:02:40Z',
    })
    await getTwFundamentals('2330')
    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
    expect(globalThis.fetch.mock.calls[0][0]).toMatch(/data\/tw_eps_history\.json$/)
  })

  it('returns null for a code that is not in the snapshot (e.g. 上櫃)', async () => {
    globalThis.fetch = mockFetch()
    expect(await getTwFundamentals('6488')).toBeNull()
  })

  it('throws a readable error and retries on the next call after a failure', async () => {
    globalThis.fetch = mockFetch(404)
    await expect(getTwFundamentals('2330')).rejects.toThrow('無法載入台股財報資料')
    globalThis.fetch = mockFetch()
    expect(await getTwFundamentals('2330')).not.toBeNull()
  })
})
