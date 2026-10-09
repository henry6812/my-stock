import SwipeActions from "./SwipeActions";

// Mobile list row: content on the left / right, actions revealed by swiping
// left (see SwipeActions).
// `label` names a tappable row for assistive tech, instead of having every
// line of its content read out.
function MobileSwipeRow({
  actions,
  disabled = false,
  main,
  side = null,
  onTap,
  label,
}) {
  return (
    <SwipeActions actions={actions} disabled={disabled}>
      <div
        className="mobile-swipe-row"
        onClick={onTap}
        role={onTap ? "button" : undefined}
        aria-label={onTap ? label : undefined}
        tabIndex={onTap ? 0 : undefined}
        onKeyDown={
          onTap
            ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onTap();
                }
              }
            : undefined
        }
      >
        <div className="mobile-swipe-row-main">{main}</div>
        {side !== null && <div className="mobile-swipe-row-side">{side}</div>}
      </div>
    </SwipeActions>
  );
}

export default MobileSwipeRow;
