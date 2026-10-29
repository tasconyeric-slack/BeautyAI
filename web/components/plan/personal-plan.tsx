"use client";
import Link from "next/link";
import s from "@/components/journey/journey.module.css";
import * as React from "react";
import type { Passport } from "@/lib/api";
import { GOALS, type Goal, type Intervention, type PlanPreferences } from "@/lib/plan/catalog";
import { buildPlanView, defaultPreferences, progressKey } from "@/lib/plan/engine";
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
  const { cards, replacements, needsCheck, constraintText } = buildPlanView(passport, preferences, choices.hair?.tier);
  const hairRecId = passport.analysis.recommendations.find(r => r.category === "hairstyle")?.id;
  const progress = (c: Intervention) => choices.plan[progressKey(preferences.goal, c)] ??
    (c.id === `hair-${choices.hair?.tier}` && hairRecId && choices.plan[hairRecId]?.saved ? { saved: true } : {});
  const decline = (cid: string) => update({ declined: [...new Set([...(preferences.declined ?? []), cid])] });
  const restore = (cid: string) => update({ declined: (preferences.declined ?? []).filter(x => x !== cid) });
  const visible = more ? cards : cards.slice(0, 3);
  const done = cards.filter(c => choices.plan[progressKey(preferences.goal, c)]?.done).length;
  const budgets = ["low", "medium", "high"] as const;
  const maxBudget = budgets.indexOf(passport.user_context.constraints.budget_level);
  return <section aria-label="个性化行动方案">
    <div className={s.planIntroduction}>
      <div><span>从选择到日常</span><h2>今天，先试一件小事。</h2><p>保留自己的特点，把喜欢的方向慢慢变成习惯。</p></div>
      <Link href={`/p/${id}/studio`}><span>{choices.looks.length ? `已保存 ${choices.looks.length} 个造型选项` : "还没有保存造型"}</span><b>{choices.looks.length ? "回到 Studio 继续比较" : "先在自己的照片上试试"}</b></Link>
    </div>
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
    {constraintText && <div className="mb-3 rounded-xl border border-rule p-3 text-[13px] leading-6">
      <p>你写的额外限制：「{constraintText}」。我们不会替你解读它，所以涉及发型、妆容和穿搭的项目会标为待核对；拍照比较类建议不受影响。</p>
      <label className="mt-2 flex min-h-10 items-center gap-2"><input type="checkbox" checked={!needsCheck}
        onChange={e => update({ confirmedOther: e.target.checked ? constraintText : "" })} className="accent-[var(--color-accent)]" />
        我已核对：下面的做法与这条限制没有冲突</label>
    </div>}
    <p aria-live="polite" className="mb-3 text-[13px] text-muted">{GOALS[preferences.goal].label} · {cards.length} 项可尝试 · 已完成 {done} / {cards.length}</p>
    {cards.length ? <ol className="space-y-4">{visible.map((card, index) => <InterventionCard key={progressKey(preferences.goal, card)}
      id={id} card={card} rank={index + 1} state={progress(card)} onDecline={() => decline(card.id)}
      setPlan={patch => setPlan(progressKey(preferences.goal, card), patch)} />)}</ol>
      : <p role="status" className="rounded-xl border border-rule p-4 text-[14px] leading-7">{"当前观察与条件下，没有需要强行改变的项目。可以保持现状，或调整目标与每项投入；缺少观察时不会编造个人建议。"}</p>}
    {replacements.length > 0 && <section aria-label="已跳过与替代" className="mt-5 space-y-3">
      <h3 className="font-serif text-[18px]">已跳过的项目与替代</h3>
      {replacements.map(r => <div key={r.declined.id} data-testid={`replacement-${r.declined.id}`} className="rounded-xl bg-paper-sunk p-3 text-[13px] leading-6">
        <p>已跳过：{r.declined.action} <button type="button" onClick={() => restore(r.declined.id)} className="ml-1 text-accent underline underline-offset-4">恢复</button></p>
        {r.replacement
          ? <ol className="mt-2"><InterventionCard id={id} card={r.replacement} rank={1} note={r.note} state={progress(r.replacement)}
            onDecline={() => decline(r.replacement!.id)} setPlan={patch => setPlan(progressKey(preferences.goal, r.replacement!), patch)} /></ol>
          : <p className="mt-1 text-muted">{r.note}</p>}
      </div>)}
    </section>}
    {cards.length > 3 && <button type="button" aria-expanded={more} onClick={() => setMore(v => !v)}
      className="mt-3 min-h-11 w-full rounded-xl border border-rule text-[14px]">{more ? "收起其余项目" : `其余 ${cards.length - 3} 项可尝试`}</button>}
    <p className="mt-4 text-[12px] leading-6 text-muted">{persistent ? "目标与进度保存在此设备，随护照删除。" : "浏览器未能保存目标，当前页面仍可使用。"}这里只保存选项，不保存照片。视觉效果因人而异，不承诺分数提升；AI 预览不是进步证明。</p>
  </section>;
}
