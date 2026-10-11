import { CHART_STOCK } from "../../theme/tokens";

// Published figures solid, projected ones outlined — the same marks as the
// EPS trend chart's bars, wherever actual and projected sit side by side.
function PublishedMark({ actual, className }) {
  return (
    <span
      className={className}
      data-state={actual ? "actual" : "projected"}
      aria-hidden
      style={actual ? { background: CHART_STOCK.primary } : { border: `1px dashed ${CHART_STOCK.primary}` }}
    />
  );
}

export default PublishedMark;
