"use client";

import Link from "next/link";
import * as React from "react";
import { Locked, Pill } from "@/components/passport/ui";
import { useChoices } from "@/lib/state/choices";
import { cn } from "@/lib/utils";
import {
  CONFIDENCE_ZH, components, display, missingText,
  type InsightView, type MeasureView, type Metric, type PillarView,
} from "./measure-model";

const BAND_TONE: Record<string, "accent" | "amber" | "muted"> = { low: "amber", high: "amber", typical: "muted" };

function SaveToPlan({ id, recId }: { id: string; recId: string }) {
  const { choices, setPlan } = useChoices(id);
  const saved = Boolean(choices.plan[recId]?.saved);
  return (
    <button type="button" onClick={() => setPlan(recId, { saved: !saved })} aria-pressed={saved}
      className={cn("min-h-11 shrink-0 rounded-full border px-3 text-[12.5px] transition-colors",
        saved ? "border-accent bg-accent-soft text-accent" : "border-rule-strong text-ink-soft hover:bg-paper-sunk")}>
      {saved ? "已加入行动方案" : "加入行动方案"}
    </button>
  );
}

/** 看到的 → 意味着 → 所以建议, each advice linked to its page and (when the model proposed one) its recommendation. */
export function EvidenceCard({ id, v, metric, onShow, compact }: {
  id: string; v: InsightView; metric?: Metric; onShow?: (metricId: string) => void; compact?: boolean;
}) {
  return (
    <article className={cn("rounded-[4px] border border-rule bg-paper-raised", compact ? "p-3" : "p-4")} data-insight={v.metricId}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-serif text-[16px] font-semibold">{v.label}</h3>
        <Pill tone={BAND_TONE[v.band]}>{v.band === "typical" ? "常见范围内" : "较有特点"}</Pill>
        <span className="text-[11.5px] text-muted">{CONFIDENCE_ZH[v.confidence]}</span>
      </div>
      <dl className="mt-2 space-y-1.5 text-[13.5px] leading-6">
        <div className="flex gap-2">
          <dt className="w-[4.5em] shrink-0 text-muted">看到的</dt>
          <dd>
            {v.seen}
            {metric && onShow && (
              <button type="button" onClick={() => onShow(metric.id)}
                className="ml-2 text-[12.5px] text-accent underline-offset-4 hover:underline">在照片上看</button>
            )}
          </dd>
        </div>
        <div className="flex gap-2"><dt className="w-[4.5em] shrink-0 text-muted">意味着</dt><dd className="text-ink-soft">{v.means}</dd></div>
        {v.advice.length > 0 && (
          <div className="flex gap-2">
            <dt className="w-[4.5em] shrink-0 text-muted">所以建议</dt>
            <dd className="min-w-0 flex-1">
              <ul className="space-y-2">
                {v.advice.map((a, i) => (
                  <li key={i}>
                    <p>{a.text}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]">
                      <Link href={a.href} className="text-accent underline-offset-4 hover:underline">去看{a.label}建议 →</Link>
                      {a.recAction && <span className="text-muted">相关：{a.recAction}</span>}
                    </p>
                    {a.recId && <div className="mt-1"><SaveToPlan id={id} recId={a.recId} /></div>}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        )}
      </dl>
    </article>
  );
}

export function PriorityList({ items }: { items: MeasureView["priorities"] }) {
  if (!items.length) return null;
  return (
    <ol className="space-y-2" aria-label="优先改善方向">
      {items.map((r, i) => (
        <li key={r.id}>
          <Link href={r.href} className="flex items-start gap-3 rounded-[4px] border border-rule bg-paper-raised p-3 hover:bg-paper-sunk">
            <span className="tnum mt-0.5 font-serif text-[18px] text-accent">{i + 1}</span>
            <span className="min-w-0">
              <span className="block text-[12px] text-muted">{r.category}</span>
              <span className="block text-[14px] leading-6">{r.action}</span>
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}

export function PillarGrid({ pillars, onShow }: { pillars: PillarView[]; onShow: (metricId: string) => void }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2" aria-label="四个观察维度">
      {pillars.map((p) => (
        <li key={p.key} className="rounded-[4px] border border-rule bg-paper-raised p-4" data-pillar={p.key}>
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="font-serif text-[16px] font-semibold">{p.name}</h3>
            <span className="tnum text-[12px] text-muted">已测 {p.measured} / {p.total} 项</span>
          </div>
          <p className="mt-1.5 text-[13.5px] leading-6">{p.summary}</p>
          {p.notable.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {p.notable.map((n) => (
                <button key={n.id} type="button" onClick={() => onShow(n.id)}
                  className="rounded-full bg-amber-soft px-2.5 py-0.5 text-[12px] text-amber hover:underline">{n.label}</button>
              ))}
            </div>
          )}
          <p className="mt-2 text-[12px] leading-5 text-muted">{p.about}</p>
        </li>
      ))}
    </ul>
  );
}

function MetricRow({ v, m, id, selected, onSelect }: {
  v: MeasureView; m: Metric; id: string; selected: boolean; onSelect: (metricId: string) => void;
}) {
  const measured = m.availability === "measured";
  const insight = v.insights[m.id];
  const comps = components(m);
  return (
    <li data-metric={m.id} className={cn("rounded-[4px]", selected && "bg-paper-sunk")}>
      <button type="button" onClick={() => onSelect(m.id)} aria-pressed={selected} aria-expanded={selected}
        className="flex min-h-12 w-full items-center gap-3 rounded-[4px] px-3 py-2 text-left focus-visible:outline-2 focus-visible:outline-[var(--ap-primary)]">
        <span className="min-w-0 flex-1">
          <span className="block text-[14px]">{m.name_zh}</span>
          {insight && <span className="block text-[12px] text-muted">{insight.label}</span>}
        </span>
        <span className={cn("tnum shrink-0 text-right", measured ? "text-[15px]" : "text-[12.5px] text-muted")}>
          {measured ? display(m) : m.availability === "needs_photo" ? "需侧脸照" : "未测量"}
        </span>
      </button>
      {selected && (
        <div className="px-3 pb-3 text-[13px] leading-6">
          <p className="text-ink-soft">{m.definition_zh}</p>
          {measured ? (
            <p className="mt-1 flex flex-wrap gap-x-3 text-[12.5px] text-muted">
              <span>{CONFIDENCE_ZH[m.confidence ?? "low"]}</span>
              {comps.map((c) => <span key={c.label} className="tnum">{c.label} {c.value}</span>)}
            </p>
          ) : (
            <p className="mt-1 rounded-[8px] bg-paper-raised px-2.5 py-1.5 text-[12.5px] text-ink-soft" data-missing={m.missing_reason ?? ""}>
              {missingText(v.profile, m)}
            </p>
          )}
          {insight && <div className="mt-2"><EvidenceCard id={id} v={insight} compact /></div>}
        </div>
      )}
    </li>
  );
}

/** Group tabs + metric list. Selecting a row draws that metric on the photo (the stage owns the drawing). */
export function Workbench({ v, id, selected, onSelect, group, onGroup }: {
  v: MeasureView; id: string; selected: string | null; onSelect: (metricId: string) => void;
  group: string; onGroup: (g: string) => void;
}) {
  const active = v.groups.find((g) => g.key === group) ?? v.groups[0];
  return (
    <div>
      <div role="tablist" aria-label="测量分组" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible">
        {v.groups.map((g) => {
          const n = g.metrics.filter((m) => m.availability === "measured").length;
          return (
            <button key={g.key} type="button" role="tab" aria-selected={g.key === active.key} onClick={() => onGroup(g.key)}
              className={cn("min-h-11 shrink-0 rounded-full border px-3 text-[13px] transition-colors",
                g.key === active.key ? "border-stage bg-stage text-stage-ink" : "border-rule text-ink-soft hover:bg-paper-sunk")}>
              {g.name}<span className="tnum ml-1 text-[11px] opacity-70">{n}</span>
            </button>
          );
        })}
      </div>
      <ul role="tabpanel" aria-label={active.name} className="mt-2 divide-y divide-rule rounded-[4px] border border-rule bg-paper-raised p-1">
        {active.metrics.map((m) => <MetricRow key={m.id} v={v} m={m} id={id} selected={selected === m.id} onSelect={onSelect} />)}
      </ul>
      {active.key === "profile" && (
        <p className="mt-2 text-[12.5px] leading-6 text-muted">侧脸项目（E 线、鼻唇角等）只能在标准 90° 侧脸照上测量，不会用正脸推算。侧脸测量将在后续版本开放。</p>
      )}
      {v.lockedCount > 0 && (
        <Locked what={`另外 ${v.lockedCount} 项明细测量`}
          bullets={["全部可测的明细指标与照片标注", "每项的左右分值与可信度说明", "发型 AI 试看与完整行动计划"]} />
      )}
    </div>
  );
}
