// Mobile holdings / cash lists: rows grouped by holder, in the configured
// holder order, with each holder's count and the total of `valueKey`
// (holdings: latestValueTwd, cash: balanceTwd). Rows whose holder is unset
// (or no longer an option) go last under 未設定; empty holders are skipped.

const UNSET_LABEL = "未設定";

export const groupHoldingsByHolder = (
  rows,
  holderOptions,
  { valueKey = "latestValueTwd" } = {},
) => {
  const known = new Set(holderOptions || []);
  const byHolder = new Map();
  (rows || []).forEach((row) => {
    const key = known.has(row.holder) ? row.holder : UNSET_LABEL;
    if (!byHolder.has(key)) byHolder.set(key, []);
    byHolder.get(key).push(row);
  });
  return [...(holderOptions || []), UNSET_LABEL]
    .filter((key) => byHolder.has(key))
    .map((key) => {
      const groupRows = byHolder.get(key);
      return {
        key,
        label: key,
        count: groupRows.length,
        totalTwd: groupRows.reduce(
          (sum, row) => sum + (Number(row[valueKey]) || 0),
          0,
        ),
        rows: groupRows,
      };
    });
};

// A holder group's change today: the sum of its rows' valueChangeTwd, over
// rows that have a previous snapshot to compare with. null when no row does,
// so the heading shows -- rather than a misleading 0.
export const sumGroupChangeTwd = (rows) => {
  const changes = (rows || [])
    .filter((row) => row.hasPreviousSnapshot)
    .map((row) => row.valueChangeTwd)
    .filter((value) => typeof value === "number" && Number.isFinite(value));
  return changes.length ? changes.reduce((sum, value) => sum + value, 0) : null;
};
