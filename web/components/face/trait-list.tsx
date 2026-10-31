import Link from "next/link";
import type { Trait } from "./face-model";

/** A feature description with its evidence and "所以 →" links to the recommendation pages it informs. */
export function TraitCard({ t, compact }: { t: Trait; compact?: boolean }) {
  return (
    <li className="rounded-[4px] border border-rule bg-paper-raised px-4 py-3.5" data-trait={t.key}>
      <h3 className={compact ? "text-[14px] font-medium" : "font-serif text-[17px] font-semibold"}>{t.title}</h3>
      {t.text && <p className="mt-1 text-[14px] leading-7 text-ink-soft">{t.text}</p>}
      {!compact && t.evidence.length > 0 && (
        <ul className="mt-2 space-y-1 border-l-2 border-amber-soft pl-3 text-[12.5px] leading-6 text-muted">
          {t.evidence.map((e) => <li key={e}>{e}</li>)}
        </ul>
      )}
      <div className="mt-2 flex flex-col gap-1">
        {t.so.map((s) => (
          <Link key={s.href + s.label} href={s.href}
            className="group inline-flex min-h-8 items-baseline gap-1.5 text-[13.5px] text-accent underline-offset-4 hover:underline">
            <span className="shrink-0 font-medium">所以 →</span>
            <span className="shrink-0">{s.label}</span>
            {s.detail && <span className="line-clamp-1 text-ink-soft">· {s.detail}</span>}
          </Link>
        ))}
      </div>
    </li>
  );
}
