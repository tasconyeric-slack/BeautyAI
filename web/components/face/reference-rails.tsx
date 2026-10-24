import { Card, Section } from "@/components/passport/ui";
import type { RatioRailView, RatiosView } from "@/lib/adapters";
import { referenceRank as copy } from "@/lib/copy/zh";

/** Ratio rails (Issue #41): where a proportion sits among published reference scans. A size position — never a score:
 * the track has no "good" end, and only ratios whose landmark definition was verified are drawn. */
export function ReferenceRails({ v }: { v: RatiosView }) {
  return (
    <div data-testid="reference-ratios">
      <Section title={v.title} kicker={copy.ratiosTitle}>
        <Card>
          {v.rails.length > 0 && (
            <ul className="space-y-5" data-testid="reference-rails">
              {v.rails.map((r) => <Rail key={r.id} r={r} />)}
            </ul>
          )}
          {v.unverifiedNote && <p className="mt-4 text-[12px] leading-5 text-muted" data-testid="reference-unverified">{v.unverifiedNote}</p>}
          <details className="mt-3 text-[12px] leading-5 text-muted">
            <summary className="cursor-pointer text-ink-soft">{copy.sourceToggle}</summary>
            <p className="mt-1">{v.note}</p>
            <p className="mt-1">{copy.source}：<a href={v.sourceUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">{v.attribution}</a></p>
          </details>
        </Card>
      </Section>
    </div>
  );
}

function Rail({ r }: { r: RatioRailView }) {
  const [lo, mid, hi] = copy.bandScale;
  return (
    <li data-testid={`rail-${r.id}`}>
      <div className="flex items-baseline justify-between gap-3 text-[14px]">
        <span className="font-medium">{r.name}</span>
        <span className="text-[13px] text-ink-soft"><span className="tnum font-serif text-[16px] text-ink">{r.value}</span> · {r.band}</span>
      </div>
      <div className="relative mt-2 h-1.5 rounded-full bg-paper-sunk" aria-hidden>
        <span className="absolute inset-y-0 left-[25%] right-[25%] bg-rule-strong/60" />
        <span className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-paper-raised bg-ink"
          style={{ left: `${Math.min(97, Math.max(3, r.pct))}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted" aria-hidden>
        <span>{lo} · p5 {r.p5}</span><span>{mid} · p50 {r.p50}</span><span>{hi} · p95 {r.p95}</span>
      </div>
      <p className="mt-1 text-[12px] leading-5 text-ink-soft">{r.text}</p>
    </li>
  );
}
