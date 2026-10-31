"use client";

import { Check } from "lucide-react";
import { Card } from "@/components/passport/ui";
import { missingFor, type Board } from "@/lib/outfit";
import { cn } from "@/lib/utils";
import { Swatch } from "./piece-row";
import { PieceRow } from "./piece-row";

const KIND: Record<string, string> = { favor: "你的推荐色", neutral: "你的百搭底色", other: "报告未列入色板" };

export function BoardCard({ board, owned, chosen, onChoose, onOwned }: {
  board: Board; owned: Readonly<Record<string, boolean>>; chosen: boolean; onChoose: () => void; onOwned: (key: string, v: boolean) => void;
}) {
  const missing = missingFor(board, owned).length;
  return (
    <li><Card className={cn("h-full", chosen && "border-accent")}>
      <article data-testid={`board-${board.key}`} aria-label={`${board.label}搭配板`}>
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[12px] text-muted">{board.title === board.label ? "场合" : board.label}</p>
          <p data-testid={`board-${board.key}-gap`} className="text-[12px] text-ink-soft">{missing === 0 ? "核心单品你都有" : `还差 ${missing} 件`}</p>
        </div>
        <h3 className="font-serif text-[18px] leading-7">{board.title}</h3>
        {board.lookText && <p className="mt-1 text-[12px] leading-5 text-muted">报告原文：{board.lookText}</p>}
        <ul className="mt-2 divide-y divide-rule">{board.pieces.map((p) => <PieceRow key={p.key} piece={p} owned={Boolean(owned[p.key])} onOwned={(v) => onOwned(p.key, v)} />)}</ul>
        {board.palette.length > 0 && (
          <div className="mt-2 rounded-[4px] bg-paper-sunk px-3 py-2">
            <p className="text-[12px] text-muted">近脸色板</p>
            <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">{board.palette.map((c) => (
              <li key={c.hex} className="flex items-center gap-1.5 text-[12px]"><Swatch hex={c.hex} className="size-5" />{c.name}<span className="text-muted">· {KIND[c.kind]}</span></li>
            ))}</ul>
          </div>
        )}
        <p className="mt-2 text-[13px] leading-6 text-ink-soft"><span className="text-muted">{board.why.from === "report" ? "为什么适合你（来自报告）" : "为什么这样搭（按你的色板拼成，不是报告原话）"}：</span>{board.why.text}</p>
        {board.notes.length > 0 && <p className="mt-1 text-[12px] leading-5 text-muted">报告里的其他提示：{board.notes.join("；")}</p>}
        {board.caveats.length > 0 && <ul className="mt-1 space-y-0.5 text-[12px] leading-5 text-muted">{board.caveats.map((c) => <li key={c}>· {c}</li>)}</ul>}
        <button type="button" aria-pressed={chosen} onClick={onChoose} data-testid={`choose-${board.key}`}
          className={cn("mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-[13px]", chosen ? "border-accent bg-accent text-[var(--ap-on-primary)]" : "border-rule-strong text-accent")}>
          {chosen && <Check className="size-3.5" />}{chosen ? "我穿这套" : "选这套"}
        </button>
      </article>
    </Card></li>
  );
}
