export const formatSignedPercent = (value) => {
  if (!Number.isFinite(value)) return '--'
  const sign = value >= 0 ? '+' : '−'
  return `${sign}${Math.abs(value * 100).toFixed(1)}%`
}

// The sheet shows one stock; the same stock may be held under several
// holders (separate holding rows), so shares and value are summed.
export const buildStockDetailHolding = (rows, id) => {
  const row = rows.find((item) => item.id === id)
  if (!row) return null
  const sameStock = rows.filter((item) => item.market === row.market && item.symbol === row.symbol)
  const values = sameStock.map((item) => item.latestValueTwd).filter(Number.isFinite)
  return {
    ...row,
    totalShares: sameStock.reduce((sum, item) => sum + (Number(item.shares) || 0), 0),
    totalValueTwd: values.length ? values.reduce((sum, value) => sum + value, 0) : undefined,
  }
}

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
// the row's own controls (edit, delete, drag handle, inline editors).
export const isInteractiveTarget = (target) => Boolean(target?.closest?.(INTERACTIVE_SELECTOR))
