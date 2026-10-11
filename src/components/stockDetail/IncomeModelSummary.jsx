import { formatEps, formatQuarter } from "../../utils/valuation";

function Change({ label, value }) {
  if (!Number.isFinite(value)) return <span className="income-summary-change">{`${label} --`}</span>;
  const up = value >= 0;
  return (
    <span className={`income-summary-change income-summary-change--${up ? "up" : "down"}`}>
      {`${label} ${up ? "▲" : "▼"}${Math.abs(value * 100).toFixed(1)}%`}
    </span>
  );
}

const yearEps = (value) => (Number.isFinite(value) ? formatEps(value) : "--");

// Next quarter's EPS leads (title size, not display): the figure to hold
// against the coming report.
function IncomeModelSummary({ income }) {
  const { nextQuarter, thisYear, nextYear } = income;
  return (
    <section className="valuation-assumptions-group income-summary" aria-label="推估結果">
      <span className="income-summary-label">{`下一季 ${formatQuarter(nextQuarter)} EPS`}</span>
      <div className="income-summary-main">
        <span className="income-summary-eps">{formatEps(nextQuarter.eps)}</span>
        <Change label="YoY" value={nextQuarter.yoy} />
        <Change label="QoQ" value={nextQuarter.qoq} />
      </div>
      <span className="income-summary-years">{`今年 ${yearEps(thisYear.eps)} · 明年 ${yearEps(nextYear.eps)}`}</span>
    </section>
  );
}

export default IncomeModelSummary;
