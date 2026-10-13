import { useState } from "react";
import { NavArrowRight } from "iconoir-react";
import HoldingPosition from "./stockDetail/HoldingPosition";
import StockResearchContent from "./stockDetail/StockResearchContent";
import StockSheetShell from "./stockDetail/StockSheetShell";

// One holding (one stock, one holder): its market value, position and
// cost, buy / sell, then the stock's research, then managing the holding.
// The parent keys this by holding so basis / fold state reset when another
// opens; basis lives here so it survives the buy / sell form hiding the sheet.
function StockDetailSheet({ open, holding, isMobile, disabled, onClose, onAction }) {
  const [basis, setBasis] = useState("ttm");

  if (!holding) return null;

  const currency = holding.latestCurrency || (holding.market === "US" ? "USD" : "TWD");

  return (
    <StockSheetShell
      open={open}
      isMobile={isMobile}
      name={holding.companyName}
      symbol={holding.symbol}
      onClose={onClose}
    >
      <HoldingPosition holding={holding} disabled={disabled} onAction={onAction} />
      <StockResearchContent
        market={holding.market}
        symbol={holding.symbol}
        name={holding.companyName}
        latestPrice={holding.latestPrice}
        currency={currency}
        isStock={(holding.assetTag || "STOCK") === "STOCK"}
        isMobile={isMobile}
        disabled={disabled}
        basis={basis}
        onBasisChange={setBasis}
      />
      {/* Rarely used, so a quiet list rather than buttons. */}
      <section className="stock-detail-section" aria-label="管理這筆持股">
        <h3 className="stock-detail-heading">管理這筆持股</h3>
        <div className="stock-detail-manage">
          <button
            type="button"
            className="stock-detail-manage-row"
            disabled={disabled}
            onClick={() => onAction?.("edit")}
          >
            <span>編輯分類與持有人</span>
            <NavArrowRight aria-hidden />
          </button>
          <button
            type="button"
            className="stock-detail-manage-row"
            disabled={disabled}
            onClick={() => onAction?.("calibrate")}
          >
            <span>校正股數與成本</span>
            <NavArrowRight aria-hidden />
          </button>
          <button
            type="button"
            className="stock-detail-manage-row stock-detail-manage-row--danger"
            disabled={disabled}
            onClick={() => onAction?.("remove")}
          >
            <span>移除持股</span>
          </button>
        </div>
      </section>
    </StockSheetShell>
  );
}

export default StockDetailSheet;
