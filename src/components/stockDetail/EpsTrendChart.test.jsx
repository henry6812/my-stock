import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { CHART_STOCK } from '../../theme/tokens'

// jsdom has no layout: give the chart a fixed size and draw the bars without
// animation so their rectangles are in the DOM with real coordinates.
const WIDTH = 400
vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    Bar: (props) => <actual.Bar {...props} isAnimationActive={false} />,
    ResponsiveContainer: ({ children }) => (
      <actual.ResponsiveContainer width={WIDTH} height={220} initialDimension={{ width: WIDTH, height: 220 }}>
        {children}
      </actual.ResponsiveContainer>
    ),
  }
})

import EpsTrendChart from './EpsTrendChart'

const fundamentals = {
  singles: [
    { year: 2025, quarter: 1, eps: 1 },
    { year: 2025, quarter: 2, eps: 2 },
    { year: 2025, quarter: 3, eps: 2.5 },
    { year: 2026, quarter: 1, eps: 3 },
    { year: 2026, quarter: 2, eps: 4 },
  ],
}
const projected = [{ year: 2026, quarter: 3, eps: 5 }]

const rects = (container) =>
  [...container.querySelectorAll('path.recharts-rectangle')].map((path) => ({
    x: Number(path.getAttribute('x')),
    width: Number(path.getAttribute('width')),
    fill: path.getAttribute('fill'),
    dashed: path.getAttribute('stroke-dasharray') !== null,
  }))

describe('EpsTrendChart bar layout', () => {
  it('draws the projected bar in the single-quarter slot, beside 去年同季', () => {
    const { container } = render(<EpsTrendChart fundamentals={fundamentals} projected={projected} />)
    const bars = rects(container)
    const previous = bars.filter((bar) => bar.fill === CHART_STOCK.previous).sort((a, b) => a.x - b.x)
    const actual = bars.filter((bar) => bar.fill === CHART_STOCK.primary).sort((a, b) => a.x - b.x)
    const outlined = bars.filter((bar) => bar.dashed)

    expect(outlined).toHaveLength(1)
    // 2026Q1 / Q2 (actual) and 2026Q3 (projected) each have a 去年同季 bar.
    expect(previous).toHaveLength(3)
    const actualQ2 = actual.at(-1)
    const actualOffset = actualQ2.x - previous[1].x
    const projectedOffset = outlined[0].x - previous[2].x
    // Same slot as the actual EPS, and directly next to 去年同季 — two slots
    // per category, not three.
    expect(projectedOffset).toBeCloseTo(actualOffset, 5)
    expect(actualOffset).toBeLessThan(actualQ2.width * 2)
  })

  it('still draws a negative projected quarter', () => {
    const { container } = render(
      <EpsTrendChart fundamentals={fundamentals} projected={[{ year: 2026, quarter: 3, eps: -1 }]} />,
    )
    const [outlined] = rects(container).filter((bar) => bar.dashed)
    expect(outlined.width).toBeGreaterThan(0)
  })
})
