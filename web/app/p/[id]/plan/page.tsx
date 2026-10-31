"use client";

/** Goal-based local interventions (#34), with the original report advice, saved Looks
 *  and paid time-based plan retained below. No observation or geometry is rewritten. */
import { Bookmark, Check, ChevronDown, Scissors, Sparkles } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { PersonalPlan } from "@/components/plan/personal-plan";
import { FeedbackFor } from "@/components/adjust/feedback-for";
import { StylistBriefSheet } from "@/components/hair/hair-page";
import { Card, Locked, NotReady, Page, PageHeader, Pill, Section } from "@/components/passport/ui";
import { rankedRecs, TIER_ZH, type Tier } from "@/lib/adapters";
import { useChoices, type SavedLook } from "@/lib/state/choices";
import { usePassport } from "@/lib/state/passport-store";
import { cn } from "@/lib/utils";
import { isSampleId } from "@/lib/flags";
import { journey } from "@/lib/copy/journey";
import s from "@/components/journey/journey.module.css";

const COLS = [["today", "今天就能做"], ["next_haircut", "下次剪发"], ["invest", "值得投入"]] as const;
const TOP_N = 3;

export default function PlanPage() {
  const { id } = usePassport();
  if (isSampleId(id)) return <Page><p role="note">{journey.sampleReadOnly}</p><Link href="/report/sample">返回示例报告</Link><Link href="/start" className="ml-4">开始自己的分析</Link></Page>;
  return <div className={`${s.surface} ${s.plan}`}><PlanEditor key={id} /></div>;
}

