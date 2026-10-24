"use client";

/** 完整面部评估报告 (Issue #33, Phase 1): one continuous, photo-led report that regroups what the passport already holds
 *  — the D36 score, the V3 measurement profile and its rules-layer readings, the model's observations and the ranked
 *  recommendations — into overall assessment → facial findings → interpretation → practical improvements →
 *  appearance options → action plan → methods.
 *
 *  The same component renders a real passport (/p/[id]/report) and the public synthetic sample (/report/sample).
 *  Entitlement is the server's: a free view already lacks paid content, so the report shows what is present and
 *  says plainly what the full passport adds — it never hides or fabricates anything on the client. */
import { ArrowRight, ArrowUpRight, Check, ChevronUp, Lock, Minus } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { ConfidenceNote, StylePlane } from "@/components/ds";
import { adviceGroups } from "@/components/advice/advice-page";
import { useGeometry } from "@/components/face/face-page";
import { faceShape } from "@/components/face/face-model";
import { CONFIDENCE_ZH, measureView, type MeasureView } from "@/components/face/measure-model";
import { RangeBar } from "@/components/face/workbench";
import { journeyHref } from "@/components/passport/journey";
import { Portrait } from "@/components/passport/portrait";
import { Locked, Pill } from "@/components/passport/ui";
import { isMockPassport } from "@/components/passport/shell";
import { ScoreHero } from "@/components/profile/score-hero";
import {
  aestheticScore, colorGroups, cover, hairOptions, rankedRecs, referenceRank, stripRefs, stylePlane,
  type HairOptionView, type ScoreView,
} from "@/lib/adapters";
import { backendFor, type Passport, type PassportResponse } from "@/lib/api";
import { aestheticScore as scoreCopy, entitlements, guidance, paywall, report as copy } from "@/lib/copy/zh";
import { usePassport } from "@/lib/state/passport-store";
import { cn } from "@/lib/utils";
import { ReportPdfExport } from "./export-pdf";
import {
  CHAPTER_KEYS, chapterNo, evidenceLinks, pickActive, previewNote, regionCrop, regionViews,
  type ChapterKey, type EvidenceLinks, type PreviewNote, type RecRef, type RegionView,
} from "./report-model";

export function FullReport({ sample = false }: { sample?: boolean }) {
  const { id, data, passport } = usePassport();
  const kind = backendFor(id).kind;
  const expired = Boolean(data?.media.expired);
  const geometry = useGeometry(id, !expired && Boolean(passport?.measurement_profile));
  const locked = data?.entitlement.locked;
  const mv = React.useMemo(() => (passport ? measureView(passport, id, locked ?? []) : null), [passport, id, locked]);
  const regions = React.useMemo(() => (passport && mv ? regionViews(passport, mv) : []), [passport, mv]);
  const links = React.useMemo(() => (passport ? evidenceLinks(passport, regions) : null), [passport, regions]);
  if (!passport || !data) return null;
  const paid = data.entitlement.paid;
  // synthetic sample, fixture data or mock providers: the score is labeled as a sample, never as a person's result
  const mock = sample || isMockPassport(kind, passport);
  const base = `/p/${id}`;
  return (
    <article aria-label={copy.title} className="mx-auto max-w-6xl px-4 pb-16 sm:px-6" data-testid="full-report" data-paid={paid ? "1" : "0"} data-sample={sample ? "1" : "0"}>
      <Cover p={passport} data={data} sample={sample} />
      <Glance p={passport} mv={mv} regions={regions} mock={mock} />
      <ReportPdfExport data={data} sample={sample} geometry={geometry} className="mt-6"
        demo={sample || !isMockPassport(kind, passport) ? null : kind === "fixture" ? "fixture" : "mock"} />
      {!paid && <FreeScope id={id} sample={sample} price={data.entitlement.price_cny} />}
      <div className="mt-10 lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-12">
        <Toc sample={sample} regions={regions} />
        <div className="min-w-0 max-w-3xl">
          <Overview p={passport} base={base} mock={mock} mv={mv} />
          <Findings p={passport} mv={mv} geometry={geometry} src={expired ? null : data.media.front} expired={expired} base={base} regions={regions} links={links} />
          <Interpretation p={passport} base={base} />
          <Improvements p={passport} base={base} links={links} />
          <Options p={passport} data={data} base={base} />
          <Plan p={passport} data={data} />
          <Methods p={passport} data={data} mv={mv} sample={sample} />
          {!sample && <ReportNext id={id} />}
        </div>
      </div>
    </article>
  );
}

// --- frame -----------------------------------------------------------------------------------------------------

function Cover({ p, data, sample }: { p: Passport; data: PassportResponse; sample: boolean }) {
  const c = cover(p);
  const shape = faceShape(p);
  const num = p.passport_id.replace(/^\w+_/, "").slice(-6).toUpperCase();
  const date = new Date(data.created_at);
  return (
    <header className="pt-6 md:grid md:grid-cols-[minmax(0,360px)_1fr] md:items-end md:gap-10">
      <Portrait>
        <p className="absolute left-3 top-3 rounded-full bg-black/45 px-2.5 py-0.5 text-[10px] tracking-[0.2em] text-white/85">No.{num}</p>
      </Portrait>
      <div className="mt-6 md:mt-0">
        <p className="text-[11px] tracking-[0.2em] text-muted">{sample ? copy.sampleKicker : copy.kicker}</p>
        <h1 className="mt-2 font-serif text-[28px] font-semibold leading-snug sm:text-[36px]">{copy.title}</h1>
        <p className="mt-3 max-w-[32em] text-[15px] leading-7 text-ink-soft">{c.oneLiner}</p>
        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-[13px] sm:grid-cols-3">
          <div><dt className="text-muted">脸型</dt><dd className="mt-0.5 font-medium">{shape.title}</dd></div>
          <div><dt className="text-muted">色彩倾向</dt><dd className="mt-0.5 font-medium">{p.derived.display_labels.color.summary_zh}</dd></div>
          <div><dt className="text-muted">风格方向</dt><dd className="mt-0.5 font-medium">{c.styleLine}</dd></div>
          <div className="col-span-2 sm:col-span-3"><dt className="text-muted">生成时间</dt>
            <dd className="tnum mt-0.5">{Number.isNaN(date.getTime()) ? data.created_at : date.toLocaleDateString("zh-CN")}</dd></div>
        </dl>
        {sample && <p className="mt-5 rounded-[12px] bg-amber-soft px-4 py-3 text-[13px] leading-6 text-ink" role="note">{copy.sampleNote}</p>}
        <p className="mt-4 text-[12px] leading-5 text-muted">{copy.scopeNote}</p>
      </div>
    </header>
  );
}

