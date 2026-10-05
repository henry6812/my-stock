import { describe, it, expect } from 'vitest'
import {
  findRecentGaps,
  hasPeMonth,
  mergeEpsRows,
  mergePeMonth,
  monthDaysDescending,
  normalizeIncomeRow,
  parseBwibbuRows,
  parseMopsIncomeTables,
  parseTwNumber,
  previousMonth,
  quarterKey,
  rocToYear,
} from './twFundamentalsMerge'

const tsmcOpenApiRow = {
  年度: '115',
  季別: '2',
  公司代號: '2330',
  公司名稱: '台灣積體電路製造股份有限公司',
  營業收入: '2404483690.00',
  '營業利益（損失）': '1425568793.00',
  '本期淨利（淨損）': '1279582227.00',
  '基本每股盈餘（元）': '49.33',
}

describe('number helpers', () => {
  it('converts ROC years and TW number strings', () => {
    expect(rocToYear('115')).toBe(2026)
    expect(parseTwNumber('1,773,045,533')).toBe(1773045533)
    expect(parseTwNumber('-565,473')).toBe(-565473)
    expect(parseTwNumber('--')).toBeNull()
    expect(parseTwNumber('-')).toBeNull()
    expect(parseTwNumber('')).toBeNull()
    expect(parseTwNumber(undefined)).toBeNull()
    expect(quarterKey(2026, 2)).toBe('2026Q2')
  })
})

describe('normalizeIncomeRow', () => {
  it('reads an openapi general-industry row', () => {
    expect(normalizeIncomeRow(tsmcOpenApiRow)).toEqual({
      code: '2330',
      name: '台灣積體電路製造股份有限公司',
      year: 2026,
      quarter: 2,
      eps: 49.33,
      revenue: 2404483690,
      operatingIncome: 1425568793,
      netIncome: 1279582227,
    })
  })

  it('reads a financial-holding row with different field names', () => {
    const row = normalizeIncomeRow({
      年度: '115',
      季別: '2',
      公司代號: '2881',
      公司名稱: '富邦金',
      淨收益: '1,000',
      '本期稅後淨利（淨損）': '500',
      '基本每股盈餘（元）': '6.1',
    })
    expect(row).toMatchObject({ code: '2881', revenue: 1000, operatingIncome: null, netIncome: 500, eps: 6.1 })
  })

  it('takes year / quarter from the period argument for MOPS rows', () => {
    const row = normalizeIncomeRow(
      { 公司代號: '2330', 公司名稱: '台積電', 營業收入: '1,773,045,533', '基本每股盈餘（元）': '29.31' },
      { year: 2025, quarter: 2 },
    )
    expect(row).toMatchObject({ code: '2330', year: 2025, quarter: 2, eps: 29.31, revenue: 1773045533 })
  })

  it('reads the IFRS 17 insurance layout, whose EPS header has no （元）', () => {
    const row = normalizeIncomeRow(
      { 公司代號: '2851', 公司名稱: '中再保', 保險服務結果: '707,341', 基本每股盈餘: '3.99' },
      { year: 2026, quarter: 1 },
    )
    expect(row).toMatchObject({ code: '2851', year: 2026, quarter: 1, eps: 3.99 })
  })

  it('drops rows without a usable EPS or period', () => {
    expect(normalizeIncomeRow({ ...tsmcOpenApiRow, '基本每股盈餘（元）': '--' })).toBeNull()
    expect(normalizeIncomeRow({ ...tsmcOpenApiRow, 季別: '5' })).toBeNull()
    expect(normalizeIncomeRow({ ...tsmcOpenApiRow, 公司代號: '' })).toBeNull()
  })
})

describe('mergeEpsRows', () => {
  const empty = { basis: 'cumulative', updatedAt: null, companies: {} }
  const row = normalizeIncomeRow(tsmcOpenApiRow)

  it('adds new quarters and reports a change', () => {
    const { history, changed } = mergeEpsRows(empty, [row])
    expect(changed).toBe(true)
    expect(history.companies['2330'].quarters['2026Q2'].eps).toBe(49.33)
    expect(history.basis).toBe('cumulative')
  })

  it('reports no change when the same values arrive again', () => {
    const { history } = mergeEpsRows(empty, [row])
    expect(mergeEpsRows(history, [row]).changed).toBe(false)
  })

  it('lets the later row win for the same company and quarter (restatement)', () => {
    const restated = { ...row, eps: 49.5 }
    const { history } = mergeEpsRows(empty, [row, restated])
    expect(history.companies['2330'].quarters['2026Q2'].eps).toBe(49.5)
    expect(Object.keys(history.companies['2330'].quarters)).toEqual(['2026Q2'])
  })

  it('does not mutate the input history', () => {
    const { history } = mergeEpsRows(empty, [row])
    mergeEpsRows(history, [{ ...row, quarter: 3 }])
    expect(Object.keys(history.companies['2330'].quarters)).toEqual(['2026Q2'])
  })
})

