import { Drawer, Empty, Typography } from "antd";
import ExpenseDayList, { UpcomingExpenseList } from "./ExpenseDayList";
import { formatDate, formatTwd } from "../utils/formatters";
import { getBudgetStatus } from "../utils/budgetStatus";
import { getCycleProgress, getDailyAllowance } from "../utils/budgetView";
import useBodyScrollLock from "../hooks/useBodyScrollLock";

const { Text } = Typography;

// Mobile: a budget's current cycle — summary, then its expenses grouped by
// day (all open), with charges still to come under 本期預計.

function BudgetDetailSheet({ open, budget, today, onClose, getActions, disabled = false }) {
  useBodyScrollLock(Boolean(open && budget));
  if (!budget) return null;
  const status = getBudgetStatus(budget);
  const progress = getCycleProgress(budget, today);
  const daily =
    status.level === "over"
      ? null
      : getDailyAllowance(status.remainingTwd, progress?.daysLeft);
  const expenses = budget.cycleExpenses || [];
  const summary = [
    `${formatDate(budget.cycleStart)} ~ ${formatDate(budget.cycleEnd)}`,
    `${formatTwd(Number(budget.spentTwd) || 0)} / ${formatTwd(Number(budget.availableTwd) || 0)}`,
    budget.hasCarryInApplied && Number(budget.carryInTwd)
      ? `帶入 ${formatTwd(Number(budget.carryInTwd))}`
      : null,
    daily !== null ? `每天可花 ${formatTwd(daily)}` : null,
  ].filter(Boolean);

  return (
    <Drawer
      placement="bottom"
      title={budget.name}
      open={open}
      onClose={onClose}
      size="90vh"
      destroyOnHidden
      className="form-bottom-sheet budget-detail-sheet"
    >
      <div className="budget-detail-summary" data-testid="budget-detail-summary">
        <div className={`budget-row-remaining budget-row-remaining--${status.level}`}>
          {status.level === "over"
            ? `超支 ${formatTwd(status.overTwd)}`
            : `剩餘 ${formatTwd(status.remainingTwd)}`}
        </div>
        <Text type="secondary" className="budget-detail-meta">
          {summary.join(" · ")}
        </Text>
      </div>
      <UpcomingExpenseList
        rows={expenses}
        getActions={getActions}
        disabled={disabled}
        label="本期預計"
      />
      <ExpenseDayList
        rows={expenses.filter((row) => !row.isUpcoming)}
        today={today}
        getActions={getActions}
        disabled={disabled}
        expandAll
        empty={
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="本期還沒有支出" />
        }
      />
    </Drawer>
  );
}

export default BudgetDetailSheet;
