import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import ValuationAssumptions from './ValuationAssumptions'
import { EMPTY_VALUATION_SETTINGS } from '../../utils/valuation'

const model = {
  ttm: { eps: 72.11, formula: '近四季 2025 Q3–2026 Q2 合計 72.11' },
  forward: { eps: 79.5, growthRate: 0.2, autoGrowthRate: 0.2, formula: '今年 Q1–Q2 累計 35.17 + …' },
  autoBands: { cheap: 15, fair: 18, expensive: 22, sampleSize: 60 },
  bands: { cheap: 15, fair: 18, expensive: 22, overridden: { cheap: false, fair: false, expensive: false } },
}

const renderOpen = (props = {}) =>
  render(
    <ValuationAssumptions
      model={model}
      market="TW"
      settings={EMPTY_VALUATION_SETTINGS}
      disabled={false}
      open
      onToggle={() => {}}
      onSave={vi.fn().mockResolvedValue({})}
      {...props}
    />,
  )

describe('ValuationAssumptions', () => {
  it('shows both EPS formulas and where the default P/E comes from', () => {
    renderOpen()
    expect(screen.getByText('近四季 2025 Q3–2026 Q2 合計 72.11')).toBeInTheDocument()
    expect(screen.getByText('今年 Q1–Q2 累計 35.17 + …')).toBeInTheDocument()
    expect(screen.getByText('預設：近 60 期本益比的 P25 / P50 / P75')).toBeInTheDocument()
  })

  it('saves only the changed fields, converting growth % to a ratio', async () => {
    const onSave = vi.fn().mockResolvedValue({})
    renderOpen({ onSave })
    fireEvent.change(screen.getByLabelText('合理本益比'), { target: { value: '20' } })
    fireEvent.change(screen.getByLabelText('成長率 (%)'), { target: { value: '15' } })
    fireEvent.click(screen.getByRole('button', { name: /儲\s*存/ }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ peFair: 20, growthRate: 0.15 }))
  })

  it('resets an overridden field', () => {
    const onSave = vi.fn().mockResolvedValue({})
    renderOpen({
      onSave,
      settings: { ...EMPTY_VALUATION_SETTINGS, peFair: 20 },
      model: { ...model, bands: { ...model.bands, fair: 20, overridden: { cheap: false, fair: true, expensive: false } } },
    })
    expect(screen.getByText('已覆寫')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '重設合理本益比' }))
    expect(onSave).toHaveBeenCalledWith({ peFair: null })
  })

  it('is read-only with a hint when writes are disabled', () => {
    renderOpen({ disabled: true })
    expect(screen.getByText('登入後可調整估價假設')).toBeInTheDocument()
    expect(screen.getByLabelText('合理本益比')).toBeDisabled()
  })

  it('warns about an extreme growth rate (TW only)', () => {
    renderOpen({ model: { ...model, forward: { ...model.forward, growthRate: 0.8 } } })
    expect(screen.getByText('成長率異常，建議覆寫')).toBeInTheDocument()
  })

  it('hides growth rate for US stocks', () => {
    renderOpen({ market: 'US' })
    expect(screen.queryByLabelText('成長率 (%)')).not.toBeInTheDocument()
    expect(screen.getByLabelText('預估 EPS')).toBeInTheDocument()
  })

  it('shows a save error inline', async () => {
    renderOpen({ onSave: vi.fn().mockRejectedValue(new Error('本益比必須大於 0')) })
    fireEvent.change(screen.getByLabelText('合理本益比'), { target: { value: '20' } })
    fireEvent.click(screen.getByRole('button', { name: /儲\s*存/ }))
    expect(await screen.findByText('本益比必須大於 0')).toBeInTheDocument()
  })
})
