import { useState } from "react";
import { Button, Typography } from "antd";
import { NavArrowDown, NavArrowRight, PiggyBank, Plus } from "iconoir-react";
import Collapsible from "./Collapsible";
import EmptyState from "./EmptyState";
import SavingsGoalCard from "./SavingsGoalCard";

const { Text } = Typography;

// 支出頁「儲蓄目標」: open goals stacked full width on mobile, a wrapping grid
// on desktop (rows arrive sorted by sortOrder); archived ones fold away at
// the bottom.

export default function SavingsGoalList({
  goals = [],
  onOpen,
  onCreate,
  disabled = false,
  grid = false,
}) {
  const listClass = `savings-goal-list${grid ? " savings-goal-list--grid" : ""}`;
  const [showArchived, setShowArchived] = useState(false);
  const open = goals.filter((goal) => !goal.isArchived);
  const archived = goals.filter((goal) => goal.isArchived);

  return (
    <section className="savings-goals-section">
      <div className="savings-goals-head">
        <Text strong className="savings-goals-title">
          儲蓄目標
        </Text>
        <Button
          type="text"
          size="small"
          className="title-add-btn"
          icon={<Plus />}
          aria-label="新增儲蓄目標"
          disabled={disabled}
          onClick={() => onCreate?.()}
        />
      </div>
      {open.length === 0 ? (
        <EmptyState icon={PiggyBank} description="還沒有儲蓄目標">
          <Button icon={<Plus />} disabled={disabled} onClick={() => onCreate?.()}>
            新增目標
          </Button>
        </EmptyState>
      ) : (
        <div className={listClass}>
          {open.map((goal) => (
            <SavingsGoalCard key={goal.id} goal={goal} onOpen={onOpen} />
          ))}
        </div>
      )}
      {archived.length > 0 && (
        <div className="savings-goals-archived">
          <button
            type="button"
            className="savings-goals-archived-toggle"
            aria-expanded={showArchived}
            onClick={() => setShowArchived((value) => !value)}
          >
            {showArchived ? <NavArrowDown aria-hidden="true" /> : <NavArrowRight aria-hidden="true" />}
            <span>{`已封存（${archived.length}）`}</span>
          </button>
          <Collapsible open={showArchived}>
            <div className={listClass}>
              {archived.map((goal) => (
                <SavingsGoalCard key={goal.id} goal={goal} onOpen={onOpen} />
              ))}
            </div>
          </Collapsible>
        </div>
      )}
    </section>
  );
}
