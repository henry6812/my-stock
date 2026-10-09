// Expense-tab savings tower (月份 mode): this month's income is one smooth
// teal column (no background or outline); spending is knocked off the top
// (recurring first, then one-time) as small falling pieces, leaving a pale
// tint by kind. Each part is its own rounded block with a small gap between. What is left at the bottom is what was saved; overspending
// empties the column and leaves a thin red line at its foot. Each part is
// tappable (onSelectKind) and the income caption only shows while one is
// selected. Layout maths lives in utils/savingsTower.js — this file draws +
// animates.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { diffTowerChunks, formatTowerWan, getTowerLayout } from "../utils/savingsTower";
import { prefersReducedMotion } from "../utils/motion";

const VIEW_W = 120;
const VIEW_H = 180;
const TOWER = { x: 22, w: 76, top: 14, base: 150 };
const TOWER_HEIGHT = TOWER.base - TOWER.top;
const BODY_RX = 14;
// Saved / recurring / one-time are separate rounded blocks with a small gap
// between them; the column's outer corners are rounder (BODY_RX).
const SEGMENT_RX = 6;
const SEGMENT_GAP = 2;
// Kept short: until the chipping ends the tower shows more saved than there
// is, so the whole entrance (rise + pause + chips) stays around a second.
const RISE_MS = 300;
const BUILD_PAUSE_MS = 250; // after the column has risen, before chipping starts
const SETTLE_MS = 200;
const OVERDRAWN_H = 3;
const SPENT_KINDS = ["recurring", "oneTime"];
// Where each removed slice cracks: 3, 4 or 5 pieces of uneven width.
const SHARD_CUTS = [
  [0, 0.36, 0.68, 1],
  [0, 0.24, 0.5, 0.77, 1],
  [0, 0.18, 0.4, 0.62, 0.83, 1],
];

const chunkTop = (chunk, rows) =>
  TOWER.top + (rows - 1 - chunk.rowIndex + chunk.offset) * (TOWER_HEIGHT / rows);

// Falling pieces for one removed chunk. Spread is deterministic (no
// Math.random) so rendering stays pure.
const makeShards = (chunk, rows, firstId) => {
  const cuts = SHARD_CUTS[chunk.rowIndex % SHARD_CUTS.length];
  const center = TOWER.x + TOWER.w / 2;
  const y = chunkTop(chunk, rows);
  const h = Math.max(1, chunk.take * (TOWER_HEIGHT / rows) - 1);
  return cuts.slice(0, -1).map((start, index) => {
    const x = TOWER.x + start * TOWER.w + 0.5;
    const w = (cuts[index + 1] - start) * TOWER.w - 1;
    const jitter = ((chunk.rowIndex * 7 + index * 13) % 11) - 5;
    const dx = (x + w / 2 - center) * 0.9 + jitter;
    return { id: firstId + index, x, y, w, h, kind: chunk.kind, dx, rot: dx * 3 };
  });
};

// Append the shards for `chunks` to the animation state.
const withShards = (state, chunks, rows) => {
  let nextId = state.nextId;
  const added = chunks.flatMap((chunk) => {
    const pieces = makeShards(chunk, rows, nextId);
    nextId += pieces.length;
    return pieces;
  });
  return { ...state, shards: [...state.shards, ...added], nextId };
};

const startRun = (runKey, layout, animate, nextId = 0) => ({
  runKey,
  phase: animate ? "build" : "done", // "build" | "chip" | "done"
  revealed: animate ? 0 : layout.chunks.length,
  shownLayout: layout,
  shards: [],
  nextId,
});

// Rows removed so far, per expense kind.
const removedRows = (chunks) =>
  chunks.reduce(
    (sum, chunk) => ({ ...sum, [chunk.kind]: sum[chunk.kind] + chunk.take }),
    { recurring: 0, oneTime: 0 },
  );

