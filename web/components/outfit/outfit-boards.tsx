"use client";

/** Decision surface of /p/[id]/outfit (Issue #23): contextual boards → compare two → "I'll wear this" → checklist, plus the
 *  starter capsule. Everything is derived from the passport already on the page; choices stay on this device. */
import * as React from "react";
import { Card, Section } from "@/components/passport/ui";
import type { Passport } from "@/lib/api";
import { buildBoards, buildCapsule, planCapsule, useOutfitState, type Budget, type Context } from "@/lib/outfit";
import { BoardCard } from "./board-card";
import { CapsulePanel } from "./capsule-panel";
import { ComparePanel } from "./compare-panel";
import { DecisionCard } from "./decision-card";

const BUDGET_FROM_USER: Record<string, Budget> = { low: "low", medium: "medium", high: "high" };

export function OutfitBoards({ id, passport, disliked, locked }: { id: string; passport: Passport; disliked: ReadonlySet<string>; locked: readonly string[] }) {
  const out = useOutfitState(id);
  const result = React.useMemo(() => buildBoards(passport, { disliked }), [passport, disliked]);
  const { boards } = result;
  const { state } = out;
  const keys = boards.map((b) => b.key);
  const budget: Budget = state.budget ?? BUDGET_FROM_USER[passport.user_context.constraints?.budget_level ?? "medium"] ?? "medium";
  const chosen = state.chosen && keys.includes(state.chosen) ? state.chosen : null;
  const pair: [Context, Context] | null = boards.length < 2 ? null
    : state.compare && keys.includes(state.compare[0]) && keys.includes(state.compare[1]) ? state.compare : [keys[0]!, keys[1]!];
  const capsule = React.useMemo(() => buildCapsule(boards), [boards]);
  const plan = React.useMemo(() => planCapsule(capsule, boards, state.owned, budget), [capsule, boards, state.owned, budget]);
  const chosenBoard = boards.find((b) => b.key === chosen);

  return (
    <>
      <Section title="场合搭配板" kicker="先选一套，再决定买什么">
        {result.constraintNotes.map((n) => <p key={n} className="mb-2 text-[12px] leading-5 text-muted">{n}</p>)}
        {boards.length === 0 ? (
          <Card><p data-testid="boards-empty" className="text-[14px] leading-7">{result.reason}</p></Card>
        ) : (
          <>
            {result.status === "single" && <p data-testid="boards-single" className="mb-2 text-[13px] text-amber">{result.reason}</p>}
            <ul data-testid="boards" className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {boards.map((b) => <BoardCard key={b.key} board={b} owned={state.owned} chosen={chosen === b.key} onChoose={() => out.choose(chosen === b.key ? null : b.key)} onOwned={out.setOwned} />)}
            </ul>
          </>
        )}
        {locked.includes("outfit.occasions") && <p data-testid="boards-from-formulas" className="mt-2 text-[12px] leading-5 text-muted">这些搭配板由免费的搭配公式拼成；完整护照还有按场合写的搭配，会让搭配板更贴近你的场合。</p>}
        {!out.persisted && <p role="status" className="mt-2 text-[12px] text-amber">这个浏览器不允许保存，选择只在当前页面有效，刷新后会丢失。</p>}
      </Section>
      {pair && (
        <Section title="比一比" kicker="选两套并排看">
          <ComparePanel boards={boards} pair={pair} owned={state.owned} chosen={chosen} onPair={out.setCompare} onChoose={out.choose} />
        </Section>
      )}
      {chosenBoard && (
        <Section title="穿搭清单">
          <DecisionCard board={chosenBoard} owned={state.owned} dressed={state.dressed} onDressed={out.setDressed} onClear={() => out.choose(null)} />
        </Section>
      )}
      {capsule.pieces.length > 0 && (
        <Section title="入门胶囊" kicker="用最少的单品拼出这几套">
          <CapsulePanel capsule={capsule} plan={plan} owned={state.owned} budget={budget} onBudget={out.setBudget} onOwned={out.setOwned} boardCount={boards.length} />
        </Section>
      )}
    </>
  );
}
