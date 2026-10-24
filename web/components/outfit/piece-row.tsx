"use client";

import type * as React from "react";
import { cn } from "@/lib/utils";
import { SLOT_LABEL, type Piece } from "@/lib/outfit";

/** A colour chip; a piece whose colour the passport does not name is hatched, never given an invented colour. */
export function Swatch({ hex, className }: { hex: string | null; className?: string }) {
  return (
    <span aria-hidden className={cn("inline-block size-8 shrink-0 rounded-full border border-black/10", className)}
      style={hex ? { background: hex } : { backgroundImage: "repeating-linear-gradient(45deg, transparent 0 3px, rgba(0,0,0,.12) 3px 4px)" }} />
  );
}

export function originTag(p: Piece, owned: boolean): { text: string; tone: "own" | "suggest" | "muted" } {
  if (owned) return { text: "已有", tone: "own" };
  if (p.origin === "fill") return { text: "补充 · 可选", tone: "muted" };
  if (p.origin === "generic") return { text: p.search ? "未匹配单品库 · 自行搜索" : "自选位", tone: "muted" };
  return { text: p.optional ? "可选" : "建议", tone: "suggest" };
}

export function PieceRow({ piece, owned, onOwned, compact, extra }: { piece: Piece; owned: boolean; onOwned?: (v: boolean) => void; compact?: boolean; extra?: React.ReactNode }) {
  const tag = originTag(piece, owned);
  const slotOnly = piece.origin === "generic" && !piece.search;
  return (
    <li data-testid={`piece-${piece.key}`} data-owned={owned ? "yes" : "no"} className="flex items-start gap-3 py-2">
      <Swatch hex={piece.hex} className={cn(owned ? "ring-2 ring-accent ring-offset-1" : "border-dashed")} />
      <div className="min-w-0 flex-1">
        <p className="text-[12px] text-muted">{SLOT_LABEL[piece.slot]}</p>
        <p className={cn("text-[14px] leading-6", slotOnly && "text-ink-soft")}>{slotOnly ? piece.name : `${piece.colorName ?? ""}${piece.name}`}</p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
          <span className={cn("rounded-full px-2 py-0.5", tag.tone === "own" ? "bg-accent text-[var(--ap-on-primary)]" : tag.tone === "suggest" ? "bg-accent-soft text-accent" : "bg-paper-sunk text-muted")}>{tag.text}</span>
          {piece.disliked && <span className="text-amber">你标记过不喜欢这件</span>}
          {onOwned && piece.garmentId && (
            <label className="inline-flex min-h-8 cursor-pointer items-center gap-1 text-ink-soft">
              <input type="checkbox" checked={owned} onChange={(e) => onOwned(e.target.checked)} className="size-4 accent-[var(--ap-primary)]" />
              我已有
            </label>
          )}
        </div>
        {!compact && piece.why && <p className="mt-0.5 text-[12px] leading-5 text-ink-soft">{piece.why}</p>}
        {piece.issues.map((x) => <p key={x} className="text-[12px] leading-5 text-amber">{x}</p>)}
        {extra}
      </div>
    </li>
  );
}