/** Four things to know before reading anything: each links into the chapter that backs it up. */
function Glance({ p, mv, regions, mock }: { p: Passport; mv: MeasureView | null; regions: RegionView[]; mock: boolean }) {
  const score = aestheticScore(p);
  const first = rankedRecs(p)[0];
  const strength = p.analysis.feature_signature[0];
  const items = [
    { key: "score", href: "#overview", label: "参考分",
      value: score?.score != null ? `${score.score}${score.tier ? ` · ${score.tier}` : ""}` : "这张照片暂时给不出总分",
      note: mock ? scoreCopy.sample : "模型参考，不评价长相" },
    { key: "strength", href: "#interpretation", label: "相对突出", value: strength?.title ?? "—", note: strength ? stripRefs(strength.styling_implication) : "" },
    { key: "first", href: first ? `#rec-${first.id}` : "#improvements", label: copy.leverage, value: first?.action ?? "—",
      note: first ? [first.categoryZh, first.time, first.cost].filter(Boolean).join(" · ") : "" },
    { key: "coverage", href: "#findings", label: "测量覆盖", value: mv ? `${mv.totalMeasured} / ${mv.totalDefined} 项` : "旧版档案",
      note: mv ? `${regions.filter((r) => r.measured > 0).length} 个部位 · 来自照片关键点` : "没有按部位的测量" },
  ];
  return (
    <section aria-label="本页要点" data-testid="report-glance" className="no-print mt-6 grid gap-px overflow-hidden rounded-[14px] border border-rule bg-rule sm:grid-cols-2 lg:grid-cols-4">
      {items.map((i) => (
        <a key={i.key} href={i.href} data-glance={i.key} className="block bg-paper-raised px-4 py-3 hover:bg-paper-sunk">
          <p className="text-[11px] tracking-[0.14em] text-muted">{i.label}</p>
          <p className="mt-1 line-clamp-2 font-serif text-[15.5px] leading-6">{i.value}</p>
          {i.note && <p className="mt-0.5 line-clamp-2 text-[12px] leading-5 text-muted">{i.note}</p>}
        </a>
      ))}
    </section>
  );
}

/** Scrolls to an in-page target with the smooth motion only when the visitor has not asked for less, moves keyboard
 *  focus to its heading (so the next Tab continues from there) and keeps the address in step. */
function goTo(e: React.MouseEvent, id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  e.preventDefault();
  const calm = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" });
  try { history.replaceState(null, "", `#${id}`); } catch { /* ignore */ }
  el.querySelector<HTMLElement>("h2, h3")?.focus({ preventScroll: true });
}

/** The reading line sits just below the sticky header and step bar. */
const READING_LINE = 140;

function Toc({ sample, regions }: { sample: boolean; regions: RegionView[] }) {
  const [active, setActive] = React.useState<ChapterKey>(CHAPTER_KEYS[0]);
  React.useEffect(() => {
    let raf = 0;
    const measure = () => {
      raf = 0;
      const tops = CHAPTER_KEYS.map((k) => document.getElementById(k)?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY);
      const atEnd = window.scrollY > 0 && window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      setActive(CHAPTER_KEYS[atEnd ? CHAPTER_KEYS.length - 1 : pickActive(tops, READING_LINE)]);
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(measure); };
    measure();
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", on);
      window.removeEventListener("resize", on);
    };
  }, []);
  return (
    <nav id="report-toc" aria-label={copy.toc} className="no-print mb-8 lg:mb-0">
      <div className={cn("rounded-[14px] border border-rule bg-paper-raised p-4 lg:sticky lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto lg:border-0 lg:bg-transparent lg:p-0",
        // below the sticky header (and, on a real passport, the step bar)
        sample ? "lg:top-[4.5rem]" : "lg:top-[7.25rem]")}>
        <p className="text-[11px] tracking-[0.18em] text-muted">{copy.toc}</p>
        <ol className="mt-2 grid gap-1 text-[13.5px] sm:grid-cols-2 lg:grid-cols-1">
          {CHAPTER_KEYS.map((k) => (
            <li key={k}>
              <a href={`#${k}`} onClick={(e) => goTo(e, k)} aria-current={active === k ? "location" : undefined} data-toc={k}
                className={cn("flex gap-2 rounded-[8px] py-1 hover:text-accent", active === k && "font-medium text-accent")}>
                <span className="tnum font-mono text-[12px] leading-6 text-amber">{chapterNo(k)}</span>
                <span>{copy.chapters[k].title}</span>
              </a>
              {k === "findings" && regions.length > 0 && (
                <ol className="mb-1 ml-7 hidden space-y-0.5 text-[12.5px] text-ink-soft lg:block" aria-label="按部位跳转">
                  {regions.map((r) => (
                    <li key={r.key}><a href={`#area-${r.key}`} onClick={(e) => goTo(e, `area-${r.key}`)} className="block rounded-[6px] py-0.5 hover:text-accent">{r.title}</a></li>
                  ))}
                </ol>
              )}
            </li>
          ))}
        </ol>
      </div>
    </nav>
  );
}

function Chapter({ k, children }: { k: ChapterKey; children: React.ReactNode }) {
  return (
    <section id={k} aria-labelledby={`${k}-title`} data-chapter={k} className="border-t border-rule pb-4 pt-10 first:border-t-0 first:pt-0">
      <p className="font-mono text-[12px] tracking-[0.2em] text-amber">{chapterNo(k)}</p>
      <h2 id={`${k}-title`} tabIndex={-1} className="mt-1 font-serif text-[24px] font-semibold leading-snug focus:outline-none sm:text-[28px]">{copy.chapters[k].title}</h2>
      <p className="mt-1 max-w-[36em] text-[14px] leading-7 text-ink-soft">{copy.chapters[k].sub}</p>
      <div className="mt-6">{children}</div>
      <p className="no-print mt-6 text-right text-[12px] lg:hidden">
        <a href="#report-toc" className="inline-flex items-center gap-0.5 text-muted hover:text-accent"><ChevronUp className="size-3.5" aria-hidden />回到目录</a>
      </p>
    </section>
  );
}

function Sub({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mt-8 first:mt-0", className)}>
      <h3 className="mb-3 font-serif text-[18px] font-semibold">{title}</h3>
      {children}
    </div>
  );
}

function Swatches({ hexes, size = "size-5" }: { hexes: string[]; size?: string }) {
  return (
    <span className="flex flex-wrap gap-1" aria-hidden>
      {hexes.map((h, i) => <span key={`${h}${i}`} className={cn(size, "rounded-full border border-black/10")} style={{ background: h }} />)}
    </span>
  );
}

// --- entitlement -----------------------------------------------------------------------------------------------

