// Mobile holdings list: holdings grouped by holder, in the configured holder
// order, with each holder's count and total value. Holdings whose holder is
// unset (or no longer an option) go last under 未設定; empty holders are
// skipped.

const UNSET_LABEL = "未設定";

export const groupHoldingsByHolder = (rows, holderOptions) => {
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
          (sum, row) => sum + (Number(row.latestValueTwd) || 0),
          0,
        ),
        rows: groupRows,
      };
    });
};
