"use client";

/** The results overview (A4, Issue #2). Reading order, top to bottom:
 *    1. what this profile says — one line, the score as a model-based reference, the strengths and what they mean
 *       for styling, and ONE action to take first;
 *    2. the score's four parts and method (full card), the three archive cards, and what the evidence does and does not cover;
 *    3. the way on: facial evidence → report → advice → plan → studio, the same steps as the desktop step bar.
 *  Everything is read from the passport; nothing here measures, scores or recommends. */
import { ArrowUpRight, Share2, Sparkles } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { ConfidenceNote, ProfileTriptych } from "@/components/ds";
import { AdjustPanel } from "@/components/adjust/adjust-panel";
import { ResembleFor } from "@/components/adjust/feedback-for";
import { measureView } from "@/components/face/measure-model";
import { JOURNEY, journeyHref, type JourneyKey } from "@/components/passport/journey";
import { Portrait } from "@/components/passport/portrait";
import { aestheticScore, cover, firstThing, learnedScore, referenceRank, triptych } from "@/lib/adapters";
import { api, backendFor } from "@/lib/api";
import { guidance, paywall, profile as copy } from "@/lib/copy/zh";
import { usePassport } from "@/lib/state/passport-store";
import { atlasKeyFor, availability, type Availability } from "./overview-model";
import { ScoreGlance } from "./score-glance";
import { PredictedScoreHero, ScoreHero } from "./score-hero";

