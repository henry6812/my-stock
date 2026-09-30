import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getHoldingQuote } from './finnhubProvider'

const jsonResponse = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
})

const quoteBody = { c: 230.42, pc: 225.1 }
const profileBody = { name: 'NVIDIA Corp' }

describe('getHoldingQuote (US)', () => {
  let fetchMock

  beforeEach(() => {
    vi.stubEnv('VITE_FINNHUB_API_KEY', 'test-key')
    fetchMock = vi.fn(async (url) => (
      String(url).includes('/stock/profile2')
        ? jsonResponse(profileBody)
        : jsonResponse(quoteBody)
    ))
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('skips /stock/profile2 when the holding already has a company name', async () => {
    const quote = await getHoldingQuote({ symbol: 'NVDA', market: 'US', companyName: 'NVIDIA Corp' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toContain('/quote')
    expect(quote).toMatchObject({ price: 230.42, previousClose: 225.1, name: 'NVIDIA Corp', currency: 'USD' })
  })

  it('fetches the profile when the name is missing or just the symbol', async () => {
    for (const companyName of [undefined, '', 'NVDA']) {
      fetchMock.mockClear()
      const quote = await getHoldingQuote({ symbol: 'NVDA', market: 'US', companyName })
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(quote.name).toBe('NVIDIA Corp')
    }
  })

  it('retries /quote after a 429 rate-limit response', async () => {
    vi.useFakeTimers()
    fetchMock
      .mockImplementationOnce(async () => jsonResponse({}, 429))
    const pending = getHoldingQuote({ symbol: 'NVDA', market: 'US', companyName: 'NVIDIA Corp' })
    await vi.runAllTimersAsync()
    const quote = await pending
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(quote.price).toBe(230.42)
  })

  it('gives up after repeated 429 responses', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation(async () => jsonResponse({}, 429))
    const pending = getHoldingQuote({ symbol: 'NVDA', market: 'US', companyName: 'NVIDIA Corp' })
    const assertion = expect(pending).rejects.toThrow('429')
    await vi.runAllTimersAsync()
    await assertion
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})

describe('getHoldingQuote (TW)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('never calls Finnhub for Taiwan holdings', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      title: '0050 元大台灣50 各日成交資訊',
      data: [['', '', '', '', '', '', '111.00'], ['', '', '', '', '', '', '112.05']],
    }))
    vi.stubGlobal('fetch', fetchMock)
    const quote = await getHoldingQuote({ symbol: '0050', market: 'TW', companyName: '元大台灣50' })
    expect(quote.price).toBe(112.05)
    expect(fetchMock.mock.calls.every(([url]) => !String(url).includes('finnhub'))).toBe(true)
  })

  it('tries TPEX first when asked (symbol known not to be TWSE-listed)', async () => {
    const fetchMock = vi.fn(async () => jsonResponse([
      { SecuritiesCompanyCode: '00679B', CompanyName: '元大美債20年', Close: '24.77' },
    ]))
    vi.stubGlobal('fetch', fetchMock)
    const quote = await getHoldingQuote({ symbol: '00679B', market: 'TW' }, { tpexFirst: true })
    expect(quote.price).toBe(24.77)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toContain('tpex_off_market')
  })
})
