import dayjs from "dayjs";

// Recurring-expense schedule helpers for the UI. They follow the same rules as
// portfolioService (resolveRecurringOccurrenceDate + entryIsActiveOnDate): the
// start date itself isn't an occurrence, the day falls back to the start
// date's day when unset, it is clamped to the month's last day, and nothing
// before the start or after recurrenceUntil counts.

const GENERIC_HINT = "定期支出從這天開始生效，當天本身不會記一筆";
const DISPLAY_FORMAT = "YYYY/MM/DD";
const ISO_FORMAT = "YYYY-MM-DD";

const toDay = (value) => (value ? dayjs(value).startOf("day") : null);

const clampedDate = (monthStart, day) =>
  monthStart.date(Math.min(Math.max(1, day), monthStart.daysInMonth()));

// The schedule's (month, day): month is null for monthly recurrences.
const resolveSchedule = (entry, start) => {
  if (entry.recurrenceType === "MONTHLY") {
    return { month: null, day: Number(entry.monthlyDay) || start.date() };
  }
  if (entry.recurrenceType === "YEARLY") {
    return {
      month: Number(entry.yearlyMonth) || start.month() + 1,
      day: Number(entry.yearlyDay) || start.date(),
    };
  }
  return null;
};

const occurrencesBetween = (entry, rangeStart, rangeEnd, { limit = Infinity } = {}) => {
  if (entry?.entryType !== "RECURRING" || entry.deletedAt) return [];
  const start = toDay(entry.occurredAt);
  if (!start?.isValid()) return [];
  const schedule = resolveSchedule(entry, start);
  if (!schedule) return [];
  const until = toDay(entry.recurrenceUntil);
  const from = rangeStart.isAfter(start) ? rangeStart : start;
  const to = until?.isValid() && until.isBefore(rangeEnd) ? until : rangeEnd;

  const dates = [];
  for (
    let cursor = from.startOf("month");
    !cursor.isAfter(to, "month") && dates.length < limit;
    cursor = cursor.add(1, "month")
  ) {
    if (schedule.month !== null && cursor.month() + 1 !== schedule.month) continue;
    const date = clampedDate(cursor, schedule.day);
    if (!date.isBefore(from, "day") && !date.isAfter(to, "day")) dates.push(date);
  }
  return dates;
};

export const listRecurringOccurrences = (entry, rangeStart, rangeEnd) =>
  occurrencesBetween(entry, toDay(rangeStart), toDay(rangeEnd)).map((date) =>
    date.format(ISO_FORMAT),
  );

// The first charge on or after `today` (a yearly one is at most a year away).
export const getNextRecurringOccurrence = (entry, today) => {
  const from = toDay(today);
  const start = toDay(entry?.occurredAt);
  const searchFrom = start?.isValid() && start.isAfter(from) ? start : from;
  const [next] = occurrencesBetween(entry, from, searchFrom.add(13, "month"), {
    limit: 1,
  });
  return next ? next.format(ISO_FORMAT) : null;
};

export const getMonthlyEquivalentTwd = (entry) => {
  const amount = Number(entry?.amountTwd) || 0;
  return entry?.recurrenceType === "YEARLY" ? Math.round(amount / 12) : amount;
};

// Recurring charges for one budget still to come in its cycle: after today,
// within [cycleStart, cycleEnd].
export const sumUpcomingRecurringTwd = (
  entries,
  { budgetId, today, cycleStart, cycleEnd },
) => {
  const start = toDay(cycleStart);
  const end = toDay(cycleEnd);
  if (!start?.isValid() || !end?.isValid()) return 0;
  const tomorrow = toDay(today).add(1, "day");
  const from = tomorrow.isAfter(start) ? tomorrow : start;
  if (from.isAfter(end)) return 0;
  return (entries || [])
    .filter((entry) => Number(entry.budgetId) === Number(budgetId))
    .reduce(
      (sum, entry) =>
        sum +
        occurrencesBetween(entry, from, end).length *
          (Number(entry.amountTwd) || 0),
      0,
    );
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
  const start = toDay(occurredAt);
  if (!start?.isValid()) return GENERIC_HINT;

  let rule;
  let day;
  if (recurrenceType === "MONTHLY" && Number(monthlyDay) > 0) {
    day = Number(monthlyDay);
    rule = `每月 ${day} 號`;
  } else if (
    recurrenceType === "YEARLY" &&
    Number(yearlyMonth) > 0 &&
    Number(yearlyDay) > 0
  ) {
    day = Number(yearlyDay);
    rule = `每年 ${Number(yearlyMonth)} 月 ${day} 號`;
  }
  if (!rule) return GENERIC_HINT;

  const first = getNextRecurringOccurrence(
    {
      entryType,
      recurrenceType,
      monthlyDay,
      yearlyMonth,
      yearlyDay,
      occurredAt: start.format(ISO_FORMAT),
    },
    start.format(ISO_FORMAT),
  );
  if (!first) return GENERIC_HINT;

  const monthEndNote = day > 28 ? "；沒有這天的月份記在月底" : "";
  return `從 ${start.format(DISPLAY_FORMAT)} 起，${rule}記一筆，第一筆在 ${dayjs(first).format(DISPLAY_FORMAT)}${monthEndNote}`;
};