export function Profile() {
  const { id, data, passport } = usePassport();
  const viewed = React.useRef(false);
  React.useEffect(() => {
    if (passport && !viewed.current) {
      viewed.current = true;
      api.track("profile_view", { passport_id: id, topic: passport.user_context.topic ?? null });
    }
  }, [id, passport]);
  const locked = data?.entitlement.locked;
  const mv = React.useMemo(() => (passport ? measureView(passport, id, locked ?? []) : null), [passport, id, locked]);
  if (!passport || !data) return null;
  const c = cover(passport);
  const t = triptych(passport);
  const first = firstThing(passport);
  const score = aestheticScore(passport);
  const predicted = learnedScore(passport);
  const avail = availability(mv);
  const paid = data.entitlement.paid;
  const base = `/p/${id}`;
  const num = passport.passport_id.replace(/^\w+_/, "").slice(-6).toUpperCase();
  // The demo passports use a synthetic face; say so by the number (a live API with mock providers has its own banner).
  const synthetic = backendFor(id).kind === "fixture";
  return (
    <div className="mx-auto max-w-5xl px-4 pb-10 sm:px-6">
      {/* 1 · what this profile says */}
      <section className="pt-5 md:grid md:grid-cols-[minmax(0,400px)_1fr] md:gap-10">
        {/* stays in view while the right column scrolls, below the sticky header and step bar (the wrapper sticks:
            .ap-stage sets its own position, which would override a utility class on the stage itself) */}
        <div className="md:sticky md:top-[7.25rem] md:self-start">
        <Portrait>
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 pt-16 text-white">
            <p className="text-[10px] tracking-[0.22em] text-white/70">AESTHETIC PASSPORT · No.{num}</p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {c.signature.map((s) => <li key={s.title} className="rounded-full border border-white/40 px-2.5 py-0.5 text-[12px]">{s.title}</li>)}
            </ul>
          </div>
        </Portrait>
        </div>
        <div className="mt-6 min-w-0 md:mt-0">
          <p className="text-[11px] tracking-[0.18em] text-muted">你的形象档案</p>
          <h1 className="mt-1 font-serif text-[24px] font-semibold leading-snug sm:text-[28px]">{c.oneLiner}</h1>

          {predicted ? <div className="mt-4"><PredictedScoreHero view={predicted} /></div>
            : score && <div className="mt-4"><ScoreGlance view={score} retakeHref="/start" synthetic={synthetic} /></div>}

          <h2 className="mt-5 text-[13px] font-medium text-ink-soft">相对突出的特点 · 对造型的意义</h2>
          <ul className="mt-2 space-y-2" data-testid="overview-strengths">
            {c.signature.map((s) => {
              const atlas = atlasKeyFor(s.region);
              return (
                <li key={s.title} className="flex gap-2 text-[13.5px] leading-6">
                  <span className="mt-3 h-px w-4 shrink-0 bg-amber" aria-hidden />
                  <span>
                    <b className="font-medium">{s.title}</b> · <span className="text-ink-soft">{s.implication}</span>
                    {atlas && (
                      <Link href={`${base}/face#atlas-${atlas}`} className="ml-2 whitespace-nowrap text-[12px] text-accent underline-offset-4 hover:underline">看依据</Link>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-[13.5px] leading-6 text-ink-soft"><span className="text-muted">风格方向 · </span>{c.styleLine}；{c.bestDirection}</p>

          {first ? <FirstAction base={base} first={first} /> : (
            <Link href={`${base}/report`} className="mt-5 inline-flex h-11 items-center rounded-full bg-accent px-6 text-[14px] font-medium text-[var(--ap-on-primary)]">
              {paywall.readReport}
            </Link>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2 text-[13px]">
            <Link href={`${base}/share`} className="inline-flex items-center gap-1.5 rounded-full border border-rule px-3.5 py-1.5 text-ink-soft hover:border-ink/40 hover:text-ink">
              <Share2 className="size-4" />{copy.share}
            </Link>
            <AdjustPanel />
          </div>
        </div>
      </section>

      {/* 2 · the score's parts and method, the archive cards, what the evidence covers */}
      {score && (
        <section id="score" className="mt-10 scroll-mt-28">
          <ScoreHero view={score} rank={referenceRank(passport)} workbenchHref={`${base}/face`} retakeHref="/start" sample={synthetic} />
        </section>
      )}

      <section className="mt-8">
        <ProfileTriptych
          face={<TripCell href={`${base}/face`} value={t.face.value} note={t.face.note} target="face" />}
          color={<TripCell href={`${base}/color`} value={t.color.value} note={t.color.note} target="color" swatches={t.color.swatches} />}
          style={<TripCell href={`${base}/style`} value={t.style.value} note={t.style.note} target="style" />}
        />
        {t.color.confidence === "low" && <div className="mt-3"><ConfidenceNote level="low" tip={guidance.colorCaution} /></div>}
      </section>

      <Basis base={base} lowColor={t.color.confidence === "low"} limitations={passport.analysis.limitations.slice(0, 2)} avail={avail} />

      {/* 3 · the way on */}
      <section className="mt-10" aria-labelledby="journey-title" data-testid="overview-journey">
        <h2 id="journey-title" className="font-serif text-[20px] font-semibold">接下来</h2>
        <p className="mt-1 text-[13px] leading-6 text-muted">沿着证据往下读：先看结论是怎么量出来的，再读报告，最后落到你能做的事。</p>
        <ol className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {JOURNEY.filter((s) => s.key !== "overview").map((s, i) => (
            <li key={s.key}>
              <Link href={journeyHref(id, s.key)} data-testid={s.key === "report" ? "open-report" : `journey-${s.key}`} data-journey={s.key}
                className="group flex h-full flex-col rounded-[14px] border border-rule bg-paper-raised p-4 hover:border-ink/40">
                <span className="tnum text-[12px] text-amber">{String(i + 2).padStart(2, "0")}</span>
                <span className="mt-1 flex items-center gap-1 text-[15px] font-medium group-hover:text-accent">{s.label}<ArrowUpRight className="size-3.5" aria-hidden /></span>
                <span className="mt-1 text-[12px] leading-5 text-muted">{s.blurb}</span>
                <span className="mt-auto pt-2 text-[12px] leading-5 text-ink-soft">{journeyFact(s.key, { avail, paid })}</span>
              </Link>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

/** One line per step that says what is actually there for this passport (free vs full, how much was measured). */
export function journeyFact(key: JourneyKey, { avail, paid }: { avail: Availability | null; paid: boolean }): string {
  switch (key) {
    case "evidence": return avail ? `${avail.summary} · 十二区面部图谱` : "关键点与比例的测量";
    case "report": return paid ? "含全部测量明细与完整行动计划" : "免费版标明了完整护照增加的内容";
    case "advice": return "六个方面，每条都带理由";
    case "plan": return "先从最前面 3 件做起";
    case "studio": return paid ? "发型、发色、唇色与近脸色可以组合" : "先免费试唇色与近脸色；AI 发型试看在完整护照中";
    default: return "";
  }
}

/** The one action: the top recommendation after feedback, with why, cost and how to check it worked. */
function FirstAction({ base, first }: { base: string; first: NonNullable<ReturnType<typeof firstThing>> }) {
  return (
    <section aria-labelledby="first-action" data-testid="first-action" className="mt-5 rounded-[16px] bg-ink p-5 text-paper">
      <h2 id="first-action" className="flex items-center gap-1.5 text-[11px] tracking-[0.18em] text-paper/70"><Sparkles className="size-3.5" />{copy.firstAction}</h2>
      <p className="mt-2 font-serif text-[19px] leading-8">{first.action}</p>
      <p className="mt-2 text-[13px] leading-6 text-paper/75">{first.why}</p>
      <p className="mt-3 flex flex-wrap gap-x-3 text-[12px] text-paper/80">
        {first.time && <span>· {first.time}</span>}{first.cost && <span>· {first.cost}</span>}
        <span>· 怎么验证：{first.successCheck}</span>
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        <Link href={`${base}/${first.page}`} className="inline-flex h-10 items-center gap-1 rounded-full bg-paper px-5 text-[14px] font-medium text-ink hover:opacity-90">
          查看做法 <ArrowUpRight className="size-4" aria-hidden />
        </Link>
        <Link href={`${base}/plan`} className="inline-flex items-center gap-1 text-[14px] text-paper/85 underline-offset-4 hover:underline">
          加入行动方案
        </Link>
      </div>
    </section>
  );
}

/** What this profile can and cannot say (V2.1 §3A): where the numbers come from, which photos were used, what is withheld. */
function Basis({ base, lowColor, limitations, avail }: { base: string; lowColor: boolean; limitations: string[]; avail: Availability | null }) {
  return (
    <section className="mt-8 rounded-[14px] border border-rule bg-paper-raised p-4" aria-labelledby="basis-title" data-testid="overview-basis">
      <h2 id="basis-title" className="font-serif text-[17px] font-semibold">依据与局限</h2>
      <p className="mt-1 text-[13px] leading-6 text-ink-soft">
        脸型与比例来自照片上的关键点测量；色彩倾向受拍摄光线影响{lowColor ? "，这次判断偏保守" : ""}；
        发质、身形、预算与偏好只来自你的填写，不从照片推断。
      </p>
      {avail && (
        <dl className="mt-3 grid gap-x-6 gap-y-1 text-[13px] leading-6 sm:grid-cols-2" aria-label="用到的照片与测量范围">
          {avail.rows.map((r) => (
            <div key={r.key} className="flex gap-2" data-availability={r.state}>
              <dt className="w-[3.5em] shrink-0 text-muted">{r.name}</dt>
              <dd className={r.state === "measured" ? "text-ink-soft" : "text-amber"}>
                {r.text}
                {r.state === "missing" && <Link href={`${base}/more`} className="ml-2 text-accent underline-offset-4 hover:underline">补充</Link>}
              </dd>
            </div>
          ))}
          {avail.locked && <div className="flex gap-2 sm:col-span-2"><dt className="w-[3.5em] shrink-0 text-muted">明细</dt><dd className="text-ink-soft">{avail.locked}</dd></div>}
        </dl>
      )}
      {limitations.length > 0 && (
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-[13px] leading-6 text-muted">
          {limitations.map((l) => <li key={l}>{l}</li>)}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
        <Link href={`${base}/face`} className="text-accent underline-offset-4 hover:underline">详细测量</Link>
        <Link href={`${base}/detail`} className="text-accent underline-offset-4 hover:underline">全部观察与依据</Link>
        <Link href={`${base}/more`} className="text-accent underline-offset-4 hover:underline">补充信息，让建议更准</Link>
      </div>
    </section>
  );
}

function TripCell({ href, value, note, target, swatches }: {
  href: string; value: string; note: string; target: "face" | "color" | "style"; swatches?: string[];
}) {
  return (
    <div>
      <Link href={href} className="group block">
        <p className="font-serif text-[17px] leading-7 group-hover:text-accent">{value}</p>
        {swatches && (
          <div className="my-2 flex gap-1" aria-hidden>{swatches.map((h) => <span key={h} className="size-5 rounded-full border border-black/10" style={{ background: h }} />)}</div>
        )}
        {note && <p className="text-[12px] leading-5 text-muted">{note}</p>}
      </Link>
      <div className="mt-2"><ResembleFor target={target} /></div>
    </div>
  );
}
