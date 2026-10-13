import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import WatchlistForm, { WATCHLIST_FORM_ID } from './WatchlistForm'

const renderForm = (onSubmit) =>
  render(
    <>
      <WatchlistForm formId={WATCHLIST_FORM_ID} disabled={false} onSubmit={onSubmit} />
      <button type="submit" form={WATCHLIST_FORM_ID}>加入</button>
    </>,
  )

describe('WatchlistForm', () => {
  it('submits the market and symbol', async () => {
    const onSubmit = vi.fn(async () => {})
    renderForm(onSubmit)
    fireEvent.change(screen.getByLabelText('股票代號'), { target: { value: '2330' } })
    fireEvent.click(screen.getByRole('button', { name: '加入' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ market: 'TW', symbol: '2330' }))
  })

  it('shows the service error under the symbol', async () => {
    const onSubmit = vi.fn(async () => {
      throw new Error('已在觀察清單')
    })
    renderForm(onSubmit)
    fireEvent.change(screen.getByLabelText('股票代號'), { target: { value: '2330' } })
    fireEvent.click(screen.getByRole('button', { name: '加入' }))
    expect(await screen.findByText('已在觀察清單')).toBeInTheDocument()
  })

  it('requires a symbol', async () => {
    const onSubmit = vi.fn()
    renderForm(onSubmit)
    fireEvent.click(screen.getByRole('button', { name: '加入' }))
    expect(await screen.findByText('請輸入代號')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
