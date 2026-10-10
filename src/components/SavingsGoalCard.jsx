import { formatTwd } from "../utils/formatters";
import {
  GOAL_STATUS_META,
  getGoalNote,
  getGoalTargetLabel,
} from "../utils/savingsGoals";
import GoalIcon from "./GoalIcon";

// One savings goal: icon, name, amount saved, target and a one-line note on
// the left; status pill and a static cup filled to the progress on the right.
// The cup never animates — the expense tab's one moving thing is the tower.

export function GoalCup({ ratio = 0, tone = "teal", size = "md" }) {
  const pct = Math.round(Math.min(1, Math.max(0, Number(ratio) || 0)) * 100);
  return (
    <div className={`goal-cup goal-cup--${size} goal-cup--${tone}`} aria-hidden="true">
      <div
        className={`goal-cup-fill goal-cup-fill--${tone}`}
        style={{ height: `${pct}%` }}
      />
    </div>
  );
}

export function GoalStatusPill({ status }) {
  const meta = GOAL_STATUS_META[status];
  if (!meta) return null;
  return (
    <span className={`goal-status goal-status--${meta.tone}`}>{meta.label}</span>
  );
}

export default function SavingsGoalCard({ goal, onOpen }) {
  const tone = goal.isArchived
    ? "muted"
    : (GOAL_STATUS_META[goal.status]?.tone ?? "teal");
  const note = getGoalNote(goal);
  return (
    <button
      type="button"
      className={`savings-goal-card${goal.isArchived ? " savings-goal-card--archived" : ""}`}
      aria-label={`查看儲蓄目標：${goal.name}`}
      onClick={() => onOpen?.(goal)}
    >
      <span className="savings-goal-card-info">
        <GoalIcon iconKey={goal.iconKey} />
        <span className="savings-goal-card-name">{goal.name}</span>
        <span className="savings-goal-card-amount">{formatTwd(goal.currentTwd)}</span>
        <span className="savings-goal-card-meta">{getGoalTargetLabel(goal)}</span>
        {note && <span className="savings-goal-card-meta">{note}</span>}
      </span>
      <span className="savings-goal-card-side">
        {!goal.isArchived && <GoalStatusPill status={goal.status} />}
        <GoalCup ratio={goal.progressRatio} tone={tone} />
      </span>
    </button>
  );
}
