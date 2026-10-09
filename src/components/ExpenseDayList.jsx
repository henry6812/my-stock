import { useLayoutEffect, useRef, useState } from "react";
import { Typography } from "antd";
import { Clock, NavArrowRight, Repeat } from "iconoir-react";
import dayjs from "dayjs";
import CategoryIcon from "./CategoryIcon";
import Collapsible from "./Collapsible";
import SwipeActions from "./SwipeActions";
import { formatTwd } from "../utils/formatters";
import {
  buildExpenseDayStrip,
  defaultStripDate,
  formatDayHeading,
  groupExpenseRowsByDay,
} from "../utils/expenseGroups";

const { Text } = Typography;

// Mobile expense list: one framed list, grouped by day (newest first) with a
// subtotal per day. Each day folds from its heading; only today starts open.
// This month's upcoming recurring charges are shown apart by
// UpcomingExpenseList (collapsed under 本月預計). Each row is two lines and
// swipes for its actions, with the category's icon tile in front.

const isSet = (value) => Boolean(value) && value !== "未指定";

function ExpenseRow({ row, actions, disabled }) {
  const meta = [
    row.isUpcoming ? dayjs(row.occurredAt).format("MM/DD") : null,
    row.categoryName,
    row.payerName,
  ].filter(isSet);
  return (
    <SwipeActions actions={actions} disabled={disabled}>
      <div className="mobile-swipe-row expense-day-row">
        <CategoryIcon name={row.categoryName} icon={row.categoryIcon} />
        <div className="mobile-swipe-row-main">
          <div className="holding-main-text expense-day-row-name">
            {row.isRecurringOccurrence && (
              <Repeat
                className="expense-day-row-recurring"
                aria-hidden={false}
                aria-label="定期支出"
                role="img"
              />
            )}
            <span>{row.name}</span>
          </div>
          {meta.length > 0 && (
            <Text type="secondary" className="holding-subline">
              {meta.join(" · ")}
            </Text>
          )}
        </div>
        <div className="mobile-swipe-row-side expense-day-row-amount">
          {formatTwd(Number(row.amountTwd) || 0)}
        </div>
      </div>
    </SwipeActions>
  );
}

const renderRows = (rows, getActions, disabled) =>
  rows.map((row) => (
    <ExpenseRow
      key={`${row.id}-${row.occurredAt}`}
      row={row}
      actions={getActions(row)}
      disabled={disabled}
    />
  ));

// Distinct categories among the rows, in list order, for the tile stack.
const MAX_STACKED_CATEGORIES = 6;
const distinctCategories = (rows) => {
  const seen = new Map();
  rows.forEach((row) => {
    const key = `${row.categoryName ?? ""}|${row.categoryIcon ?? ""}`;
    if (!seen.has(key)) seen.set(key, row);
  });
  return [...seen.values()];
};

// A card like a category budget: clock tile, label + count, total and a
// fold chevron, with the upcoming charges' category tiles stacked below
// while it is closed.
export function UpcomingExpenseList({
  rows = [],
  getActions,
  disabled = false,
  label = "本月預計",
}) {
  const [expanded, setExpanded] = useState(false);
  const { upcoming } = groupExpenseRowsByDay(rows);
  if (upcoming.rows.length === 0) return null;
  const categories = distinctCategories(upcoming.rows);
  const shown = categories.slice(0, MAX_STACKED_CATEGORIES);
  const hiddenCount = categories.length - shown.length;
  return (
    <div className="expense-day-list expense-upcoming-group">
      <button
        type="button"
        className="expense-upcoming-toggle"
        aria-expanded={expanded}
        aria-label={`${label} ${upcoming.rows.length} 筆 · ${formatTwd(upcoming.totalTwd)}`}
        onClick={() => setExpanded((value) => !value)}
      >
        <span className="expense-upcoming-icon">
          <Clock />
        </span>
        <span className="expense-upcoming-main">
          <span className="expense-upcoming-title">{label}</span>
          <span className="expense-upcoming-count">
            {upcoming.rows.length} 筆
          </span>
          {/* The tile stack is a preview: open, the rows show it all. */}
          {!expanded && (
            <span className="expense-upcoming-stack" aria-hidden="true">
              {shown.map((row) => (
                <CategoryIcon
                  key={`${row.categoryName}|${row.categoryIcon}`}
                  name={row.categoryName}
                  icon={row.categoryIcon}
                />
              ))}
              {hiddenCount > 0 && (
                <span className="category-icon expense-upcoming-more">
                  +{hiddenCount}
                </span>
              )}
            </span>
          )}
        </span>
        <span className="expense-upcoming-end">
          <span className="expense-upcoming-total">
            {formatTwd(upcoming.totalTwd)}
          </span>
          <NavArrowRight className="collapse-chevron" />
        </span>
      </button>
      <Collapsible open={expanded}>
        <div className="expense-day-group expense-upcoming-rows">
          {renderRows(upcoming.rows, getActions, disabled)}
        </div>
      </Collapsible>
    </div>
  );
}

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
// The strip's amounts drop the "$": every cell is money, and it keeps the
// columns narrow.
const formatStripAmount = (value) =>
  Math.round(value).toLocaleString("zh-TW");

