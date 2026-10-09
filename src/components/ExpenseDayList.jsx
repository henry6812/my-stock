import { useState } from "react";
import { Typography } from "antd";
import { Clock, NavArrowRight, Repeat } from "iconoir-react";
import dayjs from "dayjs";
import CategoryIcon from "./CategoryIcon";
import Collapsible from "./Collapsible";
import SwipeActions from "./SwipeActions";
import { formatTwd } from "../utils/formatters";
import {
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
