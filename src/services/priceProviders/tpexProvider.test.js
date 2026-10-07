import { describe, it, expect, vi, afterEach } from 'vitest'
import { getTwQuoteFromTpex } from './tpexProvider'

const jsonResponse = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
})

// Rows as tpex_mainboard_daily_close_quotes returns them (note the stray
// spaces TPEX leaves in Close/Change).
const rows = [
  { SecuritiesCompanyCode: '6488', CompanyName: '環球晶', Close: '1215.00', Change: '+10.00' },
  { SecuritiesCompanyCode: '00679B', CompanyName: '元大美債20年', Close: '24.30', Change: '-0.03 ' },
  { SecuritiesCompanyCode: '8299', CompanyName: '群聯', Close: '2060.00', Change: '0.00 ' },
  { SecuritiesCompanyCode: '2947', CompanyName: '振宇五金', Close: '60.50', Change: '除息 ' },
  { SecuritiesCompanyCode: '3067', CompanyName: '全域', Close: ' ---', Change: '--- ' },
  { SecuritiesCompanyCode: '5347', CompanyName: '世界', Close: '1,191.50', Change: '+1.50' },
]

const quoteFor = async (symbol) => {
  vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(rows)))
  return getTwQuoteFromTpex(symbol)
}

describe('getTwQuoteFromTpex', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reads the same-origin daily close snapshot first', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(rows))
    vi.stubGlobal('fetch', fetchMock)
    await getTwQuoteFromTpex('6488')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toContain('data/tpex_daily_close_quotes.json')
  })

  it('derives previousClose from a rise', async () => {
    expect(await quoteFor('6488')).toEqual({
      price: 1215, previousClose: 1205, name: '環球晶', currency: 'TWD',
    })
  })

  it('derives previousClose from a fall without float noise', async () => {
    const quote = await quoteFor('00679B')
    expect(quote.price).toBe(24.3)
    expect(quote.previousClose).toBe(24.33)
  })

  it('treats an unchanged close as previousClose === price', async () => {
    expect((await quoteFor('8299')).previousClose).toBe(2060)
  })

  it('leaves previousClose undefined on ex-dividend/ex-rights days', async () => {
    const quote = await quoteFor('2947')
    expect(quote.price).toBe(60.5)
    expect(quote.previousClose).toBeUndefined()
  })

  it('parses thousands separators', async () => {
    expect(await quoteFor('5347')).toMatchObject({ price: 1191.5, previousClose: 1190 })
  })

  it('fails for a symbol with no trade today', async () => {
    await expect(quoteFor('3067')).rejects.toThrow('No TPEX quote found for symbol: 3067')
  })

  it('fails for an unknown symbol', async () => {
    await expect(quoteFor('9999')).rejects.toThrow('No TPEX quote found for symbol: 9999')
  })
})
