import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import NetWorthJar from './NetWorthJar'

describe('NetWorthJar (reduced motion → final state)', () => {
  beforeEach(() => {
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
      matches: query.includes('reduce'),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  })
  afterEach(() => vi.restoreAllMocks())

  it('labels the jar with the current level and capacity', () => {
    render(<NetWorthJar totalTwd={6_384_200} baselineTwd={6_301_000} playKey={1} />)
    expect(screen.getByRole('img', { name: '總資產水位 638萬，容量 1000萬' })).toBeInTheDocument()
  })

  it('shows only the capacity, not the current level or the floor', () => {
    render(<NetWorthJar totalTwd={10_046_000} baselineTwd={9_982_000} playKey={1} />)
    expect(screen.getByText('2000萬')).toBeInTheDocument()
    expect(screen.queryByText('1004萬')).toBeNull()
    expect(screen.queryByText(/起$/)).toBeNull()
  })

  it("draws no dashed line, stripes or gradients", () => {
    const { container } = render(<NetWorthJar totalTwd={6_384_200} baselineTwd={6_301_000} playKey={1} />)
    expect(screen.queryByText('昨日')).toBeNull()
    expect(container.querySelector('line[stroke-dasharray], .networth-jar-baseline')).toBeNull()
    expect(container.querySelector('pattern')).toBeNull()
    expect(container.querySelector('linearGradient')).toBeNull()
  })

  it('marks the band up or down', () => {
    const { container, rerender } = render(<NetWorthJar totalTwd={6_384_200} baselineTwd={6_301_000} playKey={1} />)
    expect(container.querySelector('.networth-jar-band--up')).not.toBeNull()
    rerender(<NetWorthJar totalTwd={6_218_500} baselineTwd={6_301_000} playKey={1} />)
    expect(container.querySelector('.networth-jar-band--down')).not.toBeNull()
  })

  it('draws the jar as a fill and hides the capacity until revealed', () => {
    const { container, rerender } = render(<NetWorthJar totalTwd={6_384_200} baselineTwd={6_301_000} playKey={1} />)
    const svg = container.querySelector('svg')
    expect(svg).not.toHaveClass('networth-jar--revealed')
    expect(container.querySelector('.networth-jar-body')).not.toBeNull()
    expect(container.querySelector('.networth-jar-outline, .networth-jar-glass, .networth-jar-shine, .networth-jar-tick')).toBeNull()
    rerender(<NetWorthJar totalTwd={6_384_200} baselineTwd={6_301_000} playKey={1} revealed />)
    expect(svg).toHaveClass('networth-jar--revealed')
  })

  it('always shows the capacity for an empty jar', () => {
    const { container } = render(<NetWorthJar totalTwd={0} baselineTwd={0} playKey={1} />)
    expect(container.querySelector('svg')).toHaveClass('networth-jar--revealed')
  })

  it('renders no water for an empty jar', () => {
    const { container } = render(<NetWorthJar totalTwd={0} baselineTwd={0} playKey={1} />)
    expect(container.querySelector('.networth-jar-water')).toBeNull()
  })
})
