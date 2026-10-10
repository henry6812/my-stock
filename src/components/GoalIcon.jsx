// A savings goal's icon in a round neutral tile (decoration: the goal's name
// is always written next to it).
import { GOAL_ICON_COMPONENTS } from "./goalIconComponents";

export default function GoalIcon({ iconKey, size = "md" }) {
  const key = GOAL_ICON_COMPONENTS[iconKey] ? iconKey : "savings";
  const Icon = GOAL_ICON_COMPONENTS[key];
  return (
    <span
      className={`goal-icon goal-icon--${size}`}
      data-goal-icon={key}
      aria-hidden="true"
    >
      <Icon />
    </span>
  );
}
