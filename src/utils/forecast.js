// 財務預估: pure math for the forecast sheet. Everything is in today's money
// (real TWD): returns are converted from nominal with the inflation rate, and
// income / expense stay flat because they are assumed to grow with inflation.
// Spec: docs/superpowers/specs/2026-10-17-financial-forecast-design.md
import dayjs from "dayjs";
import { formatTwd } from "./formatters";
import { normalizeTotalCost } from "./holdingShares";

export const FORECAST_HORIZONS = [10, 20, 30, 40];

// null amounts / ratio mean "use the automatic value".
export const FORECAST_DEFAULTS = {
  monthlyIncomeTwd: null,
  monthlyExpenseTwd: null,
  investRatio: null,
  stockReturn: 0.06,
  cashReturn: 0.01,
  inflation: 0.02,
  withdrawalRate: 0.04,
  horizonYears: 30,
};

export const FORECAST_LIMITS = {
  stockReturn: { min: -0.2, max: 0.3, label: "股票年報酬" },
  cashReturn: { min: -0.2, max: 0.3, label: "現金年利率" },
  inflation: { min: 0, max: 0.15, label: "通膨率" },
  withdrawalRate: { min: 0.01, max: 0.1, label: "提領率" },
  investRatio: { min: 0, max: 1, label: "新存款投資比例" },
};

const RATE_KEYS = ["stockReturn", "cashReturn", "inflation", "withdrawalRate"];
const AMOUNT_LABELS = {
  monthlyIncomeTwd: "每月收入",
  monthlyExpenseTwd: "每月支出",
};

const toFiniteOrNull = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const inRange = (value, { min, max }) => value >= min && value <= max;

const formatLimitPercent = (value) => `${Math.round(value * 100)}%`;

// Whatever is stored (or nothing) → a complete settings object; a missing,
// broken or out-of-range value falls back to its default.
export const normalizeForecastSettings = (raw) => {
  const source = raw && typeof raw === "object" ? raw : {};
  const next = { ...FORECAST_DEFAULTS };
  for (const key of Object.keys(AMOUNT_LABELS)) {
    const value = toFiniteOrNull(source[key]);
    next[key] = value !== null && value >= 0 ? Math.round(value) : null;
  }
  const ratio = toFiniteOrNull(source.investRatio);
  next.investRatio =
    ratio !== null && inRange(ratio, FORECAST_LIMITS.investRatio) ? ratio : null;
  for (const key of RATE_KEYS) {
    const value = toFiniteOrNull(source[key]);
    if (value !== null && inRange(value, FORECAST_LIMITS[key])) next[key] = value;
  }
  const horizon = Number(source.horizonYears);
  if (FORECAST_HORIZONS.includes(horizon)) next.horizonYears = horizon;
  return next;
};

// A save must not store what normalize would silently drop: throw instead.
export const validateForecastSettings = (settings = {}) => {
  for (const [key, label] of Object.entries(AMOUNT_LABELS)) {
    const raw = settings[key];
    if (raw === null || raw === undefined) continue;
    const value = toFiniteOrNull(raw);
    if (value === null || value < 0) throw new Error(`${label}不能小於 0`);
  }
  for (const key of [...RATE_KEYS, "investRatio"]) {
    const limit = FORECAST_LIMITS[key];
    const raw = settings[key];
    if (raw === null || raw === undefined) {
      if (key === "investRatio") continue;
      throw new Error(`請輸入${limit.label}`);
    }
    const value = toFiniteOrNull(raw);
    if (value === null || !inRange(value, limit)) {
      throw new Error(
        `${limit.label}需介於 ${formatLimitPercent(limit.min)} 到 ${formatLimitPercent(limit.max)}`,
      );
    }
  }
  if (
    settings.horizonYears !== undefined &&
    !FORECAST_HORIZONS.includes(Number(settings.horizonYears))
  ) {
    throw new Error("預估年限只能是 10、20、30 或 40 年");
  }
};

// Today's stock and cash, plus the cumulative return of the holdings that
// have a cost (not annualised: holdings carry no purchase date). A holding
// without a price is left out; one without a cost (or a US one without a
// rate) counts toward the stock total but not the return.
export const getForecastStartingPoint = ({ rows = [], cashRows = [] } = {}) => {
  let stockTwd = 0;
  let valueWithCostTwd = 0;
  let costTwd = 0;
  let unsetCostCount = 0;
  for (const row of rows ?? []) {
    const valueTwd = Number(row?.latestValueTwd);
    if (row?.latestValueTwd === null || !Number.isFinite(valueTwd)) continue;
    stockTwd += valueTwd;
    const cost = normalizeTotalCost(row.totalCost);
    const rate = row.market === "US" ? Number(row.fxRateToTwd) : 1;
    if (cost === null || !Number.isFinite(rate)) {
      unsetCostCount += 1;
      continue;
    }
    valueWithCostTwd += valueTwd;
    costTwd += cost * rate;
  }
  const cashTwd = (cashRows ?? []).reduce(
    (sum, row) => sum + (Number(row?.balanceTwd) || 0),
    0,
  );
  return {
    stockTwd,
    cashTwd,
    holdingsReturn: costTwd > 0 ? (valueWithCostTwd - costTwd) / costTwd : null,
    unsetCostCount,
  };
};

export const getAutoInvestRatio = ({ stockTwd, cashTwd }) => {
  const stock = Math.max(0, Number(stockTwd) || 0);
  const total = stock + Math.max(0, Number(cashTwd) || 0);
  return total > 0 ? stock / total : 0.5;
};

