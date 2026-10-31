"use client";

/** Facial feature atlas (Issue #32, D39): twelve regions, each with a crop of its own photo, the traits that can be
 *  seen, what they imply for styling, and the evidence behind every line — measured (CV), rules, the analysis model's
 *  description, or what the person entered. Desktop: region navigation on the left, the region on the right; mobile:
 *  a scrolling region bar. Hovering or focusing a measured fact previews its lines on the crop, clicking pins it; the
 *  workbench button pins the same metric in the measurement workbench above.
 *
 *  View data comes from atlas-model.ts; this file only lays it out. */
import { ArrowRight, Lock } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { atlas as copy } from "@/lib/copy/zh";
import type { FaceGeometry } from "@/lib/tint";
import { cn } from "@/lib/utils";
import { ATLAS, atlasCrop, type Atlas, type AtlasCrop, type AtlasRegion, type ConceptState, type Provenance } from "./atlas-model";
import { arcPath, CONFIDENCE_ZH, type MeasureView, type ViewRole } from "./measure-model";

const PROV_CLS: Record<Provenance, string> = {
  measured: "border-amber/40 bg-amber-soft text-amber",
  rules: "border-rule-strong bg-paper-sunk text-ink-soft",
  observed: "border-accent/30 bg-accent-soft text-accent",
  entered: "border-rule bg-paper text-ink-soft",
};
const STATE_CLS: Record<ConceptState, string> = {
  measured: "bg-amber-soft text-amber", locked: "bg-paper-sunk text-ink-soft", needs_photo: "bg-paper-sunk text-ink-soft",
  not_measured: "bg-paper-sunk text-muted", observed: "bg-accent-soft text-accent", not_observed: "bg-paper-sunk text-muted",
  deferred: "bg-paper-sunk text-muted", unsupported: "bg-paper-sunk text-muted",
};

const ROLE_TAG: Record<ViewRole, string> = { front: "", noglasses: copy.noglassesTag, profile90: copy.sideTag, smile: copy.smileTag };

export function ProvenanceBadge({ p }: { p: Provenance }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center rounded-full border px-1.5 text-[10.5px] leading-[18px]", PROV_CLS[p])} data-provenance={p}>
      {ATLAS.provenance_zh[p]}
    </span>
  );
}

function regionStatus(r: AtlasRegion): string {
  if (r.state === "needs_photo") return copy.navNeedsPhoto;
  if (r.state === "unavailable") return copy.navUnavailable;
  if (r.measured) return `${copy.navMeasured} ${r.measured}`;
  return copy.navObserved;
}

// --- crop ------------------------------------------------------------------------------------------------------

