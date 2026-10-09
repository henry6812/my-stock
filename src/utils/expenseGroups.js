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

// Day strip for the mobile expense list: every day of `month` (YYYY-MM) from
// the 1st up to today — or to the month's end for a past month, or to the
// latest charged row if that is later — each with its rows and subtotal.
// Days without spending are kept so the strip reads as a calendar.
export const buildExpenseDayStrip = (rows, month, today) => {
  const { days } = groupExpenseRowsByDay(rows);
  const byDate = new Map(days.map((day) => [day.date, day]));
  const start = dayjs(`${month}-01`);
  if (!start.isValid()) return [];
  const monthEnd = start.endOf("month").startOf("day");
  let end = dayjs(today).startOf("day");
  if (end.isAfter(monthEnd)) end = monthEnd;
  const latest = days[0]?.date;
  if (latest && dayjs(latest).isAfter(end) && !dayjs(latest).isAfter(monthEnd)) {
    end = dayjs(latest);
  }
  const strip = [];
  for (let day = start; !day.isAfter(end); day = day.add(1, "day")) {
    const date = day.format("YYYY-MM-DD");
    strip.push(byDate.get(date) ?? { date, totalTwd: 0, rows: [] });
  }
  return strip;
};

// The day the strip opens on: today when it is on the strip, otherwise the
// latest day with spending, otherwise the strip's last day.
export const defaultStripDate = (strip, today) => {
  if (strip.length === 0) return null;
  if (strip.some((day) => day.date === today)) return today;
  const spent = [...strip].reverse().find((day) => day.rows.length > 0);
  return (spent ?? strip[strip.length - 1]).date;
};
