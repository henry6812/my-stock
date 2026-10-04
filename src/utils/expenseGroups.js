import dayjs from "dayjs";

// Mobile expense list: charged rows grouped by day (newest first, each with a
// subtotal), and this month's upcoming recurring charges kept apart.

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

const sumAmounts = (rows) =>
  rows.reduce((sum, row) => sum + (Number(row.amountTwd) || 0), 0);

export const groupExpenseRowsByDay = (rows) => {
  const byDate = new Map();
  const upcomingRows = [];
  (rows || []).forEach((row) => {
    if (row.isUpcoming) {
      upcomingRows.push(row);
      return;
    }
    if (!byDate.has(row.occurredAt)) byDate.set(row.occurredAt, []);
    byDate.get(row.occurredAt).push(row);
  });
  const days = Array.from(byDate.entries())
    .sort(([a], [b]) => String(b).localeCompare(String(a)))
    .map(([date, dayRows]) => ({ date, totalTwd: sumAmounts(dayRows), rows: dayRows }));
  upcomingRows.sort((a, b) => String(a.occurredAt).localeCompare(String(b.occurredAt)));
  return {
    days,
    upcoming: { totalTwd: sumAmounts(upcomingRows), rows: upcomingRows },
  };
};

export const formatDayHeading = (date, today) => {
  const day = dayjs(date);
  const label = `${day.format("MM/DD")}（${WEEKDAYS[day.day()]}）`;
  const diff = dayjs(today).startOf("day").diff(day.startOf("day"), "day");
  if (diff === 0) return `今天 · ${label}`;
  if (diff === 1) return `昨天 · ${label}`;
  return label;
};
