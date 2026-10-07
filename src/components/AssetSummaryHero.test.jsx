import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import AssetSummaryHero from './AssetSummaryHero'

const NOW = new Date('2026-10-07T22:00:00+08:00')

const props = {
  totalTwd: 14_163_874,
  displayTotalTwd: 14_163_874,
  baselineTwd: 14_167_760,
  changeTwd: -3_886,
  changePct: -0.0274,
  priceDataStale: false,
  quoteAt: '2026-10-07T21:52:00+08:00',
  playKey: 1,
}

const text = (container) => ({
  label: container.querySelector('.asset-hero-label').textContent,
  num: container.querySelector('.asset-hero-num').textContent,
  sub: container.querySelector('.asset-hero-sub').textContent,
})

describe('AssetSummaryHero', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
      matches: query.includes('reduce'),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("summarises today's total and move", () => {
    const { container } = render(<AssetSummaryHero {...props} />)
    expect(text(container)).toEqual({ label: '今日・總資產', num: '$14,163,874', sub: '今日 −$3,886（−0.03%）' })
    expect(container.querySelector('.asset-hero-sub')).toHaveClass('asset-hero-sub--down')
  })

  it('colours a rise green', () => {
    const { container } = render(<AssetSummaryHero {...props} changeTwd={12_000} changePct={0.086} />)
    expect(text(container).sub).toBe('今日 +$12,000（+0.09%）')
    expect(container.querySelector('.asset-hero-sub')).toHaveClass('asset-hero-sub--up')
  })

  it('shows the quote time in the label when prices are not from today', () => {
    const { container } = render(
      <AssetSummaryHero {...props} priceDataStale quoteAt="2026-10-06T13:30:00+08:00" />,
    )
    expect(text(container).label).toBe('10/06 13:30・總資產')
    expect(text(container).sub).toBe('今日 --')
  })

  it('shows the next milestone and the quote time when the jar is tapped, then goes back', () => {
    const { container } = render(<AssetSummaryHero {...props} />)
    fireEvent.click(screen.getByRole('button', { name: '查看里程碑與報價時間' }))
    expect(text(container)).toEqual({
      label: '2000萬・還差',
      num: '$5,836,126',
      sub: '從 1000萬 起已達 41.6%・報價 10/07 21:52',
    })
    expect(screen.getByRole('button', { name: '查看里程碑與報價時間' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(container.querySelector('.asset-hero-num'))
    expect(text(container).label).toBe('今日・總資產')
  })

  it('toggles back when the jar is tapped again', () => {
    const { container } = render(<AssetSummaryHero {...props} />)
    const jar = screen.getByRole('button', { name: '查看里程碑與報價時間' })
    fireEvent.click(jar)
    fireEvent.click(jar)
    expect(text(container).label).toBe('今日・總資產')
  })

  it('forgets the milestone view when the hero replays', () => {
    const { container, rerender } = render(<AssetSummaryHero {...props} />)
    fireEvent.click(screen.getByRole('button', { name: '查看里程碑與報價時間' }))
    rerender(<AssetSummaryHero {...props} playKey={2} />)
    expect(text(container).label).toBe('今日・總資產')
  })

  it('leaves out the floor below the first 千萬 and a missing quote time', () => {
    const { container } = render(
      <AssetSummaryHero {...props} totalTwd={6_384_200} displayTotalTwd={6_384_200} quoteAt={null} />,
    )
    expect(text(container).label).toBe('總資產')
    fireEvent.click(screen.getByRole('button', { name: '查看里程碑與報價時間' }))
    expect(text(container)).toEqual({ label: '1000萬・還差', num: '$3,615,800', sub: '已達 63.8%' })
  })

  it('has nothing to tap with no assets', () => {
    render(<AssetSummaryHero {...props} totalTwd={0} displayTotalTwd={0} baselineTwd={0} changeTwd={null} />)
    expect(screen.queryByRole('button', { name: '查看里程碑與報價時間' })).toBeNull()
  })
})
