import { useState } from "react";
import { Typography } from "antd";
import { DownOutlined, RightOutlined, SyncOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import SwipeActions from "./SwipeActions";
import { formatTwd } from "../utils/formatters";
import {
  formatDayHeading,
  groupExpenseRowsByDay,
} from "../utils/expenseGroups";

const { Text } = Typography;

// Mobile expense list: one framed list, grouped by day (newest first) with a
// subtotal per day; this month's upcoming recurring charges sit collapsed at
// the bottom under 本月預計. Each row is two lines and swipes for its actions.

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
        <div className="mobile-swipe-row-main">
          <div className="holding-main-text expense-day-row-name">
            {row.isRecurringOccurrence && (
              <SyncOutlined
                className="expense-day-row-recurring"
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

function ExpenseDayList({
  rows = [],
  today,
  getActions,
  disabled = false,
  empty = null,
}) {
  const [showUpcoming, setShowUpcoming] = useState(false);
  const { days, upcoming } = groupExpenseRowsByDay(rows);
  if (days.length === 0 && upcoming.rows.length === 0) return empty;

  const renderRow = (row) => (
    <ExpenseRow
      key={`${row.id}-${row.occurredAt}`}
      row={row}
      actions={getActions(row)}
      disabled={disabled}
    />
  );

  return (
    <div className="expense-day-list">
      {days.map((day) => (
        <section key={day.date} className="expense-day-group">
          <div className="expense-day-heading" data-testid="expense-day-heading">
            <span>{formatDayHeading(day.date, today)}</span>
            <span className="expense-day-total">{formatTwd(day.totalTwd)}</span>
          </div>
          {day.rows.map(renderRow)}
        </section>
      ))}
      {upcoming.rows.length > 0 && (
        <section className="expense-day-group expense-upcoming-group">
          <button
            type="button"
            className="expense-day-heading expense-upcoming-toggle"
            aria-expanded={showUpcoming}
            onClick={() => setShowUpcoming((value) => !value)}
          >
            <span>
              本月預計 {upcoming.rows.length} 筆 · {formatTwd(upcoming.totalTwd)}
            </span>
            {showUpcoming ? <DownOutlined /> : <RightOutlined />}
          </button>
          {showUpcoming && upcoming.rows.map(renderRow)}
        </section>
      )}
    </div>
  );
}

export default ExpenseDayList;
