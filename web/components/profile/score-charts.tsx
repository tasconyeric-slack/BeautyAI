import type { HarmonyAxis } from "@/lib/adapters";
import { densityPaths, radarPoint, radarPolygon, type Density } from "./score-chart-geometry";

export function ReferenceDensity({ curve, score }: { curve: Density; score: number }) {
  const p = densityPaths(curve, score);
  return <svg viewBox="0 0 320 150" role="img" aria-label={`颜值分分布，均值 ${curve.mean.toFixed(1)}，你的分数 ${score}`}
    data-testid="reference-density" className="block w-full">
    <path d={p.area} className="fill-accent/5" />
    <path d={p.rightArea} data-testid="reference-density-tail" className="fill-accent/20" />
    <path d={p.line} fill="none" strokeWidth="1.8" className="stroke-accent" />
    <line x1={p.left} x2={p.right} y1={p.baseline} y2={p.baseline} className="stroke-rule" />
    <line x1={p.markerX} x2={p.markerX} y1={p.top} y2={p.baseline} data-testid="reference-score-marker"
      data-score={score} strokeWidth="1.5" className="stroke-accent" />
    <circle cx={p.markerX} cy={p.markerY} r="3.5" strokeWidth="1.5" className="fill-paper-raised stroke-accent" />
    <line x1={p.meanX} x2={p.meanX} y1={p.baseline} y2={p.baseline + 5} className="stroke-ink-soft" />
    <g className="fill-muted" fontSize="10"><text x={p.left} y="138">1</text><text x={p.right} y="138" textAnchor="end">10</text>
      <text x={p.meanX} y="138" textAnchor="middle">均值 {curve.mean.toFixed(1)}</text></g>
  </svg>;
}

export function HarmonyRadar({ axes }: { axes: HarmonyAxis[] }) {
  const complete = axes.every(a => a.value !== null);
  return <section data-testid="harmony-radar" aria-label="几何协调度" className="mx-auto w-full max-w-[420px]">
    <h3 className="text-[14px] font-medium">几何协调度 <span className="ml-1 text-[11px] font-normal text-muted">/100</span></h3>
    <svg viewBox="0 0 360 310" role="img" aria-label={axes.map(a => `${a.label} ${a.value ?? "未测得"}`).join("，")} className="block w-full">
      {[22, 44, 66, 88].map(r => <polygon key={r} points={axes.map((_, i) => { const p = radarPoint(i, axes.length, r); return `${p.x},${p.y}`; }).join(" ")}
        fill="none" className="stroke-rule" strokeWidth="0.8" />)}
      {axes.map((a, i) => { const p = radarPoint(i, axes.length, 88); return <line key={a.id} x1="180" y1="150" x2={p.x} y2={p.y} className="stroke-rule" strokeWidth="0.8" />; })}
      {complete && <polygon data-testid="harmony-polygon" points={radarPolygon(axes)} strokeWidth="1.6" className="fill-accent/20 stroke-accent" />}
      {axes.map((a, i) => { const p = radarPoint(i, axes.length, 119), dot = radarPoint(i, axes.length, 88 * (a.value ?? 0) / 100);
        return <g key={a.id} data-axis={a.id} data-value={a.value ?? "missing"}>
          {a.value !== null && <circle cx={dot.x} cy={dot.y} r="2.5" className="fill-accent" />}
          <text x={p.x} y={p.y - 3} textAnchor="middle" fontSize="11" className="fill-ink-soft">{a.label}</text>
          <text x={p.x} y={p.y + 12} textAnchor="middle" fontSize="12" className="fill-ink">{a.value ?? "—"}</text>
        </g>;
      })}
    </svg>
  </section>;
}