describe('findRecentGaps', () => {
  const withQuarters = (keys) => ({
    companies: { 1101: { name: '台泥', quarters: Object.fromEntries(keys.map((k) => [k, { eps: 1 }])) } },
  })

  it('flags a missing quarter right before the latest one', () => {
    expect(findRecentGaps(withQuarters(['2025Q3', '2025Q4', '2026Q2']))).toEqual([{ code: '1101', missing: '2026Q1' }])
  })

  it('treats Q4 of last year as the predecessor of Q1', () => {
    expect(findRecentGaps(withQuarters(['2025Q3', '2026Q1']))).toEqual([{ code: '1101', missing: '2025Q4' }])
  })

  it('ignores companies whose history starts at the latest quarter', () => {
    expect(findRecentGaps(withQuarters(['2026Q2']))).toEqual([])
  })

  it('ignores semi-annual filers (創新板) that never report that quarter', () => {
    expect(findRecentGaps(withQuarters(['2025Q2', '2025Q4', '2026Q2']))).toEqual([])
  })

  it('ignores a newly listed 創新板 company with only two semi-annual filings', () => {
    expect(findRecentGaps(withQuarters(['2025Q2', '2025Q4']))).toEqual([])
  })

  it('ignores contiguous histories', () => {
    expect(findRecentGaps(withQuarters(['2026Q1', '2026Q2']))).toEqual([])
  })
})

describe('P/E history helpers', () => {
  const bwibbu = {
    stat: 'OK',
    fields: ['證券代號', '證券名稱', '收盤價', '殖利率(%)', '股利年度', '本益比', '股價淨值比', '財報年/季'],
    data: [
      ['1101', '台泥', '26.30', '3.04', 114, '-', '0.85', '115/2'],
      ['2330', '台積電', '1085.00', '0.90', 114, '28.28', '9.84', '115/2'],
    ],
  }

  it('parses BWIBBU_d rows, mapping "-" to null', () => {
    expect(parseBwibbuRows(bwibbu)).toEqual([
      { code: '1101', pe: null },
      { code: '2330', pe: 28.28 },
    ])
  })

  it('returns null for a non-trading day response', () => {
    expect(parseBwibbuRows({ stat: '很抱歉，沒有符合條件的資料!', total: 0 })).toBeNull()
  })

  it('merges a month, replacing an existing entry and keeping newest first', () => {
    let history = { updatedAt: null, companies: { 2330: [['2026-08', 27]] } }
    history = mergePeMonth(history, '2026-09', [{ code: '2330', pe: 28.28 }])
    history = mergePeMonth(history, '2026-09', [{ code: '2330', pe: 28.5 }])
    expect(history.companies['2330']).toEqual([
      ['2026-09', 28.5],
      ['2026-08', 27],
    ])
    expect(hasPeMonth(history, '2026-09')).toBe(true)
    expect(hasPeMonth(history, '2026-07')).toBe(false)
  })

  it('computes the previous month and its days, last day first', () => {
    expect(previousMonth(new Date('2026-10-05T12:00:00Z'))).toBe('2026-09')
    expect(previousMonth(new Date('2026-01-10T12:00:00Z'))).toBe('2025-12')
    const days = monthDaysDescending('2026-02')
    expect(days[0]).toBe('20260228')
    expect(days).toHaveLength(28)
    expect(days.at(-1)).toBe('20260201')
  })
})

describe('parseMopsIncomeTables', () => {
  it('turns each hasBorder table row into a header-keyed object', () => {
    const html = `
      <html><body>
      <table class='hasBorder'>
        <tr class='tblHead'><th>公司代號</th><th>公司名稱</th><th>基本每股盈餘（元）</th></tr>
        <tr class='even'><td>2330</td><td>台積電</td><td style='text-align:right !important;'>29.31&nbsp;</td></tr>
        <tr class='odd'><td>2303</td><td>聯電</td><td>1.85</td></tr>
      </table>
      <table class='hasBorder'>
        <tr class='tblHead'><th>公司代號</th><th>公司名稱</th><th>淨收益</th><th>基本每股盈餘（元）</th></tr>
        <tr class='even'><td>2881</td><td>富邦金</td><td>1,000</td><td>6.10</td></tr>
      </table>
      </body></html>`
    expect(parseMopsIncomeTables(html)).toEqual([
      { 公司代號: '2330', 公司名稱: '台積電', '基本每股盈餘（元）': '29.31' },
      { 公司代號: '2303', 公司名稱: '聯電', '基本每股盈餘（元）': '1.85' },
      { 公司代號: '2881', 公司名稱: '富邦金', 淨收益: '1,000', '基本每股盈餘（元）': '6.10' },
    ])
  })
})
