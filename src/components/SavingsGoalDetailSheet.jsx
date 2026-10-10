import { Button, Drawer } from "antd";
import { EditPencil } from "iconoir-react";
import useBodyScrollLock from "../hooks/useBodyScrollLock";
import { formatTwd } from "../utils/formatters";
import {
  GOAL_STATUS_META,
  getGoalFacts,
  getGoalTargetLabel,
} from "../utils/savingsGoals";
import GoalIcon from "./GoalIcon";
import { GoalCup, GoalStatusPill } from "./SavingsGoalCard";

// A savings goal's detail: the head (amount, target, status, cup), how the
// target or pace is worked out, the linked accounts, then archive / delete.
// Bottom sheet on mobile, side drawer on desktop.

export default function SavingsGoalDetailSheet({
  open,
  goal,
  isMobile,
  onClose,
  onEdit,
  onToggleArchive,
  onDelete,
  disabled = false,
}) {
  useBodyScrollLock(Boolean(open && goal && isMobile));
  if (!goal) return null;
  const tone = goal.isArchived
    ? "muted"
    : (GOAL_STATUS_META[goal.status]?.tone ?? "teal");
  const facts = getGoalFacts(goal);

  return (
    <Drawer
      placement={isMobile ? "bottom" : "right"}
      size={isMobile ? "90vh" : 420}
      title={goal.name}
      open={open}
      onClose={onClose}
      destroyOnHidden
      className={`savings-goal-sheet${isMobile ? " form-bottom-sheet" : ""}`}
      extra={
        <Button
          type="text"
          icon={<EditPencil />}
          disabled={disabled}
          onClick={() => onEdit?.(goal)}
        >
          編輯
        </Button>
      }
    >
      <div className="savings-goal-detail-head" data-testid="savings-goal-detail-head">
        <div className="savings-goal-detail-info">
          <GoalIcon iconKey={goal.iconKey} size="lg" />
          {!goal.isArchived && <GoalStatusPill status={goal.status} />}
          <span className="savings-goal-detail-amount">{formatTwd(goal.currentTwd)}</span>
          <span className="savings-goal-card-meta">{getGoalTargetLabel(goal)}</span>
        </div>
        <GoalCup ratio={goal.progressRatio} tone={tone} size="lg" />
      </div>

      {facts.length > 0 && (
        <dl className="savings-goal-facts">
          {facts.map((fact) => (
            <div key={fact.label} className="savings-goal-fact">
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <h3 className="savings-goal-detail-subtitle">帳戶</h3>
      {goal.accounts.length === 0 && goal.missingAccountCount === 0 ? (
        <p className="savings-goal-detail-empty">尚未選擇帳戶</p>
      ) : (
        <ul className="savings-goal-accounts">
          {goal.accounts.map((account) => (
            <li key={account.key} className="savings-goal-account">
              <div className="savings-goal-account-top">
                <span className="savings-goal-account-name">
                  {`${account.bankName}・${account.accountAlias}`}
                </span>
                <span className="savings-goal-account-balance">
                  {formatTwd(account.balanceTwd)}
                </span>
              </div>
              <span className="savings-goal-card-meta">{account.holder ?? "未設定"}</span>
              {account.sharedWith.length > 0 && (
                <span className="savings-goal-card-meta">
                  {`也計入：${account.sharedWith.join("、")}`}
                </span>
              )}
            </li>
          ))}
          {goal.missingAccountCount > 0 && (
            <li className="savings-goal-account savings-goal-card-meta">
              {`${goal.missingAccountCount} 個帳戶已刪除`}
            </li>
          )}
        </ul>
      )}

      <div className="savings-goal-detail-actions">
        <Button block disabled={disabled} onClick={() => onToggleArchive?.(goal)}>
          {goal.isArchived ? "取消封存" : "封存"}
        </Button>
        <Button block danger disabled={disabled} onClick={() => onDelete?.(goal)}>
          刪除
        </Button>
      </div>
    </Drawer>
  );
}
