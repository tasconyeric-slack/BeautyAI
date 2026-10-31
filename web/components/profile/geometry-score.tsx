import type { GeometryScoreView } from "@/lib/adapters";
import { geometryScore as copy } from "@/lib/copy/zh";
import { ReferenceDensity } from "./score-charts";

export function GeometryScoreHero({ view }: { view: GeometryScoreView }) {
  return <section data-testid="geometry-score" aria-label={copy.title}
    className="mt-4 rounded-[4px] border border-rule bg-paper-raised p-5">
    <div className="grid grid-cols-2 gap-4">
      <div><h2 className="text-[13px] text-ink-soft">{copy.title}</h2>
        <p data-testid="geometry-score-value" className="mt-3 font-serif text-[34px] tabular-nums">
          {view.score ?? copy.unavailable}{view.score !== null && <small className="ml-1 text-[16px]">/10</small>}
        </p>{view.limited && <p className="text-[12px] text-muted">{copy.limited}</p>}
        <ul className="mt-4 space-y-2 text-[12px]">{view.components.map(c => <li key={c.key}>
          {c.name} · {c.weight}%<span className="float-right">{c.score === null ? "—" : `${c.score} /10`}</span>
        </li>)}</ul>
      </div>
      <div className="border-l border-rule pl-4"><h2 className="text-[13px] text-ink-soft">{copy.rank}</h2>
        <p data-testid="geometry-rank" className="mt-3 font-serif text-[28px]">{view.rank ? `约前 ${view.rank.top_percent}%` : copy.rankMissing}</p>
        {view.rank && <p className="mt-3 text-[11px] text-muted">{view.rank.cohort_label} · {view.rank.n_reference} 张照片。{copy.scope}</p>}
        {view.rank?.distribution && view.score !== null && <div className="mt-4"><ReferenceDensity curve={view.rank.distribution} score={view.score} scoreLabel={copy.title} /></div>}
      </div>
    </div>
    {view.statusText && <p className="mt-3 text-[12px] text-muted">{view.statusText}</p>}
    {view.flags.map(flag => <p key={flag} className="text-[12px] text-muted">{flag}</p>)}
    <p className="mt-4 text-[11px] leading-5 text-muted">{copy.method}</p>
  </section>;
}
