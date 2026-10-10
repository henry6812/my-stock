// 儲蓄目標: pure helpers. A goal's amount is the sum of the cash accounts it
// links (by cloud key — local ids differ per device); an account may count
// toward several goals in full. portfolioService builds the rows, the UI only
// renders them. Spec: docs/superpowers/specs/2026-10-10-savings-goals-design.md
import dayjs from "dayjs";
import { formatTwd } from "./formatters";

export const GOAL_KIND = {
  DEADLINE: "deadline",
  OPEN: "open",
  ONGOING: "ongoing",
};
export const GOAL_KINDS = Object.values(GOAL_KIND);

export const ONGOING_MONTHS_MIN = 1;
export const ONGOING_MONTHS_MAX = 24;
export const ONGOING_MONTHS_DEFAULT = 6;

// Picker order + accessible names; components/goalIconComponents.js maps the
// keys to iconoir icons.
export const GOAL_ICON_OPTIONS = [
  { key: "savings", label: "存錢" },
  { key: "emergency", label: "緊急預備金" },
  { key: "car", label: "買車" },
  { key: "travel", label: "旅遊" },
  { key: "phone", label: "手機" },
  { key: "home", label: "買房" },
  { key: "wedding", label: "結婚" },
  { key: "education", label: "教育" },
  { key: "computer", label: "電腦" },
  { key: "medical", label: "醫療" },
];
export const GOAL_ICON_KEYS = GOAL_ICON_OPTIONS.map((item) => item.key);

// First rule whose keyword appears in the name wins; no match → savings.
const ICON_RULES = [
  ["emergency", ["預備金", "緊急"]],
  ["car", ["車"]],
  ["travel", ["旅", "出國", "機票"]],
  ["phone", ["手機"]],
  ["home", ["房", "頭期"]],
  ["wedding", ["婚"]],
  ["education", ["教育", "學"]],
  ["computer", ["電腦", "筆電", "3C"]],
  ["medical", ["醫療", "醫"]],
];

export const getGoalIconKey = (name) => {
  const text = String(name ?? "").toUpperCase();
  const rule = ICON_RULES.find(([, keywords]) =>
    keywords.some((keyword) => text.includes(keyword)),
  );
  return rule ? rule[0] : "savings";
};

export const normalizeGoalIcon = (value) =>
  GOAL_ICON_KEYS.includes(value) ? value : null;

export const resolveGoalIcon = ({ icon, name }) =>
  normalizeGoalIcon(icon) ?? getGoalIconKey(name);

export const GOAL_STATUS_META = {
  achieved: { label: "已達成", tone: "teal" },
  overdue: { label: "已逾期", tone: "down" },
  "on-track": { label: "進度正常", tone: "teal" },
  behind: { label: "落後", tone: "warn" },
  "in-progress": { label: "進行中", tone: "teal" },
  sufficient: { label: "足夠", tone: "teal" },
  below: { label: "低於目標", tone: "warn" },
  "insufficient-data": { label: "支出資料不足", tone: "muted" },
};

// Latest 12 complete months (the current month is still running, and so
// was the first month if recording began after the 1st); a month with no
// expenses counts as 0. `monthlySummaries` is buildMonthlySummaries' output:
// ascending, ending at the current month.
export const averageMonthlyExpense = (
  monthlySummaries = [],
  { firstExpenseDate = null } = {},
) => {
  const partialMonth =
    firstExpenseDate && !String(firstExpenseDate).endsWith("-01")
      ? String(firstExpenseDate).slice(0, 7)
      : null;
  const complete = monthlySummaries
    .filter((row) => !row.isCurrent && row.month !== partialMonth)
    .slice(-12);
  if (complete.length === 0) {
    return { averageTwd: null, monthsUsed: 0 };
  }
  const total = complete.reduce(
    (sum, row) => sum + (Number(row.expenseTwd) || 0),
    0,
  );
  return {
    averageTwd: Math.round(total / complete.length),
    monthsUsed: complete.length,
  };
};

