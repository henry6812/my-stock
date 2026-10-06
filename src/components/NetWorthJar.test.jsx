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
    expect(screen.getByText('638萬')).toBeInTheDocument()
    expect(screen.getByText('1000萬')).toBeInTheDocument()
  })

  it("draws yesterday's line with its exact value", () => {
    render(<NetWorthJar totalTwd={6_384_200} baselineTwd={6_301_000} playKey={1} />)
    const line = screen.getByTestId('jar-baseline')
    expect(line).toBeInTheDocument()
    expect(line.querySelector('title').textContent).toContain('昨日23:59')
  })

  it('marks the band up or down', () => {
    const { container, rerender } = render(<NetWorthJar totalTwd={6_384_200} baselineTwd={6_301_000} playKey={1} />)
    expect(container.querySelector('.networth-jar-band--up')).not.toBeNull()
    rerender(<NetWorthJar totalTwd={6_218_500} baselineTwd={6_301_000} playKey={1} />)
    expect(container.querySelector('.networth-jar-band--down')).not.toBeNull()
  })

  it('hides the baseline in a freshly crossed jar and labels its floor', () => {
    render(<NetWorthJar totalTwd={10_046_000} baselineTwd={9_982_000} playKey={1} />)
    expect(screen.queryByTestId('jar-baseline')).toBeNull()
    expect(screen.getByText('2000萬')).toBeInTheDocument()
    expect(screen.getByText('從 1000萬 起')).toBeInTheDocument()
  })

  it('renders no water for an empty jar', () => {
    const { container } = render(<NetWorthJar totalTwd={0} baselineTwd={0} playKey={1} />)
    expect(container.querySelector('.networth-jar-water')).toBeNull()
  })
})
