import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getTwFundamentals, resetTwFundamentalsCache } from './twFundamentalsProvider'

const file = {
  code: '2330',
  name: '台積電',
  statement: 'general',
  updatedAt: '2026-10-05T12:03:11Z',
  quarters: { '2026Q2': { eps: 35.17 } },
  monthlyRevenue: { '2026-09': 511857399 },
  monthly: [['2026-09', 28.1, 1285], ['2026-08', 27.4, 1200], ['2026-07', null, null]],
}

const response = (status, body, type = 'application/json') => ({
  ok: status === 200,
  status,
  headers: { get: () => type },
  json: async () => body,
})

beforeEach(() => {
  resetTwFundamentalsCache()
})

describe('getTwFundamentals', () => {
  it('reads one file per company, once, with the month-end series oldest first', async () => {
    globalThis.fetch = vi.fn(async () => response(200, file))
    const data = await getTwFundamentals('2330')
    expect(data).toEqual({
      name: '台積電',
      statement: 'general',
      cumulative: { '2026Q2': { eps: 35.17 } },
      monthlyRevenue: { '2026-09': 511857399 },
      monthly: [
        { month: '2026-07', pe: null, close: null },
        { month: '2026-08', pe: 27.4, close: 1200 },
        { month: '2026-09', pe: 28.1, close: 1285 },
      ],
      peSeries: [
        { label: '2026-07', pe: null },
        { label: '2026-08', pe: 27.4 },
        { label: '2026-09', pe: 28.1 },
      ],
      updatedAt: '2026-10-05T12:03:11Z',
    })
    await getTwFundamentals('2330')
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    expect(globalThis.fetch.mock.calls[0][0]).toMatch(/data\/tw\/2330\.json$/)
  })

  it('returns null for a code without a file (上櫃), including the dev server’s HTML fallback', async () => {
    globalThis.fetch = vi.fn(async () => response(404, null, 'text/html'))
    expect(await getTwFundamentals('6488')).toBeNull()
    globalThis.fetch = vi.fn(async () => response(200, null, 'text/html'))
    expect(await getTwFundamentals('6489')).toBeNull()
  })

  it('throws a readable error and retries on the next call after a failure', async () => {
    globalThis.fetch = vi.fn(async () => response(500, null))
    await expect(getTwFundamentals('2330')).rejects.toThrow('無法載入台股財報資料')
    globalThis.fetch = vi.fn(async () => response(200, file))
    expect(await getTwFundamentals('2330')).not.toBeNull()
  })
})
