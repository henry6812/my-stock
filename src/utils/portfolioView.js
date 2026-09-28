// Pure view-layer constants and helpers extracted from App.jsx.
// These are stateless (they were module-scope in App.jsx and never closed over
// component state), so moving them here is behavior-preserving.

import { parseNumericLike } from "./number";

export const PULL_REFRESH_MAX = 96;
export const PULL_REFRESH_TRIGGER = 68;
export const NUMBER_ANIMATION_DURATION_MS = 2000;

const PROGRESS_UNIT_TWD = 10000000;

export const DEFAULT_EXPENSE_ANALYTICS = {
  monthlyTotalsAllHistory: [],
  kindBreakdown: [],
  payerRanking: [],
  familyBalance: [],
  categoryBreakdown: [],
};

const ANTD_TAG_COLOR_POOL = [
  "magenta",
  "red",
  "volcano",
  "orange",
  "gold",
  "lime",
  "green",
  "cyan",
  "blue",
  "geekblue",
  "purple",
];

const CHART_COLOR_POOL = [
  "#1677ff",
  "#52c41a",
  "#faad14",
  "#eb2f96",
  "#13c2c2",
  "#722ed1",
  "#fa8c16",
  "#2f54eb",
];

export const getStableTagColor = (seed, fallback = "blue") => {
  const text = String(seed ?? "").trim();
  if (!text) {
    return fallback;
  }
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) | 0;
  }
  const colorIndex = Math.abs(hash) % ANTD_TAG_COLOR_POOL.length;
  return ANTD_TAG_COLOR_POOL[colorIndex];
};

export const getStableChartColor = (seed, fallback = "#1677ff") => {
  const text = String(seed ?? "").trim();
  if (!text) {
    return fallback;
  }
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) | 0;
  }
  const colorIndex = Math.abs(hash) % CHART_COLOR_POOL.length;
  return CHART_COLOR_POOL[colorIndex];
};

let holderDraftIdSequence = 0;

export const createHolderDraftRow = (value = "", originalValue = value) => {
  holderDraftIdSequence += 1;
  return {
    id: `holder-draft-${holderDraftIdSequence}`,
    value,
    originalValue,
  };
};

export const createHolderDraftRows = (options = []) =>
  options.map((option) => createHolderDraftRow(option, option));

const HOLDER_TAB_PREFIX = "holder:";
export const HOLDER_TAB_ALL = "all";
export const HOLDER_TAB_UNSET = "unset";

export const getHolderTabKey = (holder) => `${HOLDER_TAB_PREFIX}${holder}`;

const getHolderValueFromTabKey = (tabKey) =>
  typeof tabKey === "string" && tabKey.startsWith(HOLDER_TAB_PREFIX)
    ? tabKey.slice(HOLDER_TAB_PREFIX.length)
    : null;

export const formatSignedPrice = (value, currency = "TWD") => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "--";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 4,
    signDisplay: "always",
  }).format(value);
};

export const formatSignedTwd = (value) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "--";
  }
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
    signDisplay: "always",
  }).format(Math.round(value));
};

export const formatChangePercent = (value) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "--";
  }
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
};

export const floorToTenThousand = (value) => {
  const parsed = parseNumericLike(value, {
    fallback: Number.NaN,
    context: "floorToTenThousand",
  });
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }
  return Math.floor(parsed / 10000) * 10000;
};

export const formatNetWorthScaleLabel = (value) => {
  const flooredValue = floorToTenThousand(value);
  if (flooredValue <= 0) {
    return "0";
  }
  const totalWan = Math.round(flooredValue / 10000);
  if (totalWan < 10000) {
    return `${totalWan}萬`;
  }

  const yi = Math.floor(totalWan / 10000);
  const wan = totalWan % 10000;
  if (wan === 0) {
    return `${yi}億`;
  }
  return `${yi}億${wan}萬`;
};

export const formatRecurringScheduleText = (row) => {
  if (!row) return "--";
  if (row.recurrenceType === "MONTHLY") {
    return `每月 ${row.monthlyDay || "--"} 日扣款`;
  }
  if (row.recurrenceType === "YEARLY") {
    return `每年 ${row.yearlyMonth || "--"} 月${row.yearlyDay ? `${row.yearlyDay} 日` : ""}扣款`;
  }
  return "--";
};

export const formatBudgetModeLabel = (mode) =>
  mode === "SPECIAL" ? "特別預算" : "常駐預算";

export const formatBudgetCycleLabel = (budgetType) =>
  budgetType === "QUARTERLY"
    ? "季度"
    : budgetType === "YEARLY"
      ? "年度"
      : "月度";

const escapeCsvValue = (value) => {
  const normalizedValue = String(value ?? "");
  const escapedValue = normalizedValue.replace(/"/g, '""');
  return `"${escapedValue}"`;
};

export const createHoldingsCsvContent = (rows) => {
  const header = ["股票名稱", "代號", "持股股數"];
  const records = rows.map((row) => [
    row.companyName || row.symbol,
    row.symbol,
    row.shares,
  ]);

  return [header, ...records]
    .map((record) => record.map((value) => escapeCsvValue(value)).join(","))
    .join("\r\n");
};

export const filterRowsByHolderTab = (targetRows, tab) => {
  const holderValue = getHolderValueFromTabKey(tab);
  if (holderValue) {
    return targetRows.filter((row) => row.holder === holderValue);
  }
  if (tab === HOLDER_TAB_UNSET) {
    return targetRows.filter(
      (row) => row.holderName === "未設定" || !row.holder,
    );
  }
  return targetRows;
};

const clampRatio = (value) => Math.min(1, Math.max(0, value));

export const getProgressDisplayTargets = (currentTotal, baselineTotal) => {
  const flooredCurrent = floorToTenThousand(currentTotal);
  const flooredBaseline = floorToTenThousand(baselineTotal);
  const maxValue = Math.max(
    flooredCurrent + PROGRESS_UNIT_TWD,
    flooredBaseline,
    PROGRESS_UNIT_TWD,
  );
  const progressMax =
    Math.ceil(maxValue / PROGRESS_UNIT_TWD) * PROGRESS_UNIT_TWD || 0;

  if (progressMax <= 0) {
    return {
      progressMaxTwd: 0,
      currentRatio: 0,
      baselineRatio: 0,
      deltaLeftRatio: 0,
      deltaWidthRatio: 0,
    };
  }

  const currentRatio = clampRatio(flooredCurrent / progressMax);
  const baselineRatio = clampRatio(flooredBaseline / progressMax);

  return {
    progressMaxTwd: progressMax,
    currentRatio,
    baselineRatio,
    deltaLeftRatio: Math.min(currentRatio, baselineRatio),
    deltaWidthRatio: Math.abs(currentRatio - baselineRatio),
  };
};

export const buildProgressStops = (progressMaxTwd) => {
  const stops = [];
  for (let value = 0; value <= progressMaxTwd; value += PROGRESS_UNIT_TWD) {
    stops.push(value);
  }
  return stops;
};
