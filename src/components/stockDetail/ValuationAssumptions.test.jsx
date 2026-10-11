import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import ValuationAssumptions from './ValuationAssumptions'
import { buildValuationModel, EMPTY_VALUATION_SETTINGS } from '../../utils/valuation'
import { TW_FUNDAMENTALS } from '../../utils/incomeModel.fixture'

const buildModel = (settings) =>
  buildValuationModel({ fundamentals: TW_FUNDAMENTALS, settings, price: 50, basis: 'ttm', todayIso: '2026-10-11' })
const model = buildModel(EMPTY_VALUATION_SETTINGS)

const usModel = () =>
  buildValuationModel({
    fundamentals: { ...TW_FUNDAMENTALS, market: 'US', company: undefined },
    settings: EMPTY_VALUATION_SETTINGS,
    price: 50,
    basis: 'ttm',
    todayIso: '2026-10-11',
  })

const renderOpen = (props = {}) =>
  render(
    <ValuationAssumptions
      model={model}
      buildModel={buildModel}
      market="TW"
      settings={EMPTY_VALUATION_SETTINGS}
      disabled={false}
      open
      isMobile
      title="調整估價假設 · 台積電"
      onClose={() => {}}
      onSave={vi.fn().mockResolvedValue({})}
      {...props}
    />,
  )

