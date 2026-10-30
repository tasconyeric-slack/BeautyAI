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
import { measureView, type MeasureView } from "@/components/face/measure-model";
import { journeyHref } from "@/components/passport/journey";
import { Locked, Pill } from "@/components/passport/ui";
import { isMockPassport } from "@/components/passport/shell";
import {
  colorGroups, cover, hairOptions, rankedRecs, referenceRank, stripRefs, stylePlane,
  type Tier,
} from "@/lib/adapters";
import { backendFor, type Passport, type PassportResponse } from "@/lib/api";
import { aestheticScore as scoreCopy, entitlements, guidance, paywall, report as copy } from "@/lib/copy/zh";
import { usePassport } from "@/lib/state/passport-store";
import { readChoices } from "@/lib/state/choices";
import { cn } from "@/lib/utils";
import { ReportPdfExport } from "./export-pdf";
import { HairSection } from "@/components/report-slice/hair-section";
import { photoExpired, usePhotosGone } from "@/components/report-slice/model";
import type { FaceGeometry } from "@/lib/tint";
import { CopyButton } from "@/components/ui/copy-button";
import { ReportOverview } from "./report-overview";
import { RegionMeasurements } from "./region-measurements";
import s from "./full-report.module.css";
import {
  CHAPTER_KEYS, chapterNo, evidenceLinks, pickActive, regionViews,
  type ChapterKey, type EvidenceLinks, type RecRef, type RegionView,
} from "./report-model";

const SampleContext = React.createContext(false);

/** Public examples only navigate within the report; they never enter a writable fake passport. */
function ReportLink({ href, children, ...props }: React.ComponentProps<typeof Link>) {
  const sample = React.useContext(SampleContext);
  const url = typeof href === "string" ? href : "";
  if (sample && url.startsWith("/p/")) {
    const area = url.split("/").at(-1)?.split("?")[0];
    const target = area === "face" || area === "measure" ? "findings" : area === "detail" ? "interpretation" : area === "plan" ? "plan" : area === "more" ? "methods" : area === "hair" ? "current-hair-choice" : "options";
    return <a {...props} href={`#${target}`}>{children}</a>;
  }
  return <Link {...props} href={href}>{children}</Link>;
}

function useMobileReport() {
  return React.useSyncExternalStore(React.useCallback((update) => {
    const media = window.matchMedia?.("(max-width: 767px)");
    media?.addEventListener("change", update);
    return () => media?.removeEventListener("change", update);
  }, []), () => window.matchMedia?.("(max-width: 767px)").matches ?? false, () => false);
}

export function FullReport({ sample = false }: { sample?: boolean }) {
  const { id, data, passport } = usePassport();
  const gone = usePhotosGone(data?.media ?? { expired: true, front: null, thumb: null, expires_at: null });
  const geometry = useGeometry(id, !gone && Boolean(passport?.measurement_profile));
  return data ? <FullReportContent key={id} data={data} geometry={geometry} sample={sample} /> : null;
}

