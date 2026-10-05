import { Segmented, Typography } from "antd";
import { formatPrice } from "../../utils/formatters";
import { formatSignedPercent } from "../../utils/stockDetail";
import { positionOnScale, ZONE_LABELS } from "../../utils/valuation";

const { Text } = Typography;

const STATUS_MESSAGES = {
  "no-eps": "資料不足，無法計算",
  loss: "虧損中，無法用本益比估價",
  "missing-pe": "歷史本益比不足，請在估價假設填入本益比",
  "invalid-pe": "本益比需符合 便宜 ≤ 合理 ≤ 昂貴",
};

const PRICE_ITEMS = [
  { key: "cheap", label: "便宜價" },
  { key: "fair", label: "合理價" },
  { key: "expensive", label: "昂貴價" },
];

const percent = (value) => `${(value * 100).toFixed(2)}%`;

// Three bands on one axis: cheap (green) up to 便宜價, fair (grey) up to
// 昂貴價, expensive (red) beyond; ▼ marks the current price.
function PriceRuler({ valuation, currency }) {
  const { prices, scale, price } = valuation;
  const cheapAt = positionOnScale(prices.cheap, scale);
  const fairAt = positionOnScale(prices.fair, scale);
  const expensiveAt = positionOnScale(prices.expensive, scale);
  return (
    <div className="valuation-ruler">
      <div className="valuation-ruler-track">
        <span className="valuation-ruler-band valuation-ruler-band--cheap" style={{ width: percent(cheapAt) }} />
        <span
          className="valuation-ruler-band valuation-ruler-band--fair"
          style={{ left: percent(cheapAt), width: percent(expensiveAt - cheapAt) }}
        />
        <span
          className="valuation-ruler-band valuation-ruler-band--expensive"
          style={{ left: percent(expensiveAt), width: percent(1 - expensiveAt) }}
        />
        <span className="valuation-ruler-tick" style={{ left: percent(fairAt) }} />
      </div>
      {price !== null && (
        <span
          className="valuation-ruler-marker"
          style={{ left: percent(positionOnScale(price, scale)) }}
          aria-label={`現價 ${formatPrice(price, currency)}`}
        >
          ▼
        </span>
      )}
    </div>
  );
}

function ValuationCard({ model, basis, onBasisChange, market, currency }) {
  const { valuation } = model;
  return (
    <section className="stock-detail-section valuation-card" aria-label="估價">
      <Segmented
        block
        value={basis}
        onChange={onBasisChange}
        options={[
          { label: "近四季 TTM", value: "ttm" },
          { label: market === "US" ? "未來四季預估" : "今年預估", value: "forward" },
        ]}
      />
      {valuation.status !== "ok" ? (
        <Text type="secondary" className="valuation-card-message">
          {STATUS_MESSAGES[valuation.status]}
        </Text>
      ) : (
        <>
          <PriceRuler valuation={valuation} currency={currency} />
          <div className="valuation-card-prices">
            {PRICE_ITEMS.map(({ key, label }) => (
              <div key={key} className={`valuation-card-price valuation-card-price--${key}`}>
                <Text type="secondary">{label}</Text>
                <span className="valuation-card-price-value">
                  {formatPrice(valuation.prices[key], currency)}
                </span>
              </div>
            ))}
          </div>
          {valuation.zone && (
            <div className={`valuation-card-verdict valuation-card-verdict--${valuation.zone}`}>
              {`目前${ZONE_LABELS[valuation.zone]}，距合理價 ${formatSignedPercent(valuation.distanceToFair)}`}
            </div>
          )}
        </>
      )}
    </section>
  );
}

export default ValuationCard;
