import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import StaleBalanceIcon from './StaleBalanceIcon'

const now = '2026-10-10T04:00:00.000Z'

describe('StaleBalanceIcon', () => {
  it('shows an icon named with the day count once the balance is over a month old', () => {
    render(<StaleBalanceIcon balanceUpdatedAt="2026-09-05T04:00:00.000Z" now={now} />)
    expect(screen.getByRole('img', { name: '35 天沒更新餘額' })).toBeInTheDocument()
  })

  it('renders nothing for a recent balance', () => {
    const { container } = render(<StaleBalanceIcon balanceUpdatedAt="2026-10-01T00:00:00.000Z" now={now} />)
    expect(container).toBeEmptyDOMElement()
  })
})
