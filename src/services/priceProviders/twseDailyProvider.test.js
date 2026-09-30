import { describe, it, expect, vi, afterEach } from 'vitest'
import { getTwseDailyQuotes } from './twseDailyProvider'

const jsonResponse = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
})

const FIELDS = [
  '證券代號', '證券名稱', '成交股數', '成交筆數', '成交金額', '開盤價', '最高價', '最低價',
  '收盤價', '漲跌(+/-)', '漲跌價差', '最後揭示買價', '最後揭示買量', '最後揭示賣價', '最後揭示賣量', '本益比',
]
const row = (code, name, close, sign, change) => (
  [code, name, '0', '0', '0', '0', '0', '0', close, sign, change, '0', '0', '0', '0', '0']
)

const dailyBody = {
  stat: 'OK',
  date: '20260930',
  tables: [
    { title: '價格指數', fields: ['指數', '收盤指數'], data: [['發行量加權股價指數', '20,000']] },
    {
      title: '115年09月30日 每日收盤行情(全部(不含權證、牛熊證、可展延牛熊證))',
      fields: FIELDS,
      data: [
        row('0050', '元大台灣50', '112.05', '<p style= color:red>+</p>', '0.75'),
        row('2330', '台積電', '2,480.00', '<p style= color:green>-</p>', '5.00'),
        row('0056', '元大高股息', '56.95', '<p> </p>', '0.00'),
        row('00878', '國泰永續高股息', '56.95', '<p style= color:red>+</p>', '0.40'),
        row('2881', '富邦金', '90.10', '<p>X</p>', '3.00'),
        row('00625K', '富邦上証+R', '--', '<p> </p>', '0.00'),
      ],
    },
  ],
}
const noDataBody = { stat: '很抱歉，沒有符合條件的資料!', type: 'ALLBUT0999' }

describe('getTwseDailyQuotes', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('parses one MI_INDEX response into quotes for every listed symbol', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(dailyBody))
    vi.stubGlobal('fetch', fetchMock)

    const { date, quotes, listedSymbols } = await getTwseDailyQuotes()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toContain('/rwd/zh/afterTrading/MI_INDEX')
    expect(date).toBe('20260930')
    expect(quotes['0050']).toEqual({ price: 112.05, name: '元大台灣50', currency: 'TWD', previousClose: 111.3 })
    expect(quotes['2330']).toMatchObject({ price: 2480, previousClose: 2485 })
    expect(quotes['0056']).toMatchObject({ price: 56.95, previousClose: 56.95 })
    expect(quotes['00878'].previousClose).toBe(56.55) // no float noise
    // Ex-rights/dividend day: the change is vs. a reference price, not the
    // previous close, so leave the baseline unknown.
    expect(quotes['2881']).toMatchObject({ price: 90.1, previousClose: undefined })
    // No trade today → not a usable quote, but still a TWSE-listed symbol.
    expect(quotes['00625K']).toBeUndefined()
    expect(listedSymbols.has('00625K')).toBe(true)
    expect(listedSymbols.has('00679B')).toBe(false)
  })

  it('walks back to the latest trading day when today has no data yet', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-04T03:00:00Z')) // Sunday in Taipei
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(noDataBody)) // Sun
      .mockResolvedValueOnce(jsonResponse(noDataBody)) // Sat
      .mockResolvedValueOnce(jsonResponse({ ...dailyBody, date: '20261002' })) // Fri
    vi.stubGlobal('fetch', fetchMock)

    const pending = getTwseDailyQuotes()
    await vi.runAllTimersAsync()
    const { date } = await pending

    expect(date).toBe('20261002')
    const requestedDates = fetchMock.mock.calls.map(([url]) => new URL(url).searchParams.get('date'))
    expect(requestedDates).toEqual(['20261004', '20261003', '20261002'])
  })

  it('throws when no trading day is found within the lookback window', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(noDataBody)))
    const pending = getTwseDailyQuotes()
    const assertion = expect(pending).rejects.toThrow(/MI_INDEX/)
    await vi.runAllTimersAsync()
    await assertion
  })

  it('throws on an HTTP error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({}, 503)))
    await expect(getTwseDailyQuotes()).rejects.toThrow('503')
  })
})