function PlanEditor() {
  const { id, passport, data } = usePassport();
  const { choices, setPlan } = useChoices(id);
  const [brief, setBrief] = React.useState<Tier | null>(null);
  const [more, setMore] = React.useState(false);
  if (!passport || !data) return <NotReady />;
  const recs = rankedRecs(passport);
  const top = recs.slice(0, TOP_N);
  const rest = recs.slice(TOP_N);
  const plan = passport.derived.plan;
  const hasPlan = plan.today.length || plan.next_haircut.length || plan.invest.length;
  const chosenHair = choices.hair ? passport.analysis.hair_options.find((o) => o.tier === choices.hair!.tier) : null;
  const done = top.filter((r) => choices.plan[r.id]?.done).length;
  return (
    <Page>
      <PageHeader kicker="我的行动方案" title="让喜欢的方向，成为日常。"
        sub="你的造型选择，与可以开始的下一步。" />
      <PersonalPlan id={id} passport={passport} />
      <details className="mt-12 rounded-[4px] border border-rule p-6">
        <summary className="cursor-pointer text-[14px] text-ink-soft">报告原始建议与反馈</summary>
      <p className="mb-3 mt-3 text-[13px] text-muted" aria-live="polite">已完成 {done} / {top.length}</p>

      <ol className="space-y-3">
        {top.map((r, i) => {
          const st = choices.plan[r.id] ?? {};
          return (
            <li key={r.id}>
              <article className={cn("rounded-[4px] border bg-paper-raised p-6", st.done ? "border-accent/40 opacity-75" : "border-rule")}>
                <div className="flex items-start gap-3">
                  <span className="tnum mt-0.5 font-serif text-[22px] leading-none text-amber" aria-label={`优先级 ${i + 1}`}>{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap gap-1.5"><Pill tone="accent">{r.categoryZh}</Pill>{r.time && <Pill>{r.time}</Pill>}</div>
                    <h2 className={cn("mt-1.5 text-[16px] font-medium leading-7", st.done && "line-through")}>{r.action}</h2>
                  </div>
                </div>
                <dl className="mt-3 grid gap-2 text-[14px] leading-7">
                  <div><dt className="inline text-muted">能带来 · </dt><dd className="inline">{r.effect}</dd></div>
                  <div><dt className="inline text-muted">需要 · </dt><dd className="inline">{[r.effort, r.cost, r.time].filter(Boolean).join(" · ")}</dd></div>
                  {r.howTo.length > 0 && (
                    <div>
                      <dt className="text-muted">怎么做</dt>
                      <dd><ol className="mt-0.5 list-decimal space-y-0.5 pl-5">{r.howTo.map((h) => <li key={h}>{h}</li>)}</ol></dd>
                    </div>
                  )}
                  <div><dt className="inline text-muted">怎么检查 · </dt><dd className="inline">{r.successCheck}</dd></div>
                  {r.avoid && <div><dt className="inline text-muted">避免 · </dt><dd className="inline text-ink-soft">{r.avoid}</dd></div>}
                </dl>
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-rule pt-3">
                  <button type="button" aria-pressed={Boolean(st.saved)} onClick={() => setPlan(r.id, { saved: !st.saved })}
                    className={cn("inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-[13px]", st.saved ? "border-accent bg-accent-soft text-accent" : "border-rule-strong")}>
                    <Bookmark className="size-3.5" />{st.saved ? "已加入我的方案" : "加入我的方案"}
                  </button>
                  <button type="button" aria-pressed={Boolean(st.done)} onClick={() => setPlan(r.id, { done: !st.done })}
                    className={cn("inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-[13px]", st.done ? "border-accent bg-accent text-[var(--ap-on-primary)]" : "border-rule-strong")}>
                    <Check className="size-3.5" />{st.done ? "已完成" : "标记完成"}
                  </button>
                  <Link href={`/p/${id}/${r.page}`} className="ml-auto text-[13px] text-accent underline-offset-4 hover:underline">详细说明</Link>
                </div>
                <div className="mt-2"><FeedbackFor type="recommendation" target={r.id} /></div>
              </article>
            </li>
          );
        })}
      </ol>

      {rest.length > 0 && (
        <Section>
          <button type="button" aria-expanded={more} onClick={() => setMore((v) => !v)}
            className="flex w-full items-center justify-between rounded-[12px] border border-rule px-4 py-3 text-[14px]">
            其余 {rest.length} 条建议<ChevronDown className={cn("size-4 transition-transform", more && "rotate-180")} />
          </button>
          {more && (
            <ol className="mt-2 space-y-2">
              {rest.map((r) => (
                <li key={r.id}><Card>
                  <div className="flex flex-wrap gap-1.5"><Pill tone="accent">{r.categoryZh}</Pill>{r.time && <Pill>{r.time}</Pill>}{r.cost && <Pill>{r.cost}</Pill>}</div>
                  <p className="mt-1 text-[15px]">{r.action}</p>
                  <p className="text-[13px] text-ink-soft">{r.effect}</p>
                  <div className="mt-2"><FeedbackFor type="recommendation" target={r.id} /></div>
                </Card></li>
              ))}
            </ol>
          )}
        </Section>
      )}

      </details>

      {(chosenHair || choices.looks.length > 0) && (
        <Section title="我选定的" kicker="来自发型建议与形象实验室">
          <div className="space-y-2">
            {chosenHair && (
              <Card className="flex items-center gap-3">
                <Scissors className="size-4 shrink-0 text-accent" />
                <span className="min-w-0 flex-1 text-[14px]">发型：{TIER_ZH[chosenHair.tier]} · {chosenHair.name_zh}</span>
                <button type="button" onClick={() => setBrief(chosenHair.tier)} className="shrink-0 text-[13px] text-accent underline-offset-4 hover:underline">发型师简报</button>
              </Card>
            )}
            {choices.looks.map((l) => (
              <Card key={l.id} className="flex items-center gap-3">
                <Sparkles className="size-4 shrink-0 text-accent" />
                <span className="min-w-0 flex-1 truncate text-[14px]">{l.name}</span>
                <Link href={`/p/${id}/studio${lookQuery(l)}`} className="shrink-0 text-[13px] text-accent underline-offset-4 hover:underline">在实验室打开</Link>
              </Card>
            ))}
          </div>
        </Section>
      )}


      {hasPlan ? (
        <Section title="完整计划 · 按时间" kicker="完整护照">
          {COLS.map(([k, label]) => plan[k].length > 0 && (
            <div key={k} className="mb-4">
              <h3 className="mb-1.5 text-[13px] text-muted">{label}</h3>
              <ul className="space-y-1.5">{plan[k].map((x) => (
                <li key={x.rec_id} className="rounded-[12px] border border-rule bg-paper-raised px-4 py-2.5 text-[14px]">
                  {x.action}<span className="mt-0.5 block text-[12px] text-muted">怎么检查：{x.success_check}</span>
                </li>
              ))}</ul>
            </div>
          ))}
        </Section>
      ) : data.entitlement.locked.includes("plan") ? (
        <Locked what="按“今天 / 下次剪发 / 值得投入”排好的完整计划" bullets={["完整的时间计划与搭配关系", "AI 发型试看与组合造型", "全部唇色、穿搭单品与镜框尺寸"]} />
      ) : null}
      <StylistBriefSheet tier={brief} onClose={() => setBrief(null)} />
    </Page>
  );
}

function lookQuery(l: SavedLook): string {
  const q = new URLSearchParams();
  q.set("look", l.id);
  if (l.hair) q.set("hair", l.hair);
  if (l.hairColor !== null) q.set("hc", String(l.hairColor));
  if (l.lip) q.set("lip", l.lip.replace("#", ""));
  if (l.drape) q.set("drape", l.drape.replace("#", ""));
  const s = q.toString();
  return s ? `?${s}` : "";
}
