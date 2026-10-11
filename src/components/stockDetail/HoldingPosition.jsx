import { Button } from "antd";
import { formatPrice, formatTwd } from "../../utils/formatters";
import {
  getAverageCost,
  getHoldingCurrency,
  getUnrealized,
} from "../../utils/holdingShares";
import { formatSignedPercent } from "../../utils/stockDetail";

const formatShares = (value) =>
  Number(value).toLocaleString("zh-TW", { maximumFractionDigits: 4 });

// Totals read better without cents in TWD; per-share prices keep them.
const formatAmount = (value, currency) =>
  currency === "TWD" ? formatTwd(value) : formatPrice(value, currency);

const formatSignedAmount = (value, currency) =>
  `${value >= 0 ? "+" : "−"}${formatAmount(Math.abs(value), currency)}`;

const changeClass = (value) =>
  value >= 0 ? "stock-detail-change--up" : "stock-detail-change--down";

// The tapped holder's position, top of the stock detail sheet: what the
// family holds (market value) leads, the ledger lines below explain it,
// then 買進 / 賣出.
function HoldingPosition({ holding, disabled, onAction }) {
  const currency = getHoldingCurrency(holding);
  const averageCost = getAverageCost(holding);
  const unrealized = getUnrealized(holding);
  const hasChange = Number.isFinite(holding.priceChangePct);

  return (
    <section className="stock-detail-position" aria-label="持股">
      <span className="stock-detail-position-label">
        {`${holding.holderName || "未設定"} 的持股`}
      </span>
      <span className="stock-detail-value">{formatTwd(holding.latestValueTwd)}</span>
      {averageCost === null ? (
        <div className="stock-detail-gain stock-detail-gain--unset">
          <span>還沒設定成本</span>
          <Button
            type="link"
            size="small"
            disabled={disabled}
            aria-label="設定成本"
            onClick={() => onAction?.("calibrate")}
          >
            設定
          </Button>
        </div>
      ) : (
        unrealized && (
          <div className={`stock-detail-gain ${changeClass(unrealized.amount)}`}>
            {`未實現 ${formatSignedAmount(unrealized.amount, currency)}${
              unrealized.pct === null ? "" : `（${formatSignedPercent(unrealized.pct)}）`
            }`}
          </div>
        )
      )}

      <dl className="stock-detail-ledger">
        <div className="stock-detail-ledger-row">
          <dt>股數</dt>
          <dd>{`${formatShares(holding.shares)} 股`}</dd>
        </div>
        {averageCost !== null && (
          <>
            <div className="stock-detail-ledger-row">
              <dt>均價</dt>
              <dd>{formatPrice(averageCost, currency)}</dd>
            </div>
            <div className="stock-detail-ledger-row">
              <dt>成本</dt>
              <dd>{formatAmount(holding.totalCost, currency)}</dd>
            </div>
          </>
        )}
        <div className="stock-detail-ledger-row">
          <dt>現價</dt>
          <dd>
            <span>{formatPrice(holding.latestPrice, currency)}</span>
            {hasChange && (
              <span className={changeClass(holding.priceChangePct)}>
                {formatSignedPercent(holding.priceChangePct / 100)}
              </span>
            )}
          </dd>
        </div>
      </dl>

      <div className="stock-detail-trade">
        <Button type="primary" block disabled={disabled} onClick={() => onAction?.("buy")}>
          買進
        </Button>
        <Button block disabled={disabled} onClick={() => onAction?.("sell")}>
          賣出
        </Button>
      </div>
    </section>
  );
}

export default HoldingPosition;
