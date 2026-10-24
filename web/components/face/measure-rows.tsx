import { cn } from "@/lib/utils";
import type { Measure } from "./face-model";

const pos = (v: number, [lo, hi]: [number, number]) => `${Math.min(100, Math.max(0, ((v - lo) / (hi - lo)) * 100))}%`;

/** One measurement: mono number + a grey "常见范围" band with the user's position as a thin amber tick. */
export function MeasureRow({ m }: { m: Measure }) {
  const aria = m.value == null ? `${m.label}：${m.display}` : `${m.label} ${m.display}，常见范围 ${m.bandText}`;
  return (
    <li className="py-3" data-measure={m.key}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[14px]">
          {m.label}
          {m.note && <span className="ml-2 text-[12px] text-muted">{m.note}</span>}
        </span>
        <span className={cn("tnum shrink-0 text-[15px]", m.value == null && "text-[13px] text-muted")}>{m.display}</span>
      </div>
      <div role="img" aria-label={aria} className="relative mt-2 h-3">
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-rule" />
        <div className="absolute top-0 h-full rounded-[2px] bg-paper-sunk"
          style={{ left: pos(m.band[0], m.domain), width: `calc(${pos(m.band[1], m.domain)} - ${pos(m.band[0], m.domain)})` }} />
        {m.value != null && (
          <div className="absolute -top-0.5 h-4 w-[2px] -translate-x-1/2 rounded-full bg-amber" style={{ left: pos(m.value, m.domain) }} />
        )}
      </div>
      <p className="tnum mt-1 text-[11px] text-muted">常见范围 {m.bandText}</p>
    </li>
  );
}

export function MeasureList({ items }: { items: Measure[] }) {
  return <ul className="divide-y divide-rule">{items.map((m) => <MeasureRow key={m.key} m={m} />)}</ul>;
}
