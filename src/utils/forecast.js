// 財務預估: pure math for the forecast sheet. Everything is in today's money
// (real TWD): returns are converted from nominal with the inflation rate, and
// income / expense stay flat because they are assumed to grow with inflation.
// Spec: docs/superpowers/specs/2026-10-17-financial-forecast-design.md
import dayjs from "dayjs";

export const toRealMonthlyRate = (nominalAnnual, inflation = 0) =>
  Math.pow(
    (1 + (Number(nominalAnnual) || 0)) / (1 + (Number(inflation) || 0)),
    1 / 12,
  ) - 1;

// Month 0 is today. Each month: both sides grow by their own real return,
// then the surplus is split by investRatio; a deficit comes out of cash
// first, then stock, and neither goes below zero.
export const projectNetWorth = ({
  stockTwd,
  cashTwd,
  assumptions,
  months,
  startMonth,
}) => {
  const stockRate = toRealMonthlyRate(assumptions.stockReturn, assumptions.inflation);
  const cashRate = toRealMonthlyRate(assumptions.cashReturn, assumptions.inflation);
  const surplus =
    (Number(assumptions.monthlyIncomeTwd) || 0) -
    (Number(assumptions.monthlyExpenseTwd) || 0);
  const ratio = Math.min(1, Math.max(0, Number(assumptions.investRatio) || 0));
  const start = dayjs(`${startMonth}-01`);

  let stock = Math.max(0, Number(stockTwd) || 0);
  let cash = Math.max(0, Number(cashTwd) || 0);
  const point = (monthIndex) => ({
    monthIndex,
    month: start.add(monthIndex, "month").format("YYYY-MM"),
    stockTwd: stock,
    cashTwd: cash,
    totalTwd: stock + cash,
  });

  const series = [point(0)];
  for (let monthIndex = 1; monthIndex <= months; monthIndex += 1) {
    stock *= 1 + stockRate;
    cash *= 1 + cashRate;
    if (surplus >= 0) {
      stock += surplus * ratio;
      cash += surplus * (1 - ratio);
    } else {
      const fromCash = Math.min(cash, -surplus);
      cash -= fromCash;
      stock = Math.max(0, stock - (-surplus - fromCash));
    }
    series.push(point(monthIndex));
  }
  return series;
};

// Annual expense ÷ withdrawal rate; null when either is unknown.
export const getFiThreshold = ({ monthlyExpenseTwd, withdrawalRate } = {}) => {
  if (monthlyExpenseTwd === null || monthlyExpenseTwd === undefined) return null;
  const expense = Number(monthlyExpenseTwd);
  const rate = Number(withdrawalRate);
  if (!Number.isFinite(expense) || expense < 0) return null;
  if (!Number.isFinite(rate) || rate <= 0) return null;
  return (expense * 12) / rate;
};

export const findFiMonth = (series = [], thresholdTwd) => {
  if (thresholdTwd === null || thresholdTwd === undefined) return null;
  const index = series.findIndex((point) => point.totalTwd >= thresholdTwd);
  return index < 0 ? null : index;
};

export const runForecast = ({
  stockTwd,
  cashTwd,
  assumptions,
  startMonth,
  horizonYears,
}) => {
  const years = horizonYears ?? assumptions.horizonYears;
  const series = projectNetWorth({
    stockTwd,
    cashTwd,
    assumptions,
    months: years * 12,
    startMonth,
  });
  const thresholdTwd = getFiThreshold(assumptions);
  const fiMonthIndex = findFiMonth(series, thresholdTwd);
  return {
    series,
    thresholdTwd,
    fiMonthIndex,
    fiMonth: fiMonthIndex === null ? null : series[fiMonthIndex].month,
    endTotalTwd: series[series.length - 1].totalTwd,
    horizonYears: years,
  };
};
