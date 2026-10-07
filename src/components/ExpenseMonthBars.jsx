// Month picker for the expense summary card: one bar per month (height =
// spending), the selected month solid teal. The 累計 pill switches mode.
// Deliberately text-free apart from the pill.
import { formatTwd } from "../utils/formatters";

const MONTH_BARS_MAX = 12;
const MIN_BAR_PX = 12;
const BAR_RANGE_PX = 52;

const monthName = (month) => {
  const [year, mon] = month.split("-");
  return `${year} 年 ${Number(mon)} 月`;
};

export default function ExpenseMonthBars({
  summaries = [],
  mode,
  activeMonth,
  highlightMonth = null,
  onSelectMonth,
  onToggleCumulative,
}) {
  const cumulative = mode === "cumulative";
  const shown = summaries.slice(-MONTH_BARS_MAX);
  const max = Math.max(1, ...shown.map((s) => Number(s.expenseTwd) || 0));

  return (
    <div className={`expense-month-bars${cumulative ? " expense-month-bars--cumulative" : ""}`}>
      <div className="expense-month-bars-track">
        {shown.map((summary) => {
          const spent = Number(summary.expenseTwd) || 0;
          const on = cumulative
            ? summary.month === highlightMonth
            : summary.month === activeMonth;
          return (
            <button
              key={summary.month}
              type="button"
              className={`expense-month-bar${on ? " is-on" : ""}`}
              style={{ height: `${Math.round(MIN_BAR_PX + (spent / max) * BAR_RANGE_PX)}px` }}
              aria-label={`${monthName(summary.month)}，支出 ${formatTwd(spent)}`}
              aria-pressed={!cumulative && summary.month === activeMonth}
              onClick={() => onSelectMonth?.(summary.month)}
            />
          );
        })}
      </div>
      <button
        type="button"
        className={`expense-month-bars-all${cumulative ? " is-on" : ""}`}
        aria-pressed={cumulative}
        onClick={() => onToggleCumulative?.()}
      >
        累計
      </button>
    </div>
  );
}
