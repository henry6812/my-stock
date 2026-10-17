import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import ForecastAssumptions from './ForecastAssumptions'
import ForecastChart from './ForecastChart'
import ForecastWhatIf from './ForecastWhatIf'
import { DEFAULT_WHAT_IF, runForecast } from '../../utils/forecast'

const assumptions = {
  monthlyIncomeTwd: 100000,
  monthlyExpenseTwd: 60000,
  investRatio: 0.75,
  stockReturn: 0.06,
  cashReturn: 0.01,
  inflation: 0.02,
  withdrawalRate: 0.04,
  horizonYears: 30,
}
const base = runForecast({ stockTwd: 3_000_000, cashTwd: 1_000_000, assumptions, startMonth: '2026-10' })

describe('ForecastChart', () => {
  it('offers the four horizons and reports a change', () => {
    const onHorizonChange = vi.fn()
    render(<ForecastChart base={base} horizonYears={30} onHorizonChange={onHorizonChange} />)
    for (const label of ['10 年', '20 年', '30 年', '40 年']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    fireEvent.click(screen.getByText('10 年'))
    expect(onHorizonChange).toHaveBeenCalledWith(10)
  })
})

describe('ForecastWhatIf', () => {
  it('shows the knob values and no difference while untouched', () => {
    render(
      <ForecastWhatIf
        assumptions={assumptions}
        knobs={DEFAULT_WHAT_IF}
        onChange={() => {}}
        onReset={() => {}}
        diffText={null}
      />,
    )
    expect(screen.getByText('每月支出')).toBeInTheDocument()
    expect(screen.getByText('每月收入')).toBeInTheDocument()
    expect(screen.getAllByText('不變')).toHaveLength(2)
    expect(screen.getByText('75%')).toBeInTheDocument()
    expect(screen.getByText('6%')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '重設' })).not.toBeInTheDocument()
  })

  it('shows the difference and resets', () => {
    const onReset = vi.fn()
    render(
      <ForecastWhatIf
        assumptions={assumptions}
        knobs={{ ...DEFAULT_WHAT_IF, expenseDeltaTwd: -5000 }}
        onChange={() => {}}
        onReset={onReset}
        diffText="財務自由提早 3 年"
      />,
    )
    expect(screen.getByText('−$5,000')).toBeInTheDocument()
    expect(screen.getByText('財務自由提早 3 年')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '重設' }))
    expect(onReset).toHaveBeenCalled()
  })
})

describe('ForecastAssumptions', () => {
  const resolved = {
    ...assumptions,
    sources: { monthlyIncomeTwd: 'auto', monthlyExpenseTwd: 'custom', investRatio: 'auto' },
    isComplete: true,
  }
  const auto = { monthlyIncomeTwd: 100000, monthlyExpenseTwd: 58000, expenseMonthsUsed: 4, investRatio: 0.75 }
  const start = { stockTwd: 3_000_000, cashTwd: 1_000_000, holdingsReturn: 0.25, unsetCostCount: 2 }

  it('lists every assumption with its value and source', () => {
    render(
      <ForecastAssumptions assumptions={resolved} auto={auto} start={start} isMobile onSave={vi.fn()} />,
    )
    expect(screen.getByText('每月收入')).toBeInTheDocument()
    expect(screen.getByText('$100,000')).toBeInTheDocument()
    expect(screen.getByText('收入設定的每月收入')).toBeInTheDocument()
    expect(screen.getByText('$60,000')).toBeInTheDocument()
    expect(screen.getByText('自訂 · 依 4 個月資料平均為 $58,000')).toBeInTheDocument()
    expect(screen.getByText('目前股票占比')).toBeInTheDocument()
    expect(screen.getByText('目前持股累計報酬 25%（2 檔未設定成本）')).toBeInTheDocument()
    expect(screen.getByText('提領率')).toBeInTheDocument()
  })

  it('saves an edited rate as a fraction', async () => {
    const onSave = vi.fn().mockResolvedValue(true)
    render(
      <ForecastAssumptions assumptions={resolved} auto={auto} start={start} isMobile onSave={onSave} />,
    )
    fireEvent.click(screen.getByRole('button', { name: '股票年報酬 6%，編輯' }))
    fireEvent.change(screen.getByRole('spinbutton', { name: '股票年報酬' }), { target: { value: '7.5' } })
    fireEvent.click(screen.getByRole('button', { name: /^儲 ?存$/ }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ stockReturn: 0.075 }))
  })

  it('puts an overridden value back to automatic', async () => {
    const onSave = vi.fn().mockResolvedValue(true)
    render(
      <ForecastAssumptions assumptions={resolved} auto={auto} start={start} isMobile onSave={onSave} />,
    )
    fireEvent.click(screen.getByRole('button', { name: '每月支出 $60,000，編輯' }))
    fireEvent.click(screen.getByRole('button', { name: '改回自動' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ monthlyExpenseTwd: null }))
  })

  it('is read-only when writing is disabled', () => {
    render(
      <ForecastAssumptions assumptions={resolved} auto={auto} start={start} isMobile disabled onSave={vi.fn()} />,
    )
    expect(screen.queryByRole('button', { name: /，編輯$/ })).not.toBeInTheDocument()
  })
})
