import dayjs from "dayjs";

// Form hint for a recurring expense's start date. The first occurrence follows
// the same rules as portfolioService (resolveRecurringOccurrenceDate +
// entryIsActiveOnDate): the start date itself isn't an occurrence, the day is
// clamped to the month's last day, and nothing before the start counts.

const GENERIC_HINT = "定期支出從這天開始生效，當天本身不會記一筆";
const DATE_FORMAT = "YYYY/MM/DD";

const clampedDate = (monthStart, day) =>
  monthStart.date(Math.min(Math.max(1, day), monthStart.daysInMonth()));

const findFirstOccurrence = (start, { month = null, day }) => {
  let cursor = start.startOf("month");
  // A yearly occurrence is at most 12 months away; monthly at most 1.
  for (let i = 0; i < 13; i += 1) {
    if (month === null || cursor.month() + 1 === month) {
      const candidate = clampedDate(cursor, day);
      if (!candidate.isBefore(start, "day")) return candidate;
    }
    cursor = cursor.add(1, "month");
  }
  return null;
};

export const describeRecurrenceStart = ({
  entryType,
  recurrenceType,
  monthlyDay,
  yearlyMonth,
  yearlyDay,
  occurredAt,
}) => {
  if (entryType !== "RECURRING") return null;
  const start = occurredAt ? dayjs(occurredAt).startOf("day") : null;
  if (!start?.isValid()) return GENERIC_HINT;

  let rule;
  let day;
  let first;
  if (recurrenceType === "MONTHLY" && Number(monthlyDay) > 0) {
    day = Number(monthlyDay);
    rule = `每月 ${day} 號`;
    first = findFirstOccurrence(start, { day });
  } else if (
    recurrenceType === "YEARLY" &&
    Number(yearlyMonth) > 0 &&
    Number(yearlyDay) > 0
  ) {
    day = Number(yearlyDay);
    rule = `每年 ${Number(yearlyMonth)} 月 ${day} 號`;
    first = findFirstOccurrence(start, { month: Number(yearlyMonth), day });
  }
  if (!rule || !first) return GENERIC_HINT;

  const monthEndNote = day > 28 ? "；沒有這天的月份記在月底" : "";
  return `從 ${start.format(DATE_FORMAT)} 起，${rule}記一筆，第一筆在 ${first.format(DATE_FORMAT)}${monthEndNote}`;
};
