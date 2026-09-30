// Helpers for adding shares to a holding that may already exist.
// Shared by HoldingForm (to warn before submit) and portfolioService (to write).

export const HOLDING_SHARES_MODE = {
  ADD: "add",
  REPLACE: "replace",
};

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

export const resolveNextShares = ({ existingShares, inputShares, mode }) => {
  const current = Number(existingShares);
  if (mode === HOLDING_SHARES_MODE.REPLACE || !Number.isFinite(current)) {
    return inputShares;
  }
  // Round to the form's 4-decimal precision so 0.1 + 0.2 stays 0.3.
  return Math.round((current + inputShares) * 10000) / 10000;
};
