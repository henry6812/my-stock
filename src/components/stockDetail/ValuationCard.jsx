import { Segmented, Typography } from "antd";
import { NavArrowRight } from "iconoir-react";
import { formatPrice } from "../../utils/formatters";
import { formatEps, zonePosition, ZONE_LABELS } from "../../utils/valuation";
import { describeEpsFactor, describePeFactor } from "../../utils/valuationEquation";
import PublishedMark from "./PublishedMark";

const { Text } = Typography;

const STATUS_MESSAGES = {
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

// One factor of the equation. A button when it leads to inputs in 估價假設,
// a plain group when there is nothing to adjust (近四季).
function Factor({ label, value, caption, children, actionLabel, onClick }) {
  const content = (
    <>
      <span className="valuation-factor-head">
        <span className="valuation-factor-label">{label}</span>
        <span className="valuation-factor-value">{value}</span>
      </span>
      {children}
      <span className="valuation-factor-caption">
        <span>{caption}</span>
        {onClick && <NavArrowRight aria-hidden />}
      </span>
    </>
  );
  const name = `${label} ${value}，${caption}`;
  return onClick ? (
    <button type="button" className="valuation-factor" aria-label={`${name}，${actionLabel}`} onClick={onClick}>
      {content}
    </button>
  ) : (
    <div className="valuation-factor valuation-factor--static" role="group" aria-label={name}>
      {content}
    </div>
  );
}

function QuarterCells({ actual, projected }) {
  const states = [...Array(actual).fill(true), ...Array(projected).fill(false)];
  return (
    <span className="valuation-factor-cells" aria-hidden>
      {states.map((isActual, index) => (
        <PublishedMark key={index} actual={isActual} className="valuation-factor-cell" />
      ))}
    </span>
  );
}

// EPS × 本益比: the two inputs every price on the ruler is made of, each
// opening 估價假設 at the section that sets it.
function ValuationEquation({ model, basis, onOpenAssumptions }) {
  const eps = describeEpsFactor(model.chosen, basis);
  const pe = describePeFactor(model.bands);
  const epsTarget = eps.kind === "quarters" ? "model" : "custom";
  return (
    <div className="valuation-equation">
      <Factor
        label="EPS"
        value={Number.isFinite(model.chosen?.eps) ? formatEps(model.chosen.eps) : "--"}
        caption={eps.caption}
        actionLabel={epsTarget === "model" ? "調整推估假設" : "調整直接指定 EPS"}
        onClick={eps.adjustable ? () => onOpenAssumptions?.(epsTarget) : null}
      >
        {eps.kind === "quarters" && <QuarterCells actual={eps.actual} projected={eps.projected} />}
        {eps.kind === "custom" && <span className="valuation-factor-tag">自訂</span>}
      </Factor>
      <span className="valuation-equation-times" aria-hidden>
        ×
      </span>
      <Factor
        label="本益比"
        value={pe.value}
        caption={pe.caption}
        actionLabel="調整本益比"
        onClick={() => onOpenAssumptions?.("pe")}
      />
    </div>
  );
}

function ValuationCard({ model, basis, onBasisChange, onOpenAssumptions, market, currency }) {
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
      <ValuationEquation model={model} basis={basis} onOpenAssumptions={onOpenAssumptions} />
      {model.chosen?.formula && <span className="valuation-card-formula">{model.chosen.formula}</span>}
      {valuation.status !== "ok" ? (
        // Without an EPS the EPS factor already says why.
        valuation.status !== "no-eps" && (
          <Text type="secondary" className="valuation-card-message">
            {STATUS_MESSAGES[valuation.status]}
          </Text>
        )
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
