// Pure layout for the expense-tab savings tower (components/SavingsTower.jsx).
// Income is a tower of TOWER_ROWS rows; spending removes it from the top —
// recurring first, then one-time. Whatever is left is what was saved.

export const TOWER_ROWS = 10;
// The overspend pit below the ground line never grows past this fraction of
// the tower's height, however large the overspend.
export const OVERSPEND_DEPTH_CAP = 0.12;

const EPS = 1e-9;

const toAmount = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
};

// Row maths happens in fractions of a row; rounding to 1e-6 keeps repeated
// subtraction from drifting (and keeps the split loop finite).
const round = (value) => Math.round(value * 1e6) / 1e6;

export const getTowerLayout = ({
  incomeTwd,
  recurringTwd,
  oneTimeTwd,
  rows = TOWER_ROWS,
}) => {
  const income = toAmount(incomeTwd);
  const recurring = toAmount(recurringTwd);
  const oneTime = toAmount(oneTimeTwd);
  const spentTwd = recurring + oneTime;

  if (income <= 0) {
    return {
      hasIncome: false,
      rows,
      chunks: [],
      incomeTwd: 0,
      spentTwd,
      savedTwd: 0,
      savedRatio: 0,
      overspendTwd: 0,
      overspendDepthRatio: 0,
    };
  }

  const chunks = [];
  let cursor = 0; // rows removed so far, counted from the top
  const removeFromTop = (amountTwd, kind) => {
    let remaining = round(Math.min((amountTwd / income) * rows, rows - cursor));
    while (remaining > EPS) {
      const rowFromTop = Math.floor(cursor + EPS);
      const offset = round(cursor - rowFromTop);
      const take = round(Math.min(1 - offset, remaining));
      if (take <= 0) break;
      chunks.push({ rowIndex: rows - 1 - rowFromTop, offset, take, kind });
      cursor = round(cursor + take);
      remaining = round(remaining - take);
    }
  };
  removeFromTop(recurring, "recurring");
  removeFromTop(oneTime, "oneTime");

  const savedTwd = Math.max(0, income - spentTwd);
  const overspendTwd = Math.max(0, spentTwd - income);
  return {
    hasIncome: true,
    rows,
    chunks,
    incomeTwd: income,
    spentTwd,
    savedTwd,
    savedRatio: savedTwd / income,
    overspendTwd,
    overspendDepthRatio: Math.min(OVERSPEND_DEPTH_CAP, overspendTwd / income),
  };
};

export const getRowRemovedFractions = (chunks, rows) => {
  const removed = new Array(rows).fill(0);
  chunks.forEach((chunk) => {
    removed[chunk.rowIndex] = round(removed[chunk.rowIndex] + chunk.take);
  });
  return removed;
};

export const chunkKey = (chunk) =>
  `${chunk.rowIndex}:${chunk.offset}:${chunk.take}:${chunk.kind}`;

export const diffTowerChunks = (prevLayout, nextLayout) => {
  const prevChunks = prevLayout?.chunks ?? [];
  const nextChunks = nextLayout?.chunks ?? [];
  const prevKeys = new Set(prevChunks.map(chunkKey));
  const nextKeys = new Set(nextChunks.map(chunkKey));
  return {
    added: nextChunks.filter((chunk) => !prevKeys.has(chunkKey(chunk))),
    restored: prevChunks.filter((chunk) => !nextKeys.has(chunkKey(chunk))),
  };
};

// Round on whole 千 first: (31500 / 10000).toFixed(1) gives "3.1" due to float.
export const formatTowerWan = (twd) =>
  `${(Math.round(toAmount(twd) / 1000) / 10).toFixed(1)} 萬`;
