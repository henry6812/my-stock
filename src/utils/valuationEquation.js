// The two factors of the valuation card's EPS × P/E equation: what the EPS
// in use is made of, and where the P/E bands come from. Pure; the card
// renders them and opens 估價假設 at the matching section.

const NO_EPS = '資料不足，無法計算'

// adjustable: tapping the factor leads somewhere useful in 估價假設 —
// every basis except 近四季, which is published figures only.
export const describeEpsFactor = (chosen, basis) => {
  const adjustable = basis !== 'ttm'
  if (chosen?.custom) return { kind: 'custom', caption: '直接指定 EPS', adjustable }
  if (!Number.isFinite(chosen?.eps)) return { kind: 'unavailable', caption: chosen?.reason ?? NO_EPS, adjustable }
  const { actual, projected } = chosen.composition
  const projectedWord = basis === 'forward' ? '預估' : '推估'
  let caption
  if (projected === 0) caption = '全為實際・不受假設影響'
  else if (actual === 0) caption = `${projected} 季${projectedWord}`
  else caption = `${actual} 季實際・${projected} 季${projectedWord}`
  return { kind: 'quarters', actual, projected, caption, adjustable }
}

export const describePeFactor = (bands) => {
  const values = [bands?.cheap, bands?.fair, bands?.expensive]
  if (!values.every(Number.isFinite)) return { value: '--', caption: '尚未設定' }
  const overridden = Object.values(bands.overridden ?? {}).some(Boolean)
  return { value: values.join('／'), caption: overridden ? '自訂' : '歷史區間' }
}
