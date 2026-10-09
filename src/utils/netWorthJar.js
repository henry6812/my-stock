// Pure geometry for the asset-tab net-worth jar (components/NetWorthJar.jsx).
// The jar holds one 千萬: its floor is the 千萬 the total is currently in and
// its cap is the next one. Values are floored to 萬 like the old progress bar.
import { floorToTenThousand } from "./portfolioView";

export const JAR_UNIT_TWD = 10_000_000;

const clamp01 = (value) => Math.min(1, Math.max(0, value));

export const getJarGeometry = ({ totalTwd, baselineTwd }) => {
  const total = floorToTenThousand(totalTwd);
  const baseline = floorToTenThousand(baselineTwd);
  const floorTwd = Math.floor(total / JAR_UNIT_TWD) * JAR_UNIT_TWD;
  const capTwd = floorTwd + JAR_UNIT_TWD;
  const toRatio = (value) => clamp01((value - floorTwd) / JAR_UNIT_TWD);

  // No snapshot from yesterday yet: don't draw a line or a delta band, and
  // never mistake "0 → today" for crossing a milestone.
  const hasBaseline = baseline > 0;
  const crossedMilestone = hasBaseline && baseline < floorTwd;

  let direction = "flat";
  if (hasBaseline && total > baseline) direction = "up";
  if (hasBaseline && total < baseline) direction = "down";

  return {
    floorTwd,
    capTwd,
    totalTwd: total,
    baselineTwd: baseline,
    levelRatio: toRatio(total),
    baselineRatio: hasBaseline && !crossedMilestone ? toRatio(baseline) : null,
    hasBaseline,
    crossedMilestone,
    direction,
    gapToCapTwd: capTwd - total,
    isEmpty: total <= 0,
  };
};

// What a portfolio load should animate. Numbers count up on the first load and
// whenever a refresh asks for it; the jar replays its entrance only on the
// first load — after a price refresh it glides to the new level instead.
export const getAssetAnimationPlan = ({ isInitialLoad, numbersRequested }) => ({
  animateNumbers: isInitialLoad || numbersRequested,
  replayJar: isInitialLoad,
});
