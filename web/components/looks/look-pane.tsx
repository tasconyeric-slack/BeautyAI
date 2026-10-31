"use client";

import { Loader2 } from "lucide-react";
import { Stage } from "@/components/ds";
import { cn } from "@/lib/utils";
import type { LayerNote } from "./diff";
import type { LookRender } from "./use-look-render";

const STATE_ZH = { generated: "AI 生成", local: "本地模拟", unavailable: "未画出" } as const;

/** One picture in the comparison: the original, or a saved look drawn on the same photo. */
export function LookPane({ slot, title, render, front, expired, notes, swatches, selected }: {
  slot: "原图" | "A" | "B";
  title: string;
  /** Undefined for the original: it is just the photo. */
  render?: LookRender;
  front: string | null;
  expired: boolean;
  notes?: readonly LayerNote[];
  swatches?: { label: string; hex: string }[];
  selected?: boolean;
}) {
  const status = render?.status;
  const showCanvas = render && status === "ready";
  const src = render ? render.fallbackSrc : front;
  return (
    <figure data-testid={`pane-${slot}`} data-selected={selected ? "yes" : "no"}
      className={cn("rounded-[4px] border bg-paper-raised p-3", selected ? "border-accent ring-2 ring-accent/30" : "border-rule")}>
      <Stage className="relative overflow-hidden rounded-[4px]">
        <div className="relative aspect-[4/5] w-full">
          {showCanvas ? <canvas ref={render.canvas} className="absolute inset-0 size-full object-cover" role="img" aria-label={`${title}：${render.label}`} data-testid={`canvas-${slot}`} />
            : expired ? <Placeholder>照片已按隐私规则在 24 小时后删除，无法显示画面。可以重新上传一张再比较。</Placeholder>
            : src && (!render || status === "plain") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={src} alt={title} className="absolute inset-0 size-full object-cover" />
            ) : status === "loading" || (!render && !src) ? <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="size-5 animate-spin text-stage-muted" /></div>
            : <Placeholder>暂时读不到照片，下方仍可比较设置。</Placeholder>}
          <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2.5 py-1 text-[12px] font-medium text-white">{slot === "原图" ? "原图" : `造型 ${slot}`}</span>
        </div>
      </Stage>
      <figcaption className="px-1 pb-1 pt-2.5">
        <p className="truncate text-[13px] font-medium" title={title}>{title}</p>
        <p className="mt-0.5 text-[12px] text-ink-soft" data-testid={`label-${slot}`}>{render ? render.label : "没有任何修改"}</p>
        {swatches && swatches.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="配色">
            {swatches.map((s) => (
              <li key={s.label} title={s.label} className="size-5 rounded-full border border-black/10" style={{ background: s.hex }}><span className="sr-only">{s.label}</span></li>
            ))}
          </ul>
        )}
        {notes && notes.length > 0 && (
          <ul className="mt-2 space-y-1 text-[12px] leading-5" data-testid={`notes-${slot}`}>
            {notes.map((n) => (
              <li key={n.key} className={n.state === "unavailable" ? "text-[#8A5A2E]" : "text-ink-soft"}>
                <span className="font-medium">{n.label}</span> · {STATE_ZH[n.state]}{n.state === "unavailable" && n.detail ? `：${n.detail}` : ""}
              </li>
            ))}
          </ul>
        )}
      </figcaption>
    </figure>
  );
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return <div className="absolute inset-0 flex items-center justify-center p-5 text-center text-[12px] leading-6 text-stage-muted">{children}</div>;
}