// Settings + automatic values → the assumptions the projection runs on.
// `sources` says which of the three automatic fields were overridden.
export const resolveForecastAssumptions = ({ settings, auto = {} }) => {
  const normalized = normalizeForecastSettings(settings);
  const pick = (key) =>
    normalized[key] !== null
      ? { value: normalized[key], source: "custom" }
      : { value: auto[key] ?? null, source: "auto" };
  const income = pick("monthlyIncomeTwd");
  const expense = pick("monthlyExpenseTwd");
  const ratio = pick("investRatio");
  return {
    monthlyIncomeTwd: income.value,
    monthlyExpenseTwd: expense.value,
    investRatio: ratio.value ?? 0.5,
    stockReturn: normalized.stockReturn,
    cashReturn: normalized.cashReturn,
    inflation: normalized.inflation,
    withdrawalRate: normalized.withdrawalRate,
    horizonYears: normalized.horizonYears,
    sources: {
      monthlyIncomeTwd: income.source,
      monthlyExpenseTwd: expense.source,
      investRatio: ratio.source,
    },
    isComplete: income.value !== null && expense.value !== null,
  };
};

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

export const DEFAULT_WHAT_IF = {
  expenseDeltaTwd: 0,
  incomeDeltaTwd: 0,
  investRatio: null,
  stockReturn: null,
};

const EPS = 1e-9;

export const applyWhatIf = (assumptions, knobs = DEFAULT_WHAT_IF) => ({
  ...assumptions,
  monthlyIncomeTwd: Math.max(
    0,
    (Number(assumptions.monthlyIncomeTwd) || 0) + (Number(knobs.incomeDeltaTwd) || 0),
  ),
  monthlyExpenseTwd: Math.max(
    0,
    (Number(assumptions.monthlyExpenseTwd) || 0) + (Number(knobs.expenseDeltaTwd) || 0),
  ),
  investRatio: knobs.investRatio ?? assumptions.investRatio,
  stockReturn: knobs.stockReturn ?? assumptions.stockReturn,
});

const differs = (knobValue, baseValue) =>
  knobValue !== null &&
  knobValue !== undefined &&
  Math.abs(Number(knobValue) - Number(baseValue)) > EPS;

export const isWhatIfActive = (assumptions, knobs = DEFAULT_WHAT_IF) =>
  (Number(knobs.expenseDeltaTwd) || 0) !== 0 ||
  (Number(knobs.incomeDeltaTwd) || 0) !== 0 ||
  differs(knobs.investRatio, assumptions.investRatio) ||
  differs(knobs.stockReturn, assumptions.stockReturn);

// ± range of the income / expense knobs: half the base, in whole thousands,
// at least 10,000.
export const getWhatIfAmountRange = (amountTwd) =>
  Math.max(10000, Math.round(((Number(amountTwd) || 0) * 0.5) / 1000) * 1000);

export const FORECAST_INCOMPLETE_TEXT = "設定每月收入與支出以開始預估";

const describeSpan = (months) =>
  months >= 12 ? `${Math.round(months / 12)} 年` : `${months} 個月`;

const fiYear = (result) => result.fiMonth.slice(0, 4);

export const describeFiResult = (result) => {
  if (!result) return FORECAST_INCOMPLETE_TEXT;
  if (result.fiMonthIndex === null) return `${result.horizonYears} 年內未達財務自由`;
  if (result.fiMonthIndex === 0) return "已達財務自由門檻";
  return `照目前步調，${fiYear(result)} 年可財務自由（約 ${describeSpan(result.fiMonthIndex)}後）`;
};

export const getFiHeadline = (result) => {
  if (result.fiMonthIndex === null) return "未達";
  if (result.fiMonthIndex === 0) return "已達成";
  return `${fiYear(result)} 年`;
};

export const describeWhatIfDiff = (base, alt) => {
  const parts = [];
  if (base.fiMonthIndex !== null && alt.fiMonthIndex !== null) {
    const diff = base.fiMonthIndex - alt.fiMonthIndex;
    if (diff !== 0) {
      parts.push(`財務自由${diff > 0 ? "提早" : "延後"} ${describeSpan(Math.abs(diff))}`);
    }
  } else if (alt.fiMonthIndex !== null) {
    parts.push(
      alt.fiMonthIndex === 0 ? "變成已達財務自由門檻" : `變成 ${fiYear(alt)} 年可財務自由`,
    );
  } else if (base.fiMonthIndex !== null) {
    parts.push(`變成 ${alt.horizonYears} 年內未達財務自由`);
  }
  const delta = alt.endTotalTwd - base.endTotalTwd;
  if (Math.abs(delta) >= 1) {
    parts.push(
      `${alt.horizonYears} 年後${delta > 0 ? "多" : "少"} ${formatTwd(Math.abs(delta), true)}`,
    );
  }
  return parts.length ? parts.join(" · ") : "跟目前步調一樣";
};

// One point a year (month 0, 12, 24…) for the chart.
export const buildForecastChartData = ({ base, whatIf = null }) =>
  base.series
    .filter((point) => point.monthIndex % 12 === 0)
    .map((point) => ({
      yearsFromNow: point.monthIndex / 12,
      year: Number(point.month.slice(0, 4)),
      stockTwd: point.stockTwd,
      cashTwd: point.cashTwd,
      totalTwd: point.totalTwd,
      whatIfTotalTwd: whatIf ? whatIf.series[point.monthIndex].totalTwd : null,
    }));