export default function SavingsTower({
  incomeTwd,
  recurringTwd,
  oneTimeTwd,
  hasIncome,
  playKey,
  onSetupIncome,
  selectedKind = null,
  onSelectKind,
}) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [reduced] = useState(prefersReducedMotion);
  const layout = useMemo(
    () =>
      getTowerLayout({
        incomeTwd: hasIncome ? incomeTwd : 0,
        recurringTwd,
        oneTimeTwd,
      }),
    [hasIncome, incomeTwd, recurringTwd, oneTimeTwd],
  );
  const animate = !reduced && layout.hasIncome;

  // Income appearing after mount (data loaded late) replays the entrance.
  const [incomeSeen, setIncomeSeen] = useState(layout.hasIncome);
  const [replayToken, setReplayToken] = useState(0);
  if (incomeSeen !== layout.hasIncome) {
    setIncomeSeen(layout.hasIncome);
    if (layout.hasIncome) setReplayToken((token) => token + 1);
  }

  const runKey = `${playKey}:${replayToken}`;
  const [run, setRun] = useState(() => startRun(runKey, layout, animate));
  if (run.runKey !== runKey) {
    setRun(startRun(runKey, layout, animate, run.nextId));
  } else if (run.shownLayout !== layout && run.phase === "done") {
    // Data changed after the entrance: animate only the difference.
    const { added } = diffTowerChunks(run.shownLayout, layout);
    const next = { ...run, shownLayout: layout, revealed: layout.chunks.length };
    setRun(animate ? withShards(next, added, layout.rows) : next);
  }

  // Timers read the latest layout (it may change mid-entrance).
  const layoutRef = useRef(layout);
  useEffect(() => {
    layoutRef.current = layout;
  });

  useEffect(() => {
    if (!animate) return undefined;
    // Each step reads layoutRef, so data that lands mid-entrance (e.g. right
    // after switching month) is what gets chipped away.
    let timer = 0;
    let index = 0;
    const chipNext = () => {
      const current = layoutRef.current;
      if (index >= current.chunks.length) {
        timer = setTimeout(() => {
          setRun((s) => ({
            ...s,
            phase: "done",
            revealed: layoutRef.current.chunks.length,
            shownLayout: layoutRef.current,
          }));
        }, SETTLE_MS);
        return;
      }
      const chunk = current.chunks[index];
      const delay = Math.max(60, 120 - index * 10);
      index += 1;
      const revealed = index;
      setRun((s) =>
        withShards({ ...s, phase: "chip", revealed }, [chunk], current.rows),
      );
      timer = setTimeout(chipNext, delay);
    };
    timer = setTimeout(chipNext, RISE_MS + BUILD_PAUSE_MS);
    return () => clearTimeout(timer);
    // A new run (runKey) restarts the sequence; layout changes mid-run are
    // picked up through layoutRef.
  }, [run.runKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const rowH = TOWER_HEIGHT / layout.rows;
  const removed = removedRows(layout.chunks.slice(0, run.revealed));
  const recurringH = removed.recurring * rowH;
  const oneTimeH = removed.oneTime * rowH;
  const savedTop = TOWER.top + recurringH + oneTimeH;
  // Top to bottom; each block gives up half the gap on a side it shares with
  // another block.
  const blocks = [
    { kind: "recurring", y: TOWER.top, h: recurringH },
    { kind: "oneTime", y: TOWER.top + recurringH, h: oneTimeH },
    { kind: "saved", y: savedTop, h: layout.hasIncome ? TOWER.base - savedTop : 0 },
  ].filter((block) => block.h > 0);
  const shape = Object.fromEntries(
    blocks.map((block, index) => {
      const top = block.y + (index > 0 ? SEGMENT_GAP / 2 : 0);
      const bottom = block.y + block.h - (index < blocks.length - 1 ? SEGMENT_GAP / 2 : 0);
      return [block.kind, { y: top, h: Math.max(0, bottom - top) }];
    }),
  );
  const done = run.phase === "done";

  const select = (kind) => (event) => {
    event.stopPropagation();
    onSelectKind?.(kind);
  };
  const partClass = (kind) =>
    `savings-tower-part${selectedKind && selectedKind !== kind ? " is-dim" : ""}`;

  return (
    <div
      className={`savings-tower${selectedKind ? " savings-tower--revealed" : ""}`}
      data-phase={run.phase}
    >
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        aria-hidden="true"
        onClick={() => onSelectKind?.(null)}
      >
        <defs>
          <clipPath id={`${id}-clip`}>
            <rect x={TOWER.x} y={TOWER.top} width={TOWER.w} height={TOWER_HEIGHT} rx={BODY_RX} />
          </clipPath>
        </defs>
        {layout.hasIncome && (
          <text
            className="savings-tower-income"
            x={TOWER.x + TOWER.w / 2}
            y={TOWER.top - 4}
            textAnchor="middle"
          >
            {`收入 ${formatTowerWan(layout.incomeTwd)}`}
          </text>
        )}

        <g clipPath={`url(#${id}-clip)`}>
          {shape.saved && (
            <g className={partClass("saved")} data-kind="saved" onClick={select("saved")}>
              <rect
                key={run.runKey}
                className={`savings-tower-saved${run.phase === "build" ? " savings-tower-rise" : ""}`}
                x={TOWER.x}
                y={shape.saved.y}
                width={TOWER.w}
                height={shape.saved.h}
                rx={SEGMENT_RX}
              />
            </g>
          )}

          {/* Where spending removed income, a faint tint by kind shows the
              recurring / one-time split. */}
          {SPENT_KINDS.map(
            (kind) =>
              shape[kind] && (
                <g key={kind} className={partClass(kind)} data-kind={kind} onClick={select(kind)}>
                  <rect
                    className={`savings-tower-spent savings-tower-spent--${kind}`}
                    x={TOWER.x}
                    y={shape[kind].y}
                    width={TOWER.w}
                    height={shape[kind].h}
                    rx={SEGMENT_RX}
                  />
                </g>
              ),
          )}

          {done && layout.overspendTwd > 0 && (
            <rect
              className="savings-tower-overdrawn"
              x={TOWER.x}
              y={TOWER.base - OVERDRAWN_H}
              width={TOWER.w}
              height={OVERDRAWN_H}
            />
          )}
        </g>

        {run.shards.map((shard) => (
          <rect
            key={shard.id}
            className={`savings-tower-shard savings-tower-shard--${shard.kind}`}
            x={shard.x}
            y={shard.y}
            width={shard.w}
            height={shard.h}
            rx="1.5"
            style={{ "--dx": `${shard.dx}px`, "--rot": `${shard.rot}deg` }}
            onAnimationEnd={() =>
              setRun((s) => ({
                ...s,
                shards: s.shards.filter((item) => item.id !== shard.id),
              }))
            }
          />
        ))}
      </svg>
      {!layout.hasIncome && (
        <button type="button" className="savings-tower-setup" onClick={onSetupIncome}>
          設定收入
        </button>
      )}
    </div>
  );
}
