import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import ScreenSection from './ScreenSection'

const item = (code, distance, extra = {}) => ({
  code,
  name: `股${code}`,
  industryName: '半導體',
  price: 90,
  priceSource: 'daily',
  fallbackMonth: null,
  distanceToFair: distance,
  zone: 'below',
  flags: [],
  custom: false,
  owned: false,
  watched: false,
  ...extra,
})
const result = {
  below: Array.from({ length: 7 }, (_, index) => item(String(1000 + index), -0.5 + index * 0.01)),
  fairLow: [item('2000', -0.1, { zone: 'fair-low', owned: true, priceSource: 'month-end', fallbackMonth: '2026-08' })],
  flagged: [item('3000', -0.6, { flags: ['construction'] })],
  counts: { listed: 8, flagged: 1 },
}
const handlers = () => ({
  onBasisChange: vi.fn(),
  onOpen: vi.fn(),
  onOpenAll: vi.fn(),
  onOpenSettings: vi.fn(),
  onOpenIndustries: vi.fn(),
})
const renderSection = (props = {}) => {
  const h = handlers()
  render(
    <ScreenSection
      status="ready"
      result={result}
      basis="ttm"
      industries={[]}
      quotesDate="20261014"
      quotesFailed={false}
      {...h}
      {...props}
    />,
  )
  return h
}

describe('ScreenSection', () => {
  it('previews five rows per group and links to the full list', () => {
    const h = renderSection()
    expect(screen.getByText('低估候選')).toBeInTheDocument()
    expect(screen.getByText('低於便宜價')).toBeInTheDocument()
    expect(screen.getByText('7 檔')).toBeInTheDocument()
    expect(screen.getByText('股1004')).toBeInTheDocument()
    expect(screen.queryByText('股1005')).not.toBeInTheDocument()
    expect(screen.getByText('1000 · 半導體')).toBeInTheDocument()
    expect(screen.getByText('距合理價 −50%')).toBeInTheDocument()
    expect(screen.getByText('2000 · 半導體 · 持有 · 8 月底價')).toBeInTheDocument()
    expect(screen.getByText('10/14 收盤')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '查看全部 8 檔 · 另有 1 檔被標記' }))
    expect(h.onOpenAll).toHaveBeenCalled()
  })

  it('switches basis, opens industries, settings and a stock', () => {
    const h = renderSection()
    fireEvent.click(screen.getByRole('button', { name: '今年' }))
    expect(h.onBasisChange).toHaveBeenCalledWith('thisYear')
    fireEvent.click(screen.getByRole('button', { name: '全部產業' }))
    expect(h.onOpenIndustries).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '篩選門檻' }))
    expect(h.onOpenSettings).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '股1000 1000，查看個股' }))
    expect(h.onOpen).toHaveBeenCalledWith(result.below[0])
  })

  it('says when the data has not been built', () => {
    renderSection({ status: 'missing', result: null })
    expect(screen.getByText('篩選資料尚未產生')).toBeInTheDocument()
  })

  it('says when nothing is below 合理價, noting an industry filter', () => {
    renderSection({ result: { below: [], fairLow: [], flagged: [], counts: { listed: 0, flagged: 0 } }, industries: ['24'] })
    expect(screen.getByText('目前沒有低於合理價的股票（已篩選產業）')).toBeInTheDocument()
  })

  it('shows a failed price update', () => {
    renderSection({ quotesFailed: true })
    expect(screen.getByText('價格更新失敗，使用月底價')).toBeInTheDocument()
  })
})