describe('ValuationAssumptions', () => {
  it('shows the US EPS figures with their formulas and where the default P/E comes from', () => {
    renderOpen({ market: 'US', model: usModel() })
    expect(screen.getByRole('heading', { name: '本益比' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '未來四季預估' })).toBeInTheDocument()
    expect(screen.getByText('空白時使用過去 8 期本益比的低、中、高位置')).toBeInTheDocument()
  })

  it('opens as its own sheet with a full-width save button', () => {
    renderOpen()
    expect(screen.getByText('調整估價假設 · 台積電')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '記下這次預估' })).toHaveClass('ant-btn-block')
  })

  it('closes after a successful save', async () => {
    const onClose = vi.fn()
    renderOpen({ onClose })
    fireEvent.change(screen.getByLabelText('合理本益比'), { target: { value: '20' } })
    fireEvent.click(screen.getByRole('button', { name: /儲\s*存/ }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('saves only the changed fields', async () => {
    const onSave = vi.fn().mockResolvedValue({})
    renderOpen({ onSave })
    fireEvent.change(screen.getByLabelText('合理本益比'), { target: { value: '20' } })
    fireEvent.change(screen.getByLabelText('預估 EPS'), { target: { value: '80' } })
    fireEvent.click(screen.getByRole('button', { name: /儲\s*存/ }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ peFair: 20, forwardEps: 80 }, expect.objectContaining({ quarter: '2026Q3' })))
  })

  it('resets an overridden field', () => {
    const onSave = vi.fn().mockResolvedValue({})
    renderOpen({
      onSave,
      settings: { ...EMPTY_VALUATION_SETTINGS, peFair: 20 },
      model: buildModel({ ...EMPTY_VALUATION_SETTINGS, peFair: 20 }),
    })
    expect(screen.queryByText('已覆寫')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重設合理本益比' })).toHaveTextContent('改回預設')
    fireEvent.click(screen.getByRole('button', { name: '重設合理本益比' }))
    expect(onSave).toHaveBeenCalledWith({ peFair: null }, null)
  })

  it('is read-only with a hint when writes are disabled', () => {
    renderOpen({ disabled: true })
    expect(screen.getByText('登入後可調整估價假設')).toBeInTheDocument()
    expect(screen.getByLabelText('合理本益比')).toBeDisabled()
  })

  it('never shows a growth-rate field', () => {
    const { unmount } = renderOpen({ market: 'TW' })
    expect(screen.queryByLabelText('成長率 (%)')).toBeNull()
    unmount()
    const usModel = buildValuationModel({
      fundamentals: { ...TW_FUNDAMENTALS, market: 'US', company: undefined },
      settings: EMPTY_VALUATION_SETTINGS,
      price: 50,
      basis: 'ttm',
      todayIso: '2026-10-11',
    })
    renderOpen({ market: 'US', model: usModel })
    expect(screen.queryByLabelText('成長率 (%)')).toBeNull()
    expect(screen.getByLabelText('預估 EPS')).toBeInTheDocument()
  })

  it('shows a save error inline', async () => {
    renderOpen({ onSave: vi.fn().mockRejectedValue(new Error('本益比必須大於 0')) })
    fireEvent.change(screen.getByLabelText('合理本益比'), { target: { value: '20' } })
    fireEvent.click(screen.getByRole('button', { name: /儲\s*存/ }))
    expect(await screen.findByText('本益比必須大於 0')).toBeInTheDocument()
  })
})

describe('ValuationAssumptions — income model (TW)', () => {
  it('shows next quarter, this year and next year at the top', () => {
    renderOpen()
    const summary = screen.getByLabelText('推估結果')
    expect(summary).toHaveTextContent('下一季 2026 Q3 EPS')
    expect(summary).toHaveTextContent('3.40')
    expect(summary).toHaveTextContent('YoY ▲46.6%')
    expect(summary).toHaveTextContent('QoQ ▲11.8%')
    expect(summary).toHaveTextContent('今年 12.88 · 明年 19.00')
  })

  it('shows the automatic values as placeholders and updates the estimate live', () => {
    renderOpen()
    const margin = screen.getByLabelText('毛利率（%）')
    expect(margin).toHaveAttribute('placeholder', '自動 50.0')
    expect(screen.getByLabelText('業外（億/季）')).toHaveAttribute('placeholder', '自動 0.0')
    fireEvent.change(margin, { target: { value: '60' } })
    expect(screen.getByLabelText('推估結果')).toHaveTextContent('4.48')
  })

  it('records the estimate without changes when next quarter has no snapshot yet', async () => {
    const onSave = vi.fn().mockResolvedValue({})
    renderOpen({ onSave })
    fireEvent.click(screen.getByRole('button', { name: '記下這次預估' }))
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        {},
        { quarter: '2026Q3', eps: 3.4, revenue: 1350, grossMargin: expect.closeTo(0.5, 6), opexRatio: expect.closeTo(0.2, 6) },
      ),
    )
  })

  it('saves changed assumptions with a snapshot of the new estimate', async () => {
    const onSave = vi.fn().mockResolvedValue({})
    const settings = { ...EMPTY_VALUATION_SETTINGS, snapshots: { '2026Q3': { eps: 3.4, savedAt: '2026-10-01T00:00:00Z' } } }
    renderOpen({ onSave, settings, model: buildModel(settings) })
    expect(screen.getByRole('button', { name: /儲\s*存/ })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('毛利率（%）'), { target: { value: '60' } })
    fireEvent.click(screen.getByRole('button', { name: /儲\s*存/ }))
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        { model: { global: { grossMargin: 0.6 } } },
        expect.objectContaining({ quarter: '2026Q3', eps: expect.closeTo(4.48, 6), grossMargin: 0.6 }),
      ),
    )
  })

  it('resets a global override at once', () => {
    const onSave = vi.fn().mockResolvedValue({})
    const settings = { ...EMPTY_VALUATION_SETTINGS, model: { global: { ...EMPTY_VALUATION_SETTINGS.model.global, taxRate: 0.18 }, quarters: {} } }
    renderOpen({ onSave, settings, model: buildModel(settings) })
    fireEvent.click(screen.getByRole('button', { name: '重設稅率' }))
    expect(onSave).toHaveBeenCalledWith({ model: { global: { taxRate: null } } }, null)
  })

  it('keeps the sign key on fields that can be negative', () => {
    renderOpen()
    expect(screen.getByLabelText('營收 YoY（%）')).not.toHaveAttribute('inputmode')
    expect(screen.getByLabelText('業外（億/季）')).not.toHaveAttribute('inputmode')
    expect(screen.getByLabelText('稅率（%）')).toHaveAttribute('inputmode', 'decimal')
  })

  it('shows shares and calibration under 進階', () => {
    renderOpen()
    fireEvent.click(screen.getByRole('button', { name: '進階' }))
    expect(screen.getByLabelText('非控制權益比（%）')).toBeInTheDocument()
    expect(screen.getByText('0.0 億股')).toBeInTheDocument()
  })

  it('lists projected quarters by year with the yearly total', () => {
    renderOpen()
    const list = screen.getByLabelText('逐季推估')
    expect(list).toHaveTextContent('2026今年 12.88')
    expect(list).toHaveTextContent('2027明年 19.00')
    expect(screen.getByRole('button', { name: '2026 Q3 推估 EPS 3.40' })).toHaveTextContent('營收已全部公布')
    expect(screen.getByRole('button', { name: '2026 Q4 推估 EPS 3.40' })).not.toHaveTextContent('已公布')
  })

  it('opens one quarter’s statement and overrides it on its own', async () => {
    const onSave = vi.fn().mockResolvedValue({})
    const settings = { ...EMPTY_VALUATION_SETTINGS, snapshots: { '2026Q3': { eps: 3.4 } } }
    renderOpen({ onSave, settings, model: buildModel(settings) })
    fireEvent.click(screen.getByRole('button', { name: '2026 Q4 推估 EPS 3.40' }))
    expect(screen.getByLabelText('2026 Q4 營收 YoY（%）')).toHaveAttribute('placeholder', '50.0')
    expect(screen.queryByLabelText('2026 Q3 毛利率（%）')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('2026 Q4 毛利率（%）'), { target: { value: '55' } })
    expect(screen.getByRole('button', { name: '2026 Q4 推估 EPS 3.94' })).toHaveTextContent('已覆寫')
    fireEvent.click(screen.getByRole('button', { name: /儲\s*存/ }))
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({ model: { quarters: { '2026Q4': { grossMargin: 0.55 } } } }, expect.any(Object)),
    )
  })

  it('hides the revenue YoY input for a quarter whose revenue is all published', () => {
    renderOpen()
    fireEvent.click(screen.getByRole('button', { name: '2026 Q3 推估 EPS 3.40' }))
    expect(screen.queryByLabelText('2026 Q3 營收 YoY（%）')).not.toBeInTheDocument()
    expect(screen.getByLabelText('2026 Q3 毛利率（%）')).toBeInTheDocument()
  })

  it('explains why the model is unavailable and keeps 直接指定 EPS', () => {
    const financial = { ...TW_FUNDAMENTALS, company: { ...TW_FUNDAMENTALS.company, statement: 'financial' } }
    const build = (settings) =>
      buildValuationModel({ fundamentals: financial, settings, price: 50, basis: 'ttm', todayIso: '2026-10-11' })
    renderOpen({ model: build(EMPTY_VALUATION_SETTINGS), buildModel: build })
    expect(screen.getByText('金融股不適用損益表推估')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '直接指定 EPS' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /儲\s*存/ })).toBeDisabled()
  })

  it('notes that a custom EPS takes over this year and next year', () => {
    renderOpen()
    fireEvent.change(screen.getByLabelText('預估 EPS'), { target: { value: '20' } })
    expect(screen.getByText('已使用自訂 EPS，模型結果僅供參考')).toBeInTheDocument()
  })

  it('compares past estimates with the published figures', () => {
    const settings = {
      ...EMPTY_VALUATION_SETTINGS,
      snapshots: {
        '2026Q2': { eps: 3.2, revenue: 1_250, grossMargin: 0.52, opexRatio: 0.19, savedAt: '2026-07-20T00:00:00Z' },
        '2026Q3': { eps: 3.4, savedAt: '2026-10-01T00:00:00Z' },
      },
    }
    renderOpen({ settings, model: buildModel(settings) })
    const row = screen.getByRole('button', { name: /2026 Q2/ })
    expect(row).toHaveTextContent('預估 3.20 → 實際 3.04')
    expect(row).toHaveTextContent('▼5.0%')
    expect(screen.queryByRole('button', { name: /^2026 Q3 預估/ })).not.toBeInTheDocument()
    fireEvent.click(row)
    expect(screen.getByText('52.0% → 50.0%')).toBeInTheDocument()
  })
})
