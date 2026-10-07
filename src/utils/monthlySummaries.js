// Per-month expense / income series for the expense summary card (month
// bars + 累計 growth tower). Pure: portfolioService feeds it occurrences and
// an income resolver.

const nextMonth = (month) => {
  const [year, mon] = month.split("-").map(Number);
  return mon === 12
    ? `${year + 1}-01`
    : `${year}-${String(mon + 1).padStart(2, "0")}`;
};

const isRecurring = (occurrence) =>
  Boolean(occurrence?.isRecurringOccurrence) ||
  occurrence?.entryType === "RECURRING";

export const buildMonthlySummaries = ({
  occurrences = [],
  firstMonth,
  currentMonth,
  incomeForMonth,
}) => {
  if (!currentMonth) return [];
  const start =
    firstMonth && firstMonth <= currentMonth ? firstMonth : currentMonth;

  const byMonth = new Map();
  for (const occurrence of occurrences) {
    const amount = Number(occurrence?.amountTwd) || 0;
    if (amount <= 0) continue;
    const month = String(occurrence?.occurredAt ?? "").slice(0, 7);
    if (month < start || month > currentMonth) continue;
    const row = byMonth.get(month) ?? { recurringTwd: 0, oneTimeTwd: 0 };
    if (isRecurring(occurrence)) {
      row.recurringTwd += amount;
    } else {
      row.oneTimeTwd += amount;
    }
    byMonth.set(month, row);
  }

  const rows = [];
  for (let month = start; month <= currentMonth; month = nextMonth(month)) {
    const row = byMonth.get(month) ?? { recurringTwd: 0, oneTimeTwd: 0 };
    const income = incomeForMonth?.(month);
    rows.push({
      month,
      expenseTwd: row.recurringTwd + row.oneTimeTwd,
      recurringTwd: row.recurringTwd,
      oneTimeTwd: row.oneTimeTwd,
      incomeTwd: typeof income === "number" && income > 0 ? income : null,
      isCurrent: month === currentMonth,
    });
  }
  return rows;
};
