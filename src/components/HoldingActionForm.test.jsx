import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import HoldingActionForm from './HoldingActionForm'

const holding = {
  id: 1,
  market: 'TW',
  symbol: '2330',
  holder: 'Po',
  assetTag: 'STOCK',
  shares: 100,
  totalCost: 50000,
  latestCurrency: 'TWD',
}

const renderForm = (props = {}) => {
  const onSubmit = vi.fn()
  const onCalibrateInstead = vi.fn()
  render(
    <>
      <HoldingActionForm
        formId="holding-action"
        mode="buy"
        holding={holding}
        holderOptions={[{ value: 'Po', label: 'Po' }, { value: 'Wei', label: 'Wei' }]}
        holdingTagOptions={[{ value: 'STOCK', label: '個股' }, { value: 'ETF', label: 'ETF' }]}
        onSubmit={onSubmit}
        onCalibrateInstead={onCalibrateInstead}
        {...props}
      />
      <button type="submit" form="holding-action">送出</button>
    </>,
  )
  return { onSubmit, onCalibrateInstead }
}

const sharesInput = () => screen.getByRole('spinbutton', { name: '股數' })
const submit = () => fireEvent.click(screen.getByRole('button', { name: '送出' }))

describe('<HoldingActionForm /> buy', () => {
  it('previews the new average and submits shares and price', async () => {
    const { onSubmit } = renderForm()
    fireEvent.change(sharesInput(), { target: { value: '50' } })
    fireEvent.change(screen.getByRole('spinbutton', { name: /每股價格/ }), { target: { value: '560' } })
    expect(await screen.findByText(/買進後 150 股 · 均價 \$520/)).toBeInTheDocument()
    submit()
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ shares: 50, price: 560 }))
  })

  it('points to calibration when the holding has no cost', () => {
    const { onCalibrateInstead } = renderForm({ holding: { ...holding, totalCost: null } })
    expect(screen.getByText(/這檔還沒設定成本/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '先校正成本' }))
    expect(onCalibrateInstead).toHaveBeenCalled()
  })
})

describe('<HoldingActionForm /> sell', () => {
  it('refuses more shares than are held', async () => {
    const { onSubmit } = renderForm({ mode: 'sell' })
    fireEvent.change(sharesInput(), { target: { value: '101' } })
    submit()
    expect(await screen.findByText('賣出股數不可超過持有股數')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('fills everything with 全部 and warns that the holding goes away', async () => {
    renderForm({ mode: 'sell' })
    fireEvent.click(screen.getByRole('button', { name: '全部' }))
    expect(sharesInput()).toHaveValue('100')
    expect(await screen.findByText('賣出全部會移除這筆持股')).toBeInTheDocument()
  })

  it('previews the remaining shares and submits', async () => {
    const { onSubmit } = renderForm({ mode: 'sell' })
    fireEvent.change(sharesInput(), { target: { value: '30' } })
    expect(await screen.findByText('賣出後 70 股')).toBeInTheDocument()
    submit()
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ shares: 30 }))
  })
})

describe('<HoldingActionForm /> calibrate', () => {
  it('starts from the current shares and average, and can clear the cost', async () => {
    const { onSubmit } = renderForm({ mode: 'calibrate' })
    expect(screen.getByText('用於修正錯誤、股票分割或配股，不算買賣。')).toBeInTheDocument()
    expect(sharesInput()).toHaveValue('100')
    const average = screen.getByRole('spinbutton', { name: /平均成本/ })
    expect(average).toHaveValue('500.00')
    fireEvent.change(average, { target: { value: '' } })
    submit()
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ shares: 100, averageCost: null }))
  })
})

describe('<HoldingActionForm /> edit', () => {
  it('submits the current tag and holder', async () => {
    const { onSubmit } = renderForm({ mode: 'edit' })
    submit()
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ assetTag: 'STOCK', holder: 'Po' }))
  })
})

describe('<HoldingActionForm /> while saving', () => {
  // After a write, the list reloads while the form is still open: the form
  // must keep previewing against the holding it was opened with.
  it('does not flash the sell-everything warning once a partial sale lands', async () => {
    const ui = (current) => (
      <HoldingActionForm formId="holding-action" mode="sell" holding={current} onSubmit={vi.fn()} />
    )
    const { rerender } = render(ui(holding))
    fireEvent.change(sharesInput(), { target: { value: '50' } })
    expect(await screen.findByText('賣出後 50 股')).toBeInTheDocument()
    rerender(ui({ ...holding, shares: 50, totalCost: 25000 }))
    expect(screen.getByText('賣出後 50 股')).toBeInTheDocument()
    expect(screen.queryByText('賣出全部會移除這筆持股')).not.toBeInTheDocument()
  })
})

describe('<HoldingActionForm /> precision', () => {
  it('saves an unchanged calibration without rounding the cost', async () => {
    const { onSubmit } = renderForm({ mode: 'calibrate', holding: { ...holding, shares: 3, totalCost: 1000 } })
    submit()
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    const { shares, averageCost } = onSubmit.mock.calls[0][0]
    expect(shares * averageCost).toBe(1000)
  })

  it('refuses prices with more than 4 decimals', async () => {
    const { onSubmit } = renderForm()
    fireEvent.change(sharesInput(), { target: { value: '10' } })
    fireEvent.change(screen.getByRole('spinbutton', { name: /每股價格/ }), { target: { value: '1.23456' } })
    submit()
    expect(await screen.findByText('最多 4 位小數')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
