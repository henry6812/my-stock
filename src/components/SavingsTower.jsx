// Expense-tab savings tower: this period's income is a tower of gold bricks;
// spending knocks bricks off the top (recurring first, then one-time) and
// what is left is what was saved. Overspending digs a red pit below ground.
// Layout maths lives in utils/savingsTower.js — this file draws + animates.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  diffTowerChunks,
  formatTowerWan,
  getRowRemovedFractions,
  getTowerLayout,
} from "../utils/savingsTower";
import { prefersReducedMotion } from "../utils/motion";

const VIEW_W = 120;
const VIEW_H = 180;
const TOWER = { x: 22, w: 76, top: 14, base: 150 };
const TOWER_HEIGHT = TOWER.base - TOWER.top;
const BUILD_STAGGER_MS = 45;
const BUILD_PAUSE_MS = 900; // after the last row lands, before chipping starts
const SETTLE_MS = 200;
const INSIDE_LABEL_RATIO = 0.85;

// Even rows: two half bricks. Odd rows: quarter / half / quarter (offset bond).
const rowBricks = (rowIndex) => {
  const cuts =
    rowIndex % 2 === 0
      ? [0, TOWER.w / 2, TOWER.w]
      : [0, TOWER.w / 4, (TOWER.w * 3) / 4, TOWER.w];
  return cuts.slice(0, -1).map((start, index) => ({
    x: TOWER.x + start + 0.75,
    w: cuts[index + 1] - start - 1.5,
  }));
};

