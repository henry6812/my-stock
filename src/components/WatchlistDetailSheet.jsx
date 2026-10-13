import { useState } from "react";
import { formatDateTime, formatPrice } from "../utils/formatters";
import { formatSignedPercent } from "../utils/stockDetail";
import StockResearchContent from "./stockDetail/StockResearchContent";
import StockSheetShell from "./stockDetail/StockSheetShell";

const changeClass = (value) =>
  value >= 0 ? "stock-detail-change--up" : "stock-detail-change--down";

const formatSignedPrice = (value, currency) =>
  `${value >= 0 ? "+" : "−"}${formatPrice(Math.abs(value), currency)}`;

// A watched stock: its last quote, then the same research as a holding —
// no position, no buy / sell. The parent keys this by item id.
function WatchlistDetailSheet({ open, item, isMobile, disabled, onClose, onRemove }) {
  const [basis, setBasis] = useState("ttm");

  if (!item) return null;

  return (
    <StockSheetShell open={open} isMobile={isMobile} name={item.name} symbol={item.symbol} onClose={onClose}>
      <section className="stock-detail-position watchlist-quote" aria-label="報價">
        <span className="stock-detail-position-label">現價</span>
        <span className="watchlist-quote-price">
          {item.latestPrice === null ? "—" : formatPrice(item.latestPrice, item.currency)}
        </span>
        {Number.isFinite(item.change) && (
          <span className={changeClass(item.change)}>
            {`${formatSignedPrice(item.change, item.currency)}（${formatSignedPercent(item.changePct)}）`}
          </span>
        )}
        <span className="watchlist-quote-time">
          {item.priceUpdatedAt ? `更新於 ${formatDateTime(item.priceUpdatedAt)}` : "尚未取得報價"}
        </span>
      </section>
      <StockResearchContent
        market={item.market}
        symbol={item.symbol}
        name={item.name}
        latestPrice={item.latestPrice}
        currency={item.currency}
        isStock
        isMobile={isMobile}
        disabled={disabled}
        basis={basis}
        onBasisChange={setBasis}
      />
      <section className="stock-detail-section" aria-label="管理觀察">
        <h3 className="stock-detail-heading">管理</h3>
        <div className="stock-detail-manage">
          <button
            type="button"
            className="stock-detail-manage-row stock-detail-manage-row--danger"
            disabled={disabled}
            onClick={onRemove}
          >
            <span>從觀察清單移除</span>
          </button>
        </div>
      </section>
    </StockSheetShell>
  );
}

export default WatchlistDetailSheet;
