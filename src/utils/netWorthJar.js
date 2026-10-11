// Pure geometry for the asset-tab net-worth jar (components/NetWorthJar.jsx).
// The jar starts at 0 and its cap is the next 千萬 above the total, so the
// water is the whole net worth. floorTwd (the 千萬 already reached) only marks
// a crossing. Values are floored to 萬 like the old progress bar.
// The principal (cash plus what the holdings cost) settles at the bottom as a
// darker layer; the water above it is unrealized gain.
import { floorToTenThousand } from "./portfolioView";
import { normalizeTotalCost } from "./holdingShares";

export const JAR_UNIT_TWD = 10_000_000;

const clamp01 = (value) => Math.min(1, Math.max(0, value));

// Principal = net worth minus the holdings' unrealized gain. A holding without
// a cost (or a US one without a rate) counts at its value, i.e. no gain, and
// is counted in unsetCount. US costs use today's rate, so a currency move
// is not part of the gain.
export const getPrincipalTwd = ({ totalTwd, rows }) => {
  let gainTwd = 0;
  let unsetCount = 0;
  for (const row of rows ?? []) {
    const valueTwd = Number(row?.latestValueTwd);
    if (!Number.isFinite(valueTwd)) continue;
    const cost = normalizeTotalCost(row.totalCost);
    const rate = row.market === "US" ? Number(row.fxRateToTwd) : 1;
    if (cost === null || !Number.isFinite(rate)) {
      unsetCount += 1;
      continue;
    }
    gainTwd += valueTwd - cost * rate;
  }
  return { principalTwd: (Number(totalTwd) || 0) - gainTwd, unsetCount };
};

export const getJarGeometry = ({ totalTwd, baselineTwd, principalTwd }) => {
  const total = floorToTenThousand(totalTwd);
  const baseline = floorToTenThousand(baselineTwd);
  const floorTwd = Math.floor(total / JAR_UNIT_TWD) * JAR_UNIT_TWD;
  const capTwd = floorTwd + JAR_UNIT_TWD;
  const toRatio = (value) => clamp01(value / capTwd);

  // No snapshot from yesterday yet: don't draw a line or a delta band, and
  // never mistake "0 → today" for crossing a milestone. A crossing raises the
  // cap, but yesterday still has a place in the bigger jar.
  const hasBaseline = baseline > 0;
  const crossedMilestone = hasBaseline && baseline < floorTwd;

  let direction = "flat";
  if (hasBaseline && total > baseline) direction = "up";
  if (hasBaseline && total < baseline) direction = "down";

  // No principal given (or nothing in the jar): no layer at all.
  const hasPrincipal =
    principalTwd !== undefined &&
    principalTwd !== null &&
    Number.isFinite(Number(principalTwd)) &&
    total > 0;
  const principal = hasPrincipal ? floorToTenThousand(Math.max(0, principalTwd)) : null;

  return {
    floorTwd,
    capTwd,
    totalTwd: total,
    baselineTwd: baseline,
    levelRatio: toRatio(total),
    baselineRatio: hasBaseline ? toRatio(baseline) : null,
    hasBaseline,
    crossedMilestone,
    direction,
    gapToCapTwd: capTwd - total,
    isEmpty: total <= 0,
    principalTwd: principal,
    // 1 when a loss puts the principal above the cap.
    principalRatio: hasPrincipal ? toRatio(principal) : null,
    // Underwater: the principal line sits above the water.
    inLoss: hasPrincipal && principal > total,
  };
};

// What a portfolio load should animate. Numbers count up on the first load and
// whenever a refresh asks for it; the jar replays its entrance only on the
// first load — after a price refresh it glides to the new level instead.
export const getAssetAnimationPlan = ({ isInitialLoad, numbersRequested }) => ({
  animateNumbers: isInitialLoad || numbersRequested,
  replayJar: isInitialLoad,
});