function CropFigure({ crop, src, region, label, expired }: {
  crop: AtlasCrop | null; src: string | null; region: AtlasRegion; label: string | null; expired: boolean;
}) {
  if (!src || !crop) {
    const text = expired ? copy.cropExpired : region.state === "needs_photo" ? copy.cropNeedsPhoto
      : !src ? copy.cropNoPhoto : copy.cropNone;
    return (
      <div className="flex aspect-square w-full items-center justify-center rounded-[4px] bg-[var(--ap-stage)] p-4 text-center text-[12px] leading-5 text-stage-muted"
        data-testid="atlas-crop-empty">{text}</div>
    );
  }
  const [x0, y0, x1, y1] = crop.box;
  const bw = x1 - x0, bh = y1 - y0;
  const W = crop.width, H = crop.height;
  const o = crop.overlay;
  const r = Math.max(bw * W, bh * H);
  return (
    <figure className="w-full">
      <div className="relative w-full overflow-hidden rounded-[4px] bg-[var(--ap-stage)]" style={{ aspectRatio: `${(bw * W) / (bh * H)}` }}
        data-testid="atlas-crop" data-crop-role={crop.role}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={`${region.name}${copy.cropAlt}`} className="absolute max-w-none"
          style={{ width: `${100 / bw}%`, height: `${100 / bh}%`, left: `${(-x0 / bw) * 100}%`, top: `${(-y0 / bh) * 100}%` }} />
        {o && (
          <svg viewBox={`${x0 * W} ${y0 * H} ${bw * W} ${bh * H}`} preserveAspectRatio="none" className="pointer-events-none absolute inset-0 size-full"
            aria-hidden data-atlas-overlay={label ?? ""}>
            <g key={label ?? ""} className="ap-rise" style={{ filter: "drop-shadow(0 0 1.5px rgba(0,0,0,.6))" }}>
              {crop.silhouette && (
                <polyline points={crop.silhouette.map(([x, y]) => `${x * W},${y * H}`).join(" ")} fill="none"
                  stroke="rgba(255,255,255,.75)" strokeWidth={1.3} vectorEffect="non-scaling-stroke" />
              )}
              {o.segments.map((s, i) => (
                <line key={i} x1={s.a[0] * W} y1={s.a[1] * H} x2={s.b[0] * W} y2={s.b[1] * H} data-role={s.role}
                  stroke={s.role === "measure" ? "var(--ap-amber)" : "rgba(255,255,255,.85)"} strokeWidth={s.role === "measure" ? 2.2 : 1.2}
                  strokeDasharray={s.role === "measure" ? undefined : "6 5"} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              ))}
              {o.arcs.map((a, i) => (
                <path key={i} d={arcPath(a, W, H, r * 0.08)} fill="none" stroke="var(--ap-amber)" strokeWidth={1.8} vectorEffect="non-scaling-stroke" />
              ))}
              {[...o.segments.flatMap((s) => (s.role === "measure" ? [s.a, s.b] : [])), ...o.dots].map(([x, y], i) => (
                <circle key={i} cx={x * W} cy={y * H} r={r / 90} fill="var(--ap-amber)" stroke="#fff" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              ))}
            </g>
          </svg>
        )}
      </div>
      <figcaption className="mt-1.5 text-[11.5px] leading-5 text-muted" aria-live="polite" data-testid="atlas-crop-caption">
        {crop.role === "profile90" ? copy.cropSide : crop.role === "noglasses" ? copy.cropNoglasses : copy.cropFront}
        {o && label ? <> · {copy.cropShowing}<span className="text-ink">{label}</span>{copy.cropLegend}</> : <> · {copy.cropPlain}</>}
      </figcaption>
    </figure>
  );
}

// --- one region ------------------------------------------------------------------------------------------------

