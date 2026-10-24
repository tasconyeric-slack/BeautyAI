"use client";

import { Card } from "@/components/passport/ui";
import { BUDGET_LABEL, CONTEXT_LABEL, FIRST_BUY, shoppingChecklist, type Budget, type Capsule, type CapsulePiece, type CapsulePlan } from "@/lib/outfit";
import { cn } from "@/lib/utils";
import { PieceRow } from "./piece-row";
import { ShareActions } from "./share-actions";

function Group({ title, note, items, owned, onOwned }: { title: string; note?: string; items: CapsulePiece[]; owned: Readonly<Record<string, boolean>>; onOwned: (k: string, v: boolean) => void }) {
  if (!items.length) return null;
  return (
    <div className="mt-3">
      <p className="text-[13px] font-medium">{title} <span className="font-normal text-muted">{items.length} 件</span></p>
      {note && <p className="text-[12px] text-muted">{note}</p>}
      <ul className="divide-y divide-rule">{items.map((c) => (
        <PieceRow key={c.piece.key} piece={c.piece} owned={Boolean(owned[c.piece.key])} onOwned={(v) => onOwned(c.piece.key, v)} compact
          extra={<p className="text-[12px] leading-5 text-muted">用在 {c.usedIn.map((k) => CONTEXT_LABEL[k]).join("、")}（{c.usedIn.length} 套）· 搜索：{c.piece.search}</p>} />
      ))}</ul>
    </div>
  );
}

export function CapsulePanel({ capsule, plan, owned, budget, onBudget, onOwned, boardCount }: {
  capsule: Capsule; plan: CapsulePlan; owned: Readonly<Record<string, boolean>>; budget: Budget; onBudget: (b: Budget) => void;
  onOwned: (k: string, v: boolean) => void; boardCount: number;
}) {
  const reuse = capsule.pieces.length ? (capsule.pieces.reduce((n, c) => n + c.usedIn.length, 0) / capsule.pieces.length).toFixed(1) : "0";
  return (
    <section data-testid="outfit-capsule"><Card>
      <p data-testid="capsule-summary" className="text-[14px] leading-7">
        {capsule.pieces.length} 件单品拼出 {boardCount} 套搭配，平均每件用 {reuse} 次。已有 {plan.owned.length} 件，还差 {plan.buyNow.length + plan.later.length} 件。
        {plan.wearableNow.length > 0 && <> 现在就能穿：{plan.wearableNow.map((k) => CONTEXT_LABEL[k]).join("、")}。</>}
      </p>
      <fieldset className="mt-3">
        <legend className="text-[12px] text-muted">预算（只决定先买几件，不是价格）</legend>
        <div role="radiogroup" aria-label="预算" className="mt-1 inline-flex rounded-full border border-rule bg-paper-raised p-0.5">
          {(["low", "medium", "high"] as const).map((b) => (
            <button key={b} type="button" role="radio" aria-checked={budget === b} data-testid={`budget-${b}`} onClick={() => onBudget(b)}
              className={cn("min-h-9 rounded-full px-3.5 text-[13px]", budget === b ? "bg-ink text-paper" : "text-ink-soft")}>{BUDGET_LABEL[b]}</button>
          ))}
        </div>
      </fieldset>
      <Group title="先买" note={`按“多套搭配都用到”排序，${BUDGET_LABEL[budget]}先买 ${FIRST_BUY[budget]} 件以内；已有的单品点“我已有”`} items={plan.buyNow} owned={owned} onOwned={onOwned} />
      <Group title="以后再说" note="先用你已有的相近单品替代也可以" items={plan.later} owned={owned} onOwned={onOwned} />
      <Group title="已有" items={plan.owned} owned={owned} onOwned={onOwned} />
      {capsule.dropped > 0 && <p className="mt-2 text-[12px] text-muted">另有 {capsule.dropped} 件只用在单套搭配里的点缀没有放进胶囊。</p>}
      <div className="mt-3"><ShareActions text={shoppingChecklist(plan, budget)} title="入门胶囊购物清单" testId="capsule" /></div>
    </Card></section>
  );
}
