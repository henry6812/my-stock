// Asset-tab hero, same shape as the expense summary card: label → big number
// → one line of secondary text → the net-worth jar. The label reads
// 「時間・指標」. Tapping the jar swaps the figures for the next milestone and
// the quote time, and reveals the jar's capacity and principal (noting
// holdings without a cost); tapping anywhere
// else, or the jar again, goes back.
import { useState } from "react";
import dayjs from "dayjs";
import NetWorthJar from "./NetWorthJar";
import { getJarGeometry } from "../utils/netWorthJar";
import { requestTiltPermission } from "../utils/deviceTilt";
import { formatNetWorthScaleLabel } from "../utils/portfolioView";

const digits = (value) => Math.round(Math.abs(value)).toLocaleString("en-US");
const quoteTime = (quoteAt) => dayjs(quoteAt).format("MM/DD HH:mm");

const describeChange = ({ changeTwd, changePct, priceDataStale }) => {
  if (priceDataStale || typeof changeTwd !== "number" || Number.isNaN(changeTwd)) {
    return { text: "今日 --", tone: "flat" };
  }
  if (changeTwd === 0) {
    return { text: "今日 $0（0.00%）", tone: "flat" };
  }
  const sign = changeTwd > 0 ? "+" : "−";
  const pct =
    typeof changePct === "number" && !Number.isNaN(changePct)
      ? `（${sign}${Math.abs(changePct).toFixed(2)}%）`
      : "";
  return {
    text: `今日 ${sign}$${digits(changeTwd)}${pct}`,
    tone: changeTwd > 0 ? "up" : "down",
  };
};

export default function AssetSummaryHero({
  totalTwd,
  displayTotalTwd,
  baselineTwd,
  principalTwd,
  unsetCostCount = 0,
  changeTwd,
  changePct,
  priceDataStale,
  quoteAt,
  playKey,
}) {
  // The milestone view belongs to one entrance; a replay (playKey) drops it
  // without a reset effect.
  const [shown, setShown] = useState({ playKey, milestone: false });
  const milestone = shown.playKey === playKey && shown.milestone;
  const setMilestone = (value) => setShown({ playKey, milestone: value });

  const geometry = getJarGeometry({ totalTwd, baselineTwd });

  let label;
  let amount;
  let sub;
  if (milestone) {
    const total = Number(totalTwd) || 0;
    // Same scale as the jar: 0 → the next 千萬.
    const reached = (total / geometry.capTwd) * 100;
    const parts = [
      `已達 ${reached.toFixed(1)}%`,
      quoteAt ? `報價 ${quoteTime(quoteAt)}` : null,
      unsetCostCount > 0 ? `${unsetCostCount} 檔未設成本` : null,
    ].filter(Boolean);
    label = `${formatNetWorthScaleLabel(geometry.capTwd)}・還差`;
    amount = geometry.capTwd - total;
    sub = { text: parts.join("・"), tone: "flat" };
  } else {
    const fresh =
      quoteAt && !priceDataStale && dayjs(quoteAt).isSame(dayjs(), "day");
    label = !quoteAt
      ? "總資產"
      : fresh
        ? "今日・總資產"
        : `${quoteTime(quoteAt)}・總資產`;
    amount = Number(displayTotalTwd) || 0;
    sub = describeChange({ changeTwd, changePct, priceDataStale });
  }

  return (
    <section className="asset-hero" aria-label="資產摘要" onClick={() => setMilestone(false)}>
      <div key={`${playKey}|${milestone}`} className="asset-hero-swap">
        <div className="asset-hero-label">{label}</div>
        <div className="asset-hero-num">
          <span className="asset-hero-cur">$</span>
          {digits(amount)}
        </div>
        <div className={`asset-hero-sub asset-hero-sub--${sub.tone}`}>{sub.text}</div>
      </div>
      {geometry.isEmpty ? (
        <div className="asset-hero-jar">
          <NetWorthJar totalTwd={totalTwd} baselineTwd={baselineTwd} playKey={playKey} />
        </div>
      ) : (
        <button
          type="button"
          className="asset-hero-jar"
          aria-label="查看里程碑、本金與報價時間"
          aria-pressed={milestone}
          onClick={(event) => {
            event.stopPropagation();
            // iOS only lets the water follow the phone's tilt after asking,
            // and only from a tap: the first jar tap asks.
            requestTiltPermission();
            setMilestone(!milestone);
          }}
        >
          <NetWorthJar
            totalTwd={totalTwd}
            baselineTwd={baselineTwd}
            principalTwd={principalTwd}
            playKey={playKey}
            revealed={milestone}
          />
        </button>
      )}
    </section>
  );
}
