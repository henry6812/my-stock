import { WarningCircle, WarningTriangle } from "iconoir-react";
import { formatTwd } from "../utils/formatters";

// A budget's 剩餘 / 超支 amount, coloured by level. Near the limit and over it
// also get a warning icon, so the level doesn't rest on colour alone.
const LEVEL_ICONS = { warn: WarningCircle, over: WarningTriangle };

export default function BudgetRemaining({ status, as = "span" }) {
  const Element = as;
  const Icon = LEVEL_ICONS[status.level];
  return (
    <Element className={`budget-row-remaining budget-row-remaining--${status.level}`}>
      {Icon && <Icon className="budget-row-remaining-icon" />}
      {status.level === "over"
        ? `超支 ${formatTwd(status.overTwd)}`
        : `剩餘 ${formatTwd(status.remainingTwd)}`}
    </Element>
  );
}
