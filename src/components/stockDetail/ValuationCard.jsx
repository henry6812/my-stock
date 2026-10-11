import { Segmented, Typography } from "antd";
import { formatPrice } from "../../utils/formatters";
import { zonePosition, ZONE_LABELS } from "../../utils/valuation";

const { Text } = Typography;

const STATUS_MESSAGES = {
  "no-eps": "資料不足，無法計算",
  loss: "虧損中，無法用本益比估價",
  "missing-pe": "歷史本益比不足，請在估價假設填入本益比",
  "invalid-pe": "本益比需符合 便宜 ≤ 合理 ≤ 昂貴",
};

const BASIS_OPTIONS = {
  TW: [
    { label: "近四季", value: "ttm" },
    { label: "下季後", value: "ttmAfterNext" },
    { label: "今年", value: "thisYear" },
    { label: "明年", value: "nextYear" },
  ],
  US: [
    { label: "近四季 TTM", value: "ttm" },
    { label: "未來四季預估", value: "forward" },
  ],
};

const PRICE_ITEMS = [
  { key: "cheap", label: "便宜價" },
  { key: "fair", label: "合理價" },
  { key: "expensive", label: "昂貴價" },
];

const ZONES = ["below", "fair-low", "fair-high", "above"];

const describeDistance = (distance) => {
  const percent = Math.abs(distance * 100).toFixed(1);
  if (percent === "0.0") return "就在合理價";
  return `比合理價${distance > 0 ? "高" : "低"} ${percent}%`;
};

// Four equal zones, so 便宜價 / 合理價 / 昂貴價 sit on the quarter marks
// with their labels right under them; the current price is pinned inside
// its zone and named, instead of an unlabelled ▼ on a to-scale bar.
function PriceRuler({ valuation, currency }) {
  const { prices, scale, price } = valuation;
  const at = price === null ? null : zonePosition(price, prices, scale);
  return (
    <div className="valuation-ruler">
      {at !== null && (
        <div
          className="valuation-ruler-marker"
          style={{ "--at": at }}
          aria-label={`現價 ${formatPrice(price, currency)}`}
        >
          <span className="valuation-ruler-marker-label">{`現價 ${formatPrice(price, currency)}`}</span>
          <span className="valuation-ruler-marker-pin" aria-hidden>
            ▼
          </span>
        </div>
      )}
      <div className="valuation-ruler-track">
        {ZONES.map((zone) => (
          <span key={zone} className={`valuation-ruler-zone valuation-ruler-zone--${zone}`} />
        ))}
      </div>
      <div className="valuation-ruler-prices">
        {PRICE_ITEMS.map(({ key, label }) => (
          <div key={key} className={`valuation-card-price valuation-card-price--${key}`}>
            <span className="valuation-card-price-label">{label}</span>
            <span className="valuation-card-price-value">{formatPrice(prices[key], currency)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ValuationCard({ model, basis, onBasisChange, market, currency }) {
  const { valuation } = model;
  return (
    <section className="stock-detail-section valuation-card" aria-label="估價">
      <h3 className="stock-detail-heading">估價</h3>
      <Segmented
        block
        value={basis}
        onChange={onBasisChange}
        options={BASIS_OPTIONS[market] ?? BASIS_OPTIONS.US}
      />
      {model.chosen?.formula && <span className="valuation-card-formula">{model.chosen.formula}</span>}
      {valuation.status !== "ok" ? (
        <Text type="secondary" className="valuation-card-message">
          {model.chosen?.reason ?? STATUS_MESSAGES[valuation.status]}
        </Text>
      ) : (
        <>
          {valuation.zone && (
            <div className="valuation-card-verdict">
              <span className={`valuation-card-zone valuation-card-zone--${valuation.zone}`}>
                {ZONE_LABELS[valuation.zone]}
              </span>
              <span className="valuation-card-distance">
                {describeDistance(valuation.distanceToFair)}
              </span>
            </div>
          )}
          <PriceRuler valuation={valuation} currency={currency} />
        </>
      )}
    </section>
  );
}

export default ValuationCard;
