import { useState } from "react";
import { NavArrowRight } from "iconoir-react";
import Collapsible from "./Collapsible";

// One framed list of groups, each folding from its heading (title on the
// left, total + chevron on the right). Shares the expense day list's styles.

function CollapsibleGroups({
  groups = [],
  renderRow,
  defaultExpanded = true,
  empty = null,
  className = "",
}) {
  // Groups the user opened / closed; others follow defaultExpanded.
  const [toggled, setToggled] = useState({});
  if (groups.length === 0) return empty;

  return (
    <div className={`expense-day-list ${className}`.trim()}>
      {groups.map((group) => {
        const expanded = toggled[group.key] ?? defaultExpanded;
        return (
          <section key={group.key} className="expense-day-group">
            <button
              type="button"
              className="expense-day-heading expense-day-toggle"
              aria-expanded={expanded}
              onClick={() =>
                setToggled((current) => ({ ...current, [group.key]: !expanded }))
              }
            >
              <span>{group.title}</span>
              <span className="expense-day-heading-end">
                <span className="expense-day-total">{group.total}</span>
                <NavArrowRight className="collapse-chevron" />
              </span>
            </button>
            <Collapsible open={expanded}>{group.rows.map(renderRow)}</Collapsible>
          </section>
        );
      })}
    </div>
  );
}

export default CollapsibleGroups;