/** Free vs full, exactly as the server trims it (config/pricing.yaml, D33). Reused on the paywall. */
export function EntitlementTable({ className }: { className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-[14px] border border-rule bg-paper-raised", className)} data-testid="entitlement-table">
      <h3 className="border-b border-rule px-4 py-3 font-serif text-[16px] font-semibold">{entitlements.title}</h3>
      <table className="w-full text-left text-[13px] leading-6">
        <thead className="bg-paper-sunk text-[12px] text-muted">
          <tr><th className="px-4 py-2 font-normal" scope="col"><span className="sr-only">内容</span></th>
            <th className="px-2 py-2 font-normal" scope="col">{entitlements.free}</th>
            <th className="px-4 py-2 font-normal" scope="col">{entitlements.full}</th></tr>
        </thead>
        <tbody>
          {entitlements.rows.map((r) => (
            <tr key={r.area} className="border-t border-rule align-top">
              <th scope="row" className="whitespace-nowrap px-4 py-2.5 font-medium">{r.area}</th>
              <td className="px-2 py-2.5 text-ink-soft">{r.free}</td>
              <td className="px-4 py-2.5">{r.full}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-rule px-4 py-2.5 text-[12px] text-muted">{entitlements.previewNote}</p>
    </div>
  );
}

function FreeScope({ id, sample, price }: { id: string; sample: boolean; price: number }) {
  if (sample) return null;
  return (
    <div className="mt-8 rounded-[16px] border border-accent/30 bg-accent-soft p-4 sm:p-5" data-testid="report-free-scope">
      <p className="flex items-center gap-1.5 text-[13px] font-medium"><Lock className="size-3.5" />你正在阅读免费版报告</p>
      <p className="mt-1 text-[13px] leading-6 text-ink-soft">{paywall.freeScope}</p>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[13.5px]">
        <Link href={`/p/${id}/unlock`} className="font-medium text-accent underline-offset-4 hover:underline">{paywall.onUnlock} · ¥{price}</Link>
        <Link href="/report/sample" className="text-ink-soft underline-offset-4 hover:underline">{paywall.sampleReport}</Link>
      </div>
    </div>
  );
}

// --- 01 overview -----------------------------------------------------------------------------------------------

function Overview({ p, base, mock, mv }: { p: Passport; base: string; mock: boolean; mv: MeasureView | null }) {
  const score = aestheticScore(p);
  const recs = rankedRecs(p);
  const first = recs[0];
  const strengths = p.analysis.feature_signature.map((f) => ({ title: f.title, text: stripRefs(f.styling_implication) }));
  const works = p.analysis.works.slice(0, 2).map((w) => stripRefs(w.text));
  return (
    <Chapter k="overview">
      {score ? (
        <ScoreHero view={score} rank={referenceRank(p)} workbenchHref={`${base}/face`} retakeHref="/start" sample={mock} />
      ) : (
        <p className="rounded-[14px] border border-rule bg-paper-raised p-4 text-[13.5px] leading-6 text-ink-soft" data-testid="score-missing">
          这份档案生成于{scoreCopy.title}上线之前，所以没有参考分；重新上传一张正脸照即可获得。
        </p>
      )}

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-[16px] border border-rule bg-paper-raised p-5">
          <h3 className="text-[13px] font-medium text-ink-soft">{copy.strengths}</h3>
          <ul className="mt-3 space-y-3" data-testid="report-strengths">
            {strengths.map((s) => (
              <li key={s.title} className="text-[14px] leading-6">
                <span className="flex items-start gap-2"><Check className="mt-1 size-4 shrink-0 text-accent" /><b className="font-medium">{s.title}</b></span>
                <span className="ml-6 block text-[13px] text-ink-soft">{s.text}</span>
              </li>
            ))}
          </ul>
          {works.length > 0 && <p className="mt-3 border-t border-rule pt-3 text-[13px] leading-6 text-ink-soft">{works.join("；")}</p>}
        </div>
        {first && (
          <div className="flex flex-col rounded-[16px] bg-ink p-5 text-paper" data-testid="report-leverage">
            <h3 className="text-[13px] font-medium text-paper/70">{copy.leverage}</h3>
            <p className="mt-2 font-serif text-[19px] leading-8">{first.action}</p>
            <p className="mt-2 text-[13px] leading-6 text-paper/80">{first.why}</p>
            <p className="mt-auto pt-3 text-[12px] text-paper/70">
              {[first.categoryZh, first.time, first.cost].filter(Boolean).join(" · ")} · 怎么检查：{first.successCheck}
            </p>
          </div>
        )}
      </div>

      {score && score.components.length > 0 && (
        <div className="mt-6 grid gap-6 rounded-[16px] border border-rule bg-paper-raised p-5 md:grid-cols-[280px_1fr] md:items-center">
          <HarmonyChart view={score} />
          <div>
            <h3 className="text-[13px] font-medium text-ink-soft">{copy.pillars}</h3>
            {mv ? (
              <ul className="mt-2 space-y-3" data-testid="report-pillars">
                {mv.pillars.map((pl) => (
                  <li key={pl.key} className="text-[13.5px] leading-6">
                    <span className="flex items-baseline justify-between gap-3">
                      <b className="font-medium">{pl.name}</b>
                      <span className="tnum shrink-0 text-[12px] text-muted">{copy.measuredOf} {pl.measured} / {pl.total}</span>
                    </span>
                    <span className="block text-ink-soft">{pl.summary || pl.about}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[13px] text-muted">这份档案生成于深度测量上线之前，没有分维度的测量。</p>
            )}
          </div>
        </div>
      )}
    </Chapter>
  );
}

/** The four score components as a radar: geometry only, the same numbers as the score hero. */
function HarmonyChart({ view }: { view: ScoreView }) {
  // wide viewBox: the left / right axis labels sit outside the chart
  const R = 72, CX = 160, CY = 106;
  const n = view.components.length;
  const at = (i: number, r: number) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [CX + r * Math.cos(a), CY + r * Math.sin(a)] as const;
  };
  const poly = view.components.map((c, i) => at(i, (R * (c.score ?? 0)) / 100).join(",")).join(" ");
  return (
    <figure>
      <svg viewBox="0 0 320 212" className="mx-auto block w-full max-w-[280px]" role="img"
        aria-label={`${copy.harmony}：${view.components.map((c) => `${c.name} ${c.score ?? scoreCopy.notMeasured}`).join("，")}`}>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <polygon key={f} points={view.components.map((_, i) => at(i, R * f).join(",")).join(" ")} fill="none" className="stroke-rule" strokeWidth={1} />
        ))}
        {view.components.map((_, i) => { const [x, y] = at(i, R); return <line key={i} x1={CX} y1={CY} x2={x} y2={y} className="stroke-rule" strokeWidth={1} />; })}
        <polygon points={poly} className="fill-accent/20 stroke-accent" strokeWidth={2} />
        {view.components.map((c, i) => {
          const [x, y] = at(i, R + 12);
          const anchor = Math.abs(x - CX) < 1 ? "middle" : x > CX ? "start" : "end";
          return (
            <text key={c.key} x={x} y={y} textAnchor={anchor} dominantBaseline="middle" className="fill-ink-soft text-[10px]">
              {c.name} {c.score ?? "—"}
            </text>
          );
        })}
      </svg>
      <figcaption className="mt-1 text-center text-[12px] text-muted">{copy.harmony} · 0–100</figcaption>
    </figure>
  );
}

// --- 02 findings -----------------------------------------------------------------------------------------------

function Findings({ p, mv, geometry, src, expired, base, regions, links }: {
  p: Passport; mv: MeasureView | null; geometry: ReturnType<typeof useGeometry>; src: string | null; expired: boolean; base: string;
  regions: RegionView[]; links: EvidenceLinks | null;
}) {
  const shape = faceShape(p);
  return (
    <Chapter k="findings">
      <div className="rounded-[16px] border border-rule bg-paper-raised p-5">
        <h3 className="font-serif text-[17px] font-semibold">脸型：{shape.title}</h3>
        <ul className="mt-3 space-y-2" aria-label="脸型候选">
          {shape.candidates.map((c) => (
            <li key={c.key} className="grid grid-cols-[4.5em_1fr_3em] items-center gap-3 text-[13.5px]">
              <span className={c.primary ? "font-medium" : "text-ink-soft"}>{c.name}</span>
              <span className="relative h-1.5 rounded-full bg-paper-sunk">
                <span className={cn("absolute inset-y-0 left-0 rounded-full", c.primary ? "bg-accent" : "bg-rule-strong")} style={{ width: `${Math.round(c.probability * 100)}%` }} />
              </span>
              <span className="tnum text-right text-[12px] text-muted">{Math.round(c.probability * 100)}%</span>
            </li>
          ))}
        </ul>
        {shape.traits.length > 0 && <p className="mt-3 text-[13px] text-ink-soft">{shape.traits.join(" · ")}</p>}
      </div>
      {!mv && (
        <p className="mt-6 rounded-[14px] bg-paper-sunk p-4 text-[13.5px] leading-6" data-testid="findings-legacy">
          这份档案生成于深度测量上线之前，按部位的测量不可用；下面的解读与建议仍然来自这份档案。
          <Link href="/start?topic=face" className="ml-1 text-accent underline-offset-4 hover:underline">重新上传获得深度测量</Link>
        </p>
      )}
      {regions.map((r) => <Region key={r.key} r={r} geometry={geometry} src={src} expired={expired} base={base} recs={links?.byRegion[r.key] ?? []} />)}
    </Chapter>
  );
}

function Region({ r, geometry, src, expired, base, recs }: {
  r: RegionView; geometry: ReturnType<typeof useGeometry>; src: string | null; expired: boolean; base: string; recs: RecRef[];
}) {
  return (
    <section id={`area-${r.key}`} className="mt-10" data-region={r.key} aria-labelledby={`region-${r.key}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rule pb-2">
        <h3 id={`region-${r.key}`} tabIndex={-1} className="font-serif text-[20px] font-semibold focus:outline-none">{r.title}</h3>
        <span className="tnum text-[12px] text-muted">{copy.measuredOf} {r.measured} / {r.total}</span>
      </div>
      <div className="mt-4 grid gap-5 md:grid-cols-[220px_minmax(0,1fr)]">
        <RegionFigure r={r} geometry={geometry} src={src} expired={expired} />
        <div className="min-w-0">
          {r.rows.length > 0 ? (
            <ul className="divide-y divide-rule rounded-[14px] border border-rule bg-paper-raised" data-testid={`region-rows-${r.key}`}>
              {r.rows.map((row) => (
                <li key={row.id} className="px-4 py-3" data-metric-row={row.id}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[14px] font-medium">{row.name}</span>
                    <span className="tnum font-serif text-[16px]" data-testid="metric-value">{row.value}</span>
                  </div>
                  {row.assessment && (
                    <div className="mt-1.5 grid grid-cols-[1fr_auto] items-center gap-3">
                      <RangeBar a={row.assessment} m={row.metric} />
                      <span className={cn("text-[12px]", row.assessment.band === "typical" ? "text-muted" : "text-amber")}>{row.assessment.label_zh}</span>
                    </div>
                  )}
                  <p className="mt-1 text-[12px] leading-5 text-muted">{row.definition}{row.confidence ? ` · ${CONFIDENCE_ZH[row.confidence]}` : ""}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-[14px] bg-paper-sunk p-4 text-[13px] text-muted">{copy.regionNoData}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-muted">
            {r.more > 0 && <span>另有 {r.more} 项 · {copy.regionMore}</span>}
            {r.locked > 0 && <span className="inline-flex items-center gap-1" data-testid={`region-locked-${r.key}`}><Lock className="size-3" />{r.locked} {copy.regionLocked}</span>}
            {r.missing.map((m) => <span key={m.reason}>{copy.regionMissing} {m.count} 项：{m.reason}</span>)}
            <Link href={`${base}/face`} className="text-accent underline-offset-4 hover:underline">{copy.openWorkbench}</Link>
          </div>
        </div>
      </div>
      {(r.insights.length > 0 || r.observations.length > 0) && (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {r.insights.length > 0 && (
            <div>
              <h4 className="text-[12px] tracking-[0.12em] text-muted">{copy.regionInsights}</h4>
              <ul className="mt-2 space-y-2">
                {r.insights.map((i) => (
                  <li key={i.metricId} className="rounded-[12px] bg-paper-sunk px-3.5 py-2.5 text-[13.5px] leading-6">
                    <b className="font-medium">{i.label}</b>：{i.seen}
                    <span className="block text-ink-soft">{i.means}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {r.observations.length > 0 && (
            <div>
              <h4 className="text-[12px] tracking-[0.12em] text-muted">{copy.regionObservations}</h4>
              <ul className="mt-2 space-y-1.5">
                {r.observations.map((o) => (
                  <li key={o.text} className="flex gap-2 text-[13.5px] leading-6">
                    {o.polarity === "strength" ? <Check className="mt-1 size-3.5 shrink-0 text-accent" /> : <Minus className="mt-1 size-3.5 shrink-0 text-muted" />}
                    {o.text}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {recs.length > 0 && (
        <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[12.5px]" data-testid={`region-recs-${r.key}`}>
          <span className="text-muted">这些发现支撑的建议</span>
          {recs.map((x) => (
            <a key={x.recId} href={`#rec-${x.recId}`} onClick={(e) => goTo(e, `rec-${x.recId}`)} title={x.action}
              className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-0.5 text-accent hover:underline">
              <span className="tnum shrink-0">{x.rank}</span><span className="truncate">{x.action}</span>
            </a>
          ))}
        </p>
      )}
    </section>
  );
}

