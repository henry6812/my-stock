import { useState } from "react";
import { NavArrowRight } from "iconoir-react";
import Collapsible from "./Collapsible";

// One framed list of groups, each folding from its heading (title on the
// left, total + chevron on the right). Shares the expense day list's styles.
// With storageKey, the groups the user opened / closed are remembered in
// localStorage (a per-device convenience; failures fall back to defaults).
// A group's optional `leading` node (e.g. a holder avatar) sits before its
// title.

const readToggled = (storageKey) => {
  if (!storageKey) return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const writeToggled = (storageKey, toggled) => {
  if (!storageKey) return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(toggled));
  } catch {
    // Storage unavailable (private mode, quota): keep it for this session.
  }
};

function CollapsibleGroups({
  groups = [],
  renderRow,
  defaultExpanded = true,
  storageKey,
  empty = null,
  className = "",
}) {
  // Groups the user opened / closed; others follow defaultExpanded.
  const [toggled, setToggled] = useState(() => readToggled(storageKey));
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
                setToggled((current) => {
                  const next = { ...current, [group.key]: !expanded };
                  writeToggled(storageKey, next);
                  return next;
                })
              }
            >
              <span className="expense-day-title">
                {group.leading}
                <span>{group.title}</span>
              </span>
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