// Main mobile expense list: one day at a time. A strip of the month's days
// on top — weekday, date and that day's total — picks the day (solid ink,
// like a selected chip); it opens on today, scrolled to the end so the
// latest days are in view. The picked day's rows follow with no heading:
// its date and total are already in the strip.
export function ExpenseDayStrip({
  rows = [],
  month,
  today,
  getActions,
  disabled = false,
  empty = null,
}) {
  const strip = buildExpenseDayStrip(rows, month, today);
  const fallback = defaultStripDate(strip, today);
  // The pick belongs to its month; switching months reopens on the default.
  const [picked, setPicked] = useState({ month, date: null });
  const pickedDate =
    picked.month === month && strip.some((day) => day.date === picked.date)
      ? picked.date
      : fallback;
  const trackRef = useRef(null);
  const hasRows = strip.some((day) => day.rows.length > 0);
  // The strip mounts once the month's rows arrive, so that is part of it.
  const scrollKey = `${month}|${strip.length}|${hasRows}`;

  // Bring the picked day into view (at the end) on open and month change,
  // without scrolling the page.
  useLayoutEffect(() => {
    const track = trackRef.current;
    const button = track?.querySelector('[aria-pressed="true"]');
    if (!track || !button) return;
    track.scrollLeft =
      button === track.lastElementChild
        ? track.scrollWidth
        : // Half a day past it, so the strip visibly goes on.
          button.offsetLeft + button.offsetWidth * 1.5 - track.clientWidth;
    // Keyed on the month and its length: picking a day must not move it.
  }, [scrollKey]);

  if (!hasRows) return empty;

  const selected = strip.find((day) => day.date === pickedDate);

  return (
    <div className="expense-day-strip">
      <div
        ref={trackRef}
        className="expense-day-strip-track"
        role="group"
        aria-label="選擇日期"
      >
        {strip.map((day) => {
          const date = dayjs(day.date);
          const isToday = day.date === today;
          const on = day.date === pickedDate;
          return (
            <button
              key={day.date}
              type="button"
              className={`expense-day-strip-day${on ? " is-on" : ""}${
                day.rows.length === 0 ? " is-empty" : ""
              }`}
              data-today={isToday || undefined}
              aria-pressed={on}
              aria-label={`${formatDayHeading(day.date, today)}，${
                day.rows.length > 0 ? formatTwd(day.totalTwd) : "沒有支出"
              }`}
              onClick={() => setPicked({ month, date: day.date })}
            >
              <span className="expense-day-strip-weekday" aria-hidden="true">
                {WEEKDAYS[date.day()]}
              </span>
              <span className="expense-day-strip-date" aria-hidden="true">
                {isToday ? "今天" : date.date()}
              </span>
              <span className="expense-day-strip-amount" aria-hidden="true">
                {formatStripAmount(day.totalTwd)}
              </span>
            </button>
          );
        })}
      </div>
      {selected && (
        <section
          className="expense-day-list"
          aria-label={formatDayHeading(selected.date, today)}
        >
          {selected.rows.length > 0 ? (
            <div className="expense-day-group">
              {renderRows(selected.rows, getActions, disabled)}
            </div>
          ) : (
            <p className="expense-day-strip-none">
              {selected.date === today ? "今天還沒有支出" : "這天沒有支出"}
            </p>
          )}
        </section>
      )}
    </div>
  );
}

function ExpenseDayList({
  rows = [],
  today,
  getActions,
  disabled = false,
  empty = null,
  // Open every day by default instead of only today.
  expandAll = false,
}) {
  // Days the user opened / closed; others follow the default (today open).
  const [toggledDays, setToggledDays] = useState({});
  const { days } = groupExpenseRowsByDay(rows);
  if (days.length === 0) return empty;
  const isExpanded = (date) =>
    toggledDays[date] ?? (expandAll || date === today);

  return (
    <div className="expense-day-list">
      {days.map((day) => {
        const expanded = isExpanded(day.date);
        return (
          <section key={day.date} className="expense-day-group">
            <button
              type="button"
              className="expense-day-heading expense-day-toggle"
              data-testid="expense-day-heading"
              aria-expanded={expanded}
              onClick={() =>
                setToggledDays((current) => ({
                  ...current,
                  [day.date]: !expanded,
                }))
              }
            >
              <span>{formatDayHeading(day.date, today)}</span>
              <span className="expense-day-heading-end">
                <span className="expense-day-total">
                  {formatTwd(day.totalTwd)}
                </span>
                <NavArrowRight className="collapse-chevron" />
              </span>
            </button>
            <Collapsible open={expanded}>
              {renderRows(day.rows, getActions, disabled)}
            </Collapsible>
          </section>
        );
      })}
    </div>
  );
}

export default ExpenseDayList;
