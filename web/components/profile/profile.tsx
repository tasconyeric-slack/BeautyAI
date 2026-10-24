"use client";

import { ArrowUpRight, BookOpen, Compass, ListChecks, Share2, Sparkles } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { ConfidenceNote, ProfileTriptych } from "@/components/ds";
import { AdjustPanel } from "@/components/adjust/adjust-panel";
import { ResembleFor } from "@/components/adjust/feedback-for";
import { Portrait } from "@/components/passport/portrait";
import { aestheticScore, cover, firstThing, referenceRank, triptych } from "@/lib/adapters";
import { api } from "@/lib/api";
import { guidance, paywall, profile as copy } from "@/lib/copy/zh";
import { usePassport } from "@/lib/state/passport-store";
import { ScoreHero } from "./score-hero";

export function Profile() {
  const { id, data, passport } = usePassport();
  const viewed = React.useRef(false);
  React.useEffect(() => {
    if (passport && !viewed.current) {
      viewed.current = true;
      api.track("profile_view", { passport_id: id, topic: passport.user_context.topic ?? null });
    }
  }, [id, passport]);
  if (!passport || !data) return null;
  const c = cover(passport);
  const t = triptych(passport);
  const first = firstThing(passport);
  const score = aestheticScore(passport);
  const base = `/p/${id}`;
  const num = passport.passport_id.replace(/^\w+_/, "").slice(-6).toUpperCase();
  return (
    <div className="mx-auto max-w-5xl px-4 pb-10 sm:px-6">
      {/* Cover */}
      <section className="pt-5 md:grid md:grid-cols-[minmax(0,400px)_1fr] md:gap-10">
        <Portrait>
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 pt-16 text-white">
            <p className="text-[10px] tracking-[0.22em] text-white/70">AESTHETIC PASSPORT · No.{num}</p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {c.signature.map((s) => <li key={s.title} className="rounded-full border border-white/40 px-2.5 py-0.5 text-[12px]">{s.title}</li>)}
            </ul>
          </div>
        </Portrait>
        <div className="mt-6 md:mt-0">
          <p className="text-[11px] tracking-[0.18em] text-muted">你的形象档案</p>
          <h1 className="mt-1 font-serif text-[24px] font-semibold leading-snug sm:text-[28px]">{c.oneLiner}</h1>
          <p className="mt-3 text-[14px] leading-7 text-ink-soft">方向：{c.bestDirection}</p>
          <ul className="mt-4 space-y-2">
            {c.signature.map((s) => (
              <li key={s.title} className="flex gap-2 text-[13px] leading-6">
                <span className="mt-2 h-px w-4 shrink-0 bg-amber" aria-hidden />
                <span><b className="font-medium">{s.title}</b> · <span className="text-ink-soft">{s.implication}</span></span>
              </li>
            ))}
          </ul>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href={`${base}/share`} className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-[14px] font-medium text-[var(--ap-on-primary)]">
              <Share2 className="size-4" />{copy.share}
            </Link>
            <AdjustPanel />
          </div>
        </div>
      </section>

      {/* AI 面部美学参考分 (D36): computed by the scoring layer from the front-photo landmarks */}
      {score && (
        <section className="mt-8">
          <ScoreHero view={score} rank={referenceRank(passport)} workbenchHref={`${base}/face`} retakeHref="/start" />
        </section>
      )}

      {/* The continuous report (Issue #33): every chapter of this passport on one page */}
      <section className="mt-6">
        <Link href={`${base}/report`} data-testid="open-report"
          className="group flex items-center gap-4 rounded-[16px] border border-ink/15 bg-paper-raised p-4 hover:border-ink/40 sm:p-5">
          <BookOpen className="size-6 shrink-0 text-accent" strokeWidth={1.6} />
          <span className="min-w-0 flex-1">
            <span className="block font-serif text-[17px] font-semibold group-hover:text-accent">{paywall.readReport}</span>
            <span className="mt-0.5 block text-[12.5px] leading-5 text-muted">
              总体评估、按部位的面部发现、解读、改善建议、形象方案与行动计划，一页读完
              {data.entitlement.paid ? "" : " · 免费版标明了完整护照增加的内容"}
            </span>
          </span>
          <ArrowUpRight className="size-5 shrink-0 text-muted group-hover:text-accent" />
        </Link>
      </section>

      {/* Three archive cards */}
      <section className="mt-8">
        <ProfileTriptych
          face={<TripCell href={`${base}/face`} value={t.face.value} note={t.face.note} target="face" />}
          color={<TripCell href={`${base}/color`} value={t.color.value} note={t.color.note} target="color" swatches={t.color.swatches} />}
          style={<TripCell href={`${base}/style`} value={t.style.value} note={t.style.note} target="style" />}
        />
        {t.color.confidence === "low" && <div className="mt-3"><ConfidenceNote level="low" tip={guidance.colorCaution} /></div>}
      </section>

      {/* First thing */}
      {first && (
        <section className="mt-8 rounded-[16px] bg-ink p-5 text-paper">
          <p className="flex items-center gap-1.5 text-[11px] tracking-[0.18em] text-paper/70"><Sparkles className="size-3.5" />{copy.firstAction}</p>
          <p className="mt-2 font-serif text-[19px] leading-8">{first.action}</p>
          <p className="mt-2 text-[13px] leading-6 text-paper/75">{first.why}</p>
          <div className="mt-3 flex flex-wrap gap-2 text-[12px] text-paper/80">
            {first.time && <span>· {first.time}</span>}{first.cost && <span>· {first.cost}</span>}
            <span>· 怎么验证：{first.successCheck}</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1">
            <Link href={`${base}/${first.page}`} className="inline-flex items-center gap-1 text-[14px] text-paper underline-offset-4 hover:underline">
              查看做法 <ArrowUpRight className="size-4" />
            </Link>
            <Link href={`${base}/plan`} className="inline-flex items-center gap-1 text-[14px] text-paper/80 underline-offset-4 hover:underline">
              加入行动方案 <ArrowUpRight className="size-4" />
            </Link>
          </div>
        </section>
      )}

      {/* Confidence and limits: what this profile can and cannot say (V2.1 §3A) */}
      <section className="mt-8 rounded-[14px] border border-rule bg-paper-raised p-4">
        <h2 className="font-serif text-[17px] font-semibold">依据与局限</h2>
        <p className="mt-1 text-[13px] leading-6 text-ink-soft">
          脸型与比例来自照片上的关键点测量；色彩倾向受拍摄光线影响{t.color.confidence === "low" ? "，这次判断偏保守" : ""}；
          发质、身形、预算与偏好只来自你的填写，不从照片推断。
        </p>
        {passport.analysis.limitations.length > 0 && (
          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-[13px] leading-6 text-muted">
            {passport.analysis.limitations.slice(0, 2).map((l) => <li key={l}>{l}</li>)}
          </ul>
        )}
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
          <Link href={`${base}/face`} className="text-accent underline-offset-4 hover:underline">详细测量</Link>
          <Link href={`${base}/detail`} className="text-accent underline-offset-4 hover:underline">全部观察与依据</Link>
          <Link href={`${base}/more`} className="text-accent underline-offset-4 hover:underline">补充信息，让建议更准</Link>
        </div>
      </section>

      {/* Next: the other three areas */}
      <section className="mt-10">
        <h2 className="mb-3 font-serif text-[20px] font-semibold">接下来</h2>
        <ul className="grid gap-3 sm:grid-cols-3">
          {[
            { href: `${base}/advice`, title: "个性化建议", sub: "发型、妆容、色彩、风格、眼镜、穿搭：选什么、为什么", icon: Compass },
            { href: `${base}/studio`, title: "形象实验室", sub: data.entitlement.paid ? "把发型、发色、唇色和近脸色组合在照片上" : "先免费试唇色与近脸色；AI 发型试看在完整护照中", icon: Sparkles },
            { href: `${base}/plan`, title: "我的行动方案", sub: "最值得先做的 3 件事，可以保存和勾选", icon: ListChecks },
          ].map(({ href, title, sub, icon: Icon }) => (
            <li key={href}>
              <Link href={href} className="group flex h-full items-start gap-3 rounded-[14px] border border-rule bg-paper-raised p-4 hover:border-ink/40">
                <Icon className="mt-0.5 size-5 shrink-0 text-accent" strokeWidth={1.6} />
                <span className="min-w-0">
                  <span className="flex items-center gap-1 text-[15px] font-medium group-hover:text-accent">{title}<ArrowUpRight className="size-3.5" /></span>
                  <span className="mt-0.5 block text-[12px] leading-5 text-muted">{sub}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
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