function RegionPanel({ r, v, id, geometry, photos, expired, onShowMetric, onAddSide }: {
  r: AtlasRegion; v: MeasureView; id: string; geometry: FaceGeometry | null; photos: Partial<Record<ViewRole, string | null>>;
  expired: boolean; onShowMetric?: (metricId: string, role: ViewRole) => void; onAddSide?: () => void;
}) {
  const [pinned, setPinned] = React.useState<string | null>(null);
  const [hover, setHover] = React.useState<string | null>(null);
  const focusIds = r.focus.map((m) => m.id);
  const shownId = (hover && focusIds.includes(hover) ? hover : null) ?? (pinned && focusIds.includes(pinned) ? pinned : null) ?? focusIds[0] ?? null;
  const shown = shownId ? v.byId[shownId] : null;
  const crop = React.useMemo(() => atlasCrop(r, geometry, shown), [r, geometry, shown]);
  // the crop's own photo: a glasses-free metric is shown on the glasses-free photo, never on the portrait
  const src = expired ? null : photos[crop?.role ?? r.role] ?? null;

  return (
    <div role="tabpanel" id={`atlas-panel-${r.key}`} aria-labelledby={`atlas-tab-${r.key}`} data-atlas-region={r.key} data-state={r.state}
      className="min-w-0 rounded-[4px] border border-rule bg-paper-raised p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="font-serif text-[20px] font-semibold">{r.name}</h3>
        <span className="tnum text-[12px] text-muted">
          {r.total ? `${copy.measuredOf} ${r.measured} / ${r.total}` : copy.noMetrics}
          {r.locked ? ` · ${copy.lockedA}${r.locked}${copy.lockedB}` : ""}
        </span>
      </div>
      <p className="mt-1 text-[13px] leading-6 text-ink-soft">{r.about}</p>

      <div className="mt-4 grid gap-5 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
        <CropFigure crop={crop} src={src} region={r} label={shown?.name_zh ?? null} expired={expired} />
        <div className="min-w-0 space-y-4">
          {r.state === "unavailable" ? (
            <p className="rounded-[4px] bg-paper px-3 py-2.5 text-[13px] leading-6 text-ink-soft" data-testid="atlas-unavailable">{copy.regionUnavailable}</p>
          ) : r.state === "needs_photo" ? (
            <div className="rounded-[4px] bg-paper px-3 py-2.5 text-[13px] leading-6 text-ink-soft" data-testid="atlas-needs-photo">
              <p>{r.missing[0]?.reason ?? copy.regionNeedsPhoto}</p>
              {r.role === "profile90" && onAddSide && (
                <button type="button" onClick={onAddSide} className="mt-2 min-h-11 rounded-full bg-accent px-4 text-[13.5px] text-[var(--ap-on-primary)]">{copy.addSide}</button>
              )}
            </div>
          ) : null}
          {r.traits.length > 0 && (
            <div>
              <h4 className="text-[12px] tracking-wide text-muted">{copy.traitsTitle}</h4>
              <ul className="mt-1.5 space-y-1.5" data-testid="atlas-traits">
                {r.traits.map((t) => (
                  <li key={t.text} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="font-serif text-[16px] font-semibold">{t.text}</span>
                    <ProvenanceBadge p={t.provenance} />
                    {t.detail && <span className="tnum text-[12px] text-muted">{t.detail}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {r.implications.length > 0 && (
            <div>
              <h4 className="text-[12px] tracking-wide text-muted">{r.state === "observed" ? copy.implicationsTitle : copy.implicationsContext}</h4>
              <ul className="mt-1.5 space-y-2" data-testid="atlas-implications">
                {r.implications.map((m) => (
                  <li key={m.text} className="rounded-[4px] border border-rule bg-paper px-3 py-2">
                    <p className="text-[14px] leading-6">{m.text}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
                      <ProvenanceBadge p={m.provenance} />
                      {m.basis && <span className="min-w-0">{copy.basis}{m.basis}</span>}
                      <Link href={m.href} className="ml-auto inline-flex min-h-8 items-center gap-1 text-accent underline-offset-4 hover:underline">
                        {m.label}<ArrowRight className="size-3" aria-hidden />
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {r.facts.length > 0 && (
        <div className="mt-5">
          <h4 className="flex items-center gap-2 text-[12px] tracking-wide text-muted">{copy.factsTitle}<ProvenanceBadge p="measured" /></h4>
          <ul className="mt-1.5 divide-y divide-rule overflow-hidden rounded-[4px] border border-rule" data-testid="atlas-facts">
            {r.facts.map((f) => {
              const drawable = focusIds.includes(f.metricId);
              const isShown = shownId === f.metricId;
              return (
                <li key={f.metricId} className={cn("grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2", isShown && "bg-paper-sunk")}>
                  <button type="button" data-atlas-metric={f.metricId} aria-pressed={drawable ? pinned === f.metricId : undefined}
                    disabled={!drawable}
                    onPointerEnter={(e) => { if (drawable && e.pointerType !== "touch") setHover(f.metricId); }}
                    onPointerLeave={(e) => { if (e.pointerType !== "touch") setHover(null); }}
                    onFocus={() => drawable && setHover(f.metricId)} onBlur={() => setHover(null)}
                    onClick={() => drawable && setPinned(f.metricId)}
                    title={drawable ? copy.factHint : copy.factNoLine}
                    className="grid min-h-11 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-3 py-1.5 text-left enabled:hover:bg-paper-sunk disabled:cursor-default focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--ap-primary)]">
                    <span className="min-w-0">
                      <span className="block truncate text-[13.5px]">{f.name}{f.related && <span className="ml-1 text-[11px] text-muted">{copy.relatedTag}</span>}</span>
                      <span className="block truncate text-[11.5px] text-muted">
                        {f.assessment ? f.assessment.label_zh : copy.describeOnly} · {CONFIDENCE_ZH[f.confidence ?? "low"]}
                        {f.role !== "front" ? ` · ${ROLE_TAG[f.role]}` : ""}
                      </span>
                    </span>
                    <span className="tnum text-[14px]">{f.value}</span>
                  </button>
                  {onShowMetric && (
                    <button type="button" onClick={() => onShowMetric(f.metricId, f.role)} aria-label={`${copy.inWorkbench}：${f.name}`}
                      className="mr-1 min-h-11 rounded-full px-2.5 text-[12px] text-accent hover:bg-accent-soft">{copy.inWorkbenchShort}</button>
                  )}
                </li>
              );
            })}
          </ul>
          {(r.more > 0 || r.locked > 0) && (
            <p className="mt-1.5 text-[12px] leading-5 text-muted">
              {r.more > 0 && <>{copy.moreA}{r.more}{copy.moreB}</>}
              {r.locked > 0 && (
                <Link href={`/p/${id}/unlock`} className="ml-1 inline-flex items-center gap-1 text-accent underline-offset-4 hover:underline">
                  <Lock className="size-3" aria-hidden />{r.locked}{copy.lockedLink}
                </Link>
              )}
            </p>
          )}
        </div>
      )}

      {(r.observations.length > 0 || r.descriptors.length > 0) && (
        <div className="mt-5">
          <h4 className="flex items-center gap-2 text-[12px] tracking-wide text-muted">{copy.observedTitle}<ProvenanceBadge p="observed" /></h4>
          <ul className="mt-1.5 space-y-1 border-l-2 border-accent/30 pl-3 text-[13px] leading-6 text-ink-soft" data-testid="atlas-observations">
            {r.observations.map((o) => <li key={o.id} data-facial={o.facial}>{!o.facial && <span className="mr-1 text-[11.5px] text-muted">{copy.contextTag}</span>}{o.text}</li>)}
            {r.descriptors.length > 0 && <li>{copy.descriptors}{r.descriptors.join("、")}</li>}
          </ul>
          <p className="mt-1 text-[11.5px] text-muted">{copy.observedNote}</p>
        </div>
      )}

      {r.entered.length > 0 && (
        <div className="mt-5">
          <h4 className="flex items-center gap-2 text-[12px] tracking-wide text-muted">{copy.enteredTitle}<ProvenanceBadge p="entered" /></h4>
          <dl className="mt-1.5 grid gap-x-4 gap-y-1 text-[13px] sm:grid-cols-[auto_1fr]" data-testid="atlas-entered">
            {r.entered.map((e) => (
              <React.Fragment key={e.label}><dt className="text-muted">{e.label}</dt><dd>{e.value}</dd></React.Fragment>
            ))}
          </dl>
          {r.key === "general" && <p className="mt-1 text-[11.5px] text-muted">{copy.enteredNote}</p>}
        </div>
      )}

      <details className="group mt-5 rounded-[4px] border border-rule bg-paper px-3 py-2" data-testid="atlas-coverage">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-[13px]">
          <span>{copy.coverageTitle}<span className="ml-2 text-[11.5px] text-muted">{r.concepts.length}{copy.coverageCount}</span></span>
          <span className="text-[12px] text-accent group-open:hidden">{copy.expand}</span>
        </summary>
        <ul className="mt-1 divide-y divide-rule text-[12.5px] leading-5">
          {r.concepts.map((c) => (
            <li key={c.zh} className="grid grid-cols-[minmax(0,8.5em)_auto_minmax(0,1fr)] items-baseline gap-x-2 py-1.5" data-concept-state={c.state}>
              <span>{c.zh}</span>
              <span className={cn("rounded-full px-1.5 text-[11px] leading-[18px]", STATE_CLS[c.state])}>{c.stateZh}{c.count ? ` ${c.count}` : ""}</span>
              <span className="text-muted">{c.note ?? ""}</span>
            </li>
          ))}
        </ul>
        {r.missing.length > 0 && (
          <p className="mt-1.5 text-[11.5px] leading-5 text-muted">{r.missing.map((m) => `${m.reason}（${m.count} 项）`).join("；")}</p>
        )}
      </details>
    </div>
  );
}

// --- overview --------------------------------------------------------------------------------------------------

function Overview({ a, onPick }: { a: Atlas; onPick: (key: string) => void }) {
  const o = a.overview;
  return (
    <div className="grid gap-3 lg:grid-cols-3" data-testid="atlas-overview">
      <div className="rounded-[4px] border border-rule bg-paper-raised p-4">
        <h3 className="text-[13px] font-medium">{copy.strongestTitle}</h3>
        <ul className="mt-2 space-y-1.5">
          {o.strongest.map((s) => (
            <li key={s.text}>
              <button type="button" onClick={() => onPick(s.region)} className="flex min-h-8 w-full flex-wrap items-baseline gap-x-2 text-left hover:text-accent">
                <span className="font-serif text-[15px] font-semibold">{s.text}</span>
                <span className="text-[11.5px] text-muted">{s.regionName}</span>
                <ProvenanceBadge p={s.provenance} />
              </button>
            </li>
          ))}
          {!o.strongest.length && <li className="text-[13px] text-muted">{copy.strongestNone}</li>}
        </ul>
      </div>
      <div className="rounded-[4px] border border-rule bg-paper-raised p-4">
        <h3 className="text-[13px] font-medium">{copy.relationsTitle}</h3>
        <ul className="mt-2 space-y-1.5 text-[13px]" data-testid="atlas-relations">
          {o.relations.map((x) => (
            <li key={x.metricId} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-2">
              <button type="button" onClick={() => onPick(x.regions[0])} className="min-h-8 truncate text-left hover:text-accent">
                {x.zh}<span className="ml-1 text-[11.5px] text-muted">{x.regionNames.join(" × ")}</span>
              </button>
              <span className={cn("rounded-full px-1.5 text-[11.5px]", x.band === "typical" ? "bg-paper-sunk text-ink-soft" : "bg-amber-soft text-amber")}>{x.label}</span>
            </li>
          ))}
          {!o.relations.length && <li className="text-muted">{copy.relationsNone}</li>}
        </ul>
      </div>
      <div className="rounded-[4px] border border-rule bg-paper-raised p-4">
        <h3 className="text-[13px] font-medium">{copy.opportunitiesTitle}</h3>
        <ol className="mt-2 space-y-2 text-[13px] leading-6" data-testid="atlas-opportunities">
          {o.opportunities.map((x, i) => (
            <li key={x.recId} className="flex gap-2">
              <span className="tnum mt-0.5 shrink-0 text-[12px] text-muted">{i + 1}</span>
              <span className="min-w-0">
                <Link href={x.href} className="underline-offset-4 hover:text-accent hover:underline">{x.action}</Link>
                <span className="block text-[11.5px] text-muted">
                  {x.category}{x.regions.length ? ` · ${copy.basis}` : ""}
                  {x.regions.map((rg, k) => (
                    <React.Fragment key={rg.key}>{k > 0 && "、"}<button type="button" className="underline-offset-2 hover:underline" onClick={() => onPick(rg.key)}>{rg.name}</button></React.Fragment>
                  ))}
                </span>
              </span>
            </li>
          ))}
          {!o.opportunities.length && <li className="text-muted">{copy.opportunitiesNone}</li>}
        </ol>
      </div>
    </div>
  );
}

// --- the atlas -------------------------------------------------------------------------------------------------

export function FaceAtlas({ a, v, id, geometry, photos, expired, onShowMetric, onAddSide }: {
  a: Atlas; v: MeasureView; id: string; geometry: FaceGeometry | null; photos: Partial<Record<ViewRole, string | null>>;
  expired: boolean; onShowMetric?: (metricId: string, role: ViewRole) => void; onAddSide?: () => void;
}) {
  const keys = a.regions.map((r) => r.key);
  const [sel, setSel] = React.useState<string>(keys[0]);
  const tabs = React.useRef<Record<string, HTMLButtonElement | null>>({});
  const rootRef = React.useRef<HTMLElement>(null);
  React.useEffect(() => {
    const m = /^#atlas-([a-z_]+)$/.exec(typeof window === "undefined" ? "" : window.location.hash);
    if (m && keys.includes(m[1])) {
      setSel(m[1]);
      tabs.current[m[1]]?.parentElement?.scrollIntoView?.({ block: "start" });
    }
    // the hash is read once, on arrival
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // on narrow screens the region bar scrolls sideways: keep the selected region visible in it (never scrolls the page)
  React.useEffect(() => {
    const t = tabs.current[sel];
    const bar = t?.parentElement;
    if (!t || !bar || bar.scrollWidth <= bar.clientWidth) return;
    bar.scrollLeft += t.getBoundingClientRect().left - bar.getBoundingClientRect().left - 16;
  }, [sel]);
  const pick = React.useCallback((key: string, focus = false) => {
    setSel(key);
    if (focus) tabs.current[key]?.focus();
    else rootRef.current?.scrollIntoView?.({ behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  }, []);
  const onKey = (e: React.KeyboardEvent) => {
    const i = keys.indexOf(sel);
    const next = { ArrowDown: i + 1, ArrowRight: i + 1, ArrowUp: i - 1, ArrowLeft: i - 1, Home: 0, End: keys.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    pick(keys[(next + keys.length) % keys.length], true);
  };
  const region = a.regions.find((r) => r.key === sel) ?? a.regions[0];
  const o = a.overview;

  return (
    <section ref={rootRef} id="atlas" className="mt-10 scroll-mt-16" aria-labelledby="atlas-title" data-testid="atlas">
      <div className="mb-3">
        <p className="text-[11px] tracking-[0.18em] text-muted">{copy.kicker}</p>
        <h2 id="atlas-title" className="font-serif text-[22px] font-semibold">{copy.title}</h2>
        <p className="mt-1 max-w-3xl text-[13px] leading-6 text-ink-soft" data-testid="atlas-summary">
          {copy.summaryA}{o.total}{copy.summaryB}<b className="tnum font-medium text-ink">{o.observable}</b>{copy.summaryC}
          {copy.summaryD}{o.conceptCounts.measured}{copy.summaryE}{o.conceptCounts.observed}{copy.summaryF}{o.conceptCounts.pending}{copy.summaryG}{o.conceptCounts.unsupported}{copy.summaryH}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted" data-testid="atlas-legend">
          {(["measured", "rules", "observed", "entered"] as Provenance[]).map((p) => (
            <span key={p} className="inline-flex items-center gap-1"><ProvenanceBadge p={p} />{copy.legend[p]}</span>
          ))}
        </p>
      </div>
      <Overview a={a} onPick={(k) => pick(k)} />

      <div className="mt-5 lg:grid lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:gap-6">
        <div role="tablist" aria-label={copy.navLabel} aria-orientation="vertical" onKeyDown={onKey}
          className="-mx-4 mb-3 flex scroll-mt-20 gap-1.5 overflow-x-auto px-4 pb-1 lg:sticky lg:top-16 lg:mx-0 lg:mb-0 lg:flex-col lg:self-start lg:overflow-visible lg:px-0">
          {a.regions.map((r, i) => (
            <button key={r.key} ref={(el) => { tabs.current[r.key] = el; }} type="button" role="tab" id={`atlas-tab-${r.key}`}
              aria-selected={r.key === region.key} aria-controls={`atlas-panel-${r.key}`} tabIndex={r.key === region.key ? 0 : -1}
              onClick={() => setSel(r.key)} data-atlas-tab={r.key}
              className={cn("flex min-h-11 shrink-0 items-center gap-2 rounded-[4px] border px-2.5 py-1 text-left transition-colors lg:w-full",
                r.key === region.key ? "border-stage bg-stage text-stage-ink" : "border-rule bg-paper-raised hover:bg-paper-sunk",
                r.state !== "observed" && r.key !== region.key && "opacity-70")}>
              <span className="tnum w-5 shrink-0 text-[11px] opacity-60">{String(i + 1).padStart(2, "0")}</span>
              <span className="min-w-0">
                <span className="block whitespace-nowrap text-[13.5px] font-medium">{r.name}</span>
                <span className="block whitespace-nowrap text-[11px] opacity-75">{regionStatus(r)}</span>
              </span>
            </button>
          ))}
        </div>
        <RegionPanel key={region.key} r={region} v={v} id={id} geometry={geometry} photos={photos} expired={expired}
          onShowMetric={onShowMetric} onAddSide={onAddSide} />
      </div>
      <p className="mt-3 text-[11.5px] leading-5 text-muted">{ATLAS.benchmark.note_zh}</p>
    </section>
  );
}
