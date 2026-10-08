// Asset-allocation maths shared by the 資產分析 list and its modal.

export const allocationShares = (items = []) => {
  const total = items.reduce((sum, item) => sum + (Number(item.value) || 0), 0);
  if (total <= 0) return [];
  return items.map((item) => ({
    ...item,
    share: (Number(item.value) || 0) / total,
  }));
};

// 「股票 88% · 現金 9%」: the largest slices, for the list row's headline.
export const describeAllocation = (items = [], limit = 2) =>
  allocationShares(items)
    .sort((a, b) => b.share - a.share)
    .slice(0, limit)
    .map((item) => `${item.name} ${Math.round(item.share * 100)}%`)
    .join(" · ");