/** One engine for the isolated comparison and both existing production entries. */
export function FullReportContent({ data: source, geometry: rawGeometry, sample = false }: { data: PassportResponse; geometry: FaceGeometry | null; sample?: boolean }) {
  const gone = usePhotosGone(source.media);
  const mobile = useMobileReport();
  const [selected, setSelected] = React.useState<Tier | null>(null);
  React.useEffect(() => {
    if (sample) return;
    const sync = () => {
      const tier = readChoices(source.id).hair?.tier;
      if (tier && ["safe", "bold", "easy"].includes(tier)) setSelected(tier as Tier);
    };
    sync();
    window.addEventListener("ap-choices", sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener("ap-choices", sync); window.removeEventListener("storage", sync); };
  }, [sample, source.id]);
  // Sanitize media at the presentation boundary, including PDF export and nested preview consumers.
  const data = React.useMemo(() => gone ? { ...source, media: { ...source.media, expired: photoExpired(source.media), front: null, photos: {}, thumb: null }, partial: { ...source.partial, previews: [] } } : source, [source, gone]);
  const p = data.passport;
  const mv = React.useMemo(() => p ? measureView(p, data.id, data.entitlement.locked) : null, [p, data.id, data.entitlement.locked]);
  const regions = React.useMemo(() => p && mv ? regionViews(p, mv) : [], [p, mv]);
  const links = React.useMemo(() => p ? evidenceLinks(p, regions) : null, [p, regions]);
  if (!p) return <p role="status">报告尚未准备好。</p>;
  const kind = backendFor(data.id).kind;
  const geometry = gone ? null : rawGeometry;
  const base = `/p/${data.id}`;
  const current = hairOptions(p, data.partial.previews).find(o => o.tier === selected && o.status !== "excluded") ?? hairOptions(p, data.partial.previews).find(o => o.status !== "excluded");
  const chapters = {
    overview: <Chapter k="overview"><ReportOverview data={data} mv={mv} sample={sample} gone={gone} geometry={geometry} exportAction={<ReportPdfExport data={data} sample={sample} geometry={geometry} compact demo={sample || !isMockPassport(kind, p) ? null : kind === "fixture" ? "fixture" : "mock"} />} /></Chapter>,
    findings: <Findings p={p} mv={mv} geometry={geometry} data={data} gone={gone} sample={sample} base={base} regions={regions} links={links} />,
    interpretation: <Interpretation p={p} base={base} />,
    improvements: <Improvements p={p} base={base} links={links} hair={<HairSection p={p} data={data} gone={gone} sample={sample} embedded selectedTier={selected} onSelect={setSelected} />} />,
    options: <Options p={p} data={data} base={base} />,
    plan: <Plan p={p} data={data} sample={sample} currentName={current?.name ?? null} />,
    methods: <Methods p={p} data={data} mv={mv} sample={sample} />,
  };
  const order: ChapterKey[] = CHAPTER_KEYS;
  return <SampleContext.Provider value={sample}><article className={s.root} aria-label={copy.title} data-testid="full-report" data-report-layout={mobile ? "mobile" : "desktop"} data-paid={data.entitlement.paid ? "1" : "0"} data-sample={sample ? "1" : "0"}>
    {!data.entitlement.paid && <FreeScope id={data.id} sample={sample} price={data.entitlement.price_cny} />}
    <div className={s.reportCover}>{chapters.overview}</div><div className={s.frame}><Toc sample={sample} regions={regions} order={order} /><div className={s.chapters}>{order.filter(k => k !== "overview").map(k => <React.Fragment key={k}>{chapters[k]}</React.Fragment>)}{!sample && <ReportNext id={data.id} />}</div></div>
  </article></SampleContext.Provider>;
}

/** Scrolls to an in-page target with the smooth motion only when the visitor has not asked for less, moves keyboard
 *  focus to its heading (so the next Tab continues from there) and keeps the address in step. */
function goTo(e: React.MouseEvent, id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  e.preventDefault();
  for (let parent = el.parentElement; parent; parent = parent.parentElement) if (parent instanceof HTMLDetailsElement) parent.open = true;
  const calm = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" });
  try { history.replaceState(null, "", `#${id}`); } catch { /* ignore */ }
  el.querySelector<HTMLElement>("h1, h2, h3")?.focus({ preventScroll: true });
}

/** The reading line sits just below the sticky header and step bar. */
const READING_LINE = 140;

