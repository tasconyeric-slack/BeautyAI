import type { HarmonyAxis } from "@/lib/adapters";
import { densityPaths, type Density } from "./score-chart-geometry";

export function ReferenceDensity({ curve, score, scoreLabel = "颜值分" }: { curve: Density; score: number; scoreLabel?: string }) {
  const p = densityPaths(curve, score);
  return <svg viewBox="0 0 320 150" role="img" aria-label={`参考分布；当前${scoreLabel} ${score}`}
    data-testid="reference-density" className="mx-auto block w-full max-w-[230px] overflow-visible">
    <path d={p.rightArea} data-testid="reference-density-tail" className="fill-accent/10" />
    <path d={p.line} fill="none" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="stroke-accent" />
    <line x1={p.left} x2={p.right} y1={p.baseline} y2={p.baseline} strokeWidth="0.8" className="stroke-rule" />
    <line x1={p.markerX} x2={p.markerX} y1={p.top} y2={p.baseline} data-testid="reference-score-marker"
      data-score={score} strokeWidth="1.2" strokeDasharray="3 4" className="stroke-accent/70" />
  </svg>;
}

export function HarmonyRadar({ axes }: { axes: HarmonyAxis[] }) {
  const complete = axes.every(a => a.value !== null);
  const point = (i: number, radius: number) => {
    const angle = -Math.PI / 2 + i * 2 * Math.PI / axes.length;
    return { x: 120 + radius * Math.cos(angle), y: 112 + radius * Math.sin(angle) };
  };
  const ring = (r: number) => axes.map((_, i) => { const p = point(i, r); return `${p.x},${p.y}`; }).join(" ");
  const names: Record<string, string> = { eyes: "眼部", brows: "眉部", nose: "鼻部", mouth: "口部", jaw: "轮廓", thirds: "三庭", fifths: "五眼", golden_ratio: "长宽" };
  return <section data-testid="harmony-radar" aria-label="几何协调度" className="mx-auto w-full max-w-[210px]">
    <h3 className="text-center text-[12px] font-medium tracking-wide text-ink-soft">几何协调度</h3>
    <svg viewBox="0 0 240 224" role="img" aria-label={axes.map(a => `${a.label} ${a.value ?? "未测得"}`).join("，")} className="mt-2 block w-full">
      {[18, 36, 54, 72].map(r => <polygon key={r} points={ring(r)} fill={r === 72 ? "var(--accent-soft)" : "none"}
        className={r === 72 ? "stroke-accent/40" : "stroke-rule"} strokeWidth={r === 72 ? 1.2 : 0.7} />)}
      {axes.map((a, i) => { const p = point(i, 72); return <line key={a.id} x1="120" y1="112" x2={p.x} y2={p.y} className="stroke-rule" strokeWidth="0.7" />; })}
      {complete && <polygon data-testid="harmony-polygon" points={axes.map((a, i) => { const p = point(i, 72 * a.value! / 100); return `${p.x},${p.y}`; }).join(" ")}
        strokeWidth="1.8" strokeLinejoin="round" className="fill-accent/20 stroke-accent" />}
      {axes.map((a, i) => { const p = point(i, 94), dot = point(i, 72 * (a.value ?? 0) / 100);
        return <g key={a.id} data-axis={a.id} data-value={a.value ?? "missing"}>
          {a.value !== null && <circle cx={dot.x} cy={dot.y} r="2.5" className="fill-paper-raised stroke-accent" strokeWidth="1.2" />}
          <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize="11" className="fill-ink-soft">{names[a.id] ?? a.label}</text>
        </g>;
      })}
    </svg>
  </section>;
}
