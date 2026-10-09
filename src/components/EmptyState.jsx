// Placeholder for an empty list or chart: the subject's iconoir icon in the
// same round tile as a row without a category (white, 1px line, muted), one
// muted line of text, then an optional action. Used instead of antd's Empty
// illustration, which is drawn in a different style from our icons.
export default function EmptyState({ icon: Icon, description, children }) {
  return (
    <div className="empty-state">
      {Icon && (
        <span className="empty-state-icon">
          <Icon />
        </span>
      )}
      {description && <p className="empty-state-text">{description}</p>}
      {children && <div className="empty-state-action">{children}</div>}
    </div>
  );
}
