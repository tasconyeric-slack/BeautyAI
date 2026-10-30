/** Display coordinates only. Both the browser and PDF use these same chart paths. */
import type { HarmonyAxis, LearnedScoreView } from "@/lib/adapters";

export type Density = NonNullable<NonNullable<LearnedScoreView["rank"]>["distribution"]>;
export function densityPaths(curve: Density, score: number) {
  const left = 12, right = 308, baseline = 112, top = 12;
  const [lo, hi] = curve.bounds;
  const max = Math.max(...curve.points.map(p => p[1]));
  const x = (v: number) => left + ((v - lo) / (hi - lo)) * (right - left);
  const y = (v: number) => baseline - (v / max) * (baseline - top);
  const points = curve.points.map(p => [x(p[0]), y(p[1])]);
  const markerX = x(Math.min(hi, Math.max(lo, score)));
  const next = points.findIndex(p => p[0] >= markerX);
  const a = points[Math.max(0, next - 1)], b = points[next < 0 ? points.length - 1 : next];
  const markerY = b[0] === a[0] ? b[1] : a[1] + ((markerX - a[0]) / (b[0] - a[0])) * (b[1] - a[1]);
  const line = points.map((p, i) => `${i ? "L" : "M"}${p[0]},${p[1]}`).join(" ");
  const rightArea = `M${markerX},${baseline} L${markerX},${markerY} `
    + points.filter(p => p[0] > markerX).map(p => `L${p[0]},${p[1]}`).join(" ") + ` L${right},${baseline} Z`;
  return { line, area: `${line} L${right},${baseline} L${left},${baseline} Z`, rightArea,
    markerX, markerY, meanX: x(curve.mean), baseline, left, right, top };
}

export const radarPoint = (i: number, count: number, radius: number) => {
  const angle = -Math.PI / 2 + (i * 2 * Math.PI) / count;
  return { x: 180 + radius * Math.cos(angle), y: 150 + radius * Math.sin(angle) };
};
export const radarPolygon = (axes: HarmonyAxis[], radius = 88) => axes.map((a, i) => {
  const p = radarPoint(i, axes.length, radius * (a.value ?? 0) / 100);
  return `${p.x},${p.y}`;
}).join(" ");
