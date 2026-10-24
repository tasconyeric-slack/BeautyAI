"use client";

import { Card } from "@/components/passport/ui";
import { SLOT_LABEL, boardChecklist, boardName, type Board } from "@/lib/outfit";
import { ShareActions } from "./share-actions";
import { Swatch } from "./piece-row";

/** After "我穿这套": the getting-dressed checklist (tick as you go) and the same list as copyable text. */
export function DecisionCard({ board, owned, dressed, onDressed, onClear }: {
  board: Board; owned: Readonly<Record<string, boolean>>; dressed: Readonly<Record<string, boolean>>;
  onDressed: (key: string, v: boolean) => void; onClear: () => void;
}) {
  const text = boardChecklist(board, owned);
  const done = board.pieces.filter((p) => dressed[p.key]).length;
  return (
    <section data-testid="outfit-decision"><Card className="border-accent">
      <p className="text-[12px] text-accent">我的选择</p>
      <h3 className="font-serif text-[18px] leading-7">{boardName(board)}</h3>
      <p className="mt-1 text-[12px] text-muted">穿搭清单：按顺序勾，已勾 {done}/{board.pieces.length}</p>
      <ol className="mt-2 divide-y divide-rule">
        {board.pieces.map((p) => (
          <li key={p.key} className="py-1">
            <label className="flex min-h-10 cursor-pointer items-center gap-3 text-[14px]">
              <input type="checkbox" checked={Boolean(dressed[p.key])} onChange={(e) => onDressed(p.key, e.target.checked)} className="size-4 accent-[var(--ap-primary)]" />
              <Swatch hex={p.hex} className="size-5" />
              <span className="min-w-0 flex-1"><span className="text-[12px] text-muted">{SLOT_LABEL[p.slot]} · </span>{p.origin === "generic" && !p.search ? p.name : `${p.colorName ?? ""}${p.name}`}
                {p.garmentId && <span className="ml-1 text-[12px] text-muted">{owned[p.key] ? "已有" : "待找"}</span>}</span>
            </label>
          </li>
        ))}
      </ol>
      <pre data-testid="decision-text" className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-xl bg-paper-sunk p-3 text-[12px] leading-5 text-ink-soft">{text}</pre>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <ShareActions text={text} title={`${board.label}穿搭清单`} testId="decision" />
        <button type="button" onClick={onClear} className="text-[13px] text-muted underline-offset-4 hover:underline">换一套</button>
      </div>
    </Card></section>
  );
}
