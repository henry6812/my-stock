// Asset-tab net-worth jar: the total is the water level inside a jar that
// starts at 0 and fills to the next 千萬. The jar is just a faint fill, no outline or glass; the water
// is two moving wave layers, with today's move since yesterday as a pale
// solid band on top (green up / red down). The capacity label stays hidden
// until the hero is tapped (`revealed`); an empty jar always shows it, since
// there is no water to look at. On a phone the water leans against the tilt
// (utils/deviceTilt.js) with a little slosh; the principal leans later and less. The principal (cash plus what the holdings
// cost) is a darker layer settled at the bottom: water above it is gain; on a
// loss a thin line marks where the principal should reach. Its amount shows
// with the capacity. Geometry lives in utils/netWorthJar.js — this file only
// draws and animates it.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { getJarGeometry } from "../utils/netWorthJar";
import { formatNetWorthScaleLabel } from "../utils/portfolioView";
import { prefersReducedMotion } from "../utils/motion";
import { stepSpring, subscribeTilt } from "../utils/deviceTilt";

const VIEW_W = 120;
const VIEW_H = 170;
const JAR = { x: 18, y: 16, w: 84, h: 146, r: 18 };
// Entrance: rise to yesterday's level first, then move to today's.
const RISE_TO_BASELINE_MS = 1100;
const CELEBRATE_DELAY_MS = 900;
const CELEBRATE_MS = 1500;
const LEVEL_EASE = 0.06; // per-frame lerp toward the target level
const BUBBLE_COUNT = 8;
// Below this level the principal label sits on the jar body, not the water.
const LABEL_ON_WATER_RATIO = 0.15;

const yOf = (ratio) => JAR.y + JAR.h * (1 - ratio);

// The principal's surface: a longer, lower, slower swell than the water's.
const PRINCIPAL_WAVELENGTH = 26;
const PRINCIPAL_AMP = 1.2;
const PRINCIPAL_PHASE_STEP = 0.018; // per frame; the water moves 0.045

// Tilt springs (per frame). The principal is heavier: slower, and it leans
// only part of the way.
const WATER_SPRING = { stiffness: 0.02, damping: 0.12 };
const PRINCIPAL_SPRING = { stiffness: 0.008, damping: 0.14 };
const PRINCIPAL_LEAN = 0.6;
const JAR_CX = JAR.x + JAR.w / 2;

const STEPS = Array.from({ length: (JAR.w + 8) / 4 + 1 }, (_, n) => n * 4);
const xAt = (i) => JAR.x - 4 + i;

// surfaceAt(i) gives the surface's y at step i (0 … JAR.w + 8).
const buildLayerPath = (surfaceAt) => {
  const bottom = JAR.y + JAR.h + 4;
  let d = `M ${xAt(0)} ${bottom}`;
  for (const i of STEPS) d += ` L ${xAt(i)} ${surfaceAt(i).toFixed(2)}`;
  return `${d} L ${xAt(JAR.w + 8)} ${bottom} Z`;
};

const buildLinePath = (surfaceAt) =>
  STEPS.map((i, n) => `${n ? "L" : "M"} ${xAt(i)} ${surfaceAt(i).toFixed(2)}`).join(" ");

// slope = tan(lean): + raises the right side (the phone's right side is lower).
const leanAt = (i, slope) => (JAR_CX - xAt(i)) * slope;

const waveAt = (levelY, phase, amp, offset, slope = 0) => (i) =>
  levelY + offset + Math.sin(i / 13 + phase) * amp + leanAt(i, slope);

const principalWaveAt = (principalY, phase, amp, slope = 0) => (i) =>
  principalY + Math.sin(i / PRINCIPAL_WAVELENGTH + phase) * amp + leanAt(i, slope);

const buildWavePath = (levelY, phase, amp, offset, slope) =>
  buildLayerPath(waveAt(levelY, phase, amp, offset, slope));

// Today's band: the strip between two leaning lines.
const buildBandPath = (topY, bottomY, slope) => {
  const left = 0;
  const right = JAR.w + 8;
  return [
    `M ${xAt(left)} ${(topY + leanAt(left, slope)).toFixed(2)}`,
    `L ${xAt(right)} ${(topY + leanAt(right, slope)).toFixed(2)}`,
    `L ${xAt(right)} ${(bottomY + leanAt(right, slope)).toFixed(2)}`,
    `L ${xAt(left)} ${(bottomY + leanAt(left, slope)).toFixed(2)}`,
    "Z",
  ].join(" ");
};

const slopeOf = (deg) => Math.tan((deg * Math.PI) / 180);

