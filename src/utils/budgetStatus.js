// One source of truth for a budget card's usage %, colour level and the
// remaining / over-budget amount (the card previously computed the % text
// and the bar width from two different fields).

export const BUDGET_WARN_RATIO = 0.8;

export const BUDGET_LEVEL_COLORS = {
  ok: "#99d2cb",
  warn: "#faad14",
  over: "#f5222d",
};

export const getBudgetStatus = ({ spentTwd, availableTwd }) => {
  const spent = Number(spentTwd);
  const available = Number(availableTwd);
  const safeSpent = Number.isFinite(spent) ? Math.max(0, spent) : 0;
  const safeAvailable = Number.isFinite(available) ? Math.max(0, available) : 0;

  if (safeAvailable <= 0) {
    return {
      usedPct: safeSpent > 0 ? 100 : 0,
      barPct: safeSpent > 0 ? 100 : 0,
      level: safeSpent > 0 ? "over" : "ok",
      remainingTwd: 0,
      overTwd: safeSpent,
    };
  }

  const ratio = safeSpent / safeAvailable;
  const level = ratio > 1 ? "over" : ratio >= BUDGET_WARN_RATIO ? "warn" : "ok";
  return {
    usedPct: ratio * 100,
    barPct: Math.min(100, Math.round(ratio * 100)),
    level,
    remainingTwd: Math.max(0, safeAvailable - safeSpent),
    overTwd: Math.max(0, safeSpent - safeAvailable),
  };
};
