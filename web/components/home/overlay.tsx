"use client";
/** Measurement lines drawn in the photo's own pixel space (viewBox = native size), so they stay registered to the
 *  landmarks however the plate is cropped, scaled or zoomed. `unit` = screen px per viewBox unit, used only to keep
 *  ticks and dots a constant on-screen size. */
import { arcPath, type MetricOverlay } from "@/components/face/measure-model";
import type { Pt } from "@/lib/tint";
import s from "./home.module.css";

export const smoothPath = (pts: readonly Pt[], W: number, H: number, closed = true): string => {
  if (pts.length < 3) return "";
  const P = pts.map(([x, y]) => [x * W, y * H] as const);
  const n = P.length;
  const at = (i: number) => P[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))];
  let d = `M${P[0][0].toFixed(1)},${P[0][1].toFixed(1)}`;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    // Catmull–Rom through the measured samples (no invented control points beyond the curve fit).
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return closed ? `${d} Z` : d;
};

/** A measured segment with perpendicular end ticks. */
export function Bracket({ a, b, W, H, unit, dashed, className, style }: {
  a: Pt; b: Pt; W: number; H: number; unit: number; dashed?: boolean; className?: string; style?: React.CSSProperties;
}) {
  const ax = a[0] * W, ay = a[1] * H, bx = b[0] * W, by = b[1] * H;
  const len = Math.hypot(bx - ax, by - ay) || 1;
  const nx = -(by - ay) / len, ny = (bx - ax) / len;
  const t = 6 / unit;
  return (
    <g className={className} style={style}>
      {dashed
        ? <line x1={ax} y1={ay} x2={bx} y2={by} className={s.lnRef} strokeDasharray={`${4 / unit} ${4 / unit}`} />
        : <line x1={ax} y1={ay} x2={bx} y2={by} pathLength={1} className={s.lnMeasure} />}
      {!dashed && (
        <>
          <line x1={ax - nx * t} y1={ay - ny * t} x2={ax + nx * t} y2={ay + ny * t} className={s.lnTick} />
          <line x1={bx - nx * t} y1={by - ny * t} x2={bx + nx * t} y2={by + ny * t} className={s.lnTick} />
        </>
      )}
    </g>
  );
}

export function MetricLines({ ov, unit }: { ov: MetricOverlay; unit: number }) {
  const { width: W, height: H } = ov;
  return (
    <g>
      {ov.outline && <path d={smoothPath(ov.outline, W, H)} pathLength={1} className={s.lnContour} />}
      {ov.segments.map((seg, i) => (
        <Bracket key={i} a={seg.a} b={seg.b} W={W} H={H} unit={unit} dashed={seg.role !== "measure"}
          className={s.seq} style={{ "--i": i } as React.CSSProperties} />
      ))}
      {ov.arcs.map((arc, i) => (
        <path key={`a${i}`} d={arcPath(arc, W, H, 26 / unit)} pathLength={1} className={s.lnMeasure} />
      ))}
      {ov.dots.map((d, i) => <circle key={`d${i}`} cx={d[0] * W} cy={d[1] * H} r={2.6 / unit} className={s.dot} />)}
    </g>
  );
}
