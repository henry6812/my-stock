import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
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
