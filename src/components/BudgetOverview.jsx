import { Tag } from "antd";
import SwipeActions from "./SwipeActions";
import { formatTwd } from "../utils/formatters";
import { BUDGET_LEVEL_COLORS, getBudgetStatus } from "../utils/budgetStatus";
import {
  getBudgetBarSegments,
  getCycleProgress,
  getDailyAllowance,
  sortBudgetsByUrgency,
} from "../utils/budgetView";

// Mobile 目前生效預算: one framed list, most urgent first. Each row leads with
// the amount left (or over), a bar split into charged / upcoming with a marker
// for how far the cycle has run, and a 「已用 · 已花 / 可用 · 每天可花」 line.
// Tap opens the budget's detail; swipe for edit / delete.

function BudgetRow({ budget, today, onOpen }) {
  const status = getBudgetStatus(budget);
  const { chargedPct, upcomingPct } = getBudgetBarSegments(budget);
  const progress = getCycleProgress(budget, today);
  const daily =
    status.level === "over"
      ? null
      : getDailyAllowance(status.remainingTwd, progress?.daysLeft);
  // Upcoming charges are the bar's lighter segment (the detail lists them),
  // which keeps this line to one row.
  const meta = [
    `已用 ${status.usedPct.toFixed(0)}%`,
    `${formatTwd(Number(budget.spentTwd) || 0)} / ${formatTwd(Number(budget.availableTwd) || 0)}`,
    daily !== null ? `每天可花 ${formatTwd(daily)}` : null,
  ].filter(Boolean);

  return (
    <button
      type="button"
      className="budget-row"
      aria-label={`查看預算：${budget.name}`}
      onClick={() => onOpen?.(budget)}
    >
      <div className="budget-row-top">
        <span className="budget-row-name">
          <span>{budget.name}</span>
          {budget.budgetMode === "SPECIAL" && (
            <Tag variant="filled" className="budget-row-tag">
              特別預算
            </Tag>
          )}
        </span>
        <span className={`budget-row-remaining budget-row-remaining--${status.level}`}>
          {status.level === "over"
            ? `超支 ${formatTwd(status.overTwd)}`
            : `剩餘 ${formatTwd(status.remainingTwd)}`}
        </span>
      </div>
      <div className="budget-bar" aria-hidden="true">
        <div
          className="budget-bar-charged"
          style={{
            width: `${chargedPct}%`,
            background: BUDGET_LEVEL_COLORS[status.level],
          }}
        />
        <div
          className="budget-bar-upcoming"
          style={{
            left: `${chargedPct}%`,
            width: `${upcomingPct}%`,
            background: BUDGET_LEVEL_COLORS[status.level],
          }}
        />
        {progress && (
          <div
            className="budget-bar-pace"
            style={{ left: `${progress.elapsedRatio * 100}%` }}
          />
        )}
      </div>
      <div className="budget-row-meta">{meta.join(" · ")}</div>
    </button>
  );
}

function BudgetOverview({
  budgets = [],
  today,
  onOpen,
  getActions,
  disabled = false,
}) {
  return (
    <div className="budget-overview">
      {sortBudgetsByUrgency(budgets).map((budget) => (
        <SwipeActions
          key={budget.id}
          actions={getActions(budget)}
          disabled={disabled}
        >
          <BudgetRow budget={budget} today={today} onOpen={onOpen} />
        </SwipeActions>
      ))}
    </div>
  );
}

export default BudgetOverview;
