// Pure layout for the 累計 growth tower (components/SavingsGrowthTower.jsx).
// Each month's surplus (income − expense) drops on top as one layer; an
// overspent month chips the same amount off the top, layer by layer, down
// to the ground at most. Amounts stay in TWD; the component scales by
// `peakTwd`, the tallest the stack ever got.

const EPS = 1e-9;

export const getMonthSurplus = (summary) =>
  (Number(summary?.incomeTwd) || 0) - (Number(summary?.expenseTwd) || 0);

export const getGrowthTowerLayout = (summaries = []) => {
  let stack = [];
  let height = 0;
  let peakTwd = 0;
  let totalSavedTwd = 0;
  let totalSpentTwd = 0;
  const steps = [];

  summaries.forEach((summary, index) => {
    const surplus = getMonthSurplus(summary);
    totalSavedTwd += surplus;
    totalSpentTwd += Number(summary?.expenseTwd) || 0;

    if (surplus > EPS) {
      stack = [
        ...stack,
        {
          month: summary.month,
          index,
          bottom: height,
          top: height + surplus,
          isCurrent: Boolean(summary.isCurrent),
        },
      ];
      height += surplus;
      peakTwd = Math.max(peakTwd, height);
      steps.push({ month: summary.month, type: "add", stack, removed: [] });
      return;
    }

    if (surplus < -EPS) {
      let need = -surplus;
      const next = stack.map((layer) => ({ ...layer }));
      const removed = [];
      while (need > EPS && next.length > 0) {
        const layer = next[next.length - 1];
        const cut = Math.min(need, layer.top - layer.bottom);
        removed.push({
          month: layer.month,
          index: layer.index,
          bottom: layer.top - cut,
          top: layer.top,
        });
        layer.top -= cut;
        height -= cut;
        need -= cut;
        if (layer.top - layer.bottom <= EPS) next.pop();
      }
      stack = next;
      steps.push({ month: summary.month, type: "chip", stack, removed });
      return;
    }

    steps.push({ month: summary.month, type: "none", stack, removed: [] });
  });

  return {
    hasIncome: summaries.some((summary) => Number(summary?.incomeTwd) > 0),
    peakTwd,
    totalSavedTwd,
    totalSpentTwd,
    steps,
    layers: stack,
  };
};
