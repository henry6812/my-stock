import { Button, Typography } from "antd";
import { formatPrice, formatTwd } from "../../utils/formatters";
import {
  getAverageCost,
  getHoldingCurrency,
  getUnrealized,
} from "../../utils/holdingShares";
import { formatSignedPercent } from "../../utils/stockDetail";

const { Text } = Typography;

const formatShares = (value) =>
  Number(value).toLocaleString("zh-TW", { maximumFractionDigits: 4 });

// Totals read better without cents in TWD; per-share prices keep them.
const formatAmount = (value, currency) =>
  currency === "TWD" ? formatTwd(value) : formatPrice(value, currency);

const formatSignedAmount = (value, currency) =>
  `${value >= 0 ? "+" : "−"}${formatAmount(Math.abs(value), currency)}`;

// The tapped holder's position in the stock detail sheet, with 買進 / 賣出.
function HoldingPosition({ holding, disabled, onAction }) {
  const currency = getHoldingCurrency(holding);
  const averageCost = getAverageCost(holding);
  const unrealized = getUnrealized(holding);

  return (
    <section className="stock-detail-position" aria-label="持股">
      <Text type="secondary">
        {`${holding.holderName || "未設定"} 持有 ${formatShares(holding.shares)} 股 · 市值 ${formatTwd(holding.latestValueTwd)}`}
      </Text>
      {averageCost === null ? (
        <div className="stock-detail-position-line">
          <Text type="secondary">未設定成本</Text>
          <Button
            type="link"
            size="small"
            disabled={disabled}
            onClick={() => onAction?.("calibrate")}
          >
            設定成本
          </Button>
        </div>
      ) : (
        <>
          <div className="stock-detail-position-line">
            {`均價 ${formatPrice(averageCost, currency)} · 成本 ${formatAmount(holding.totalCost, currency)}`}
          </div>
          {unrealized && (
            <div
              className={`stock-detail-position-line ${
                unrealized.amount >= 0 ? "stock-detail-change--up" : "stock-detail-change--down"
              }`}
            >
              {`未實現 ${formatSignedAmount(unrealized.amount, currency)}${
                unrealized.pct === null ? "" : `（${formatSignedPercent(unrealized.pct)}）`
              }`}
            </div>
          )}
        </>
      )}
      <div className="stock-detail-trade">
        <Button block disabled={disabled} onClick={() => onAction?.("buy")}>
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
