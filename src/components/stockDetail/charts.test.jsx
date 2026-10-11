import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import EpsTrendChart from './EpsTrendChart'
import { buildEpsChartData, todayLabelPosition } from '../../utils/stockDetail'
import PeHistoryChart from './PeHistoryChart'
import PeRiverChart from './PeRiverChart'

const singles = [
  { year: 2024, quarter: 1, eps: 1 },
  { year: 2024, quarter: 2, eps: 2 },
  { year: 2024, quarter: 3, eps: 3 },
  { year: 2024, quarter: 4, eps: 4 },
  { year: 2025, quarter: 1, eps: 5 },
  { year: 2025, quarter: 2, eps: 6 },
  { year: 2025, quarter: 3, eps: 7 },
  { year: 2025, quarter: 4, eps: 8 },
  { year: 2026, quarter: 1, eps: 9 },
]

describe("buildEpsChartData", () => {
  it("keeps the latest 8 quarters with last year’s quarter and estimates", () => {
    const data = buildEpsChartData({
      singles,
      surprises: [{ year: 2026, quarter: 1, estimate: 8.5, surprisePercent: 5.9 }],
    })
    expect(data).toHaveLength(8)
    expect(data[0]).toEqual({ label: "24Q2", eps: 2, lastYearEps: null, estimate: null, surprisePercent: null, projected: null })
    expect(data.at(-1)).toEqual({ label: "26Q1", eps: 9, lastYearEps: 5, estimate: 8.5, surprisePercent: 5.9, projected: null })
  })

  it("adds projected quarters after the actual ones, keeping 12 bars at most", () => {
    const projected = [
      { year: 2026, quarter: 2, eps: 9.5 }, { year: 2026, quarter: 3, eps: 10 },
      { year: 2026, quarter: 4, eps: 10.5 }, { year: 2027, quarter: 1, eps: 11 },
      { year: 2027, quarter: 2, eps: 11.5 }, { year: 2027, quarter: 3, eps: 12 },
    ]
    const data = buildEpsChartData({ singles, surprises: [], projected })
    expect(data).toHaveLength(12)
    expect(data[5]).toMatchObject({ label: "26Q1", eps: 9, projected: null })
    expect(data[6]).toEqual({ label: "26Q2", eps: null, lastYearEps: 6, estimate: null, surprisePercent: null, projected: 9.5 })
    expect(data.at(-1)).toMatchObject({ label: "27Q3", lastYearEps: null, projected: 12 })
  })
})

describe("chart components", () => {
  it("shows the next earnings line", () => {
    render(
      <EpsTrendChart
        fundamentals={{ singles, surprises: [], nextEarnings: { date: "2026-11-14", label: "Q3 財報法定截止日" } }}
      />,
    )
    expect(screen.getByText("下次財報")).toBeInTheDocument()
    expect(screen.getByText("2026-11-14")).toBeInTheDocument()
    expect(screen.getByText("Q3 財報法定截止日")).toBeInTheDocument()
  })

  it("draws the EPS series in misty blue, not black and grey", () => {
    const { container } = render(<EpsTrendChart fundamentals={{ singles, surprises: [], nextEarnings: null }} />)
    const swatches = [...container.querySelectorAll(".stock-detail-legend-swatch")].map((el) => el.style.background)
    expect(swatches).toEqual(["rgb(76, 111, 168)", "rgb(195, 208, 230)"])
  })

  it("labels the two EPS series", () => {
    render(<EpsTrendChart fundamentals={{ singles, surprises: [], nextEarnings: null }} />)
    expect(screen.getByText("單季")).toBeInTheDocument()
    expect(screen.getByText("去年同季")).toBeInTheDocument()
  })

  it("labels projected bars in the legend only when there are some", () => {
    const { rerender } = render(<EpsTrendChart fundamentals={{ singles, surprises: [], nextEarnings: null }} />)
    expect(screen.queryByText("推估")).not.toBeInTheDocument()
    rerender(
      <EpsTrendChart fundamentals={{ singles, surprises: [], nextEarnings: null }} projected={[{ year: 2026, quarter: 2, eps: 9.5 }]} />,
    )
    expect(screen.getByText("推估")).toBeInTheDocument()
  })

  it("shows an empty state without EPS data", () => {
    render(<EpsTrendChart fundamentals={{ singles: [], surprises: [], nextEarnings: null }} />)
    expect(screen.getByText("尚無 EPS 資料")).toBeInTheDocument()
  })

  it("shows an empty state with fewer than two P/E points", () => {
    render(<PeHistoryChart peSeries={[{ label: "2026-09", pe: 28 }]} bands={{}} />)
    expect(screen.getByText("尚無歷史本益比資料")).toBeInTheDocument()
  })

  it("names the river chart and its series", () => {
    const river = { status: "ok", todayLabel: "2026-10", points: [{ label: "2026-09" }, { label: "2026-10", future: true }] }
    render(<PeRiverChart river={river} />)
    expect(screen.getByRole("heading", { name: "股價與 EPS" })).toBeInTheDocument()
    for (const label of ["股價", "便宜–昂貴", "推估"]) expect(screen.getByText(label)).toBeInTheDocument()
  })

  it("shows the 推估 legend only when the river has future points", () => {
    const points = [{ label: "2026-09", future: false }, { label: "2026-10", future: false }]
    render(<PeRiverChart river={{ status: "ok", todayLabel: "2026-10", points }} />)
    expect(screen.queryByText("推估")).not.toBeInTheDocument()
    expect(screen.getByText("股價")).toBeInTheDocument()
  })

  it("keeps the 今天 label inside the plot when today is the last point", () => {
    const past = [{ label: "a", future: false }, { label: "b", future: false }]
    expect(todayLabelPosition(past)).toBe("insideTopRight")
    expect(todayLabelPosition([...past, { label: "c", future: true }])).toBe("insideTopLeft")
  })

  it("asks for P/E bands, or says there is no price history", () => {
    const { rerender } = render(<PeRiverChart river={{ status: "missing-pe", points: [], todayLabel: null }} />)
    expect(screen.getByText("請先在估價假設設定本益比")).toBeInTheDocument()
    rerender(<PeRiverChart river={{ status: "ok", points: [{ label: "2026-10" }], todayLabel: "2026-10" }} />)
    expect(screen.getByText("尚無歷史股價資料")).toBeInTheDocument()
  })
})
