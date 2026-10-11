export const formatSignedPercent = (value) => {
  if (!Number.isFinite(value)) return '--'
  const sign = value >= 0 ? '+' : '−'
  return `${sign}${Math.abs(value * 100).toFixed(1)}%`
}

// The sheet shows the holding that was tapped: one stock of one holder.
// The same stock under another holder is a separate holding with its own
// shares and cost.
export const buildStockDetailHolding = (rows, id) =>
  rows.find((item) => item.id === id) ?? null

const INTERACTIVE_SELECTOR = [
  'button',
  'a',
  'input',
  'textarea',
  'select',
  '[role="button"]',
  '[role="combobox"]',
  '.ant-select',
  '.ant-input-number',
  '.ant-popover',
].join(',')

// Desktop rows open the detail sheet on click, except clicks that land on
// the row's own controls (drag handle and other controls). The
// row itself is skipped: dnd-kit marks sortable rows role="button".
export const isInteractiveTarget = (target, row = null) => {
  const hit = target?.closest?.(INTERACTIVE_SELECTOR)
  return Boolean(hit) && hit !== row
}

const CHART_QUARTERS = 8

const shortLabel = ({ year, quarter }) => `${String(year).slice(2)}Q${quarter}`

// Latest 8 quarters for the EPS chart, each with last year's same quarter
// and (US) the consensus estimate it was measured against.
export const buildEpsChartData = ({ singles = [], surprises = [] }) =>
  singles.slice(-CHART_QUARTERS).map((item) => {
    const lastYear = singles.find((other) => other.year === item.year - 1 && other.quarter === item.quarter)
    const surprise = surprises.find((other) => other.year === item.year && other.quarter === item.quarter)
    return {
      label: shortLabel(item),
      eps: Number.isFinite(item.eps) ? item.eps : null,
      lastYearEps: Number.isFinite(lastYear?.eps) ? lastYear.eps : null,
      estimate: Number.isFinite(surprise?.estimate) ? surprise.estimate : null,
      surprisePercent: Number.isFinite(surprise?.surprisePercent) ? surprise.surprisePercent : null,
    }
  })
