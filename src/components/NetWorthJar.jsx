// Asset-tab net-worth jar: the total is the water level inside a jar that
// holds one 千萬. The jar is just a faint fill, no outline or glass; the water
// is two moving wave layers, with today's move since yesterday as a pale
// solid band on top (green up / red down). The capacity label stays hidden
// until the hero is tapped (`revealed`); an empty jar always shows it, since
// there is no water to look at. Geometry lives in utils/netWorthJar.js — this file only
// draws and animates it.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { getJarGeometry } from "../utils/netWorthJar";
import { formatNetWorthScaleLabel } from "../utils/portfolioView";
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

export default function NetWorthJar({ totalTwd, baselineTwd, playKey, revealed = false }) {
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
  const showFrame = revealed || geometry.isEmpty;

  return (
    <svg
      className={`networth-jar${showFrame ? " networth-jar--revealed" : ""}${celebrating ? " networth-jar--celebrate" : ""}`}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      role="img"
      aria-label={`總資產水位 ${currentLabel}，容量 ${capLabel}`}
    >
      <defs>
        <clipPath id={`${id}-clip`}>
          <rect x={JAR.x} y={JAR.y} width={JAR.w} height={JAR.h} rx={JAR.r} />
        </clipPath>
      </defs>

      <rect className="networth-jar-body" x={JAR.x} y={JAR.y} width={JAR.w} height={JAR.h} rx={JAR.r} />
      <g clipPath={`url(#${id}-clip)`}>
        {!geometry.isEmpty && (
          <g className="networth-jar-water">
            <path ref={backRef} className="networth-jar-wave-back" />
            <path ref={frontRef} className="networth-jar-wave-front" />
          </g>
        )}
        <rect
          ref={bandRef}
          className={`networth-jar-band networth-jar-band--${up ? "up" : "down"}`}
          x={JAR.x}
          width={JAR.w}
          height="0"
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

      {celebrating && (
        <rect className="networth-jar-halo" x={JAR.x} y={JAR.y} width={JAR.w} height={JAR.h} rx={JAR.r} />
      )}

      <text className="networth-jar-cap" x={JAR.x + JAR.w / 2} y={JAR.y - 5} textAnchor="middle">
        {capLabel}
      </text>
    </svg>
  );
}