export default function NetWorthJar({
  totalTwd,
  baselineTwd,
  principalTwd,
  playKey,
  revealed = false,
}) {
  const [reduced] = useState(prefersReducedMotion);
  const geometry = useMemo(
    () => getJarGeometry({ totalTwd, baselineTwd, principalTwd }),
    [totalTwd, baselineTwd, principalTwd],
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
  const principalPhaseRef = useRef(0);
  const principalAmpRef = useRef(reduced ? 0 : PRINCIPAL_AMP);
  const risingRef = useRef(false); // true while the entrance rises to yesterday
  const bandOnRef = useRef(reduced);
  const frontRef = useRef(null);
  const backRef = useRef(null);
  const bandRef = useRef(null);
  const principalRef = useRef(null);
  const principalTopRef = useRef(null);
  const tiltTargetRef = useRef(0);
  const waterTiltRef = useRef({ value: 0, velocity: 0 });
  const principalTiltRef = useRef({ value: 0, velocity: 0 });

  const paint = () => {
    const g = geometryRef.current;
    const levelY = yOf(levelRef.current);
    const slope = slopeOf(waterTiltRef.current.value);
    frontRef.current?.setAttribute(
      "d",
      buildWavePath(levelY, phaseRef.current, ampRef.current, 0, slope),
    );
    backRef.current?.setAttribute(
      "d",
      buildWavePath(levelY, -phaseRef.current * 0.8 + 2, ampRef.current * 1.3, -2.5, slope),
    );
    // The principal has its own slow swell but never rises past the water,
    // so while the water is below it (rising, or a loss) all water is principal.
    if (g.principalRatio !== null) {
      const water = waveAt(levelY, phaseRef.current, ampRef.current, 0, slope);
      const principal = principalWaveAt(
        yOf(g.principalRatio),
        principalPhaseRef.current,
        principalAmpRef.current,
        slopeOf(principalTiltRef.current.value),
      );
      principalRef.current?.setAttribute(
        "d",
        buildLayerPath((i) => Math.max(water(i), principal(i))),
      );
      principalTopRef.current?.setAttribute("d", buildLinePath(principal));
    }
    if (bandRef.current) {
      const show = bandOnRef.current && g.baselineRatio !== null && g.direction !== "flat";
      const baseY = yOf(g.baselineRatio ?? 0);
      bandRef.current.setAttribute(
        "d",
        show ? buildBandPath(Math.min(levelY, baseY), Math.max(levelY, baseY), slope) : "",
      );
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
    targetRef.current = g.baselineRatio ?? 0;
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
      principalPhaseRef.current += PRINCIPAL_PHASE_STEP;
      levelRef.current += (targetRef.current - levelRef.current) * LEVEL_EASE;
      const tilt = tiltTargetRef.current;
      waterTiltRef.current = stepSpring(
        waterTiltRef.current,
        tilt,
        WATER_SPRING.stiffness,
        WATER_SPRING.damping,
      );
      principalTiltRef.current = stepSpring(
        principalTiltRef.current,
        tilt * PRINCIPAL_LEAN,
        PRINCIPAL_SPRING.stiffness,
        PRINCIPAL_SPRING.damping,
      );
      const settled = Math.abs(targetRef.current - levelRef.current) < 0.002;
      // A quick tilt makes the surface choppier for a moment.
      const slosh = Math.min(2.5, Math.abs(waterTiltRef.current.velocity) * 2);
      ampRef.current += ((settled ? 1.2 : 3) + slosh - ampRef.current) * 0.04;
      paint();
    };
    frame = requestAnimationFrame(tick);
    const unsubscribe = subscribeTilt((deg) => {
      tiltTargetRef.current = deg;
    });
    return () => {
      cancelAnimationFrame(frame);
      unsubscribe();
    };
  }, [reduced]);

  const capLabel = formatNetWorthScaleLabel(geometry.capTwd);
  const currentLabel = formatNetWorthScaleLabel(geometry.totalTwd);
  const levelY = yOf(geometry.levelRatio);
  const up = geometry.direction === "up" || geometry.crossedMilestone;
  const showFrame = revealed || geometry.isEmpty;
  const hasPrincipal = geometry.principalRatio !== null;
  const principalLabel = hasPrincipal ? formatNetWorthScaleLabel(geometry.principalTwd) : null;

  return (
    <svg
      className={`networth-jar${showFrame ? " networth-jar--revealed" : ""}${celebrating ? " networth-jar--celebrate" : ""}`}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      role="img"
      aria-label={`總資產水位 ${currentLabel}，${principalLabel ? `本金 ${principalLabel}，` : ""}容量 ${capLabel}`}
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
            {hasPrincipal && <path ref={principalRef} className="networth-jar-principal" />}
          </g>
        )}
        {geometry.inLoss && (
          <path ref={principalTopRef} className="networth-jar-principal-top" />
        )}
        <path
          ref={bandRef}
          className={`networth-jar-band networth-jar-band--${up ? "up" : "down"}`}
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

      {hasPrincipal && (
        <text
          className={`networth-jar-principal-label${geometry.levelRatio < LABEL_ON_WATER_RATIO ? " networth-jar-principal-label--dry" : ""}`}
          x={JAR.x + JAR.w / 2}
          y={JAR.y + JAR.h - 9}
          textAnchor="middle"
        >
          {`本金 ${principalLabel}`}
        </text>
      )}

      <text className="networth-jar-cap" x={JAR.x + JAR.w / 2} y={JAR.y - 5} textAnchor="middle">
        {capLabel}
      </text>
    </svg>
  );
}
