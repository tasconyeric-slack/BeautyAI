"use client";
import Link from "next/link";
import type { Intervention } from "@/lib/plan/catalog";
import { cn } from "@/lib/utils";

export const COST_LABEL = { free: "无需新增花费", low: "低花费", medium: "中等花费", high: "较高花费" };
const PURPOSE = { enhance: "突出已有特点", balance: "平衡视觉比例", express: "表达偏好印象" };
export function InterventionCard({ id, card, rank, state, setPlan }: {
  id: string; card: Intervention; rank: number; state: { saved?: boolean; done?: boolean };
  setPlan: (patch: { saved?: boolean; done?: boolean }) => void;
}) {
  return <li>
    <article data-testid={`intervention-${card.id}`} aria-label={card.action}
      className={cn("rounded-[16px] border bg-paper-raised p-4", state.done ? "border-accent/40" : "border-rule")}>
      <p className="text-[12px] text-accent">{rank} · {card.category} · {PURPOSE[card.purpose]}</p>
      <h3 className="mt-1 font-serif text-[18px] leading-7">{card.action}</h3>
      <p className="mt-2 text-[13px] leading-6 text-ink-soft">{card.goalReason}</p>
      <dl className="mt-3 space-y-2 text-[14px] leading-7">
        <div><dt className="text-muted">为什么与你有关 · 报告观察</dt><dd><ul>{card.evidence.map(o => <li key={o.id}>
          <span className="mr-1 text-[12px] text-muted">{o.id}</span>{o.text}
          {o.polarity === "strength" && <span className="ml-1 text-[12px] text-accent">已有特点，值得保留</span>}
        </li>)}</ul></dd></div>
        <div><dt className="inline text-muted">视觉机制 · </dt><dd className="inline">{card.mechanism}</dd></div>
        <div><dt className="inline text-muted">想尝试的变化 · </dt><dd className="inline">{card.effect}</dd></div>
        <div><dt className="inline text-muted">每项投入参考 · </dt><dd className="inline">{COST_LABEL[card.cost]} · 每天约 {card.minutes} 分钟；实际价格以店家或产品为准</dd></div>
        <div><dt className="inline text-muted">维护 · </dt><dd className="inline">{card.upkeep}</dd></div>
        <div><dt className="text-muted">怎么做</dt><dd><ol className="list-decimal pl-5">{card.steps.map(s => <li key={s}>{s}</li>)}</ol></dd></div>
        <div className="rounded-xl bg-paper-sunk px-3 py-2"><dt className="text-muted">更轻量的替代</dt>
          <dd>{card.alternative.action}<span className="block text-[12px] text-muted">{COST_LABEL[card.alternative.cost]} · 约 {card.alternative.minutes} 分钟 · {card.alternative.upkeep}</span></dd></div>
        <div><dt className="inline text-muted">怎么验证 · </dt><dd className="inline">{card.successCheck}</dd></div>
        <div><dt className="inline text-muted">可恢复程度 · </dt><dd className="inline">{card.reversibility}</dd></div>
        <div><dt className="inline text-muted">局限与条件 · </dt><dd className="inline">{card.limitation}</dd></div>
      </dl>
      <div className="mt-4 flex flex-wrap gap-2 border-t border-rule pt-3 text-[13px]">
        <button type="button" aria-pressed={Boolean(state.saved)} onClick={() => setPlan({ saved: !state.saved })}
          className="min-h-10 rounded-full border border-rule-strong px-3 text-accent">{state.saved ? "已加入我的方案" : "加入我的方案"}</button>
        <button type="button" aria-pressed={Boolean(state.done)} onClick={() => setPlan({ done: !state.done })}
          className="min-h-10 rounded-full border border-rule-strong px-3 text-accent">{state.done ? "已完成" : "标记完成"}</button>
        <Link href={`/p/${id}/studio${card.studioQuery ? `?${card.studioQuery}` : ""}`}
          className="inline-flex min-h-10 items-center text-accent underline underline-offset-4">{card.studioLabel}</Link>
      </div>
    </article>
  </li>;
}
