import { ClockRotateRight } from "iconoir-react";
import { getStaleBalanceLabel, isCashBalanceStale } from "../utils/cashBalanceAge";
import HoverTooltip from "./HoverTooltip";

// A quiet nudge next to a bank account whose balance hasn't been saved for
// over a month. Icon only; the day count is in the tooltip (hover devices)
// and the accessible name.
export default function StaleBalanceIcon({ balanceUpdatedAt, now }) {
  if (!isCashBalanceStale(balanceUpdatedAt, now)) return null;
  const label = getStaleBalanceLabel(balanceUpdatedAt, now);
  return (
    <HoverTooltip title={label}>
      <span className="stale-balance-icon" role="img" aria-label={label}>
        <ClockRotateRight />
      </span>
    </HoverTooltip>
  );
}