/** A tight crop of the front photo around this region, with the lines its measurements were computed from. */
function RegionFigure({ r, geometry, src, expired }: { r: RegionView; geometry: ReturnType<typeof useGeometry>; src: string | null; expired: boolean }) {
  const crop = React.useMemo(() => regionCrop(r.drawable, geometry), [r.drawable, geometry]);
  if (!src || !crop) {
    return (
      <div className="flex aspect-square w-full items-center justify-center rounded-[14px] bg-[var(--ap-stage)] p-4 text-center text-[12px] leading-5 text-stage-muted md:w-[220px]" data-testid="region-figure-empty">
        {expired ? copy.cropExpired : r.drawable.length ? copy.cropPending : "这一部位的测量不在正脸照上画线。"}
      </div>
    );
  }
  const [x0, y0, x1, y1] = crop.box;
  const bw = x1 - x0, bh = y1 - y0;
  const W = crop.width, H = crop.height;
  return (
    <figure className="w-full md:w-[220px]">
      <div className="relative w-full overflow-hidden rounded-[14px] bg-[var(--ap-stage)]" style={{ aspectRatio: `${(bw * W) / (bh * H)}` }} data-testid="region-figure">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={`${r.title}局部`} className="absolute max-w-none"
          style={{ width: `${100 / bw}%`, height: `${100 / bh}%`, left: `${(-x0 / bw) * 100}%`, top: `${(-y0 / bh) * 100}%` }} />
        <svg viewBox={`${x0 * W} ${y0 * H} ${bw * W} ${bh * H}`} preserveAspectRatio="none" className="pointer-events-none absolute inset-0 size-full" aria-hidden>
          <g style={{ filter: "drop-shadow(0 0 1.5px rgba(0,0,0,.55))" }}>
            {crop.overlays.flatMap((o, k) => o.segments.map((s, i) => (
              <line key={`${k}-${i}`} x1={s.a[0] * W} y1={s.a[1] * H} x2={s.b[0] * W} y2={s.b[1] * H}
                stroke={s.role === "measure" ? "var(--ap-amber)" : "rgba(255,255,255,.8)"} strokeWidth={s.role === "measure" ? 2 : 1.2}
                strokeDasharray={s.role === "measure" ? undefined : "6 5"} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            )))}
            {crop.overlays.flatMap((o, k) => [...o.segments.flatMap((s) => (s.role === "measure" ? [s.a, s.b] : [])), ...o.dots].map(([x, y], i) => (
              <circle key={`${k}-d${i}`} cx={x * W} cy={y * H} r={Math.max(bw * W, bh * H) / 90} fill="var(--ap-amber)" stroke="#fff" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            )))}
          </g>
        </svg>
      </div>
      <figcaption className="mt-1.5 text-[11.5px] leading-5 text-muted">
        正脸照局部 · 线条是 {r.drawable.slice(0, crop.overlays.length).map((m) => m.name_zh).join("、")} 的测量位置
      </figcaption>
    </figure>
  );
}

