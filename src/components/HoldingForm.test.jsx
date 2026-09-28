import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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

  it('applies the given formId to the form element', () => {
    const { container } = render(
      <HoldingForm onSubmit={vi.fn()} formId="my-holding-form" />,
    )
    expect(container.querySelector('form#my-holding-form')).not.toBeNull()
  })
})
