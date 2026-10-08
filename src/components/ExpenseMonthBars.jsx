// Month picker for the expense summary card: one bar per month (height =
// spending) with its month number underneath, the selected month solid teal
// and the current month's number in bold; months still to come are empty
// dashed bars. Each month is a full-height column, so the tap target is the
// column, not the (possibly tiny) bar. Past 12 bars the track scrolls
// sideways, kept on the picked month. The 累計 pill switches mode.
import { useLayoutEffect, useRef } from "react";
import { formatTwd } from "../utils/formatters";

const MONTH_BARS_VISIBLE = 12;
const MIN_BAR_PX = 12;
const BAR_RANGE_PX = 52;

const monthName = (month) => {
  const [year, mon] = month.split("-");
  return `${year} 年 ${Number(mon)} 月`;
};

export default function ExpenseMonthBars({
  summaries = [],
  futureMonths = [],
  mode,
  activeMonth,
  highlightMonth = null,
  onSelectMonth,
  onToggleCumulative,
}) {
  const cumulative = mode === "cumulative";
  const scrolls = summaries.length + futureMonths.length > MONTH_BARS_VISIBLE;
  const max = Math.max(1, ...summaries.map((s) => Number(s.expenseTwd) || 0));
  const trackRef = useRef(null);
  const focusMonth = (cumulative ? highlightMonth : activeMonth) ?? null;

  // Keep the picked (or else the current) month in view when the track scrolls.
  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track || !scrolls) return;
    const target =
      track.querySelector(".expense-month-bar.is-on") ??
      track.querySelector('.expense-month-bar[data-current="true"]');
    if (!target) return;
    track.scrollLeft =
      target.offsetLeft - (track.clientWidth - target.offsetWidth) / 2;
  }, [scrolls, focusMonth, summaries.length]);

  const bar = (month, { height, label, isCurrent = false, future = false }) => {
    const on = cumulative ? month === highlightMonth : month === activeMonth;
    return (
      <button
        key={month}
        type="button"
        className={`expense-month-bar${future ? " expense-month-bar--future" : ""}${on ? " is-on" : ""}`}
        data-current={isCurrent || undefined}
        aria-label={label}
        aria-pressed={!cumulative && month === activeMonth}
        onClick={() => onSelectMonth?.(month)}
      >
        <span className="expense-month-bar-fill" style={{ height: `${height}px` }} />
        <span className="expense-month-bar-label" aria-hidden="true">
          {Number(month.split("-")[1])}
        </span>
      </button>
    );
  };

  return (
    <div className={`expense-month-bars${cumulative ? " expense-month-bars--cumulative" : ""}`}>
      <div
        ref={trackRef}
        className={`expense-month-bars-track${scrolls ? " expense-month-bars-track--scroll" : ""}`}
      >
        {summaries.map((summary) => {
          const spent = Number(summary.expenseTwd) || 0;
          return bar(summary.month, {
            height: Math.round(MIN_BAR_PX + (spent / max) * BAR_RANGE_PX),
            label: `${monthName(summary.month)}，支出 ${formatTwd(spent)}`,
            isCurrent: summary.isCurrent,
          });
        })}
        {futureMonths.map((month) =>
          bar(month, {
            height: MIN_BAR_PX,
            label: `${monthName(month)}，尚未到來`,
            future: true,
          }),
        )}
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
