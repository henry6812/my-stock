import { useCallback, useMemo, useState } from "react";
import dayjs from "dayjs";
import {
  applyWhatIf,
  DEFAULT_WHAT_IF,
  describeFiResult,
  describeWhatIfDiff,
  getAutoInvestRatio,
  getForecastStartingPoint,
  isWhatIfActive,
  resolveForecastAssumptions,
  runForecast,
} from "../utils/forecast";

// 財務預估 from what App already loaded: holdings + cash (loadAllData) and
// income, the expense average and the saved assumptions (loadExpenseData).
// The what-if knobs and the viewed horizon live here and are never saved;
// the sheet resets them when it closes.
export default function useForecast({
  rows,
  cashRows,
  defaultMonthlyIncomeTwd,
  averageMonthlyExpense,
  settings,
  currentMonth,
}) {
  const [knobs, setKnobs] = useState(DEFAULT_WHAT_IF);
  const [horizonOverride, setHorizonYears] = useState(null);

  const start = useMemo(
    () => getForecastStartingPoint({ rows, cashRows }),
    [rows, cashRows],
  );
  const auto = useMemo(
    () => ({
      monthlyIncomeTwd:
        typeof defaultMonthlyIncomeTwd === "number" ? defaultMonthlyIncomeTwd : null,
      monthlyExpenseTwd: averageMonthlyExpense?.averageTwd ?? null,
      expenseMonthsUsed: averageMonthlyExpense?.monthsUsed ?? 0,
      investRatio: getAutoInvestRatio(start),
    }),
    [defaultMonthlyIncomeTwd, averageMonthlyExpense, start],
  );
  const assumptions = useMemo(
    () => resolveForecastAssumptions({ settings, auto }),
    [settings, auto],
  );
  const horizonYears = horizonOverride ?? assumptions.horizonYears;
  const startMonth = currentMonth ?? dayjs().format("YYYY-MM");

  const base = useMemo(
    () =>
      assumptions.isComplete
        ? runForecast({
            stockTwd: start.stockTwd,
            cashTwd: start.cashTwd,
            assumptions,
            startMonth,
            horizonYears,
          })
        : null,
    [assumptions, start, startMonth, horizonYears],
  );
  const whatIf = useMemo(
    () =>
      base && isWhatIfActive(assumptions, knobs)
        ? runForecast({
            stockTwd: start.stockTwd,
            cashTwd: start.cashTwd,
            assumptions: applyWhatIf(assumptions, knobs),
            startMonth,
            horizonYears,
          })
        : null,
    [base, assumptions, knobs, start, startMonth, horizonYears],
  );

  const resetKnobs = useCallback(() => setKnobs(DEFAULT_WHAT_IF), []);

  return {
    start,
    auto,
    assumptions,
    horizonYears,
    setHorizonYears,
    base,
    whatIf,
    knobs,
    setKnobs,
    resetKnobs,
    summary: describeFiResult(base),
    diffText: base && whatIf ? describeWhatIfDiff(base, whatIf) : null,
  };
}