function Toc({ sample, regions, order }: { sample: boolean; regions: RegionView[]; order: ChapterKey[] }) {
  const [active, setActive] = React.useState<ChapterKey>(CHAPTER_KEYS[0]);
  React.useEffect(() => {
    let raf = 0;
    const measure = () => {
      raf = 0;
      const tops = order.map((k) => document.getElementById(k)?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY);
      const atEnd = window.scrollY > 0 && window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      setActive(order[atEnd ? order.length - 1 : pickActive(tops, READING_LINE)]);
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
  }, [order.join(",")]);
  return (
    <nav id="report-toc" aria-label={copy.toc} className="no-print mb-8 lg:mb-0">
      <div className={cn("rounded-[14px] border border-rule bg-paper-raised p-4 lg:sticky lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto lg:border-0 lg:bg-transparent lg:p-0",
        // below the sticky header (and, on a real passport, the step bar)
        sample ? "lg:top-[4.5rem]" : "lg:top-[7.25rem]")}>
        <p className="text-[11px] tracking-[0.18em] text-muted">{copy.toc}</p>
        <ol className="mt-2 grid gap-1 text-[13.5px] sm:grid-cols-2 lg:grid-cols-1">
          {order.map((k) => (
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
  if (k === "overview") return <section id={k} aria-labelledby="overview-title" data-chapter={k}>{children}</section>;
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
        <ReportLink href={`/p/${id}/unlock`} className="font-medium text-accent underline-offset-4 hover:underline">{paywall.onUnlock} · ¥{price}</ReportLink>
        <ReportLink href="/report/sample" className="text-ink-soft underline-offset-4 hover:underline">{paywall.sampleReport}</ReportLink>
      </div>
    </div>
  );
}

// --- 01 overview -----------------------------------------------------------------------------------------------

// --- 02 findings -----------------------------------------------------------------------------------------------

function Findings({ p, mv, geometry, data, gone, sample, base, regions, links }: {
  p: Passport; mv: MeasureView | null; geometry: FaceGeometry | null; data: PassportResponse; gone: boolean; sample: boolean; base: string;
  regions: RegionView[]; links: EvidenceLinks | null;
}) {
  const shape = faceShape(p);
  return (
    <Chapter k="findings">
      <div className="rounded-[16px] border border-rule bg-paper-raised p-5">
        <p className="text-[12px] text-muted">轮廓特征</p>
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
          <ReportLink href="/start?topic=face" className="ml-1 text-accent underline-offset-4 hover:underline">重新上传获得深度测量</ReportLink>
        </p>
      )}
      {regions.map((r) => <Region key={r.key} r={r} geometry={geometry} data={data} gone={gone} sample={sample} recs={links?.byRegion[r.key] ?? []} />)}
    </Chapter>
  );
}

function Region({ r, geometry, data, gone, sample, recs }: {
  r: RegionView; geometry: FaceGeometry | null; data: PassportResponse; gone: boolean; sample: boolean; recs: RecRef[];
}) {
  return (
    <section id={`area-${r.key}`} className="mt-10" data-region={r.key} aria-labelledby={`region-${r.key}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rule pb-2">
        <h3 id={`region-${r.key}`} tabIndex={-1} className="font-serif text-[20px] font-semibold focus:outline-none">{r.title}</h3>
        <span className="tnum text-[12px] text-muted">{copy.measuredOf} {r.measured} / {r.total}</span>
      </div>
      <RegionMeasurements r={r} geometry={geometry} data={data} gone={gone} sample={sample} />
      {r.insights.length > 0 && <table className={s.insightTable}><thead><tr><th>面部特点</th><th>造型启发</th></tr></thead><tbody>{r.insights.map(i => <tr key={i.metricId}><th scope="row">{i.label}<small>{i.seen}</small></th><td>{i.means}</td></tr>)}</tbody></table>}
      {r.observations.length > 0 && <details className={s.observationDetails}><summary>照片细节</summary><ul>{r.observations.map(o => <li key={o.text}>{o.text}</li>)}</ul></details>}
      {recs.length > 0 && (
        <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[12.5px]" data-testid={`region-recs-${r.key}`}>
          <span className="text-muted">相关造型建议</span>
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
          <p className="mt-3 text-[12px] leading-5 text-muted">从发型、配色与光线入手，让视觉重心更清晰。</p>
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
      <p className="mt-4 text-[13px]"><ReportLink href={`${base}/detail`} className="text-accent underline-offset-4 hover:underline">全部观察与依据 →</ReportLink></p>
    </Chapter>
  );
}

// --- 04 improvements -------------------------------------------------------------------------------------------

function Improvements({ p, base, links, hair }: { p: Passport; base: string; links: EvidenceLinks | null; hair: React.ReactNode }) {
  const recs = rankedRecs(p).slice(0, 5);
  if (recs.length === 0) {
    return (
      <Chapter k="improvements">
        <p className="rounded-[14px] bg-paper-sunk p-4 text-[13.5px] leading-6 text-ink-soft" data-testid="improvements-empty">
          这次没有可以排序的建议。补充一些信息（发质、预算、偏好）后，建议会更具体。
          <ReportLink href={`${base}/more`} className="ml-1 text-accent underline-offset-4 hover:underline">补充信息</ReportLink>
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
                  <h3 className="mt-1.5 font-serif text-[21px] font-medium leading-8">{r.page === "hair" && <small className="block font-sans text-[11px] text-muted">优先方向</small>}{r.action}</h3>
                  {r.page === "hair" && hair}
                  <dl className="mt-2 grid gap-1.5 text-[13.5px] leading-6">
                    <div><dt className="inline text-muted">为什么 · </dt><dd className="inline text-ink-soft">{r.why}</dd></div>
                    <div><dt className="inline text-muted">能带来 · </dt><dd className="inline">{r.effect}</dd></div>
                    <div><dt className="inline text-muted">怎么检查 · </dt><dd className="inline">{r.successCheck}</dd></div>
                  </dl>
                  {ev && ev.regions.length > 0 && (
                    <p className="mt-2.5 flex flex-wrap items-center gap-x-1.5 gap-y-1.5 text-[12.5px]" data-testid={`rec-evidence-${r.id}`}>
                      <span className="text-muted">相关特点</span>
                      {ev.regions.map((g) => (
                        <a key={g.key} href={`#area-${g.key}`} onClick={(e) => goTo(e, `area-${g.key}`)}
                          className="rounded-full border border-rule px-2.5 py-0.5 text-ink-soft hover:border-accent hover:text-accent">{g.title}</a>
                      ))}
                      {ev.readings.slice(0, 2).map((x) => <span key={x.metricId} className="text-muted">· {x.label}</span>)}
                    </p>
                  )}
                  {(r.howTo.length > 0 || r.avoid || r.evidence.length > 0) && (
                    <details data-rec-howto className="mt-2 text-[13.5px] leading-6">
                      <summary className="inline-flex min-h-8 cursor-pointer items-center text-[13px] text-accent">具体做法</summary>
                      <dl className="mt-1 grid gap-1.5">
                        {r.howTo.length > 0 && <div><dt className="text-muted">怎么做</dt><dd><ol className="mt-0.5 list-decimal space-y-0.5 pl-5">{r.howTo.map((h) => <li key={h}>{h}</li>)}</ol></dd></div>}
                        {r.avoid && <div><dt className="inline text-muted">避免 · </dt><dd className="inline text-ink-soft">{r.avoid}</dd></div>}
                        {r.evidence.length > 0 && <div><dt className="inline text-muted">依据 · </dt><dd className="inline text-[12.5px] text-muted">{r.evidence.join("；")}</dd></div>}
                      </dl>
                    </details>
                  )}
                  <ReportLink href={`${base}/${r.page}`} className="mt-2 inline-flex items-center gap-1 text-[13px] text-accent underline-offset-4 hover:underline">详细说明<ArrowUpRight className="size-3.5" /></ReportLink>
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

