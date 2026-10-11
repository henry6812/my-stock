// Helpers for a holding's shares and cost. Shared by the forms (previews)
// and portfolioService (writes).

export const normalizeHoldingSymbol = (symbol, market) => {
  const normalized = String(symbol ?? "")
    .trim()
    .toUpperCase();
  if (market === "TW") {
    return normalized.replace(".TW", "");
  }
  return normalized;
};

export const findExistingHolding = (holdings, { symbol, market, holder }) => {
  const normalizedSymbol = normalizeHoldingSymbol(symbol, market);
  if (!normalizedSymbol || !market || !holder) {
    return null;
  }
  return (
    (holdings ?? []).find(
      (item) =>
        item?.market === market &&
        item?.holder === holder &&
        normalizeHoldingSymbol(item?.symbol, item?.market) === normalizedSymbol,
    ) ?? null
  );
};

// Shares and costs are kept to the forms' 4-decimal precision so
// 0.1 + 0.2 stays 0.3.
const roundTo4 = (value) => Math.round(value * 10000) / 10000;

// totalCost is in the holding's market currency (TWD / USD); null = unset.
export const normalizeTotalCost = (value) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? roundTo4(parsed) : null;
};

export const applyBuy = (holding, { shares, price }) => {
  const cost = normalizeTotalCost(holding.totalCost);
  return {
    shares: roundTo4(Number(holding.shares) + shares),
    // Without the earlier shares' cost, any average would be wrong.
    totalCost: cost === null ? null : roundTo4(cost + shares * price),
  };
};

export const applySell = (holding, soldShares) => {
  const current = Number(holding.shares);
  const remaining = roundTo4(current - soldShares);
  const cost = normalizeTotalCost(holding.totalCost);
  if (remaining <= 0) {
    return { shares: 0, totalCost: cost === null ? null : 0, soldAll: true };
  }
  return {
    shares: remaining,
    // Selling keeps the average cost, so the total shrinks in proportion.
    totalCost: cost === null ? null : roundTo4((cost * remaining) / current),
    soldAll: false,
  };
};

export const applyCalibration = ({ shares, averageCost }) => ({
  shares,
  totalCost:
    averageCost === null || averageCost === undefined
      ? null
      : roundTo4(shares * averageCost),
});

export const getAverageCost = (holding) => {
  const cost = normalizeTotalCost(holding?.totalCost);
  const shares = Number(holding?.shares);
  if (cost === null || !Number.isFinite(shares) || shares <= 0) {
    return null;
  }
  return cost / shares;
};

export const getUnrealized = (holding) => {
  const cost = normalizeTotalCost(holding?.totalCost);
  const price = holding?.latestPrice;
  if (cost === null || typeof price !== "number" || !Number.isFinite(price)) {
    return null;
  }
  const amount = roundTo4(Number(holding.shares) * price - cost);
  return { amount, pct: cost > 0 ? roundTo4(amount / cost) : null };
};

export const getHoldingCurrency = (holding) =>
  holding?.latestCurrency || (holding?.market === "US" ? "USD" : "TWD");