// Falling pieces for one removed chunk. Spread is deterministic (no
// Math.random) so rendering stays pure.
const makeShards = (chunk, rows, firstId) => {
  const rowH = TOWER_HEIGHT / rows;
  const rowTop = TOWER.base - (chunk.rowIndex + 1) * rowH;
  const center = TOWER.x + TOWER.w / 2;
  return rowBricks(chunk.rowIndex).map((brick, index) => {
    const jitter = ((chunk.rowIndex * 7 + index * 13) % 11) - 5;
    const dx = (brick.x + brick.w / 2 - center) * 0.9 + jitter;
    return {
      id: firstId + index,
      x: brick.x,
      y: rowTop + 0.75 + chunk.offset * (rowH - 1.5),
      w: brick.w,
      h: Math.max(1, chunk.take * (rowH - 1.5)),
      kind: chunk.kind,
      dx,
      rot: dx * 3,
    };
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

export default function SavingsTower({
  incomeTwd,
  recurringTwd,
  oneTimeTwd,
  hasIncome,
  playKey,
  onSetupIncome,
}) {
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
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");

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
      const delay = Math.max(110, 240 - index * 18);
      index += 1;
      const revealed = index;
      setRun((s) =>
        withShards({ ...s, phase: "chip", revealed }, [chunk], current.rows),
      );
      timer = setTimeout(chipNext, delay);
    };
    timer = setTimeout(
      chipNext,
      layoutRef.current.rows * BUILD_STAGGER_MS + BUILD_PAUSE_MS,
    );
    return () => clearTimeout(timer);
    // A new run (runKey) restarts the sequence; layout changes mid-run are
    // picked up through layoutRef.
  }, [run.runKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const rowH = TOWER_HEIGHT / layout.rows;
  const removed = getRowRemovedFractions(
    layout.chunks.slice(0, run.revealed),
    layout.rows,
  );
  const done = run.phase === "done";
  const savedHeight = layout.savedRatio * TOWER_HEIGHT;
  const savedInside = layout.savedRatio >= INSIDE_LABEL_RATIO;
  const pitDepth = layout.overspendDepthRatio * TOWER_HEIGHT;

  return (
    <div className="savings-tower">
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} aria-hidden="true">
        <defs>
          <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f2cf6b" />
            <stop offset="1" stopColor="#d9a93a" />
          </linearGradient>
        </defs>
        <line
          className="savings-tower-ground"
          x1={TOWER.x - 14}
          x2={TOWER.x + TOWER.w + 14}
          y1={TOWER.base + 0.5}
          y2={TOWER.base + 0.5}
        />
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

        {/* Ghost outlines keep the original income height visible. */}
        <g className="savings-tower-ghost">
          {Array.from({ length: layout.rows }, (_, rowIndex) =>
            rowBricks(rowIndex).map((brick) => (
              <rect
                key={`${rowIndex}-${brick.x}`}
                x={brick.x}
                y={TOWER.base - (rowIndex + 1) * rowH + 0.75}
                width={brick.w}
                height={rowH - 1.5}
                rx="2"
              />
            )),
          )}
        </g>

        {layout.hasIncome && (
          <g
            key={run.runKey}
            className={run.phase === "build" ? "savings-tower-build" : undefined}
          >
            {Array.from({ length: layout.rows }, (_, rowIndex) => {
              const left = 1 - removed[rowIndex];
              if (left <= 0) return null;
              const fullH = rowH - 1.5;
              const y =
                TOWER.base - (rowIndex + 1) * rowH + 0.75 + fullH * removed[rowIndex];
              return rowBricks(rowIndex).map((brick) => (
                <rect
                  key={`${rowIndex}-${brick.x}`}
                  className="savings-tower-brick"
                  x={brick.x}
                  y={y}
                  width={brick.w}
                  height={fullH * left}
                  rx="2"
                  fill={`url(#${id}-gold)`}
                  style={{ animationDelay: `${rowIndex * BUILD_STAGGER_MS}ms` }}
                />
              ));
            })}
          </g>
        )}

        {/* Where spending removed income, a faint tint by kind shows the
            recurring / one-time split. */}
        {layout.chunks.slice(0, run.revealed).map((chunk) => {
          const fullH = rowH - 1.5;
          const y =
            TOWER.base - (chunk.rowIndex + 1) * rowH + 0.75 + fullH * chunk.offset;
          return rowBricks(chunk.rowIndex).map((brick) => (
            <rect
              key={`spent-${chunk.rowIndex}-${chunk.offset}-${brick.x}`}
              className={`savings-tower-spent savings-tower-spent--${chunk.kind}`}
              data-row={chunk.rowIndex}
              x={brick.x}
              y={y}
              width={brick.w}
              height={fullH * chunk.take}
              rx="2"
            />
          ));
        })}

        {run.shards.map((shard) => (
          <rect
            key={shard.id}
            className={`savings-tower-shard savings-tower-shard--${shard.kind}`}
            x={shard.x}
            y={shard.y}
            width={shard.w}
            height={shard.h}
            rx="2"
            style={{ "--dx": `${shard.dx}px`, "--rot": `${shard.rot}deg` }}
            onAnimationEnd={() =>
              setRun((s) => ({
                ...s,
                shards: s.shards.filter((item) => item.id !== shard.id),
              }))
            }
          />
        ))}

        {done && layout.hasIncome && layout.savedTwd > 0 && (
          <text
            className={`savings-tower-saved${savedInside ? " savings-tower-saved--inside" : ""}`}
            x={TOWER.x + TOWER.w / 2}
            y={
              savedInside
                ? TOWER.base - savedHeight / 2 + 3
                : TOWER.base - savedHeight - 5
            }
            textAnchor="middle"
          >
            {`存下 ${formatTowerWan(layout.savedTwd)}`}
          </text>
        )}

        {done && layout.overspendTwd > 0 && (
          <>
            <rect
              className="savings-tower-pit"
              x={TOWER.x}
              y={TOWER.base + 1.5}
              width={TOWER.w}
              height={pitDepth}
              rx="2"
            />
            <text
              className="savings-tower-over"
              x={TOWER.x + TOWER.w / 2}
              y={TOWER.base + pitDepth + 12}
              textAnchor="middle"
            >
              {`−${formatTowerWan(layout.overspendTwd)}`}
            </text>
          </>
        )}
      </svg>
      {!layout.hasIncome && (
        <button type="button" className="savings-tower-setup" onClick={onSetupIncome}>
          設定收入
        </button>
      )}
    </div>
  );
}
