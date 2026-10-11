import { useState } from "react";
import { NavArrowDown, NavArrowRight } from "iconoir-react";
import { formatPercent, formatYi } from "../../utils/incomeAssumptionForm";
import { formatDateTime } from "../../utils/formatters";
import { formatEps, formatQuarter } from "../../utils/valuation";

function Diff({ value }) {
  if (!Number.isFinite(value)) return <span className="income-history-diff">--</span>;
  const up = value >= 0;
  return (
    <span className={`income-history-diff income-history-diff--${up ? "up" : "down"}`}>
      {`${up ? "▲" : "▼"}${Math.abs(value * 100).toFixed(1)}%`}
    </span>
  );
}

const pair = (estimate, actual, format) =>
  `${Number.isFinite(estimate) ? format(estimate) : "--"} → ${Number.isFinite(actual) ? format(actual) : "--"}`;

// What was expected before each report, against what came out.
function EstimateHistory({ comparisons }) {
  const [openKey, setOpenKey] = useState(null);
  if (comparisons.length === 0) return null;
  return (
    <section className="valuation-assumptions-group">
      <h4 className="valuation-assumptions-title">預估與實際</h4>
      <div className="income-quarter-list">
        {comparisons.map((item) => {
          const open = openKey === item.key;
          return (
            <div key={item.key} className="income-quarter">
              <button
                type="button"
                className="income-quarter-row"
                aria-expanded={open}
                onClick={() => setOpenKey(open ? null : item.key)}
              >
                <span className="income-quarter-name">{formatQuarter(item)}</span>
                <span className="income-quarter-meta">
                  {`預估 ${formatEps(item.estimate.eps)} → 實際 ${formatEps(item.actual.eps)}`}
                </span>
                <Diff value={item.epsDiff} />
                {open ? <NavArrowDown aria-hidden /> : <NavArrowRight aria-hidden />}
              </button>
              {open && (
                <div className="income-statement">
                  <div className="income-statement-row">
                    <span>營收</span>
                    <span className="income-statement-result">
                      {pair(item.estimate.revenue, item.actual.revenue, formatYi)}
                    </span>
                  </div>
                  <div className="income-statement-row">
                    <span>毛利率</span>
                    <span className="income-statement-result">
                      {pair(item.estimate.grossMargin, item.actual.grossMargin, formatPercent)}
                    </span>
                  </div>
                  <div className="income-statement-row">
                    <span>營業費用率</span>
                    <span className="income-statement-result">
                      {pair(item.estimate.opexRatio, item.actual.opexRatio, formatPercent)}
                    </span>
                  </div>
                  {item.savedAt && (
                    <div className="income-statement-total">{`記錄於 ${formatDateTime(item.savedAt)}`}</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default EstimateHistory;
