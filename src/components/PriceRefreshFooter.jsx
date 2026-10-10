import { Refresh } from "iconoir-react";

// One quiet line under the mobile holdings list: when prices were last
// updated, and a link to update them now.

const NEVER = "尚未更新";

function PriceRefreshFooter({
  updatedText = NEVER,
  loading = false,
  disabled = false,
  onRefresh,
}) {
  const status = loading
    ? "更新中…"
    : updatedText === NEVER
      ? NEVER
      : `${updatedText}更新`;

  return (
    <div className="price-refresh-footer">
      <p className="price-refresh-status">
        <Refresh
          className={`price-refresh-icon${loading ? " is-spinning" : ""}`}
          aria-hidden
        />
        <span aria-live="polite">{status}</span>
        <span className="price-refresh-sep" aria-hidden>
          |
        </span>
        <button
          type="button"
          className="price-refresh-link"
          onClick={onRefresh}
          disabled={disabled || loading}
        >
          立即更新
        </button>
      </p>
    </div>
  );
}

export default PriceRefreshFooter;
