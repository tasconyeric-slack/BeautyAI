import { ArrowUpRight, Info } from "lucide-react";
import Link from "next/link";
import type { LearnedScoreView, RankView, ScoreComponentView, ScoreView } from "@/lib/adapters";
import { learnedAttractiveness as learnedCopy } from "@/lib/copy/zh";
import { aestheticScore as copy, referenceRank as rankCopy } from "@/lib/copy/zh";
import { ReferenceDensity } from "./score-charts";

/** AI 面部美学参考分 hero (Issue #31, D36): the number, its four parts, 2 strengths, 1 direction, and the way into the
 * measurement workbench. Renders only what the passport's scoring layer computed — never a placeholder number. */
export function ScoreHero({ view, rank = null, workbenchHref, retakeHref, sample = false, cta }: {
  view: ScoreView;
  /** Reference-cohort position (#41); the server decides whether a rank exists. */
  rank?: RankView | null;
  /** The face workbench (/p/[id]/face) where every line behind the score is drawn. */
  workbenchHref: string | null;
  retakeHref?: string;
  /** Synthetic demo (landing): labeled as such. */
  sample?: boolean;
  /** Override the primary link (landing → open the sample passport). */
  cta?: { href: string; label: string };
}) {
  const hasScore = view.score != null;
  const link = cta ?? (workbenchHref ? { href: workbenchHref, label: copy.workbench } : null);
  return (
    <section aria-label={copy.title} data-testid="score-hero" data-state={view.state}
      className="overflow-hidden rounded-[18px] border border-rule bg-paper-raised">
      <div className="grid gap-6 p-5 sm:p-6 md:grid-cols-[220px_1fr] md:gap-8">
        {/* number */}
        <div className="flex flex-col items-center text-center md:items-start md:text-left">
          <p className="text-[11px] tracking-[0.18em] text-muted">{view.name}</p>
          {sample && <p className="mt-1 text-[11px] text-muted">{copy.sample}</p>}
          {hasScore ? (
            <>
              <Gauge value={view.score as number} />
              {view.tier && <p className="mt-1 font-serif text-[17px] font-semibold">{view.tier}</p>}
            </>
          ) : (
            <div className="mt-4 flex size-[132px] items-center justify-center rounded-full border-[10px] border-rule text-[13px] leading-5 text-muted">
              {copy.notMeasured}
            </div>
          )}
          <p className="mt-2 flex flex-wrap items-center justify-center gap-1.5 text-[12px] leading-5 text-ink-soft md:justify-start">
            {view.state === "limited" && <span className="rounded-full bg-amber/20 px-2 py-0.5 text-[11px] font-medium text-ink">{copy.limited}</span>}
            <span>{view.statusText}</span>
          </p>
          {view.flags.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-[12px] leading-5 text-muted" aria-label="照片条件">
              {view.flags.map((f) => <li key={f}>· {f}</li>)}
            </ul>
          )}
          {rank && hasScore && <RankBox rank={rank} />}
        </div>

        {/* breakdown */}
        <div className="min-w-0">
          {!hasScore && (
            <div className="mb-4 rounded-[12px] bg-paper p-3 text-[13px] leading-6">
              <p className="font-medium">{copy.unavailable}</p>
              <p className="text-ink-soft">{copy.retake}</p>
              {retakeHref && <Link href={retakeHref} className="mt-1 inline-block text-accent underline-offset-4 hover:underline">{copy.retakeAction}</Link>}
            </div>
          )}
          <h3 className="text-[13px] font-medium text-ink-soft">{copy.breakdown}</h3>
          <ul className="mt-2 space-y-3">
            {view.components.map((c) => <ComponentRow key={c.key} c={c} />)}
          </ul>
        </div>
      </div>

      {(view.strengths.length > 0 || view.improvement) && hasScore && (
        <div className="grid gap-4 border-t border-rule p-5 sm:grid-cols-2 sm:p-6">
          <div>
            <h3 className="text-[13px] font-medium text-ink-soft">{copy.strengths}</h3>
            <ul className="mt-2 space-y-2" data-testid="score-strengths">
              {view.strengths.map((s) => (
                <li key={s} className="flex gap-2 text-[13.5px] leading-6"><span className="mt-2.5 h-px w-4 shrink-0 bg-amber" aria-hidden />{s}</li>
              ))}
            </ul>
          </div>
          {view.improvement && (
            <div>
              <h3 className="text-[13px] font-medium text-ink-soft">{copy.improvement} · {view.improvement.component}</h3>
              <p className="mt-2 text-[13.5px] leading-6" data-testid="score-improvement">{view.improvement.text}</p>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule bg-paper px-5 py-3 sm:px-6">
        <details className="min-w-[60%] flex-1 text-[12px] leading-5 text-muted">
          <summary className="inline-flex cursor-pointer items-center gap-1 text-ink-soft"><Info className="size-3.5" />{copy.methodToggle}</summary>
          <p className="mt-1">{copy.method}</p>
          <p className="mt-1">{view.scaleNote}</p>
          <p className="mt-1">{copy.notRank}</p>
          {rank?.state === "ranked" && rank.note && <p className="mt-1">{rank.note}</p>}
          {rank?.cohort && (
            <p className="mt-1">{rankCopy.cohort}：<a href={rank.cohort.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">{rank.cohort.publisher}</a>
              {" "}· {rank.cohort.n.toLocaleString("en-US")} 份自愿扫描 · {rank.cohort.date}</p>
          )}
        </details>
        {link && (
          <Link href={link.href} data-testid="score-cta" className="inline-flex items-center gap-1 rounded-full bg-accent px-4 py-2 text-[13px] font-medium text-[var(--ap-on-primary)]">
            {link.label}<ArrowUpRight className="size-4" />
          </Link>
        )}
      </div>
    </section>
  );
}

function RankBox({ rank }: { rank: RankView }) {
  return (
    <div className="mt-3 w-full rounded-[12px] bg-paper p-3 text-left" data-testid="score-rank" data-state={rank.state}>
      <p className="text-[11px] tracking-[0.12em] text-muted">{rank.title}</p>
      {rank.state === "ranked" ? (
        <>
          <p className="mt-0.5 font-serif text-[16px] font-semibold">
            {rank.label}
            <span className="ml-1.5 rounded-full bg-amber/20 px-1.5 py-0.5 align-middle font-sans text-[10px] font-normal">{rankCopy.approx}</span>
          </p>
          {rank.higherThan && <p className="text-[12px] text-ink-soft">{rank.higherThan}</p>}
        </>
      ) : (
        <p className="mt-0.5 text-[12px] leading-5 text-ink-soft">{rank.reason}</p>
      )}
    </div>
  );
}

function ComponentRow({ c }: { c: ScoreComponentView }) {
  return (
    <li data-testid={`score-part-${c.key}`}>
      <div className="flex items-baseline justify-between gap-3 text-[14px]">
        <span className="font-medium">{c.name}<span className="ml-1.5 text-[11px] font-normal text-muted">{c.weightPct}%</span></span>
        <span className="font-serif text-[17px] tabular-nums">{c.score ?? <span className="text-[12px] text-muted">{copy.notMeasured}</span>}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-rule" aria-hidden>
        <div className="h-full rounded-full bg-accent" style={{ width: `${c.score ?? 0}%` }} />
      </div>
      <p className="mt-1 text-[12px] leading-5 text-muted">{c.about} · {c.detail}</p>
    </li>
  );
}

function Gauge({ value, maximum = 100 }: { value: number; maximum?: number }) {
  const r = 56;
  const len = 2 * Math.PI * r;
  return (
    <div className="relative mt-3 size-[132px]">
      <svg viewBox="0 0 132 132" className="size-full -rotate-90" aria-hidden>
        <circle cx="66" cy="66" r={r} fill="none" strokeWidth="10" className="stroke-rule" />
        <circle cx="66" cy="66" r={r} fill="none" strokeWidth="10" strokeLinecap="round" className="stroke-accent"
          strokeDasharray={`${(len * value) / maximum} ${len}`} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-serif text-[44px] font-semibold leading-none tabular-nums" data-testid="score-value">{value}</span>
        <span className="mt-1 text-[11px] text-muted">/ {maximum}</span>
      </div>
    </div>
  );
}

/** Two user-facing results; calculation provenance stays in the Passport data. */
export function PredictedScoreHero({ view }: { view: LearnedScoreView }) {
  return <section data-testid="learned-score" data-state={view.available ? "available" : "unavailable"}
    aria-label={learnedCopy.title} className="grid grid-cols-2 rounded-[18px] border border-rule bg-paper-raised py-6">
    <div className="min-w-0 px-4 sm:px-6">
      <h2 className="text-[13px] font-medium text-ink-soft">{learnedCopy.title}</h2>
      {view.available ? <p data-testid="score-value" className="mt-3 whitespace-nowrap font-serif text-[40px] font-semibold leading-none tabular-nums sm:text-[48px]">
        {view.score}<span className="ml-1 font-sans text-[16px] font-normal text-muted">/10</span>
      </p> : <p className="mt-3 text-[20px] text-muted">{learnedCopy.unavailable}</p>}
    </div>
    <div className="min-w-0 border-l border-rule px-4 sm:px-6" aria-label={learnedCopy.rankAccessible}>
      <h2 className="text-[13px] font-medium text-ink-soft">{learnedCopy.rank}</h2>
      {view.available && view.rank ? <>
        <p data-testid="learned-rank" className="mt-3 whitespace-nowrap font-serif text-[36px] font-semibold leading-none tabular-nums sm:text-[44px]">
          <span className="mr-1 font-sans text-[16px] font-normal">前 </span>{view.rank.top}%
        </p>
        {!view.rank.distribution && <svg viewBox="0 0 160 20" aria-hidden="true" data-testid="rank-position" data-percentile={view.rank.percentile}
          className="mt-3 h-5 w-full max-w-[220px] overflow-visible">
          <path d="M8 10H152" fill="none" strokeWidth="3" strokeLinecap="round" className="stroke-rule" />
          <path d={`M8 10H${8 + 1.44 * view.rank.percentile!}`} fill="none" strokeWidth="3" strokeLinecap="round" className="stroke-accent/40" />
          <circle cx={8 + 1.44 * view.rank.percentile!} cy="10" r="5" strokeWidth="2" className="fill-paper-raised stroke-accent" />
        </svg>}
      </> : <p data-testid="learned-rank-unavailable" className="mt-3 text-[20px] text-muted">{learnedCopy.rankMissing}</p>}
    </div>
    {view.available && view.rank?.distribution && <div className="col-span-2 mt-4 px-4 sm:px-6">
      <ReferenceDensity curve={view.rank.distribution} score={view.score!} />
    </div>}
  </section>;
}
