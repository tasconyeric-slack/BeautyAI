"use client";
import Link from "next/link";
import type { Intervention } from "@/lib/plan/catalog";
import { cn } from "@/lib/utils";

export const COST_LABEL = { free: "无需新增花费", low: "低花费", medium: "中等花费", high: "较高花费" };
const PURPOSE = { enhance: "突出已有特点", balance: "平衡视觉比例", express: "表达偏好印象" };
export function InterventionCard({ id, card, rank, state, setPlan, onDecline, note }: {
  id: string; card: Intervention; rank: number; state: { saved?: boolean; done?: boolean };
  setPlan: (patch: { saved?: boolean; done?: boolean }) => void; onDecline?: () => void; note?: string;
}) {
  const locked = Boolean(card.needsCheck);
  return <li>
    <article data-testid={`intervention-${card.id}`} aria-label={card.action}
      className={cn("rounded-[4px] border bg-paper-raised p-6 sm:p-8", state.done ? "border-accent/40" : "border-rule")}>
      <p className="text-[12px] text-accent">{rank} · {card.category} · {PURPOSE[card.purpose]}</p>
      <h3 className="mt-1 font-serif text-[18px] leading-7">{card.action}</h3>
      {note && <p className="mt-1 text-[12px] leading-5 text-accent">{note}</p>}
      {locked && <p role="note" className="mt-1 text-[12px] leading-5 text-muted">待核对：你写的额外限制可能与这一项冲突，确认前不加入方案。</p>}
      <p className="mt-2 text-[13px] leading-6 text-ink-soft">{card.goalReason}</p>
      <dl className="mt-4 grid grid-cols-3 gap-3 border-y border-rule py-3 text-[12px] leading-6">
        <div><dt className="text-muted">投入</dt><dd>{COST_LABEL[card.cost]}</dd></div>
        <div><dt className="text-muted">每天</dt><dd>约 {card.minutes} 分钟</dd></div>
        <div><dt className="text-muted">维护</dt><dd>{card.upkeep}</dd></div>
      </dl>
      <ol className="my-4 list-decimal space-y-2 pl-5 text-[14px] leading-7">{card.steps.map(step => <li key={step}>{step}</li>)}</ol>
      <p className="text-[12px] leading-6 text-ink-soft">怎么验证 · {card.successCheck}</p>
      <details className="mt-3 text-[12px] leading-6 text-ink-soft"><summary className="min-h-11 cursor-pointer py-2">为什么适合我 · 替代选择</summary>
        <p>{card.mechanism}</p><p>{card.effect}</p><ul className="my-3">{card.evidence.map(o => <li key={o.id} data-observation={o.id}>{o.text}</li>)}</ul>
        <p>更轻量的替代：{card.alternative.action}</p><p>{COST_LABEL[card.alternative.cost]} · 约 {card.alternative.minutes} 分钟 · {card.alternative.upkeep}</p>
        <p>可恢复程度：{card.reversibility}</p><p>局限与条件：{card.limitation}</p>
      </details>
      <div className="mt-4 flex flex-wrap gap-2 border-t border-rule pt-3 text-[13px]">
        <button type="button" disabled={locked} aria-pressed={Boolean(state.saved)} onClick={() => setPlan({ saved: !state.saved })}
          className="min-h-11 rounded-full border border-rule-strong px-4 text-accent hover:bg-accent-soft aria-pressed:border-accent aria-pressed:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-45">{state.saved ? "已加入我的方案" : "加入我的方案"}</button>
        <button type="button" disabled={locked} aria-pressed={Boolean(state.done)} onClick={() => setPlan({ done: !state.done })}
          className="min-h-11 rounded-full border border-rule-strong px-4 text-accent hover:bg-accent-soft aria-pressed:border-accent aria-pressed:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-45">{state.done ? "已完成" : "标记完成"}</button>
        {card.id.startsWith("photo-")
          ? <span className="inline-flex min-h-11 items-center text-muted">现实中操作，无需实验室</span>
          : <Link href={`/p/${id}/studio${card.studioQuery ? `?${card.studioQuery}` : ""}`}
            className="inline-flex min-h-11 items-center text-accent underline underline-offset-4">{card.studioLabel}</Link>}
        {onDecline && <button type="button" onClick={onDecline}
          className="ml-auto min-h-11 rounded-full px-3 text-muted underline underline-offset-4">不适合我</button>}
      </div>
    </article>
  </li>;
}
