// Pure geometry for the asset-tab net-worth jar (components/NetWorthJar.jsx).
// The jar holds one 千萬: its floor is the 千萬 the total is currently in and
// its cap is the next one. Values are floored to 萬 like the old progress bar.
import { floorToTenThousand } from "./portfolioView";

export const JAR_UNIT_TWD = 10_000_000;
export const JAR_TICK_TWD = 2_000_000;

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

  const ticks = [];
  for (let twd = floorTwd + JAR_TICK_TWD; twd < capTwd; twd += JAR_TICK_TWD) {
    ticks.push({ twd, ratio: toRatio(twd) });
  }

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
    ticks,
    gapToCapTwd: capTwd - total,
    isEmpty: total <= 0,
  };
};
