import { describe, it, expect, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import HoldingForm from './HoldingForm'

// Smoke test proving the React + Ant Design + jsdom render path works, so
// future component tests have a known-good baseline to build on.
describe('<HoldingForm />', () => {
  it('renders the expected fields', () => {
    render(<HoldingForm onSubmit={vi.fn()} />)

    expect(screen.getByLabelText('市場')).toBeInTheDocument()
    expect(screen.getByLabelText('持股分類')).toBeInTheDocument()
    expect(screen.getByLabelText('持有人')).toBeInTheDocument()
    expect(
      screen.getByPlaceholderText('例如 2330 或 AAPL'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/買進價格/)).toBeInTheDocument()
  })

  // Saving writes the holding locally first; the list refreshes with it while
  // the price fetch is still running and the sheet is open. The form must not
  // then treat the holding it is saving as one that already existed.
  describe('while a submit is in flight', () => {
    const holderOptions = [{ value: 'Po', label: 'Po' }]

    const renderForm = (existingHoldings) => {
      let resolveSubmit
      const onSubmit = vi.fn(() => new Promise((resolve) => { resolveSubmit = resolve }))
      const ui = (holdings) => (
        <>
          <HoldingForm
            onSubmit={onSubmit}
            formId="holding-form"
            holderOptions={holderOptions}
            existingHoldings={holdings}
          />
          <button type="submit" form="holding-form">送出</button>
        </>
      )
      const view = render(ui(existingHoldings))
      return { onSubmit, resolve: (value) => resolveSubmit(value), rerenderWith: (holdings) => view.rerender(ui(holdings)) }
    }

    const fillAndSubmit = async (onSubmit) => {
      fireEvent.mouseDown(screen.getByRole('combobox', { name: '持有人' }))
      fireEvent.click(await screen.findByTitle('Po'))
      fireEvent.change(screen.getByPlaceholderText('例如 2330 或 AAPL'), { target: { value: '2330' } })
      fireEvent.change(screen.getByRole('spinbutton', { name: '股數' }), { target: { value: '100' } })
      fireEvent.change(screen.getByRole('spinbutton', { name: /買進價格/ }), { target: { value: '500' } })
      fireEvent.click(screen.getByRole('button', { name: '送出' }))
      await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    }

    it('does not offer to add to the holding it has just created', async () => {
      const { onSubmit, resolve, rerenderWith } = renderForm([])
      await fillAndSubmit(onSubmit)

      rerenderWith([{ market: 'TW', symbol: '2330', holder: 'Po', shares: 100 }])
      expect(screen.queryByText(/已持有/)).not.toBeInTheDocument()
      expect(screen.queryByText(/將以買進方式加碼/)).not.toBeInTheDocument()

      await act(async () => resolve(true))
    })

    it('keeps showing the pre-submit shares for a holding that already existed', async () => {
      const { onSubmit, resolve, rerenderWith } = renderForm([
        { market: 'TW', symbol: '2330', holder: 'Po', shares: 100 },
      ])
      await fillAndSubmit(onSubmit)

      rerenderWith([{ market: 'TW', symbol: '2330', holder: 'Po', shares: 200 }])
      expect(screen.getByText('Po 已持有 100 股，將以買進方式加碼')).toBeInTheDocument()

      await act(async () => resolve(true))
    })
  })

  const fillExisting = async (totalCost) => {
    render(
      <HoldingForm
        onSubmit={vi.fn()}
        holderOptions={[{ value: 'Po', label: 'Po' }]}
        existingHoldings={[{ market: 'TW', symbol: '2330', holder: 'Po', shares: 100, totalCost }]}
      />,
    )
    fireEvent.mouseDown(screen.getByRole('combobox', { name: '持有人' }))
    fireEvent.click(await screen.findByTitle('Po'))
    fireEvent.change(screen.getByPlaceholderText('例如 2330 或 AAPL'), { target: { value: '2330' } })
    fireEvent.change(screen.getByRole('spinbutton', { name: '股數' }), { target: { value: '50' } })
    fireEvent.change(screen.getByRole('spinbutton', { name: /買進價格/ }), { target: { value: '560' } })
  }

  it('previews a buy into an existing holding at the new average', async () => {
    await fillExisting(50000)
    expect(await screen.findByText(/儲存後 150 股 · 均價 \$520/)).toBeInTheDocument()
    expect(screen.queryByText('覆蓋為輸入的股數')).not.toBeInTheDocument()
  })

  it('notes that an existing holding without cost still needs calibrating', async () => {
    await fillExisting(null)
    expect(await screen.findByText('儲存後 150 股（成本仍需校正）')).toBeInTheDocument()
  })

  it('shows fractional US shares to 4 decimals', async () => {
    render(
      <HoldingForm
        onSubmit={vi.fn()}
        holderOptions={[{ value: 'Po', label: 'Po' }]}
        existingHoldings={[{ market: 'US', symbol: 'AAPL', holder: 'Po', shares: 0.1234, totalCost: 20 }]}
      />,
    )
    fireEvent.mouseDown(screen.getByRole('combobox', { name: '市場' }))
    fireEvent.click(await screen.findByTitle('美股 (US)'))
    fireEvent.mouseDown(screen.getByRole('combobox', { name: '持有人' }))
    fireEvent.click(await screen.findByTitle('Po'))
    fireEvent.change(screen.getByPlaceholderText('例如 2330 或 AAPL'), { target: { value: 'AAPL' } })
    expect(await screen.findByText('Po 已持有 0.1234 股，將以買進方式加碼')).toBeInTheDocument()
  })

  it('refuses buy prices with more than 4 decimals', async () => {
    const onSubmit = vi.fn()
    render(
      <>
        <HoldingForm onSubmit={onSubmit} formId="f" holderOptions={[{ value: 'Po', label: 'Po' }]} />
        <button type="submit" form="f">送出</button>
      </>,
    )
    fireEvent.change(screen.getByRole('spinbutton', { name: /買進價格/ }), { target: { value: '1.23456' } })
    fireEvent.click(screen.getByRole('button', { name: '送出' }))
    expect(await screen.findByText('最多 4 位小數')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('applies the given formId to the form element', () => {
    const { container } = render(
      <HoldingForm onSubmit={vi.fn()} formId="my-holding-form" />,
    )
    expect(container.querySelector('form#my-holding-form')).not.toBeNull()
  })
})
