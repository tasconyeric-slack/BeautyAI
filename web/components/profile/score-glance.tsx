import Link from "next/link";
import type { ScoreView } from "@/lib/adapters";
import { aestheticScore as copy } from "@/lib/copy/zh";

/** The overview's one-glance score (Issue #2): the number, framed as a model-based reference from the first line.
 *  The four parts, the cohort position and the method stay in the full <ScoreHero> that this links to. Renders only
 *  what the scoring layer computed — never a placeholder number, never a verdict. */
export const REFERENCE_NOTE = "由照片上的关键点几何计算出的模型参考：只描述这张照片的比例，不评价长相，也不是人群排名。";

export function ScoreGlance({ view, detailHref = "#score", retakeHref, synthetic = false }: {
  view: ScoreView;
  /** Where the four-part breakdown and method live (the full score card on the same page). */
  detailHref?: string;
  retakeHref?: string;
  /** The demo passport: its face is a synthetic average, and the number says so. */
  synthetic?: boolean;
}) {
  const has = view.score != null;
  return (
    <div data-testid="score-glance" data-state={view.state} className="flex items-start gap-4 rounded-[4px] border border-rule bg-paper-raised p-4">
      <Ring value={view.score} />
      <div className="min-w-0">
        <p className="text-[11px] tracking-[0.14em] text-muted">{view.name} · 模型参考</p>
        {synthetic && <p className="mt-0.5 text-[11px] text-muted">{copy.sample}</p>}
        <p className="mt-1 flex flex-wrap items-center gap-1.5 font-serif text-[16px] font-semibold leading-6">
          {has ? view.tier : copy.unavailable}
          {view.state === "limited" && <span className="rounded-full bg-amber/20 px-2 py-0.5 font-sans text-[11px] font-medium text-ink">{copy.limited}</span>}
        </p>
        <p className="mt-1 text-[12.5px] leading-5 text-ink-soft">{has ? REFERENCE_NOTE : copy.retake}</p>
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
          {has && <a href={detailHref} className="text-accent underline-offset-4 hover:underline">{copy.methodToggle}？看四项构成与依据 ↓</a>}
          {!has && retakeHref && <Link href={retakeHref} className="text-accent underline-offset-4 hover:underline">{copy.retakeAction}</Link>}
        </p>
      </div>
    </div>
  );
}

function Ring({ value }: { value: number | null }) {
  const r = 30;
  const len = 2 * Math.PI * r;
  return (
    <div className="relative size-[76px] shrink-0">
      <svg viewBox="0 0 76 76" className="size-full -rotate-90" aria-hidden>
        <circle cx="38" cy="38" r={r} fill="none" strokeWidth="6" className="stroke-rule" />
        {value != null && (
          <circle cx="38" cy="38" r={r} fill="none" strokeWidth="6" strokeLinecap="round" className="stroke-accent"
            strokeDasharray={`${(len * value) / 100} ${len}`} />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {value != null ? (
          <>
            <span className="font-serif text-[26px] font-semibold leading-none tabular-nums" data-testid="glance-value">{value}</span>
            <span className="mt-0.5 text-[10px] text-muted">/ 100</span>
          </>
        ) : <span className="text-[12px] text-muted">—</span>}
      </div>
    </div>
  );
}