function Options({ p, data, base }: { p: Passport; data: PassportResponse; base: string }) {
  const groups = colorGroups(p);
  const dl = p.derived.display_labels;
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
          <p className="mt-3 text-[12px] leading-5 text-muted">自然光下比较，更容易找到适合的颜色。
            <ReportLink href={`${base}/color`} className="ml-1 text-accent underline-offset-4 hover:underline">数字披布 →</ReportLink></p>
        </div>
      </Sub>

      <Sub title={copy.styleTitle}>
        <div className="grid gap-5 rounded-[16px] border border-rule bg-paper-raised p-5 md:grid-cols-[280px_1fr] md:items-center">
          <div className="mx-auto w-full max-w-[260px]"><StylePlane {...stylePlane(p)} /></div>
          <div className="text-[14px] leading-7">
            <p className="font-serif text-[18px]">{cover(p).styleLine}</p>
            <p className="mt-1 text-ink-soft">{p.analysis.profile_summary.best_direction}</p>

            <ReportLink href={`${base}/style`} className="mt-1 inline-block text-[13px] text-accent underline-offset-4 hover:underline">风格详情 →</ReportLink>
          </div>
        </div>
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
              <ReportLink href={`${base}/${g.page}`} className="mt-2 inline-block text-[13px] text-accent underline-offset-4 hover:underline">怎么做 →</ReportLink>
            </li>
          ))}
        </ul>
        <MakeoverDetails p={p} data={data} />
      </Sub>
    </Chapter>
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

