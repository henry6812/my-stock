// Expense-tab growth tower (累計 mode): each month's surplus drops on top as
// its own rounded teal block, with a small gap to its neighbours (no
// background or outline); an overspent month knocks the same amount off the
// top and it falls away in small pieces. The current month is pale (not
// settled). Layout maths lives in utils/savingsGrowthTower.js — this file
// draws + animates.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { getGrowthTowerLayout, getStepDelay } from "../utils/savingsGrowthTower";
import { prefersReducedMotion } from "../utils/motion";

const VIEW_W = 120;
const VIEW_H = 180;
const TOWER = { x: 22, w: 76, top: 14, base: 150 };
const TOWER_HEIGHT = TOWER.base - TOWER.top;
const BODY_RX = 14;
const LAYER_RX = 6;
const LAYER_GAP = 2;
// Where each removed segment cracks: 3, 4 or 5 pieces of uneven width.
const SHARD_CUTS = [
  [0, 0.36, 0.68, 1],
  [0, 0.24, 0.5, 0.77, 1],
  [0, 0.18, 0.4, 0.62, 0.83, 1],
];

// Falling pieces per removed segment; deterministic spread.
const makeShards = (segments, toY, firstId) => {
  let nextId = firstId;
  const center = TOWER.x + TOWER.w / 2;
  const shards = segments.flatMap((segment) => {
    const cuts = SHARD_CUTS[segment.index % SHARD_CUTS.length];
    const y = toY(segment.top);
    const h = Math.max(2, toY(segment.bottom) - y);
    return cuts.slice(0, -1).map((start, piece) => {
      const x = TOWER.x + start * TOWER.w + 0.5;
      const w = (cuts[piece + 1] - start) * TOWER.w - 1;
      const jitter = ((segment.index * 7 + piece * 13) % 11) - 5;
      const dx = (x + w / 2 - center) * 0.9 + jitter;
      return { id: nextId++, x, y, w, h, dx, rot: dx * 2 };
    });
  });
  return { shards, nextId };
};

const startRun = (runKey, stepCount, animate, nextId = 0) => ({
  runKey,
  phase: animate && stepCount > 0 ? "build" : "done",
  revealed: 0,
  shards: [],
  nextId,
});

export default function SavingsGrowthTower({
  summaries,
  playKey,
  selectedMonth = null,
  onSelectMonth,
  onSetupIncome,
}) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [reduced] = useState(prefersReducedMotion);
  const layout = useMemo(() => getGrowthTowerLayout(summaries ?? []), [summaries]);
  const animate = !reduced && layout.hasIncome;

  // Income appearing after mount (data loaded late) replays the entrance.
  const [incomeSeen, setIncomeSeen] = useState(layout.hasIncome);
  const [replayToken, setReplayToken] = useState(0);
  if (incomeSeen !== layout.hasIncome) {
    setIncomeSeen(layout.hasIncome);
    if (layout.hasIncome) setReplayToken((token) => token + 1);
  }

  const runKey = `${playKey}:${replayToken}`;
  const [run, setRun] = useState(() =>
    startRun(runKey, layout.steps.length, animate),
  );
  if (run.runKey !== runKey) {
    setRun(startRun(runKey, layout.steps.length, animate, run.nextId));
  }

  const scale = layout.peakTwd > 0 ? TOWER_HEIGHT / layout.peakTwd : 0;
  const toY = (twd) => TOWER.base - twd * scale;

  // Timers read the latest layout / scale (data may change mid-entrance).
  const layoutRef = useRef(layout);
  const toYRef = useRef(toY);
  useEffect(() => {
    layoutRef.current = layout;
    toYRef.current = toY;
  });

  useEffect(() => {
    if (run.phase !== "build") return undefined;
    let timer = 0;
    let index = 0;
    const next = () => {
      const steps = layoutRef.current.steps;
      if (index >= steps.length) {
        setRun((s) => ({ ...s, phase: "done", revealed: steps.length }));
        return;
      }
      const step = steps[index];
      index += 1;
      const revealed = index;
      setRun((s) => {
        if (step.type !== "chip") return { ...s, revealed };
        const { shards, nextId } = makeShards(step.removed, toYRef.current, s.nextId);
        return { ...s, revealed, shards: [...s.shards, ...shards], nextId };
      });
      timer = setTimeout(next, getStepDelay(steps.length));
    };
    timer = setTimeout(next, 0);
    return () => clearTimeout(timer);
    // A new run (runKey) restarts the sequence.
  }, [run.runKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const done = run.phase === "done";
  const shown = done
    ? layout.steps.length
    : Math.min(run.revealed, layout.steps.length);
  const stack = shown > 0 ? layout.steps[shown - 1].stack : [];

  const select = (month) => (event) => {
    event.stopPropagation();
    onSelectMonth?.(month);
  };

  return (
    <div className="growth-tower" data-phase={run.phase}>
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        aria-hidden="true"
        onClick={() => onSelectMonth?.(null)}
      >
        <defs>
          <clipPath id={`${id}-clip`}>
            <rect x={TOWER.x} y={TOWER.top} width={TOWER.w} height={TOWER_HEIGHT} rx={BODY_RX} />
          </clipPath>
        </defs>
        <g clipPath={`url(#${id}-clip)`}>
          {stack.map((layer, i) => {
            // Half the gap comes off each side shared with another month.
            const top = toY(layer.top) + (i < stack.length - 1 ? LAYER_GAP / 2 : 0);
            const bottom = toY(layer.bottom) - (i > 0 ? LAYER_GAP / 2 : 0);
            const className = [
              "growth-tower-layer",
              layer.isCurrent ? "growth-tower-layer--current" : "",
              done ? "" : "growth-tower-layer--enter",
              selectedMonth && selectedMonth !== layer.month ? "is-dim" : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <g
                key={layer.month}
                className={className}
                data-month={layer.month}
                onClick={select(layer.month)}
              >
                <rect
                  x={TOWER.x}
                  y={top}
                  width={TOWER.w}
                  height={Math.max(0.5, bottom - top)}
                  rx={LAYER_RX}
                />
              </g>
            );
          })}
        </g>

        {run.shards.map((shard) => (
          <rect
            key={shard.id}
            className="growth-tower-shard"
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
