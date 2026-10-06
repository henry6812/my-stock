// Asset-tab net-worth jar: the total is the water level inside a jar that
// holds one 千萬. Yesterday's level is a dashed line; today's move between the
// two is a striped band (green up / red down). Geometry lives in
// utils/netWorthJar.js — this file only draws and animates it.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { getJarGeometry } from "../utils/netWorthJar";
import { formatNetWorthScaleLabel } from "../utils/portfolioView";
import { formatTwd } from "../utils/formatters";
import { prefersReducedMotion } from "../utils/motion";

const VIEW_W = 120;
const VIEW_H = 170;
const JAR = { x: 18, y: 16, w: 84, h: 146, r: 18 };
// Entrance: rise to yesterday's level first, then move to today's.
const RISE_TO_BASELINE_MS = 1100;
const CELEBRATE_DELAY_MS = 900;
const CELEBRATE_MS = 1500;
const LEVEL_EASE = 0.06; // per-frame lerp toward the target level
const BUBBLE_COUNT = 8;

const yOf = (ratio) => JAR.y + JAR.h * (1 - ratio);

const buildWavePath = (levelY, phase, amp, offset) => {
  const bottom = JAR.y + JAR.h + 4;
  let d = `M ${JAR.x - 4} ${bottom} L ${JAR.x - 4} ${levelY}`;
  for (let i = 0; i <= JAR.w + 8; i += 4) {
    const y = levelY + offset + Math.sin(i / 13 + phase) * amp;
    d += ` L ${JAR.x - 4 + i} ${y.toFixed(2)}`;
  }
  return `${d} L ${JAR.x + JAR.w + 4} ${bottom} Z`;
};