export const computeGoalProgress = ({
  kind,
  targetTwd,
  startTwd,
  startDate,
  deadline,
  currentTwd,
  today,
}) => {
  const target = Number(targetTwd);
  if (!(target > 0)) {
    return {
      status: "insufficient-data",
      progressRatio: 0,
      shortfallTwd: null,
      expectedTwd: null,
      monthlyNeededTwd: null,
      daysLeft: null,
    };
  }
  const current = Number(currentTwd) || 0;
  const shortfallTwd = Math.max(0, target - current);
  const base = {
    progressRatio: Math.min(1, Math.max(0, current / target)),
    shortfallTwd,
    expectedTwd: null,
    monthlyNeededTwd: null,
    daysLeft: null,
  };
  if (kind === GOAL_KIND.ONGOING) {
    return { ...base, status: shortfallTwd === 0 ? "sufficient" : "below" };
  }
  if (kind !== GOAL_KIND.DEADLINE) {
    return { ...base, status: shortfallTwd === 0 ? "achieved" : "in-progress" };
  }

  const day = dayjs(today);
  const end = dayjs(deadline);
  const daysLeft = Math.max(0, end.diff(day, "day"));
  if (shortfallTwd === 0) {
    return { ...base, status: "achieved", daysLeft };
  }
  if (day.isAfter(end, "day")) {
    return { ...base, status: "overdue", daysLeft: 0 };
  }
  const start = Number(startTwd) || 0;
  const totalDays = end.diff(dayjs(startDate), "day");
  const elapsed = Math.min(
    totalDays,
    Math.max(0, day.diff(dayjs(startDate), "day")),
  );
  const expectedTwd =
    totalDays > 0
      ? Math.round(start + ((target - start) * elapsed) / totalDays)
      : target;
  const monthsLeft = Math.max(1, Math.ceil(daysLeft / 30));
  return {
    ...base,
    status: current >= expectedTwd ? "on-track" : "behind",
    expectedTwd,
    monthlyNeededTwd: Math.ceil(shortfallTwd / monthsLeft),
    daysLeft,
  };
};

// Throws dev-facing messages; the form validates the same rules in zh-TW.
// A deadline must be after today unless it is the goal's existing one, so an
// overdue goal can still be edited.
export const normalizeSavingsGoalInput = (
  input,
  { today, previousDeadline = null } = {},
) => {
  const name = String(input?.name ?? "").trim();
  if (!name) throw new Error("Goal name is required");
  const kind = GOAL_KINDS.includes(input?.kind) ? input.kind : null;
  if (!kind) throw new Error("Invalid goal kind");
  const cashAccountKeys = [
    ...new Set(
      (Array.isArray(input?.cashAccountKeys) ? input.cashAccountKeys : [])
        .map((key) => String(key ?? "").trim())
        .filter(Boolean),
    ),
  ];
  const result = {
    name,
    icon: normalizeGoalIcon(input?.icon),
    kind,
    targetTwd: null,
    targetMonths: null,
    deadline: null,
    cashAccountKeys,
  };

  if (kind === GOAL_KIND.ONGOING) {
    const months = Number(input?.targetMonths);
    if (
      !Number.isInteger(months) ||
      months < ONGOING_MONTHS_MIN ||
      months > ONGOING_MONTHS_MAX
    ) {
      throw new Error("Goal months must be 1-24");
    }
    return { ...result, targetMonths: months };
  }

  const target = Number(input?.targetTwd);
  if (!Number.isFinite(target) || target <= 0) {
    throw new Error("Goal target must be a positive number");
  }
  result.targetTwd = Math.round(target);
  if (kind === GOAL_KIND.DEADLINE) {
    const parsed = dayjs(input?.deadline);
    if (!input?.deadline || !parsed.isValid()) {
      throw new Error("Goal deadline is required");
    }
    const deadline = parsed.format("YYYY-MM-DD");
    if (deadline !== previousDeadline && deadline <= today) {
      throw new Error("Goal deadline must be after today");
    }
    result.deadline = deadline;
  }
  return result;
};

export const getNextGoalSortOrder = (goals) =>
  (goals || [])
    .filter((goal) => !goal?.deletedAt)
    .reduce((max, goal) => Math.max(max, Number(goal.sortOrder) || 0), 0) + 1;

// keyMap: { oldCashAccountKey: newCashAccountKey }. Returns only the goals
// whose links change.
export const planGoalAccountRelink = (goals, keyMap) => {
  const plan = [];
  for (const goal of goals || []) {
    const keys = goal.cashAccountKeys || [];
    if (!keys.some((key) => key in keyMap)) continue;
    plan.push({
      goal,
      cashAccountKeys: [...new Set(keys.map((key) => keyMap[key] ?? key))],
    });
  }
  return plan;
};

