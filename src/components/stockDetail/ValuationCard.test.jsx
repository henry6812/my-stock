import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import ValuationCard from './ValuationCard'

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
    expect(screen.getByText('便宜價')).toBeInTheDocument()
    expect(screen.getByText('$120.00')).toBeInTheDocument()
    expect(screen.getByText('$150.00')).toBeInTheDocument()
    expect(screen.getByText('$180.00')).toBeInTheDocument()
    expect(screen.getByText('目前合理偏低，距合理價 −6.7%')).toBeInTheDocument()
    expect(screen.getByLabelText('現價 $140.00')).toBeInTheDocument()
  })

  it('labels the forward tab per market and reports basis changes', () => {
    const onBasisChange = vi.fn()
    const { rerender } = render(
      <ValuationCard model={okModel} basis="ttm" onBasisChange={onBasisChange} market="TW" currency="TWD" />,
    )
    fireEvent.click(screen.getByText('今年預估'))
    expect(onBasisChange).toHaveBeenCalledWith('forward')
    rerender(<ValuationCard model={okModel} basis="ttm" onBasisChange={onBasisChange} market="US" currency="USD" />)
    expect(screen.getByText('未來四季預估')).toBeInTheDocument()
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
    expect(screen.queryByText(/距合理價/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/現價/)).not.toBeInTheDocument()
  })
})
