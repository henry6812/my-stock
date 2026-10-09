// Month picker for the expense summary card: always the 12 months of one
// year (Jan–Dec), one column each. Every bar is the same height — that
// month's income — and the coloured part from the bottom is what was saved,
// like the savings tower above; an overspent month is empty with a thin red
// foot. The selected month is solid teal and the current month's label bold. Months with no
// summary — still to come, or before the first record — are disabled empty
// bars. Each month is a full-height column, so the tap target is the column,
// not the (possibly tiny) bar. Underneath: the 累計 toggle, and a ‹ year ›
// switch once there is more than one year of data.
import { useState } from "react";
import { NavArrowLeft, NavArrowRight } from "iconoir-react";
import { formatTwd } from "../utils/formatters";

const BAR_PX = 40;
const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const yearOf = (month) => Number(String(month ?? "").slice(0, 4)) || null;
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
  const firstYear = yearOf(summaries[0]?.month);
  const lastYear = yearOf(summaries[summaries.length - 1]?.month);
  const focusMonth = (cumulative ? highlightMonth : activeMonth) ?? null;
  const focusYear =
    yearOf(focusMonth) ?? lastYear ?? yearOf(activeMonth) ?? new Date().getFullYear();

  // The shown year follows the focused month; ‹ › browse other years
  // without picking a month until a bar is tapped.
  const [view, setView] = useState({ focusYear, year: focusYear });
  if (view.focusYear !== focusYear) setView({ focusYear, year: focusYear });
  const year = view.year;
  const browse = (step) => setView((v) => ({ ...v, year: v.year + step }));

  const byMonth = new Map(summaries.map((summary) => [summary.month, summary]));
  const yearMonths = MONTH_ABBR.map(
    (_, index) => `${year}-${String(index + 1).padStart(2, "0")}`,
  );

  return (
    <div className={`expense-month-bars${cumulative ? " expense-month-bars--cumulative" : ""}`}>
      <div className="expense-month-bars-track">
        {yearMonths.map((month, index) => {
          const summary = byMonth.get(month);
          const label = MONTH_ABBR[index];
          if (!summary) {
            return (
              <button
                key={month}
                type="button"
                className="expense-month-bar expense-month-bar--empty"
                aria-label={`${monthName(month)}，沒有資料`}
                disabled
              >
                <span className="expense-month-bar-fill" style={{ height: `${BAR_PX}px` }} />
                <span className="expense-month-bar-label" aria-hidden="true">
                  {label}
                </span>
              </button>
            );
          }
          const spent = Number(summary.expenseTwd) || 0;
          const income = Number(summary.incomeTwd) || 0;
          const saved = income - spent;
          const savedRatio = income > 0 ? Math.min(1, Math.max(0, saved / income)) : 0;
          const over = income > 0 && saved < 0;
          const status =
            income <= 0
              ? `支出 ${formatTwd(spent)}`
              : over
                ? `超支 ${formatTwd(-saved)}`
                : `存下 ${(savedRatio * 100).toFixed(1)}%`;
          const on = cumulative ? month === highlightMonth : month === activeMonth;
          return (
            <button
              key={month}
              type="button"
              className={`expense-month-bar${on ? " is-on" : ""}${over ? " is-over" : ""}`}
              data-current={summary.isCurrent || undefined}
              aria-label={`${monthName(month)}，${status}`}
              aria-pressed={!cumulative && month === activeMonth}
              onClick={() => onSelectMonth?.(month)}
            >
              <span className="expense-month-bar-fill" style={{ height: `${BAR_PX}px` }}>
                {savedRatio > 0 && (
                  <span
                    className="expense-month-bar-saved"
                    style={{ height: `${(savedRatio * 100).toFixed(2)}%` }}
                  />
                )}
              </span>
              <span className="expense-month-bar-label" aria-hidden="true">
                {label}
              </span>
            </button>
          );
        })}
      </div>
      <div className="expense-month-bars-foot">
        {firstYear !== null && firstYear !== lastYear && (
          <div className="expense-month-bars-year" role="group" aria-label="切換年份">
            <button
              type="button"
              className="expense-month-bars-step"
              aria-label="上一年"
              disabled={year <= firstYear}
              onClick={() => browse(-1)}
            >
              <NavArrowLeft />
            </button>
            <span className="expense-month-bars-year-label">{year}</span>
            <button
              type="button"
              className="expense-month-bars-step"
              aria-label="下一年"
              disabled={year >= lastYear}
              onClick={() => browse(1)}
            >
              <NavArrowRight />
            </button>
          </div>
        )}
        <button
          type="button"
          className={`expense-month-bars-all${cumulative ? " is-on" : ""}`}
          aria-pressed={cumulative}
          onClick={() => onToggleCumulative?.()}
        >
          累計
        </button>
      </div>
    </div>
  );
}
