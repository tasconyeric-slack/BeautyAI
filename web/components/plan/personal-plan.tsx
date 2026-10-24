"use client";
import * as React from "react";
import type { Passport } from "@/lib/api";
import { GOALS, type Goal, type PlanPreferences } from "@/lib/plan/catalog";
import { buildPlan, defaultPreferences, progressKey } from "@/lib/plan/engine";
import { readPreferences, writePreferences } from "@/lib/plan/preferences";
import { useChoices } from "@/lib/state/choices";
import { InterventionCard, COST_LABEL } from "./intervention-card";

export function PersonalPlan(props: { id: string; passport: Passport }) {
  return <PlanSurface key={props.id} {...props} />;
}
function PlanSurface({ id, passport }: { id: string; passport: Passport }) {
  const [preferences, setPreferences] = React.useState(() => defaultPreferences(passport));
  const [more, setMore] = React.useState(false);
  const [persistent, setPersistent] = React.useState(true);
  const { choices, setPlan } = useChoices(id);
  React.useEffect(() => {
    setPreferences(readPreferences(id, defaultPreferences(passport)));
    // Re-read only when the passport changes, never on local toggles.
  }, [id, passport]);
  const update = (patch: Partial<PlanPreferences>) => {
    const next = { ...preferences, ...patch };
    setPreferences(next); setMore(false);
    setPersistent(writePreferences(id, next));
  };
  const cards = buildPlan(passport, preferences);
  const visible = more ? cards : cards.slice(0, 3);
  const done = cards.filter(c => choices.plan[progressKey(preferences.goal, c)]?.done).length;
  const budgets = ["low", "medium", "high"] as const;
  const maxBudget = budgets.indexOf(passport.user_context.constraints.budget_level);
  return <section aria-label="个性化行动方案">
    <h2 className="font-serif text-[22px]">从你想表达的印象出发</h2>
    <p className="mt-2 text-[13px] leading-6 text-ink-soft">面部特点不是待修正的缺点。选一个目标，先试可恢复的搭配，再决定是否投入。</p>
    <div role="radiogroup" aria-label="造型目标" className="mt-3 flex flex-wrap gap-2">
      {(Object.keys(GOALS) as Goal[]).map(goal => <label key={goal}
        className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-[14px] focus-within:outline focus-within:outline-2 focus-within:outline-accent ${preferences.goal === goal ? "border-accent bg-accent-soft text-accent" : "border-rule-strong"}`}>
        <input type="radio" name={`plan-goal-${id}`} value={goal} checked={preferences.goal === goal}
          onChange={() => update({ goal })} className="accent-[var(--color-accent)]" />{GOALS[goal].label}
      </label>)}
    </div>
    <div className="my-4 grid gap-3 rounded-xl bg-paper-sunk p-4 sm:grid-cols-2">
      <label className="grid gap-1 text-[13px]">每项花费上限
        <select aria-label="每项花费上限" value={budgets[Math.min(budgets.indexOf(preferences.budget), maxBudget)]}
          onChange={e => update({ budget: e.target.value as PlanPreferences["budget"] })} className="min-h-10 rounded-lg border border-rule bg-paper px-2">
          {budgets.slice(0, maxBudget + 1).map(b => <option key={b} value={b}>{COST_LABEL[b]}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-[13px]">每项每天最多 {Math.min(preferences.minutes, passport.user_context.constraints.daily_minutes)} 分钟
        <input aria-label="每项每天最多分钟" type="range" min={0} max={passport.user_context.constraints.daily_minutes} step={1}
          value={Math.min(preferences.minutes, passport.user_context.constraints.daily_minutes)} onChange={e => update({ minutes: Number(e.target.value) })} className="w-full accent-[var(--color-accent)]" />
      </label>
      <p className="text-[12px] leading-5 text-muted sm:col-span-2">每项分别估算，不代表整套合计。沿用你已声明的烫染、留长、预算和时间条件；切换目标不调用分析或生成。</p>
    </div>
    <p aria-live="polite" className="mb-3 text-[13px] text-muted">{GOALS[preferences.goal].label} · {cards.length} 项可尝试 · 已完成 {done} / {cards.length}</p>
    {cards.length ? <ol className="space-y-4">{visible.map((card, index) => <InterventionCard key={progressKey(preferences.goal, card)}
      id={id} card={card} rank={index + 1} state={choices.plan[progressKey(preferences.goal, card)] ?? {}}
      setPlan={patch => setPlan(progressKey(preferences.goal, card), patch)} />)}</ol>
      : <p role="status" className="rounded-xl border border-rule p-4 text-[14px] leading-7">{passport.user_context.constraints.other.trim()
        ? "你填写了额外限制，新增项目需要先逐项核对这些条件。请先参考下方报告原始建议；这里暂不添加未经核对的行动。"
        : "当前观察与条件下，没有需要强行改变的项目。可以保持现状，或调整目标与每项投入；缺少观察时不会编造个人建议。"}</p>}
    {cards.length > 3 && <button type="button" aria-expanded={more} onClick={() => setMore(v => !v)}
      className="mt-3 min-h-11 w-full rounded-xl border border-rule text-[14px]">{more ? "收起其余项目" : `其余 ${cards.length - 3} 项可尝试`}</button>}
    <p className="mt-4 text-[12px] leading-6 text-muted">{persistent ? "目标与进度保存在此设备，随护照删除。" : "浏览器未能保存目标，当前页面仍可使用。"}这里只保存选项，不保存照片。视觉效果因人而异，不承诺分数提升；AI 预览不是进步证明。</p>
  </section>;
}
