// Small, typographic data displays: provenance chips, confidence dots, meters, bipolar bars.
import * as React from "react";
import { cn } from "@/lib/utils";

export type Provenance = "cv" | "model" | "rules" | "user";

const PROV: Record<Provenance, { zh: string; title: string; cls: string }> = {
  cv: { zh: "测量", title: "由图像测量（MediaPipe / OpenCV）得到", cls: "text-prov-cv bg-prov-cv-bg border-prov-cv/30" },
  model: { zh: "模型", title: "由视觉模型根据照片判断", cls: "text-prov-model bg-prov-model-bg border-prov-model/30" },
  rules: { zh: "规则", title: "由公开的规则层计算", cls: "text-prov-rules bg-prov-rules-bg border-prov-rules/30" },
  user: { zh: "自选", title: "由你自己选择", cls: "text-ink-soft bg-paper-sunk border-rule-strong" },
};

/** The single most important design element: every value says where it came from. */
export function ProvChip({ kind, className }: { kind: Provenance; className?: string }) {
  const p = PROV[kind];
  return (
    <span
      title={p.title}
      className={cn(
        "inline-flex h-[18px] shrink-0 items-center rounded-[2px] border px-1 text-[10.5px] font-medium leading-none tracking-wide",
        p.cls,
        className,
      )}
    >
      {p.zh}
    </span>
  );
}

export function ConfidenceDots({ value, className, label = true }: { value: number; className?: string; label?: boolean }) {
  const n = Math.max(0, Math.min(5, Math.round(value * 5)));
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)} title={`置信度 ${Math.round(value * 100)}%`}>
      <span className="inline-flex gap-[3px]" aria-hidden>
        {Array.from({ length: 5 }, (_, i) => (
          <span
            key={i}
            className={cn("size-[7px] rounded-full border", i < n ? "border-accent bg-accent" : "border-rule-strong bg-transparent")}
          />
        ))}
      </span>
      {label && <span className="tnum text-[11px] text-muted">{Math.round(value * 100)}%</span>}
      <span className="sr-only">置信度 {Math.round(value * 100)}%</span>
    </span>
  );
}

/** 1–5 mini meter (impact / effort). */
export function Meter({ value, max = 5, label, invert = false }: { value: number; max?: number; label: string; invert?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5" title={`${label} ${value}/${max}`}>
      <span className="text-[11px] text-muted">{label}</span>
      <span className="inline-flex gap-[2px]" aria-hidden>
        {Array.from({ length: max }, (_, i) => (
          <span key={i} className={cn("h-[9px] w-[5px]", i < value ? (invert ? "bg-warn/70" : "bg-ink") : "bg-rule")} />
        ))}
      </span>
      <span className="sr-only">
        {label} {value}/{max}
      </span>
    </span>
  );
}

/** Centred track with a marker and the two pole labels. `value` in [min, max]. */
export function BipolarBar({
  value,
  min = -2,
  max = 2,
  low,
  high,
  confidence,
}: {
  value: number;
  min?: number;
  max?: number;
  low: string;
  high: string;
  confidence?: number;
}) {
  const t = (value - min) / (max - min);
  const pos = `${Math.max(0, Math.min(1, t)) * 100}%`;
  const centre = 50;
  const left = Math.min(centre, t * 100);
  const width = Math.abs(t * 100 - centre);
  return (
    <div className="w-full">
      <div className="relative h-5">
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-rule-strong" />
        <div className="absolute left-1/2 top-1/2 h-2.5 w-px -translate-y-1/2 bg-rule-strong" />
        <div className="absolute top-1/2 h-[3px] -translate-y-1/2 bg-accent/35" style={{ left: `${left}%`, width: `${width}%` }} />
        <div
          className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-paper bg-accent shadow-[0_0_0_1px_var(--accent)]"
          style={{ left: pos, opacity: confidence === undefined ? 1 : 0.45 + confidence * 0.55 }}
        />
      </div>
      <div className="flex justify-between text-[11px] text-muted">
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </div>
  );
}

/** Ordinal scale with labelled stops (color axes). */
export function OrdinalScale({ stops, value, confidence }: { stops: { key: string; label: string }[]; value: string; confidence?: number }) {
  const idx = stops.findIndex((s) => s.key === value);
  return (
    <div className="w-full">
      <div className="flex gap-[3px]">
        {stops.map((s, i) => (
          <div
            key={s.key}
            className={cn("h-1.5 flex-1", i === idx ? "bg-accent" : "bg-rule")}
            style={i === idx && confidence !== undefined ? { opacity: 0.45 + confidence * 0.55 } : undefined}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted">
        <span>{stops[0]?.label}</span>
        <span className="font-medium text-ink">{stops[idx]?.label ?? value}</span>
        <span>{stops[stops.length - 1]?.label}</span>
      </div>
    </div>
  );
}

export function Swatch({ hex, size = "md", title }: { hex: string; size?: "sm" | "md"; title?: string }) {
  return (
    <span
      title={title ?? hex}
      className={cn("inline-block shrink-0 rounded-[2px] border border-black/10", size === "sm" ? "size-4" : "size-7")}
      style={{ backgroundColor: hex }}
    />
  );
}
