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
      fireEvent.click(screen.getByRole('button', { name: '送出' }))
      await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    }

    it('does not offer to add to the holding it has just created', async () => {
      const { onSubmit, resolve, rerenderWith } = renderForm([])
      await fillAndSubmit(onSubmit)

      rerenderWith([{ market: 'TW', symbol: '2330', holder: 'Po', shares: 100 }])
      expect(screen.queryByText(/已持有/)).not.toBeInTheDocument()
      expect(screen.queryByText('加總到現有股數')).not.toBeInTheDocument()

      await act(async () => resolve(true))
    })

    it('keeps showing the pre-submit shares for a holding that already existed', async () => {
      const { onSubmit, resolve, rerenderWith } = renderForm([
        { market: 'TW', symbol: '2330', holder: 'Po', shares: 100 },
      ])
      await fillAndSubmit(onSubmit)

      rerenderWith([{ market: 'TW', symbol: '2330', holder: 'Po', shares: 200 }])
      expect(screen.getByText('Po 已持有 100 股')).toBeInTheDocument()

      await act(async () => resolve(true))
    })
  })

  it('applies the given formId to the form element', () => {
    const { container } = render(
      <HoldingForm onSubmit={vi.fn()} formId="my-holding-form" />,
    )
    expect(container.querySelector('form#my-holding-form')).not.toBeNull()
  })
})
