// Expense-tab growth tower (累計 mode): each month's surplus drops on top as
// one layer of bricks; an overspent month chips the same amount off the top
// and the pieces shatter. The current month is drawn dashed (not settled).
// Layout maths lives in utils/savingsGrowthTower.js — this file draws +
// animates.
import { useEffect, useMemo, useRef, useState } from "react";
import { getGrowthTowerLayout, getStepDelay } from "../utils/savingsGrowthTower";
import { prefersReducedMotion } from "../utils/motion";

const VIEW_W = 120;
const VIEW_H = 180;
const TOWER = { x: 22, w: 76, top: 14, base: 150 };
const TOWER_HEIGHT = TOWER.base - TOWER.top;
const BRICK_RX = 3;

// Even months: two half bricks. Odd months: quarter / half / quarter.
const layerBricks = (index) => {
  const cuts =
    index % 2 === 0
      ? [0, TOWER.w / 2, TOWER.w]
      : [0, TOWER.w / 4, (TOWER.w * 3) / 4, TOWER.w];
  return cuts.slice(0, -1).map((start, i) => ({
    x: TOWER.x + start + 1,
    w: cuts[i + 1] - start - 2,
  }));
};

// Four falling pieces per removed segment; deterministic spread.
const makeShards = (segments, toY, firstId) => {
  let nextId = firstId;
  const shards = segments.flatMap((segment) => {
    const y = toY(segment.top);
    const h = Math.max(2, toY(segment.bottom) - y);
    return [0, 1, 2, 3].map((piece) => {
      const dx = (piece - 1.5) * 22;
      return {
        id: nextId++,
        x: TOWER.x + (piece * TOWER.w) / 4 + 1,
        y,
        w: TOWER.w / 4 - 2,
        h,
        dx,
        rot: dx * 2,
      };
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
  const ghosts = layout.steps.slice(0, shown).flatMap((step) => step.removed);

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
        <line
          className="savings-tower-ground"
          x1={TOWER.x - 14}
          x2={TOWER.x + TOWER.w + 14}
          y1={TOWER.base + 0.5}
          y2={TOWER.base + 0.5}
        />

        {/* Where an overspent month chipped the tower; later layers cover it. */}
        <g className="growth-tower-ghost">
          {ghosts.map((segment, i) =>
            layerBricks(segment.index).map((brick) => (
              <rect
                key={`${i}-${brick.x}`}
                x={brick.x}
                y={toY(segment.top) + 0.75}
                width={brick.w}
                height={Math.max(0.5, (segment.top - segment.bottom) * scale - 1.5)}
                rx={BRICK_RX}
              />
            )),
          )}
        </g>

        {stack.map((layer) => {
          const y = toY(layer.top);
          const h = (layer.top - layer.bottom) * scale;
          const className = [
            "growth-tower-layer",
            layer.index % 2 ? "growth-tower-layer--alt" : "",
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
              {layerBricks(layer.index).map((brick) => (
                <rect
                  key={brick.x}
                  x={brick.x}
                  y={y + 0.75}
                  width={brick.w}
                  height={Math.max(0.5, h - 1.5)}
                  rx={Math.min(BRICK_RX, h / 2.5)}
                />
              ))}
            </g>
          );
        })}

        {run.shards.map((shard) => (
          <rect
            key={shard.id}
            className="growth-tower-shard"
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
      </svg>
      {!layout.hasIncome && (
        <button type="button" className="savings-tower-setup" onClick={onSetupIncome}>
          設定收入
        </button>
      )}
    </div>
  );
}
