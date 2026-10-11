import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import ValuationCard from './ValuationCard'
import { buildValuationModel, EMPTY_VALUATION_SETTINGS } from '../../utils/valuation'
import { TW_FUNDAMENTALS } from '../../utils/incomeModel.fixture'

const okModel = {
  valuation: {
    status: 'ok',
    prices: { cheap: 120, fair: 150, expensive: 180 },
    zone: 'fair-low',
    distanceToFair: -0.0667,
    scale: { min: 108, max: 198 },
    price: 140,
  },
}

describe('ValuationCard', () => {
  it('shows the three prices and the verdict', () => {
    render(<ValuationCard model={okModel} basis="ttm" onBasisChange={() => {}} market="TW" currency="TWD" />)
    expect(screen.getByRole('heading', { name: '估價' })).toBeInTheDocument()
    expect(screen.getByText('便宜價')).toBeInTheDocument()
    expect(screen.getByText('$120.00')).toBeInTheDocument()
    expect(screen.getByText('$150.00')).toBeInTheDocument()
    expect(screen.getByText('$180.00')).toBeInTheDocument()
    expect(screen.getByText('合理偏低')).toBeInTheDocument()
    expect(screen.getByText('比合理價低 6.7%')).toBeInTheDocument()
    expect(screen.getByLabelText('現價 $140.00')).toHaveTextContent('現價 $140.00')
  })

  it('offers four bases for TW stocks, two for US, and reports basis changes', () => {
    const onBasisChange = vi.fn()
    const { rerender } = render(
      <ValuationCard model={okModel} basis="ttm" onBasisChange={onBasisChange} market="TW" currency="TWD" />,
    )
    for (const label of ['近四季', '下季後', '今年', '明年']) expect(screen.getByText(label)).toBeInTheDocument()
    fireEvent.click(screen.getByText('下季後'))
    expect(onBasisChange).toHaveBeenCalledWith('ttmAfterNext')
    rerender(<ValuationCard model={okModel} basis="ttm" onBasisChange={onBasisChange} market="US" currency="USD" />)
    expect(screen.getByText('近四季 TTM')).toBeInTheDocument()
    expect(screen.getByText('未來四季預估')).toBeInTheDocument()
  })

  it('shows how the EPS in use is made up, or why there is none', () => {
    const withFormula = { ...okModel, chosen: { eps: 11.8, formula: '2025 Q4–2026 Q2 實際 + 2026 Q3 推估 合計 11.80', composition: { actual: 3, projected: 1 } } }
    const { rerender } = render(
      <ValuationCard model={withFormula} basis="ttmAfterNext" onBasisChange={() => {}} market="TW" currency="TWD" />,
    )
    expect(screen.getByText('2025 Q4–2026 Q2 實際 + 2026 Q3 推估 合計 11.80')).toBeInTheDocument()
    const unavailable = { valuation: { status: 'no-eps' }, chosen: { eps: null, reason: '金融股不適用損益表推估' } }
    rerender(<ValuationCard model={unavailable} basis="nextYear" onBasisChange={() => {}} market="TW" currency="TWD" />)
    expect(screen.getByText('金融股不適用損益表推估')).toBeInTheDocument()
  })

  it.each([
    ['loss', '虧損中，無法用本益比估價'],
    ['no-eps', '資料不足，無法計算'],
    ['missing-pe', '歷史本益比不足，請在估價假設填入本益比'],
    ['invalid-pe', '本益比需符合 便宜 ≤ 合理 ≤ 昂貴'],
  ])('explains status %s', (status, text) => {
    render(<ValuationCard model={{ valuation: { status } }} basis="ttm" onBasisChange={() => {}} market="TW" currency="TWD" />)
    expect(screen.getByText(text)).toBeInTheDocument()
  })

  it('hides the verdict and marker without a price', () => {
    const noPrice = { valuation: { ...okModel.valuation, zone: null, distanceToFair: null, price: null } }
    render(<ValuationCard model={noPrice} basis="ttm" onBasisChange={() => {}} market="TW" currency="TWD" />)
    expect(screen.queryByText(/比合理價/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/現價/)).not.toBeInTheDocument()
  })

  describe('EPS × 本益比 equation', () => {
    const modelFor = (basis, settings = EMPTY_VALUATION_SETTINGS, fundamentals = TW_FUNDAMENTALS) =>
      buildValuationModel({ fundamentals, settings, price: 50, basis, todayIso: '2026-10-11' })
    const renderCard = (basis, options = {}) => {
      const onOpenAssumptions = vi.fn()
      render(
        <ValuationCard
          model={modelFor(basis, options.settings, options.fundamentals)}
          basis={basis}
          onBasisChange={() => {}}
          onOpenAssumptions={onOpenAssumptions}
          market="TW"
          currency="TWD"
        />,
      )
      return onOpenAssumptions
    }
    const cellStates = () =>
      [...document.querySelectorAll('.valuation-factor-cell')].map((cell) => cell.dataset.state)

    it('shows the EPS in use as published and projected quarters, and opens the projection', () => {
      const onOpenAssumptions = renderCard('thisYear')
      const eps = screen.getByRole('button', { name: 'EPS 12.88，2 季實際・2 季推估，調整推估假設' })
      expect(eps).toHaveTextContent('12.88')
      expect(cellStates()).toEqual(['actual', 'actual', 'projected', 'projected'])
      fireEvent.click(eps)
      expect(onOpenAssumptions).toHaveBeenCalledWith('model')
    })

    it('shows 近四季 as published only, with nothing to adjust', () => {
      renderCard('ttm')
      expect(screen.queryByRole('button', { name: /^EPS/ })).not.toBeInTheDocument()
      expect(screen.getByRole('group', { name: 'EPS 10.72，全為實際・不受假設影響' })).toBeInTheDocument()
      expect(cellStates()).toEqual(['actual', 'actual', 'actual', 'actual'])
    })

    it('leads a custom EPS or a missing projection to 直接指定 EPS', () => {
      const custom = renderCard('nextYear', { settings: { ...EMPTY_VALUATION_SETTINGS, forwardEps: 20 } })
      fireEvent.click(screen.getByRole('button', { name: 'EPS 20.00，直接指定 EPS，調整直接指定 EPS' }))
      expect(custom).toHaveBeenCalledWith('custom')
      expect(cellStates()).toEqual([])
      expect(screen.getByText('自訂')).toBeInTheDocument()
    })

    it('shows -- with the reason when the model does not apply', () => {
      const financial = { ...TW_FUNDAMENTALS, company: { ...TW_FUNDAMENTALS.company, statement: 'financial' } }
      const onOpenAssumptions = renderCard('nextYear', { fundamentals: financial })
      fireEvent.click(screen.getByRole('button', { name: 'EPS --，金融股不適用損益表推估，調整直接指定 EPS' }))
      expect(onOpenAssumptions).toHaveBeenCalledWith('custom')
    })

    it('opens the P/E section from the 本益比 factor', () => {
      const onOpenAssumptions = renderCard('ttm')
      const pe = screen.getByRole('button', { name: /^本益比 .*，歷史區間，調整本益比$/ })
      fireEvent.click(pe)
      expect(onOpenAssumptions).toHaveBeenCalledWith('pe')
    })

    it('keeps the equation when the P/E bands are missing, so they can be set', () => {
      const noPe = { ...TW_FUNDAMENTALS, peSeries: [] }
      renderCard('ttm', { fundamentals: noPe })
      expect(screen.getByRole('button', { name: '本益比 --，尚未設定，調整本益比' })).toBeInTheDocument()
      expect(screen.getByText('歷史本益比不足，請在估價假設填入本益比')).toBeInTheDocument()
    })
  })
})
