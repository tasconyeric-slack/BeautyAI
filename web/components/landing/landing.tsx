import { Check } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { SwatchColor } from "@/components/ds";
import { IllustratedAvatar, ProfileCard } from "@/components/cards";
import { Scaled } from "@/components/passport/scaled";
import { ScoreHero } from "@/components/profile/score-hero";
import { aestheticScore as scoreCopy, common, landing, privacy, report as reportCopy, topics } from "@/lib/copy/zh";
import {
  HERO_SAMPLE, LANDING_CASES, SAMPLE_HREF, SAMPLE_REPORT_HREF, SAMPLE_SCORE, SAMPLE_SCORE_HREF, SHOWCASE, sampleReportPreview, TOPIC_KEYS, TOPIC_NAMES, heroCase, heroRows, startHref,
  type LandingCase, type Topic,
} from "./cases";
import { LandingView } from "./client";

/** A1 landing + D1 topic entries. `/t/[topic]` changes only the first-screen copy and the example. */
export function Landing({ topic = null, refCode = null }: { topic?: Topic | null; refCode?: string | null }) {
  const t = topic ? topics[topic] : null;
  const start = startHref(topic, refCode);
  return (
    <div className="relative overflow-x-clip">
      <LandingView topic={topic} refCode={refCode} />
      <Hero topic={topic} title={t?.title ?? landing.screens[0].title} subtitle={t?.subtitle ?? landing.screens[0].body} start={start} />
      <ScoreShowcase />
      <ReportPreview />
      <Cases cases={LANDING_CASES} />
      <SeeIt />
      <Privacy start={start} />
    </div>
  );
}

// --- first screen ----------------------------------------------------------------------------------------------

function Hero({ topic, title, subtitle, start }: { topic: Topic | null; title: string; subtitle: string; start: string }) {
  return (
    <section className="mx-auto grid max-w-5xl gap-8 px-4 pb-12 pt-7 sm:px-6 md:grid-cols-[minmax(0,1fr)_minmax(0,420px)] md:items-center md:gap-12 md:pb-16 md:pt-12">
      <div>
        <p className="text-[11px] tracking-[0.24em] text-muted">
          {topic ? <><span className="text-accent">{TOPIC_NAMES[topic]}</span> · 形象护照</> : "形象护照 · AESTHETIC PASSPORT"}
        </p>
        <h1 className="mt-3 text-balance font-serif text-[27px] font-bold leading-[1.42] text-ink sm:text-[40px]">{title}</h1>
        <p className="mt-3 max-w-[30em] text-[14.5px] leading-7 text-ink-soft sm:text-[16px]">{subtitle}</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            href={start}
            data-cta="primary"
            className="flex h-12 w-full items-center justify-center rounded-full bg-accent px-8 text-[15px] font-medium tracking-[0.04em] text-[var(--ap-on-primary)] transition-opacity duration-150 hover:opacity-90 sm:inline-flex sm:w-auto"
          >
            {landing.primaryAction}
          </Link>
          <Link
            href={SAMPLE_REPORT_HREF}
            data-testid="landing-hero-sample"
            className="flex h-12 w-full items-center justify-center rounded-full border border-ink/30 px-6 text-[14px] font-medium text-ink transition-colors hover:border-ink hover:bg-ink hover:text-paper sm:inline-flex sm:w-auto"
          >
            {landing.secondaryAction} →
          </Link>
        </div>
        <ul aria-label={landing.privacyLabel} data-testid="hero-privacy" className="mt-4 space-y-1 text-[12.5px] leading-5 text-muted">
          {privacy.facts.map((f) => (
            <li key={f} className="flex gap-2"><Check aria-hidden className="mt-[3px] size-3.5 shrink-0 text-accent" />{f}</li>
          ))}
        </ul>
        <ol aria-label={landing.journeyLabel} data-testid="hero-journey" className="mt-6 grid gap-px overflow-hidden rounded-[12px] border border-rule bg-rule sm:grid-cols-3">
          {landing.journey.map((j, i) => (
            <li key={j.title} className="bg-paper-raised px-3.5 py-3">
              <p className="flex items-baseline gap-1.5"><span aria-hidden className="font-mono text-[11px] text-amber">0{i + 1}</span><span className="font-serif text-[15px] font-semibold">{j.title}</span></p>
              <p className="mt-1 text-[12px] leading-5 text-muted">{j.body}</p>
            </li>
          ))}
        </ol>
        <TopicLine current={topic} />
      </div>
      <HeroSample c={heroCase} topic={topic} />
    </section>
  );
}

