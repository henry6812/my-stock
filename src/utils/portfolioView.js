// Pure view-layer constants and helpers extracted from App.jsx.
// These are stateless (they were module-scope in App.jsx and never closed over
// component state), so moving them here is behavior-preserving.

import { parseNumericLike } from "./number";
import { CHART_PALETTE, HOLDER_TONES } from "../theme/tokens";

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

const hashSeed = (text) => {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
};

// Holder tags are the only coloured tags. Tone follows the holder's position
// in the settings list so Po and Wei can never share a colour; unknown
// holders fall back to a stable hash.
export const getHolderTagStyle = (holder, holderOptions = []) => {
  const text = String(holder ?? "").trim();
  if (!text) {
    return undefined;
  }
  const position = holderOptions.indexOf(text);
  const index =
    position >= 0 ? position : hashSeed(text);
  return HOLDER_TONES[index % HOLDER_TONES.length];
};

export const getStableChartColor = (seed, fallback = CHART_PALETTE[0]) => {
  const text = String(seed ?? "").trim();
  if (!text) {
    return fallback;
  }
  return CHART_PALETTE[hashSeed(text) % CHART_PALETTE.length];
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
  return new Intl.NumberFormat("zh-TW", {
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

export const toCsvContent = (header, records) =>
  [header, ...records]
    .map((record) => record.map((value) => escapeCsvValue(value)).join(","))
    .join("\r\n");

export const createHoldingsCsvContent = (rows) =>
  toCsvContent(
    ["股票名稱", "代號", "持股股數"],
    rows.map((row) => [row.companyName || row.symbol, row.symbol, row.shares]),
  );

export const createCashCsvContent = (rows) =>
  toCsvContent(
    ["銀行", "銀行代碼", "帳戶別名", "持有人", "餘額 (TWD)"],
    rows.map((row) => [
      row.bankName,
      row.bankCode ?? "",
      row.accountAlias,
      row.holder ?? "",
      row.balanceTwd,
    ]),
  );

// entries: raw expense_entries rows; names resolved via the lookup maps.
export const createExpensesCsvContent = (
  entries,
  { categoryNameById = new Map(), budgetNameById = new Map() } = {},
) =>
  toCsvContent(
    ["日期", "名稱", "金額 (TWD)", "單筆 / 定期", "分類", "預算", "支出人", "家庭 / 個人"],
    [...entries]
      .sort((a, b) => String(b.occurredAt).localeCompare(String(a.occurredAt)))
      .map((entry) => [
        entry.occurredAt,
        entry.name,
        entry.amountTwd,
        entry.entryType === "RECURRING"
          ? entry.recurrenceType === "YEARLY"
            ? "定期（年）"
            : "定期（月）"
          : "單筆",
        categoryNameById.get(entry.categoryId) ?? "",
        budgetNameById.get(entry.budgetId) ?? "",
        entry.payer ?? "",
        entry.expenseKind ?? "",
      ]),
  );

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
