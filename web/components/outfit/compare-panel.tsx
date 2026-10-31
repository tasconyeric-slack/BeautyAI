"use client";

import { Card } from "@/components/passport/ui";
import { SLOT_LABEL, SLOT_ORDER, boardName, missingFor, type Board, type Context, type Piece } from "@/lib/outfit";
import { Swatch } from "./piece-row";

const text = (p: Piece | undefined) => (p ? `${p.colorName ?? ""}${p.name}` : "—");

export function ComparePanel({ boards, pair, owned, chosen, onPair, onChoose }: {
  boards: readonly Board[]; pair: [Context, Context]; owned: Readonly<Record<string, boolean>>; chosen: Context | null;
  onPair: (p: [Context, Context]) => void; onChoose: (c: Context) => void;
}) {
  const a = boards.find((b) => b.key === pair[0]) ?? boards[0]!;
  const b = boards.find((x) => x.key === pair[1]) ?? boards.find((x) => x !== a) ?? boards[1]!;
  const slots = SLOT_ORDER.filter((s) => a.pieces.some((p) => p.slot === s) || b.pieces.some((p) => p.slot === s));
  const pa = (s: string) => a.pieces.find((p) => p.slot === s);
  const pb = (s: string) => b.pieces.find((p) => p.slot === s);
  const shared = a.pieces.filter((p) => p.garmentId && b.pieces.some((q) => q.key === p.key));
  const need = (x: Board) => missingFor(x, owned).length;
  const select = (which: 0 | 1, v: string) => {
    const next: [Context, Context] = which === 0 ? [v as Context, pair[1]] : [pair[0], v as Context];
    if (next[0] === next[1]) next[which === 0 ? 1 : 0] = boards.find((x) => x.key !== v)!.key;
    onPair(next);
  };
  return (
    <section data-testid="outfit-compare"><Card>
      <div className="grid grid-cols-2 gap-2">
        {([a, b] as const).map((x, i) => (
          <label key={i} className="text-[12px] text-muted">{i === 0 ? "A" : "B"}
            <select aria-label={i === 0 ? "对比 A" : "对比 B"} value={x.key} onChange={(e) => select(i as 0 | 1, e.target.value)}
              className="mt-1 block min-h-11 w-full rounded-[4px] border border-rule-strong bg-paper px-2 text-[14px] text-ink">
              {boards.map((o) => <option key={o.key} value={o.key}>{boardName(o)}</option>)}
            </select>
          </label>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-[2.5rem_1fr_1fr] gap-x-2 gap-y-2 text-[13px] leading-5" role="table" aria-label="两套搭配对比">
        {slots.map((s) => {
          const x = pa(s); const y = pb(s);
          const same = Boolean(x && y && x.key === y.key && x.garmentId);
          return (
            <div key={s} role="row" className="contents">
              <span role="rowheader" className="pt-1 text-[12px] text-muted">{SLOT_LABEL[s]}</span>
              {[x, y].map((p, i) => (
                <span key={i} role="cell" className="flex items-start gap-1.5">
                  {p && <Swatch hex={p.hex} className="mt-0.5 size-4" />}
                  <span>{text(p)}{same && <span className="ml-1 text-[11px] text-accent">共用</span>}</span>
                </span>
              ))}
            </div>
          );
        })}
      </div>
      <ul data-testid="compare-summary" className="mt-3 space-y-1 border-t border-rule pt-3 text-[13px] leading-6 text-ink-soft">
        <li>共用单品：{shared.length ? shared.map((p) => text(p)).join("、") : "没有，两套要分别准备"}</li>
        <li>近脸色：A {a.palette.map((c) => c.name).join("、") || "—"}；B {b.palette.map((c) => c.name).join("、") || "—"}</li>
        <li>还要找的核心单品：A {need(a)} 件；B {need(b)} 件{need(a) !== need(b) ? `（${need(a) < need(b) ? "A" : "B"} 更省事）` : ""}</li>
      </ul>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {([a, b] as const).map((x, i) => (
          <button key={x.key} type="button" data-testid={`compare-pick-${i === 0 ? "a" : "b"}`} aria-pressed={chosen === x.key} onClick={() => onChoose(x.key)}
            className="min-h-11 rounded-full border border-rule-strong px-3 text-[13px] text-accent aria-pressed:border-accent aria-pressed:bg-accent aria-pressed:text-[var(--ap-on-primary)]">
            {chosen === x.key ? `我穿 ${i === 0 ? "A" : "B"}` : `选 ${i === 0 ? "A" : "B"}`}
          </button>
        ))}
      </div>
    </Card></section>
  );
}