export default function NetWorthJar({ totalTwd, baselineTwd, playKey }) {
  const [reduced] = useState(prefersReducedMotion);
  const geometry = useMemo(
    () => getJarGeometry({ totalTwd, baselineTwd }),
    [totalTwd, baselineTwd],
  );
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  // The playKey whose entrance is currently celebrating a new 千萬 (or null).
  const [celebrateKey, setCelebrateKey] = useState(null);
  const celebrating = celebrateKey === playKey;

  const geometryRef = useRef(geometry);
  const levelRef = useRef(reduced ? geometry.levelRatio : 0);
  const targetRef = useRef(geometry.levelRatio);
  const ampRef = useRef(reduced ? 0 : 3);
  const phaseRef = useRef(0);
  const risingRef = useRef(false); // true while the entrance rises to yesterday
  const bandOnRef = useRef(reduced);
  const frontRef = useRef(null);
  const backRef = useRef(null);
  const bandRef = useRef(null);

  const paint = () => {
    const g = geometryRef.current;
    const levelY = yOf(levelRef.current);
    frontRef.current?.setAttribute(
      "d",
      buildWavePath(levelY, phaseRef.current, ampRef.current, 0),
    );
    backRef.current?.setAttribute(
      "d",
      buildWavePath(levelY, -phaseRef.current * 0.8 + 2, ampRef.current * 1.3, -2.5),
    );
    if (bandRef.current) {
      const fromRatio = g.crossedMilestone ? 0 : g.baselineRatio;
      const show = bandOnRef.current && fromRatio !== null && g.direction !== "flat";
      const baseY = yOf(fromRatio ?? 0);
      bandRef.current.setAttribute("y", Math.min(levelY, baseY));
      bandRef.current.setAttribute("height", show ? Math.abs(levelY - baseY) : 0);
    }
  };

  // Data changed (price refresh etc.): glide to the new level, no replay.
  useEffect(() => {
    geometryRef.current = geometry;
    if (reduced) {
      levelRef.current = geometry.levelRatio;
      paint();
      return;
    }
    if (!risingRef.current) targetRef.current = geometry.levelRatio;
  }, [geometry, reduced]);

  // Entrance on mount and whenever playKey changes.
  useEffect(() => {
    if (reduced) return undefined;
    const g = geometryRef.current;
    levelRef.current = 0;
    ampRef.current = 3;
    bandOnRef.current = false;
    risingRef.current = true;
    targetRef.current = g.crossedMilestone ? 0 : (g.baselineRatio ?? 0);
    const timers = [
      setTimeout(() => {
        risingRef.current = false;
        bandOnRef.current = true;
        targetRef.current = geometryRef.current.levelRatio;
        ampRef.current = 4;
      }, RISE_TO_BASELINE_MS),
    ];
    if (g.crossedMilestone) {
      timers.push(
        setTimeout(() => setCelebrateKey(playKey), RISE_TO_BASELINE_MS + CELEBRATE_DELAY_MS),
        setTimeout(
          () => setCelebrateKey(null),
          RISE_TO_BASELINE_MS + CELEBRATE_DELAY_MS + CELEBRATE_MS,
        ),
      );
    }
    return () => timers.forEach(clearTimeout);
  }, [playKey, reduced]);

  // Wave loop. Browsers already stop rAF in hidden tabs.
  useEffect(() => {
    if (reduced) {
      paint();
      return undefined;
    }
    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      phaseRef.current += 0.045;
      levelRef.current += (targetRef.current - levelRef.current) * LEVEL_EASE;
      const settled = Math.abs(targetRef.current - levelRef.current) < 0.002;
      ampRef.current += ((settled ? 1.2 : 3) - ampRef.current) * 0.04;
      paint();
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reduced]);

  const capLabel = formatNetWorthScaleLabel(geometry.capTwd);
  const currentLabel = formatNetWorthScaleLabel(geometry.totalTwd);
  const levelY = yOf(geometry.levelRatio);
  const up = geometry.direction === "up" || geometry.crossedMilestone;

  return (
    <svg
      className={`networth-jar${celebrating ? " networth-jar--celebrate" : ""}`}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      role="img"
      aria-label={`總資產水位 ${currentLabel}，容量 ${capLabel}`}
    >
      <defs>
        <clipPath id={`${id}-clip`}>
          <rect x={JAR.x} y={JAR.y} width={JAR.w} height={JAR.h} rx={JAR.r} />
        </clipPath>
        <linearGradient id={`${id}-water`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5cbcae" />
          <stop offset="1" stopColor="#2b7f74" />
        </linearGradient>
        <pattern id={`${id}-up`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="5" height="5" fill="rgba(35,120,4,.35)" />
          <rect width="1.2" height="5" fill="rgba(255,255,255,.6)" />
        </pattern>
        <pattern id={`${id}-down`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="5" height="5" fill="rgba(207,19,34,.10)" />
          <rect width="1.2" height="5" fill="rgba(207,19,34,.45)" />
        </pattern>
      </defs>

      <rect className="networth-jar-glass" x={JAR.x} y={JAR.y} width={JAR.w} height={JAR.h} rx={JAR.r} />
      <g clipPath={`url(#${id}-clip)`}>
        {!geometry.isEmpty && (
          <g className="networth-jar-water">
            <path ref={backRef} className="networth-jar-wave-back" />
            <path ref={frontRef} fill={`url(#${id}-water)`} />
          </g>
        )}
        <rect
          ref={bandRef}
          className={`networth-jar-band networth-jar-band--${up ? "up" : "down"}`}
          x={JAR.x}
          width={JAR.w}
          height="0"
          fill={`url(#${id}-${up ? "up" : "down"})`}
        />
        {celebrating &&
          Array.from({ length: BUBBLE_COUNT }, (_, index) => (
            <circle
              key={index}
              className="networth-jar-bubble"
              cx={JAR.x + 10 + ((index * 37) % (JAR.w - 20))}
              cy={levelY}
              r={1.5 + (index % 3)}
              style={{ animationDelay: `${index * 70}ms` }}
            />
          ))}
      </g>

      {geometry.ticks.map((tick) => (
        <line
          key={tick.twd}
          className="networth-jar-tick"
          x1={JAR.x + JAR.w - 10}
          x2={JAR.x + JAR.w}
          y1={yOf(tick.ratio)}
          y2={yOf(tick.ratio)}
        />
      ))}
      <rect className="networth-jar-outline" x={JAR.x} y={JAR.y} width={JAR.w} height={JAR.h} rx={JAR.r} />
      <rect className="networth-jar-shine" x={JAR.x + 8} y={JAR.y + 14} width="4" height={JAR.h * 0.55} rx="2" />
      {celebrating && (
        <rect className="networth-jar-halo" x={JAR.x} y={JAR.y} width={JAR.w} height={JAR.h} rx={JAR.r} />
      )}

      <text className="networth-jar-cap" x={JAR.x + JAR.w / 2} y={JAR.y - 5} textAnchor="middle">
        {capLabel}
      </text>
      {geometry.floorTwd > 0 && (
        <text className="networth-jar-floor" x={JAR.x + JAR.w / 2} y={JAR.y + JAR.h + 13} textAnchor="middle">
          {`從 ${formatNetWorthScaleLabel(geometry.floorTwd)} 起`}
        </text>
      )}

      {geometry.baselineRatio !== null && (
        <g key={`baseline-${playKey}`} className="networth-jar-baseline" data-testid="jar-baseline">
          <title>{`昨日23:59：${formatTwd(geometry.baselineTwd)}`}</title>
          <line
            x1={JAR.x - 6}
            x2={JAR.x + JAR.w + 6}
            y1={yOf(geometry.baselineRatio)}
            y2={yOf(geometry.baselineRatio)}
          />
          <text x={JAR.x - 8} y={yOf(geometry.baselineRatio) + 3} textAnchor="end">
            昨日
          </text>
        </g>
      )}

      {!geometry.isEmpty && (
        <text
          key={`current-${playKey}`}
          className="networth-jar-current"
          x={JAR.x + JAR.w + 6}
          y={levelY + 3}
        >
          {currentLabel}
        </text>
      )}
    </svg>
  );
}