function TopicLine({ current }: { current: Topic | null }) {
  return (
    <nav aria-label={landing.topicLabel} className="mt-5 border-t border-rule pt-3">
      <ul className="flex flex-wrap items-center gap-x-1 gap-y-1 text-[13px] leading-6">
        {TOPIC_KEYS.map((k, i) => (
          <li key={k} className="flex items-center gap-x-1">
            {i > 0 && <span aria-hidden className="text-rule-strong">·</span>}
            <Link
              href={`/t/${k}`}
              aria-current={k === current ? "page" : undefined}
              className={`px-0.5 underline-offset-4 hover:text-accent hover:underline ${k === current ? "text-accent" : "text-ink-soft"}`}
            >
              {TOPIC_NAMES[k]}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** The deliverable, up front: the sample passport's result sheet — drawn synthetic face, its computed score, the facts the
 * topic asked about and the first action — labeled as a synthetic example at the top, not a live analysis. */
function HeroSample({ c, topic }: { c: LandingCase; topic: Topic | null }) {
  const href = c.passportId ? `/p/${c.passportId}${topic ? `/${topic}` : ""}` : SAMPLE_HREF;
  const { score, portrait, firstAction } = HERO_SAMPLE;
  return (
    <aside aria-label="示例成果" data-testid="hero-sample" className="overflow-hidden rounded-[18px] border border-rule bg-paper-raised shadow-[0_18px_40px_-26px_rgba(20,22,24,0.45)]">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 border-b border-rule bg-amber-soft px-4 py-2 text-[11.5px] text-amber">
        <span className="font-medium">{landing.sampleBadge}</span>
        <span>{landing.sampleNotLive}</span>
      </div>
      <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-4 p-4 sm:grid-cols-[132px_minmax(0,1fr)]">
        <div className="self-start overflow-hidden rounded-[10px] bg-[var(--ap-stage)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={portrait} alt="合成示例人脸（程序绘制，非真人）" className="block aspect-[4/5] w-full object-cover" />
        </div>
        <div className="min-w-0">
          {score?.score != null && (
            <p className="flex items-baseline gap-2" data-testid="hero-score">
              <span className="font-serif text-[40px] font-semibold leading-none tabular-nums">{score.score}</span>
              <span className="text-[11px] leading-4 text-muted">/ 100<br />{scoreCopy.title}</span>
            </p>
          )}
          {score?.tier && <p className="mt-1 text-[12.5px] font-medium">{score.tier} · <span className="font-normal text-muted">模型参考，不评价长相</span></p>}
          <dl className="mt-3 space-y-1.5 text-[13px] leading-[1.6]">
            {heroRows(c, topic).map((r, i) => (
              <div key={i} className="flex gap-3">
                <dt className="w-[3.6em] shrink-0 whitespace-nowrap text-muted">{r.label}</dt>
                <dd className="min-w-0">
                  {r.value && <span>{r.value}</span>}
                  {r.swatches && <Chips colors={r.swatches} spaced={Boolean(r.value)} dark={false} />}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
      {firstAction && (
        <div className="border-t border-rule px-4 py-3">
          <p className="text-[11px] tracking-[0.16em] text-muted">{landing.sampleFirstAction}</p>
          <p className="mt-1 font-serif text-[14.5px] leading-6">{firstAction}</p>
        </div>
      )}
      <p className="border-t border-rule px-4 pb-0 pt-2 text-[11.5px] leading-5 text-muted">{landing.sampleScoreNote}</p>
      <Link href={href} data-testid="hero-sample-open" className="group mt-2 flex items-center justify-between gap-3 border-t border-rule bg-paper px-4 py-3 text-[13px] font-medium hover:text-accent">
        <span className="min-w-0 truncate">{topic ? topics[topic].example : landing.sampleOpen}</span>
        <span aria-hidden className="shrink-0 transition-transform duration-150 group-hover:translate-x-0.5">→</span>
      </Link>
    </aside>
  );
}

function Chips({ colors, spaced, dark = true }: { colors: SwatchColor[]; spaced?: boolean; dark?: boolean }) {
  return (
    <span className={`flex gap-1 ${spaced ? "mt-1" : "mt-[3px]"}`}>
      {colors.map((s) => (
        <span key={s.hex} title={s.name_zh} className={`h-3.5 w-5 rounded-[2px] ring-1 ${dark ? "ring-white/15" : "ring-black/10"}`} style={{ background: s.hex }} />
      ))}
      <span className="sr-only">{colors.map((s) => s.name_zh).join("、")}</span>
    </span>
  );
}

// --- AI 面部美学参考分 (D36): the sample passport's real computed score ----------------------------------------

function ScoreShowcase() {
  if (!SAMPLE_SCORE) return null;
  return (
    <section className="border-t border-rule py-10 md:py-14" aria-labelledby="score-title">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <h2 id="score-title" className="font-serif text-[22px] font-semibold leading-snug sm:text-[26px]">{scoreCopy.landingTitle}</h2>
        <p className="mt-2 max-w-[36em] text-[14px] leading-7 text-ink-soft">{scoreCopy.landingBody}</p>
        <div className="mt-5">
          <ScoreHero view={SAMPLE_SCORE} workbenchHref={null} sample cta={{ href: SAMPLE_SCORE_HREF, label: scoreCopy.landingOpen }} />
        </div>
      </div>
    </section>
  );
}

// --- full sample report (Issue #33): one real line per chapter, then the whole report ------------------------

function ReportPreview() {
  const r = sampleReportPreview();
  const rows: { key: keyof typeof reportCopy.chapters; line: string; swatches?: SwatchColor[] }[] = [
    { key: "overview", line: r.overview },
    { key: "findings", line: r.findings },
    { key: "interpretation", line: r.interpretation },
    { key: "improvements", line: r.improvements },
    { key: "options", line: r.options, swatches: r.swatches },
    { key: "plan", line: r.plan },
    { key: "methods", line: r.methods },
  ];
  return (
    <section className="border-t border-rule py-10 md:py-14" aria-labelledby="report-preview-title" data-testid="landing-report-preview">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <h2 id="report-preview-title" className="font-serif text-[22px] font-semibold leading-snug sm:text-[26px]">{reportCopy.landingTitle}</h2>
        <p className="mt-2 max-w-[36em] text-[14px] leading-7 text-ink-soft">{reportCopy.landingBody}</p>
        <ol className="mt-5 overflow-hidden rounded-[16px] border border-rule bg-paper-raised">
          {rows.map((row, i) => (
            <li key={row.key} className="grid grid-cols-[2.5em_minmax(0,1fr)] gap-x-3 border-t border-rule px-4 py-3 first:border-t-0 sm:grid-cols-[2.5em_9em_minmax(0,1fr)]">
              <span className="font-mono text-[12px] leading-6 text-amber">{String(i + 1).padStart(2, "0")}</span>
              <span className="text-[14px] font-medium leading-6">{reportCopy.chapters[row.key].title}</span>
              <span className="col-start-2 text-[13px] leading-6 text-ink-soft sm:col-start-3">
                {row.line}
                {row.swatches && <Chips colors={row.swatches} spaced />}
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-2 text-[11px] tracking-[0.12em] text-muted">{reportCopy.demo.disclosureTitle} · 数字与分析由真实分析流程生成</p>
        <Link href={SAMPLE_REPORT_HREF} data-testid="landing-sample-report"
          className="mt-5 inline-flex h-11 items-center justify-center rounded-full border border-ink px-6 text-[14px] font-medium hover:bg-ink hover:text-paper">
          {reportCopy.landingOpen} →
        </Link>
      </div>
    </section>
  );
}

// --- cases -----------------------------------------------------------------------------------------------------

function Cases({ cases }: { cases: LandingCase[] }) {
  return (
    <section className="border-t border-rule py-10 md:py-14" aria-labelledby="cases-title">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <SectionHead id="cases-title" index="01" title={landing.screens[1].title} body={landing.screens[1].body} />
        <p className="mt-2 text-[11px] tracking-[0.12em] text-muted">{common.syntheticExample} · 虚构人物 · 左右滑动</p>
      </div>
      <ul className="relative mx-auto mt-5 flex max-w-5xl snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-4 px-4 pb-3 [scrollbar-width:none] sm:scroll-px-6 sm:px-6">
        {cases.map((c) => (
          <li key={c.id} className="w-[76%] max-w-[300px] shrink-0 snap-start">
            <figure>
              {/* The 1080×1440 share card is decorative here; its content is summarized in the caption. */}
              <div aria-hidden="true" className="overflow-hidden rounded-[10px] border border-rule bg-paper-raised">
                <Scaled width={1080} height={1440}><ProfileCard {...c.card} /></Scaled>
              </div>
              <figcaption className="mt-3">
                <p className="text-[11px] tracking-[0.14em] text-muted">{c.label} · {c.expression}</p>
                <p className="mt-1 text-[13px] leading-6 text-ink-soft">{c.face} · {c.style}</p>
                <p className="sr-only">{c.summary}</p>
                {c.passportId && (
                  <Link href={`/p/${c.passportId}`} className="mt-1 inline-block text-[13px] text-accent underline-offset-4 hover:underline">
                    打开示例档案
                  </Link>
                )}
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SectionHead({ id, index, title, body }: { id: string; index: string; title: string; body: string }) {
  return (
    <>
      <p className="font-mono text-[11px] tracking-[0.2em] text-amber">{index}</p>
      <h2 id={id} className="mt-1 font-serif text-[22px] font-semibold sm:text-[26px]">{title}</h2>
      <p className="mt-2 max-w-[34em] text-[14px] leading-7 text-ink-soft">{body}</p>
    </>
  );
}

// --- what you will see -----------------------------------------------------------------------------------------

function SeeIt() {
  const s = SHOWCASE;
  const tiles: { title: string; body: string; visual: ReactNode }[] = [
    {
      title: "发型试看",
      body: "稳妥 · 突破 · 省心，三个方向放到你身上看",
      visual: (
        <div className="grid grid-cols-3 gap-2">
          {s.hair.map((h) => (
            <figure key={h.tierZh} className="min-w-0">
              <div className="mx-auto aspect-[500/560] w-full max-w-[96px]"><IllustratedAvatar {...h.avatar} label={`插画示意：${h.name}`} /></div>
              <figcaption className="mt-1 text-center text-[11px] leading-4 text-stage-muted"><span className="block text-stage-ink">{h.tierZh}</span><span className="line-clamp-2">{h.name}</span></figcaption>
            </figure>
          ))}
        </div>
      ),
    },
    {
      title: "口红试色",
      body: "本地着色，五官形状不变",
      visual: (
        <div>
          <div className="flex justify-center gap-4">
            {s.lip.shades.map((hex) => <Lip key={hex} hex={hex} />)}
          </div>
          {s.lip.text && <p className="mt-2 text-center text-[11px] text-stage-muted">{s.lip.text}</p>}
        </div>
      ),
    },
    {
      title: "数字披布",
      body: "近脸色、衣橱底色与慎用色",
      visual: (
        <div className="grid grid-cols-3 gap-2">
          {s.drape.map((d) => (
            <figure key={d.label} className="min-w-0">
              <div className="mx-auto aspect-[500/560] w-full max-w-[96px]"><IllustratedAvatar {...d.avatar} label={`插画示意：${d.color.name_zh}披布`} /></div>
              <figcaption className="mt-1 text-center text-[11px] leading-4 text-stage-muted"><span className="block text-stage-ink">{d.label}</span><span className="block truncate">{d.color.name_zh}</span></figcaption>
            </figure>
          ))}
        </div>
      ),
    },
    {
      title: "穿搭清单",
      body: "公式、单品与能直接搜的关键词",
      visual: (
        <div className="text-[12.5px] leading-6">
          <p className="text-[11px] tracking-[0.16em] text-stage-muted">{s.outfit.title}</p>
          <ul className="mt-1.5 space-y-1">
            {s.outfit.pieces.map((p) => (
              <li key={p} className="flex items-center gap-2"><span aria-hidden className="h-3 w-3 shrink-0 rounded-[2px] border border-stage-muted/60" />{p}</li>
            ))}
          </ul>
          {s.outfit.search && <p className="mt-2 truncate font-mono text-[11px] text-stage-muted">搜 · {s.outfit.search}</p>}
        </div>
      ),
    },
  ];
  return (
    <section className="border-t border-rule py-10 md:py-14" aria-labelledby="see-title">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <SectionHead id="see-title" index="02" title={landing.screens[2].title} body={landing.screens[2].body} />
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {tiles.map((tile) => (
            <li key={tile.title} className="overflow-hidden rounded-[14px] border border-rule bg-paper-raised">
              <div className="relative flex min-h-[156px] flex-col justify-center bg-[var(--ap-stage)] px-4 pb-3 pt-6 text-stage-ink">
                <span className="absolute left-3 top-2 text-[10px] tracking-[0.16em] text-stage-muted">{common.syntheticExample}</span>
                {tile.visual}
              </div>
              <div className="px-4 py-3.5">
                <h3 className="font-serif text-[16px] font-semibold">{tile.title}</h3>
                <p className="mt-0.5 text-[12.5px] leading-5 text-muted">{tile.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Lip({ hex }: { hex: string }) {
  return (
    <svg viewBox="0 0 120 64" width="76" height="40" role="img" aria-label={`唇色 ${hex}`}>
      <path d="M8 30 C26 10 44 8 60 20 C76 8 94 10 112 30 C88 36 32 36 8 30Z" fill={hex} />
      <path d="M8 30 C32 36 88 36 112 30 C96 56 24 56 8 30Z" fill={hex} />
      <path d="M8 30 C32 36 88 36 112 30" fill="none" stroke="#141618" strokeOpacity="0.35" strokeWidth="1.2" />
      <path d="M44 44 Q60 49 76 44" fill="none" stroke="#fff" strokeOpacity="0.28" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// --- privacy ---------------------------------------------------------------------------------------------------

function Privacy({ start }: { start: string }) {
  return (
    <section className="border-t border-rule py-10 md:py-14" aria-labelledby="privacy-title">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <SectionHead id="privacy-title" index="03" title={landing.screens[3].title} body={landing.screens[3].body} />
        <ol className="mt-6 grid gap-px overflow-hidden rounded-[14px] border border-rule bg-rule sm:grid-cols-3">
          {privacy.facts.map((f, i) => (
            <li key={f} className="flex gap-3 bg-paper-raised px-4 py-4 text-[14px] leading-6">
              <span className="font-mono text-[12px] leading-6 text-amber">0{i + 1}</span>
              <span>{f}</span>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-[12px] text-muted">
          只描述特点，不评判长相 ·{" "}
          <Link href="/about" className="underline underline-offset-4 hover:text-ink">照片与数据说明</Link>
        </p>
        <div className="mt-8 flex flex-col items-center gap-2 rounded-[16px] bg-paper-sunk px-5 py-7 text-center">
          <p className="font-serif text-[18px] font-semibold">{landing.screens[0].title}</p>
          <Link
            href={start}
            data-cta="primary"
            className="mt-2 flex h-12 w-full max-w-[320px] items-center justify-center rounded-full bg-accent px-8 text-[15px] font-medium tracking-[0.04em] text-[var(--ap-on-primary)] transition-opacity duration-150 hover:opacity-90"
          >
            {landing.primaryAction}
          </Link>
        </div>
      </div>
    </section>
  );
}