function Plan({ p, data, sample, currentName }: { p: Passport; data: PassportResponse; sample: boolean; currentName: string | null }) {
  const top = rankedRecs(p).slice(0, 3);
  const plan = p.derived.plan;
  const has = plan.today.length + plan.next_haircut.length + plan.invest.length > 0;
  const cols = (["today", "next_haircut", "invest"] as const);
  return (
    <Chapter k="plan">
      <p data-testid="report-current-plan">当前发型方向：{currentName ?? "暂无可选方向"}。</p>
      {sample && <p className="text-[12px] text-muted">复制这份清单，找到适合自己的第一步。</p>}
      <CopyButton label="复制行动清单" text={top.map((r, i) => `${i + 1}. ${r.action}\n怎么检查：${r.successCheck}`).join("\n\n")} />
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
      {!sample && <p className="mt-4 text-[13px]"><ReportLink href={`/p/${data.id}/plan`} className="text-accent underline-offset-4 hover:underline">在行动方案里保存和勾选 →</ReportLink></p>}
    </Chapter>
  );
}

// --- 07 methods ------------------------------------------------------------------------------------------------

function Methods({ p }: { p: Passport; data: PassportResponse; mv: MeasureView | null; sample: boolean }) {
  return <Chapter k="methods">
    <ul className={s.limitations} data-testid="report-limitations">{p.analysis.limitations.map(l => <li key={l}>{l}</li>)}</ul>
    <p className={s.credits}><Link href="/about#data-sources">数据来源</Link></p>
  </Chapter>;
}

// --- after the last chapter ------------------------------------------------------------------------------------

/** The report ends on something to do: save the plan, try it on the photo, or read each choice in detail. */
function ReportNext({ id }: { id: string }) {
  return (
    <section aria-labelledby="report-next" data-testid="report-next" className="no-print mt-10 rounded-[16px] border border-rule bg-paper-raised p-5">
      <h2 id="report-next" className="font-serif text-[18px] font-semibold">读完了，下一步</h2>
      <p className="mt-1 text-[13.5px] leading-6 text-ink-soft">把报告变成能做的事：先存下最值得做的 3 件，再到实验室里看看效果。</p>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-3">
        <ReportLink href={journeyHref(id, "plan")} className="inline-flex h-11 items-center gap-1.5 rounded-full bg-accent px-5 text-[14px] font-medium text-[var(--ap-on-primary)] hover:opacity-90">
          保存并勾选行动方案<ArrowRight className="size-4" aria-hidden />
        </ReportLink>
        <ReportLink href={journeyHref(id, "studio")} className="inline-flex h-11 items-center rounded-full border border-ink/30 px-5 text-[14px] font-medium hover:border-ink">
          去形象实验室试一试
        </ReportLink>
        <ReportLink href={journeyHref(id, "advice")} className="text-[13.5px] text-accent underline-offset-4 hover:underline">逐项看个性化建议</ReportLink>
      </div>
    </section>
  );
}
