import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import ScreenListSheet from './ScreenListSheet'
import ScreenSettingsSheet from './ScreenSettingsSheet'
import ScreenIndustrySheet from './ScreenIndustrySheet'
import { DEFAULT_SCREEN_SETTINGS, normalizeScreenSettings } from '../../utils/stockScreen'

const item = (code, extra = {}) => ({
  code,
  name: `股${code}`,
  industryName: '半導體',
  price: 90,
  priceSource: 'daily',
  fallbackMonth: null,
  distanceToFair: -0.4,
  zone: 'below',
  flags: [],
  custom: false,
  owned: false,
  watched: false,
  ...extra,
})

const renderSettings = (props = {}) => {
  const onSave = vi.fn()
  render(
    <ScreenSettingsSheet
      open
      isMobile
      settings={DEFAULT_SCREEN_SETTINGS}
      disabled={false}
      saving={false}
      onClose={() => {}}
      onSave={onSave}
      {...props}
    />,
  )
  return onSave
}

describe('ScreenListSheet', () => {
  it('lists every row and folds the flagged ones', () => {
    const result = {
      below: Array.from({ length: 7 }, (_, i) => item(String(1000 + i))),
      fairLow: [],
      flagged: [item('3000', { flags: ['construction'] })],
      counts: { listed: 7, flagged: 1 },
    }
    render(<ScreenListSheet open isMobile result={result} onClose={() => {}} onOpen={vi.fn()} />)
    expect(screen.getByText('股1006')).toBeInTheDocument()
    expect(screen.queryByText('股3000')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '被標記 1 檔' }))
    expect(screen.getByText('3000 · 半導體 · 營建業')).toBeInTheDocument()
  })
})

describe('ScreenSettingsSheet', () => {
  it('edits thresholds in display units and saves stored units', () => {
    const onSave = renderSettings()
    const percent = screen.getByLabelText('業外占比上限')
    expect(percent).toHaveValue('30')
    fireEvent.change(percent, { target: { value: '40' } })
    fireEvent.change(screen.getByLabelText('最低成交金額'), { target: { value: '500' } })
    fireEvent.click(screen.getByRole('switch', { name: '營建業' }))
    fireEvent.click(screen.getByRole('button', { name: /^儲\s?存$/ }))
    const saved = onSave.mock.calls[0][0]
    expect(saved.flags.nonOperating.max).toBeCloseTo(0.4)
    expect(saved.flags.lowTurnover.minTradeValue).toBe(5_000_000)
    expect(saved.flags.construction.enabled).toBe(false)
  })

  it('falls back to the default for a blank threshold', () => {
    const onSave = renderSettings()
    fireEvent.change(screen.getByLabelText('至少月份數'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /^儲\s?存$/ }))
    expect(onSave.mock.calls[0][0].flags.fewPeSamples.minSamples).toBe(36)
  })

  it('resets to the defaults', () => {
    const custom = normalizeScreenSettings({ flags: { epsSpike: { enabled: true, maxGrowth: 5 } } })
    const onSave = renderSettings({ settings: custom })
    fireEvent.click(screen.getByRole('button', { name: '恢復預設' }))
    fireEvent.click(screen.getByRole('button', { name: /^儲\s?存$/ }))
    expect(onSave.mock.calls[0][0].flags.epsSpike.maxGrowth).toBe(2)
  })

  it('is read-only when signed out', () => {
    renderSettings({ disabled: true })
    expect(screen.getByText('登入後可修改')).toBeInTheDocument()
    expect(screen.getByLabelText('業外占比上限')).toBeDisabled()
    expect(screen.getByRole('button', { name: /^儲\s?存$/ })).toBeDisabled()
  })
})

describe('ScreenIndustrySheet', () => {
  it('toggles industries and clears back to all', () => {
    const onChange = vi.fn()
    const { rerender } = render(<ScreenIndustrySheet open isMobile industries={[]} onClose={() => {}} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: '半導體' }))
    expect(onChange).toHaveBeenLastCalledWith(['24'])
    rerender(<ScreenIndustrySheet open isMobile industries={['24']} onClose={() => {}} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: '半導體' }))
    expect(onChange).toHaveBeenLastCalledWith([])
    fireEvent.click(screen.getByRole('button', { name: '全部產業' }))
    expect(onChange).toHaveBeenLastCalledWith([])
  })
})
