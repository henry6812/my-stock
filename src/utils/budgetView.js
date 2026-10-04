import dayjs from "dayjs";
import { getBudgetStatus } from "./budgetStatus";
import { listRecurringOccurrences } from "./recurrence";

// Mobile budget overview helpers: how far into the cycle we are, a daily
// allowance, the charged / upcoming split of the bar, urgency order, and the
// expenses that make up a budget's current cycle.

const toDay = (value) => (value ? dayjs(value).startOf("day") : null);

// elapsedRatio: share of the cycle's days already past (before today);
// daysLeft: days remaining including today.
export const getCycleProgress = ({ cycleStart, cycleEnd }, today) => {
  const start = toDay(cycleStart);
  const end = toDay(cycleEnd);
  const now = toDay(today);
  if (!start?.isValid() || !end?.isValid() || !now?.isValid() || end.isBefore(start)) {
    return null;
  }
  const totalDays = end.diff(start, "day") + 1;
  const elapsedDays = Math.min(Math.max(now.diff(start, "day"), 0), totalDays);
  return {
    elapsedRatio: elapsedDays / totalDays,
    daysLeft: totalDays - elapsedDays,
  };
};

export const getDailyAllowance = (remainingTwd, daysLeft) => {
  const remaining = Number(remainingTwd);
  if (!(remaining > 0) || !(daysLeft > 0)) return null;
  return Math.floor(remaining / daysLeft);
};

// Bar widths (%) for what has been charged and what is still to come this
// cycle (upcoming recurring charges already counted in spentTwd).
export const getBudgetBarSegments = ({ spentTwd, upcomingTwd, availableTwd }) => {
  const spent = Math.max(0, Number(spentTwd) || 0);
  const upcoming = Math.min(Math.max(0, Number(upcomingTwd) || 0), spent);
  const available = Math.max(0, Number(availableTwd) || 0);
  if (available === 0) {
    return { chargedPct: spent > 0 ? 100 : 0, upcomingPct: 0 };
  }
  // Both relative to the budget; together they never pass 100%.
  const pct = (value) => Math.round((value / available) * 1000) / 10;
  const chargedPct = Math.min(100, pct(spent - upcoming));
  return {
    chargedPct,
    upcomingPct: Math.min(100 - chargedPct, pct(upcoming)),
  };
};

const URGENCY = { over: 0, warn: 1, ok: 2 };

export const sortBudgetsByUrgency = (budgets) =>
  [...(budgets || [])]
    .map((budget) => ({ budget, status: getBudgetStatus(budget) }))
    .sort(
      (a, b) =>
        URGENCY[a.status.level] - URGENCY[b.status.level] ||
        b.status.usedPct - a.status.usedPct,
    )
    .map(({ budget }) => budget);

// The budget's expenses inside [cycleStart, cycleEnd], newest first; the
// same set portfolioService sums into spentTwd. Recurring charges after
// today are flagged as upcoming.
export const listBudgetCycleExpenses = (
  entries,
  { budgetId, cycleStart, cycleEnd, today },
) => {
  const start = toDay(cycleStart);
  const end = toDay(cycleEnd);
  if (!start?.isValid() || !end?.isValid()) return [];
  const todayIso = toDay(today).format("YYYY-MM-DD");
  const rows = [];
  (entries || []).forEach((entry) => {
    if (entry.deletedAt || Number(entry.budgetId) !== Number(budgetId)) return;
    if (!(Number(entry.amountTwd) > 0)) return;
    if (entry.entryType === "RECURRING") {
      listRecurringOccurrences(entry, cycleStart, cycleEnd).forEach((date) => {
        rows.push({
          ...entry,
          // Editing a generated row edits the rule, whose start is this.
          originalOccurredAt: entry.occurredAt,
          occurredAt: date,
          isRecurringOccurrence: true,
          isUpcoming: date > todayIso,
        });
      });
      return;
    }
    const date = toDay(entry.occurredAt);
    if (!date?.isValid() || date.isBefore(start) || date.isAfter(end)) return;
    rows.push({
      ...entry,
      occurredAt: date.format("YYYY-MM-DD"),
      isRecurringOccurrence: false,
      isUpcoming: false,
    });
  });
  return rows.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
};
