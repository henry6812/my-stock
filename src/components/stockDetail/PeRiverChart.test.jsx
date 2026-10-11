import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RiverTooltip } from './PeRiverChart'

describe('RiverTooltip', () => {
  it('rounds band prices to 2 decimals', () => {
    const item = { label: '2026-10', close: 100, ttmEps: 10, cheap: 56.4179, fair: 80.1234, expensive: 120.9999 }
    render(<RiverTooltip active payload={[{ payload: item }]} />)
    expect(screen.getByText(/便宜 \$56\.42／合理 \$80\.12／昂貴 \$121/)).toBeTruthy()
  })
})
