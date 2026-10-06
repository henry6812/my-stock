// Fixed display order for holdings: 台股 → 美股, within a market
// ETF → 個股 → 債券, and within that by market value (TWD) high → low.
// Holdings without a value go last; remaining ties keep the legacy
// sortOrder (from the old drag reorder), then newest-updated first.
const MARKET_RANK = { TW: 0, US: 1 };
const ASSET_TAG_RANK = { ETF: 0, STOCK: 1, BOND: 2 };

const rankOf = (map, key, fallback) =>
  Object.hasOwn(map, key) ? map[key] : fallback;

const getMarketRank = (holding) =>
  rankOf(MARKET_RANK, String(holding?.market ?? "").toUpperCase(), 2);

// Unknown / missing tags count as 個股, same as the asset-type allocation.
const getAssetTagRank = (holding) =>
  rankOf(
    ASSET_TAG_RANK,
    String(holding?.assetTag ?? "").trim().toUpperCase(),
    ASSET_TAG_RANK.STOCK,
  );

// Higher value first; holdings without a finite value sort last.
const compareByValueDesc = (a, b) => {
  const aValue = Number(a?.latestValueTwd);
  const bValue = Number(b?.latestValueTwd);
  const aHasValue = Number.isFinite(aValue);
  const bHasValue = Number.isFinite(bValue);
  if (aHasValue && bHasValue) return bValue - aValue;
  if (aHasValue) return -1;
  if (bHasValue) return 1;
  return 0;
};

export const compareHoldingsByLegacyOrder = (a, b) => {
  const aOrder = Number(a?.sortOrder);
  const bOrder = Number(b?.sortOrder);
  const aHasOrder = Number.isFinite(aOrder);
  const bHasOrder = Number.isFinite(bOrder);

  if (aHasOrder && bHasOrder && aOrder !== bOrder) {
    return aOrder - bOrder;
  }
  if (aHasOrder && !bHasOrder) return -1;
  if (!aHasOrder && bHasOrder) return 1;

  if (!a?.updatedAt && !b?.updatedAt) return 0;
  if (!a?.updatedAt) return 1;
  if (!b?.updatedAt) return -1;
  if (a.updatedAt === b.updatedAt) return 0;
  return a.updatedAt > b.updatedAt ? -1 : 1;
};

export const compareHoldingsForDisplay = (a, b) =>
  getMarketRank(a) - getMarketRank(b) ||
  getAssetTagRank(a) - getAssetTagRank(b) ||
  compareByValueDesc(a, b) ||
  compareHoldingsByLegacyOrder(a, b);