export const buildSavingsGoalRows = ({
  goals = [],
  cashAccounts = [],
  monthlySummaries = [],
  firstExpenseDate = null,
  today,
}) => {
  const average = averageMonthlyExpense(monthlySummaries, { firstExpenseDate });
  const liveGoals = goals.filter((goal) => !goal.deletedAt);
  const accountByKey = new Map(
    cashAccounts
      .filter((account) => !account.deletedAt)
      .map((account) => [account.key, account]),
  );
  const openGoalsByKey = new Map();
  for (const goal of liveGoals) {
    if (goal.archivedAt) continue;
    for (const key of goal.cashAccountKeys || []) {
      const list = openGoalsByKey.get(key) ?? [];
      list.push(goal);
      openGoalsByKey.set(key, list);
    }
  }

  return [...liveGoals]
    .sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0))
    .map((goal) => {
      const keys = goal.cashAccountKeys || [];
      const accounts = keys
        .filter((key) => accountByKey.has(key))
        .map((key) => ({
          ...accountByKey.get(key),
          sharedWith: (openGoalsByKey.get(key) ?? [])
            .filter((other) => other.id !== goal.id)
            .map((other) => other.name),
        }));
      const currentTwd = accounts.reduce(
        (sum, account) => sum + (Number(account.balanceTwd) || 0),
        0,
      );
      const isOngoing = goal.kind === GOAL_KIND.ONGOING;
      const targetTwd = isOngoing
        ? average.averageTwd === null
          ? null
          : Math.round(average.averageTwd * goal.targetMonths)
        : goal.targetTwd;
      return {
        id: goal.id,
        remoteKey: goal.remoteKey,
        name: goal.name,
        icon: goal.icon ?? null,
        iconKey: resolveGoalIcon(goal),
        kind: goal.kind,
        targetTwd,
        targetMonths: goal.targetMonths ?? null,
        deadline: goal.deadline ?? null,
        startTwd: goal.startTwd,
        startDate: goal.startDate,
        cashAccountKeys: keys,
        sortOrder: goal.sortOrder,
        archivedAt: goal.archivedAt ?? null,
        isArchived: Boolean(goal.archivedAt),
        currentTwd,
        accounts,
        missingAccountCount: keys.length - accounts.length,
        averageMonthlyExpenseTwd: isOngoing ? average.averageTwd : null,
        monthsUsed: isOngoing ? average.monthsUsed : null,
        ...computeGoalProgress({ ...goal, targetTwd, currentTwd, today }),
      };
    });
};

// Goal rows (from buildSavingsGoalRows) that count the account with this
// cloud key: open goals first, archived after, each in list order.
export const getGoalsUsingCashAccount = (goalRows = [], cashAccountKey) => {
  if (!cashAccountKey) return [];
  const linked = goalRows.filter((goal) =>
    (goal.cashAccountKeys || []).includes(cashAccountKey),
  );
  return [
    ...linked.filter((goal) => !goal.isArchived),
    ...linked.filter((goal) => goal.isArchived),
  ];
};

export const getGoalTargetLabel = (goal) => {
  if (goal.kind === GOAL_KIND.ONGOING) {
    return goal.targetTwd === null
      ? `目標 ${goal.targetMonths} 個月支出`
      : `目標 ${formatTwd(goal.targetTwd)}（${goal.targetMonths} 個月）`;
  }
  return `目標 ${formatTwd(goal.targetTwd)}`;
};

const isPacing = (status) => status === "on-track" || status === "behind";

export const getGoalNote = (goal) => {
  if (!goal.cashAccountKeys?.length) return "尚未選擇帳戶";
  if (goal.kind === GOAL_KIND.DEADLINE) {
    // The total still to save, not the monthly figure: on its own that one
    // read as the total (detail sheet has 每月需再存).
    const due = `${dayjs(goal.deadline).format("YYYY/MM")} 前`;
    return goal.shortfallTwd > 0
      ? `還差 ${formatTwd(goal.shortfallTwd)}・${due}`
      : due;
  }
  if (goal.status === "in-progress" || goal.status === "below") {
    return `還差 ${formatTwd(goal.shortfallTwd)}`;
  }
  return null;
};

export const getGoalFacts = (goal) => {
  const facts = [];
  if (goal.kind === GOAL_KIND.DEADLINE) {
    facts.push({ label: "到期日", value: dayjs(goal.deadline).format("YYYY/MM/DD") });
    if (isPacing(goal.status)) {
      facts.push({ label: "剩餘", value: `${goal.daysLeft} 天` });
    }
    if (goal.shortfallTwd > 0) {
      facts.push({ label: "還差", value: formatTwd(goal.shortfallTwd) });
    }
    if (isPacing(goal.status)) {
      facts.push(
        { label: "應有進度", value: formatTwd(goal.expectedTwd) },
        { label: "每月需再存", value: formatTwd(goal.monthlyNeededTwd) },
      );
    }
    return facts;
  }
  if (goal.kind === GOAL_KIND.ONGOING) {
    if (goal.averageMonthlyExpenseTwd === null || goal.targetTwd === null) {
      return [{ label: "計算方式", value: "還沒有完整月份的支出資料" }];
    }
    facts.push(
      {
        label: "計算方式",
        value: `平均月支出 ${formatTwd(goal.averageMonthlyExpenseTwd)} × ${goal.targetMonths} 個月 = ${formatTwd(goal.targetTwd)}`,
      },
      { label: "依據", value: `近 ${goal.monthsUsed} 個完整月的支出` },
    );
  }
  if (goal.shortfallTwd > 0) {
    facts.push({ label: "還差", value: formatTwd(goal.shortfallTwd) });
  }
  return facts;
};