// --- 03 interpretation -----------------------------------------------------------------------------------------

function Interpretation({ p, base }: { p: Passport; base: string }) {
  const an = p.analysis;
  const color = p.derived.display_labels.color;
  return (
    <Chapter k="interpretation">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-[16px] border border-rule bg-paper-raised p-5">
          <h3 className="text-[13px] font-medium text-ink-soft">{copy.works}</h3>
          <ul className="mt-2 space-y-2" data-testid="report-works">
            {an.works.map((w) => <li key={w.text} className="flex gap-2 text-[14px] leading-6"><Check className="mt-1 size-4 shrink-0 text-accent" />{stripRefs(w.text)}</li>)}
          </ul>
        </div>
        <div className="rounded-[16px] border border-rule bg-paper-raised p-5">
          <h3 className="text-[13px] font-medium text-ink-soft">{copy.doesntWork}</h3>
          <ul className="mt-2 space-y-2" data-testid="report-doesnt-work">
            {an.doesnt_work.map((w) => (
              <li key={w.text} className="text-[14px] leading-6">
                <span className="mr-1.5 align-middle"><Pill tone={w.severity === "high" ? "amber" : "muted"}>{w.severity === "high" ? "影响较大" : w.severity === "medium" ? "影响中等" : "影响较小"}</Pill></span>
                {stripRefs(w.text)}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[12px] leading-5 text-muted">这些都是发型、配色、光线等可以改变的搭配，不是对五官的评价。</p>
        </div>
      </div>
      <Sub title={copy.signature} className="mt-8">
        <ol className="space-y-3">
          {an.feature_signature.map((f, i) => (
            <li key={f.title} className="flex gap-4 rounded-[14px] border border-rule bg-paper-raised p-4">
              <span className="tnum font-serif text-[22px] leading-none text-amber">{i + 1}</span>
              <span className="min-w-0 text-[14px] leading-6">
                <b className="font-medium">{f.title}</b>
                <span className="block text-ink-soft">所以：{stripRefs(f.styling_implication)}</span>
              </span>
            </li>
          ))}
        </ol>
      </Sub>
      {color.confidence < 0.5 && <div className="mt-4"><ConfidenceNote level="low" tip={guidance.colorCaution} /></div>}
      <p className="mt-4 text-[13px]"><Link href={`${base}/detail`} className="text-accent underline-offset-4 hover:underline">全部观察与依据 →</Link></p>
    </Chapter>
  );
}

// --- 04 improvements -------------------------------------------------------------------------------------------

function Improvements({ p, base, links }: { p: Passport; base: string; links: EvidenceLinks | null }) {
  const recs = rankedRecs(p).slice(0, 5);
  if (recs.length === 0) {
    return (
      <Chapter k="improvements">
        <p className="rounded-[14px] bg-paper-sunk p-4 text-[13.5px] leading-6 text-ink-soft" data-testid="improvements-empty">
          这次没有可以排序的建议。补充一些信息（发质、预算、偏好）后，建议会更具体。
          <Link href={`${base}/more`} className="ml-1 text-accent underline-offset-4 hover:underline">补充信息</Link>
        </p>
      </Chapter>
    );
  }
  return (
    <Chapter k="improvements">
      <ol className="space-y-3" data-testid="report-improvements">
        {recs.map((r, i) => {
          const ev = links?.byRec[r.id];
          return (
            <li key={r.id} id={`rec-${r.id}`} className="rounded-[16px] border border-rule bg-paper-raised p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <span className="tnum mt-0.5 font-serif text-[22px] leading-none text-amber" aria-label={`优先级 ${i + 1}`}>{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap gap-1.5"><Pill tone="accent">{r.categoryZh}</Pill>{r.time && <Pill>{r.time}</Pill>}{r.cost && <Pill>{r.cost}</Pill>}<Pill>{r.effort}</Pill></div>
                  <h3 className="mt-1.5 text-[16px] font-medium leading-7">{r.action}</h3>
                  <dl className="mt-2 grid gap-1.5 text-[13.5px] leading-6">
                    <div><dt className="inline text-muted">为什么 · </dt><dd className="inline text-ink-soft">{r.why}</dd></div>
                    <div><dt className="inline text-muted">能带来 · </dt><dd className="inline">{r.effect}</dd></div>
                    <div><dt className="inline text-muted">怎么检查 · </dt><dd className="inline">{r.successCheck}</dd></div>
                  </dl>
                  {ev && ev.regions.length > 0 && (
                    <p className="mt-2.5 flex flex-wrap items-center gap-x-1.5 gap-y-1.5 text-[12.5px]" data-testid={`rec-evidence-${r.id}`}>
                      <span className="text-muted">依据来自</span>
                      {ev.regions.map((g) => (
                        <a key={g.key} href={`#area-${g.key}`} onClick={(e) => goTo(e, `area-${g.key}`)}
                          className="rounded-full border border-rule px-2.5 py-0.5 text-ink-soft hover:border-accent hover:text-accent">{g.title}</a>
                      ))}
                      {ev.readings.slice(0, 2).map((x) => <span key={x.metricId} className="text-muted">· {x.label}</span>)}
                    </p>
                  )}
                  {(r.howTo.length > 0 || r.avoid || r.evidence.length > 0) && (
                    <details className="mt-2 text-[13.5px] leading-6">
                      <summary className="inline-flex min-h-8 cursor-pointer items-center text-[13px] text-accent">怎么做、避免什么、依据原文</summary>
                      <dl className="mt-1 grid gap-1.5">
                        {r.howTo.length > 0 && <div><dt className="text-muted">怎么做</dt><dd><ol className="mt-0.5 list-decimal space-y-0.5 pl-5">{r.howTo.map((h) => <li key={h}>{h}</li>)}</ol></dd></div>}
                        {r.avoid && <div><dt className="inline text-muted">避免 · </dt><dd className="inline text-ink-soft">{r.avoid}</dd></div>}
                        {r.evidence.length > 0 && <div><dt className="inline text-muted">依据 · </dt><dd className="inline text-[12.5px] text-muted">{r.evidence.join("；")}</dd></div>}
                      </dl>
                    </details>
                  )}
                  <Link href={`${base}/${r.page}`} className="mt-2 inline-flex items-center gap-1 text-[13px] text-accent underline-offset-4 hover:underline">详细说明<ArrowUpRight className="size-3.5" /></Link>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </Chapter>
  );
}

// --- 05 appearance options -------------------------------------------------------------------------------------

const PREVIEW_COPY: Record<PreviewNote, string> = {
  ai: copy.previewAi, illustration: copy.previewIllustration, locked: copy.previewLocked, not_yet: copy.previewNotYet,
  expired: copy.previewExpired, failed: copy.previewFailed,
};

function Options({ p, data, base }: { p: Passport; data: PassportResponse; base: string }) {
  const groups = colorGroups(p);
  const dl = p.derived.display_labels;
  const hair = hairOptions(p, data.partial.previews);
  const advice = adviceGroups(p).filter((g) => g.key !== "hair" && g.key !== "color" && g.key !== "style");
  const hairColors = p.analysis.color_profile.hair_color_directions;
  return (
    <Chapter k="options">
      <Sub title={copy.colorTitle}>
        <div className="rounded-[16px] border border-rule bg-paper-raised p-5" data-testid="report-color">
          <p className="font-serif text-[18px]">{dl.color.summary_zh}</p>
          {dl.seasonal_leaning && <p className="mt-1 text-[13px] text-ink-soft">{dl.seasonal_leaning.text_zh}</p>}
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {groups.map((g) => (
              <div key={g.key}>
                <h4 className="text-[12px] tracking-[0.12em] text-muted">{g.title}</h4>
                <div className="mt-1.5"><Swatches hexes={g.colors.slice(0, 8).map((c) => c.hex)} /></div>
                <p className="mt-1.5 text-[12px] leading-5 text-ink-soft">{g.colors.slice(0, 4).map((c) => c.name_zh).join("、")}</p>
              </div>
            ))}
          </div>
          {hairColors.length > 0 && (
            <p className="mt-4 flex flex-wrap items-center gap-2 border-t border-rule pt-3 text-[13px]">
              <span className="text-muted">发色方向</span>
              {hairColors.map((h) => <span key={h.hex} className="inline-flex items-center gap-1"><span className="size-3.5 rounded-full border border-black/10" style={{ background: h.hex }} />{h.name}</span>)}
            </p>
          )}
          <p className="mt-3 text-[12px] leading-5 text-muted">色彩判断受拍摄光线影响，可信度 {Math.round(dl.color.confidence * 100)}%。
            <Link href={`${base}/color`} className="ml-1 text-accent underline-offset-4 hover:underline">数字披布 →</Link></p>
        </div>
      </Sub>

      <Sub title={copy.styleTitle}>
        <div className="grid gap-5 rounded-[16px] border border-rule bg-paper-raised p-5 md:grid-cols-[280px_1fr] md:items-center">
          <div className="mx-auto w-full max-w-[260px]"><StylePlane {...stylePlane(p)} /></div>
          <div className="text-[14px] leading-7">
            <p className="font-serif text-[18px]">{cover(p).styleLine}</p>
            <p className="mt-1 text-ink-soft">{p.analysis.profile_summary.best_direction}</p>
            <p className="mt-2 text-[12px] text-muted">风格描述的是视觉印象（量感与线条），不是性格或身份。</p>
            <Link href={`${base}/style`} className="mt-1 inline-block text-[13px] text-accent underline-offset-4 hover:underline">风格详情 →</Link>
          </div>
        </div>
      </Sub>

      <Sub title={copy.hairTitle}>
        <p className="mb-3 text-[13.5px] leading-6 text-ink-soft">{p.analysis.hair_direction.texture_approach}</p>
        <ol className="grid gap-4 md:grid-cols-3" data-testid="report-hair">
          {hair.map((h) => <HairTile key={h.tier} h={h} paid={data.entitlement.paid} expired={data.media.expired} base={base} />)}
        </ol>
      </Sub>

      <Sub title={copy.makeoverTitle}>
        <ul className="grid gap-3 md:grid-cols-2" data-testid="report-makeover">
          {advice.map((g) => (
            <li key={g.key} className="rounded-[14px] border border-rule bg-paper-raised p-4">
              <div className="flex items-start justify-between gap-3">
                <h4 className="font-serif text-[16px] font-semibold">{g.title}</h4>
                {g.swatches && g.swatches.length > 0 && <Swatches hexes={g.swatches.slice(0, 5)} size="size-4" />}
              </div>
              <p className="mt-1.5 text-[14px] font-medium leading-6">{g.choose}</p>
              {g.why && <p className="mt-1 text-[13px] leading-6 text-ink-soft">{g.why}</p>}
              {g.avoid && <p className="mt-1 text-[12.5px] text-muted">避免：{g.avoid}</p>}
              <Link href={`${base}/${g.page}`} className="mt-2 inline-block text-[13px] text-accent underline-offset-4 hover:underline">怎么做 →</Link>
            </li>
          ))}
        </ul>
        <MakeoverDetails p={p} data={data} />
      </Sub>
    </Chapter>
  );
}

function HairTile({ h, paid, expired, base }: { h: HairOptionView; paid: boolean; expired: boolean; base: string }) {
  const pv = h.preview;
  const note = previewNote({ status: pv?.status ?? null, imageModel: pv?.image_model ?? null, paid, expired });
  const img = (note === "ai" || note === "illustration") && pv?.after_url ? pv.after_url : null;
  return (
    <li className={cn("flex flex-col overflow-hidden rounded-[16px] border border-rule bg-paper-raised", h.status === "excluded" && "opacity-75")} data-hair={h.tier} data-preview={note}>
      <div className="relative aspect-[4/5] bg-[var(--ap-stage)]">
        {img ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img} alt={`${h.name}：${PREVIEW_COPY[note]}`} className="absolute inset-0 size-full object-cover" />
            <span className="absolute inset-x-0 bottom-0 bg-black/55 px-2 py-1 text-center text-[11px] text-white">{PREVIEW_COPY[note]}</span>
          </>
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-2 p-4 text-center text-[12.5px] leading-5 text-stage-muted">
            {note === "locked" && <Lock className="size-4" />}
            <span>{PREVIEW_COPY[note]}</span>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex flex-wrap gap-1.5"><Pill tone={h.tier === "safe" ? "accent" : h.tier === "bold" ? "amber" : "muted"}>{h.tierZh}</Pill></div>
        <h4 className="mt-1.5 font-serif text-[17px] font-semibold leading-snug">{h.name}</h4>
        <p className="text-[12px] text-muted">{h.role}</p>
        {h.why[0] && <p className="mt-2 text-[13px] leading-6 text-ink-soft">{h.why[0]}</p>}
        <p className="mt-2 text-[12.5px] text-muted">{h.params.slice(0, 3).map((x) => x.value).join(" · ")} · 每天约 {h.minutes} 分钟</p>
        {h.issues.map((i) => <p key={i} className="text-[12.5px] text-[#b4442f]">{i}</p>)}
        <div className="mt-auto flex flex-wrap gap-x-4 pt-3 text-[13px]">
          <Link href={`${base}/hair`} className="text-accent underline-offset-4 hover:underline">发型师简报 →</Link>
          {paid && !img && !expired && <Link href={`${base}/studio?hair=${h.tier}`} className="text-ink-soft underline-offset-4 hover:underline">去实验室生成</Link>}
        </div>
      </div>
    </li>
  );
}

function MakeoverDetails({ p, data }: { p: Passport; data: PassportResponse }) {
  const an = p.analysis;
  const md = an.makeup_direction;
  const od = an.outfit_direction;
  const gs = p.derived.glasses_size;
  const lk = data.entitlement.locked;
  const pd = an.photo_direction;
  return (
    <div className="mt-4 grid gap-3 md:grid-cols-2">
      <div className="rounded-[14px] bg-paper-sunk p-4 text-[13.5px] leading-6">
        <h4 className="font-medium">{md.mode === "grooming" ? "理容细节" : "妆容细节"}</h4>
        {md.mode === "grooming" ? (
          <ul className="mt-1 list-disc pl-5 text-ink-soft">{[md.base_tone, md.brow, ...md.grooming].filter(Boolean).map((x) => <li key={x}>{x}</li>)}</ul>
        ) : (
          <dl className="mt-1 grid gap-0.5 text-ink-soft">
            <div><dt className="inline text-muted">底妆 · </dt><dd className="inline">{md.base_tone}</dd></div>
            <div><dt className="inline text-muted">唇 · </dt><dd className="inline">{md.lip}</dd></div>
            <div><dt className="inline text-muted">腮红 · </dt><dd className="inline">{md.blush.note}</dd></div>
            <div><dt className="inline text-muted">眉 · </dt><dd className="inline">{md.brow}</dd></div>
            <div><dt className="inline text-muted">眼 · </dt><dd className="inline">{md.eye_focus}</dd></div>
          </dl>
        )}
        {an.color_profile.lip_families.length > 0 && (
          <p className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px]"><span className="text-muted">唇色</span>
            {an.color_profile.lip_families.map((l) => <span key={l.hex} className="inline-flex items-center gap-1"><span className="size-3.5 rounded-full border border-black/10" style={{ background: l.hex }} />{l.name}</span>)}
          </p>
        )}
        {lk.includes("makeup.lip_families") && <LockedLine text="其余唇色" />}
      </div>
      <div className="rounded-[14px] bg-paper-sunk p-4 text-[13.5px] leading-6">
        <h4 className="font-medium">穿搭公式</h4>
        <ul className="mt-1 space-y-1 text-ink-soft">
          {od.formulas.map((f) => <li key={f.title}><b className="font-medium text-ink">{f.title}</b>：{f.pieces.join(" + ")}</li>)}
        </ul>
        {od.occasions.length > 0 && <p className="mt-1 text-[12.5px] text-muted">场合：{od.occasions.map((o) => o.look).join("；")}</p>}
        {(lk.includes("outfit.formulas") || lk.includes("outfit.occasions") || lk.includes("outfit.items")) && <LockedLine text="其余公式、单品与场合方案" />}
      </div>
      {an.glasses_direction && (
        <div className="rounded-[14px] bg-paper-sunk p-4 text-[13.5px] leading-6">
          <h4 className="font-medium">镜框尺寸</h4>
          {gs ? (
            <p className="tnum mt-1 text-ink-soft">{[["总宽", gs.total_width_mm], ["镜片", gs.lens_width_mm], ["鼻梁", gs.bridge_mm]]
              .filter((x): x is [string, number[]] => Array.isArray(x[1])).map(([k, v]) => `${k} ${v.join("–")} 毫米`).join(" · ")}
              <span className="block text-[12px] text-muted">{gs.note_zh}</span></p>
          ) : lk.includes("glasses_size") ? <LockedLine text="镜框毫米尺寸" /> : <p className="mt-1 text-muted">这次没有测得可靠的尺寸。</p>}
        </div>
      )}
      <div className="rounded-[14px] bg-paper-sunk p-4 text-[13.5px] leading-6">
        <h4 className="font-medium">拍照</h4>
        <p className="mt-1 text-ink-soft">{[pd.best_angle, pd.camera_height, pd.lighting, pd.expression].join(" · ")}</p>
        {pd.avoid.length > 0 && <p className="text-[12.5px] text-muted">避免：{pd.avoid.join("、")}</p>}
      </div>
    </div>
  );
}

function LockedLine({ text }: { text: string }) {
  return <p className="mt-2 inline-flex items-center gap-1 text-[12.5px] text-muted" data-testid="locked-line"><Lock className="size-3" />{text}包含在完整护照中</p>;
}

// --- 06 plan ---------------------------------------------------------------------------------------------------

function Plan({ p, data }: { p: Passport; data: PassportResponse }) {
  const top = rankedRecs(p).slice(0, 3);
  const plan = p.derived.plan;
  const has = plan.today.length + plan.next_haircut.length + plan.invest.length > 0;
  const cols = (["today", "next_haircut", "invest"] as const);
  return (
    <Chapter k="plan">
      <Sub title={copy.planTop}>
        <ol className="grid gap-3 md:grid-cols-3" data-testid="report-plan-top">
          {top.map((r, i) => (
            <li key={r.id} className="rounded-[14px] border border-rule bg-paper-raised p-4">
              <span className="tnum font-serif text-[20px] text-amber">{i + 1}</span>
              <p className="mt-1 text-[14px] font-medium leading-6">{r.action}</p>
              <p className="mt-1 text-[12px] text-muted">{[r.time, r.cost].filter(Boolean).join(" · ")}</p>
            </li>
          ))}
        </ol>
      </Sub>
      {has ? (
        <Sub title={copy.planFull}>
          <div className="grid gap-4 md:grid-cols-3" data-testid="report-plan-full">
            {cols.map((k) => (
              <div key={k}>
                <h4 className="mb-2 text-[13px] text-muted">{copy.planColumns[k]}</h4>
                {plan[k].length ? (
                  <ul className="space-y-2">
                    {plan[k].map((x) => (
                      <li key={x.rec_id} className="rounded-[12px] border border-rule bg-paper-raised px-3.5 py-2.5 text-[13.5px] leading-6">
                        {stripRefs(x.action)}<span className="mt-0.5 block text-[12px] text-muted">怎么检查：{x.success_check}</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-[12.5px] text-muted">这一栏暂时没有。</p>}
              </div>
            ))}
          </div>
        </Sub>
      ) : data.entitlement.locked.includes("plan") ? (
        <Locked what="按“今天 / 下次剪发 / 值得投入”排好的完整计划" />
      ) : null}
      <p className="mt-4 text-[13px]"><Link href={`/p/${data.id}/plan`} className="text-accent underline-offset-4 hover:underline">在行动方案里保存和勾选 →</Link></p>
    </Chapter>
  );
}

// --- 07 methods ------------------------------------------------------------------------------------------------

function Methods({ p, data, mv, sample }: { p: Passport; data: PassportResponse; mv: MeasureView | null; sample: boolean }) {
  const s = p.aesthetic_score;
  const expires = data.media.expires_at ? new Date(data.media.expires_at) : null;
  return (
    <Chapter k="methods">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-[14px] border border-rule bg-paper-raised p-4 text-[13px] leading-6 text-ink-soft">
          <h3 className="mb-1 text-[14px] font-medium text-ink">{copy.methodScore}</h3>
          <p>{scoreCopy.method}</p>
          <p className="mt-1">{scoreCopy.notRank}</p>
          {mv && <p className="mt-1">本次共测得 {mv.totalMeasured} / {mv.totalDefined} 项面部测量；比例是照片上的相对值，不是毫米。</p>}
        </div>
        <div className="rounded-[14px] border border-rule bg-paper-raised p-4 text-[13px] leading-6 text-ink-soft">
          <h3 className="mb-1 text-[14px] font-medium text-ink">{copy.methodModel}</h3>
          <p>测量来自照片关键点；文字观察来自一次图像分析；排序与计划由固定规则计算，你的反馈只改变建议顺序，不改变观察。</p>
          <p className="tnum mt-1 text-[12px] text-muted">
            版本：分析 {p.meta.prompt_version} · 规则 {p.meta.rules_version}{s ? ` · 参考分 ${s.scoring_version}` : ""}
          </p>
        </div>
        <div className="rounded-[14px] border border-rule bg-paper-raised p-4 text-[13px] leading-6 text-ink-soft">
          <h3 className="mb-1 text-[14px] font-medium text-ink">{copy.limitations}</h3>
          <ul className="list-disc space-y-0.5 pl-5" data-testid="report-limitations">
            {p.analysis.limitations.map((l) => <li key={l}>{l}</li>)}
          </ul>
        </div>
        <div className="rounded-[14px] border border-rule bg-paper-raised p-4 text-[13px] leading-6 text-ink-soft">
          <h3 className="mb-1 text-[14px] font-medium text-ink">{copy.methodPrivacy}</h3>
          {sample ? (
            <p>示例使用程序绘制的合成人脸，不含任何真人照片。</p>
          ) : data.media.expired ? (
            <p>{copy.photoExpired}</p>
          ) : expires && !Number.isNaN(expires.getTime()) ? (
            <p>{copy.photoExpires}：<time dateTime={data.media.expires_at!} className="tnum">{expires.toLocaleString("zh-CN")}</time>。之后报告中的文字与数字仍然保留，局部图与测量线不再显示。</p>
          ) : null}
          <p className="mt-1">{copy.exportNote}</p>
          {!sample && <p className="mt-1">需要立即删除时，在页面底部的“我的选择与数据”里操作。</p>}
        </div>
      </div>
      {!sample && <p className="mt-6 text-center text-[13px]"><Link href={`/p/${data.id}`} className="text-accent underline-offset-4 hover:underline">{copy.backToProfile}</Link></p>}
    </Chapter>
  );
}

// --- after the last chapter ------------------------------------------------------------------------------------

/** The report ends on something to do: save the plan, try it on the photo, or read each choice in detail. */
function ReportNext({ id }: { id: string }) {
  return (
    <section aria-labelledby="report-next" data-testid="report-next" className="no-print mt-10 rounded-[16px] border border-rule bg-paper-raised p-5">
      <h2 id="report-next" className="font-serif text-[18px] font-semibold">读完了，下一步</h2>
      <p className="mt-1 text-[13.5px] leading-6 text-ink-soft">把报告变成能做的事：先存下最值得做的 3 件，再到实验室里看看效果。</p>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-3">
        <Link href={journeyHref(id, "plan")} className="inline-flex h-11 items-center gap-1.5 rounded-full bg-accent px-5 text-[14px] font-medium text-[var(--ap-on-primary)] hover:opacity-90">
          保存并勾选行动方案<ArrowRight className="size-4" aria-hidden />
        </Link>
        <Link href={journeyHref(id, "studio")} className="inline-flex h-11 items-center rounded-full border border-ink/30 px-5 text-[14px] font-medium hover:border-ink">
          去形象实验室试一试
        </Link>
        <Link href={journeyHref(id, "advice")} className="text-[13.5px] text-accent underline-offset-4 hover:underline">逐项看个性化建议</Link>
      </div>
    </section>
  );
}
