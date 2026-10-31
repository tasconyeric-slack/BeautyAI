"use client";

/** Measurement workbench (V3B, D35). Left: the photo of the current view (front / glasses-free / side / smile) with
 *  the shown metric's own geometry; right: every metric of that view, searchable, with value, assessment and
 *  reference bar. Pointer hover previews a row's overlay, click / tap / Enter / Space pins it, focus previews it,
 *  leaving restores the pinned one. Switching views switches photo, geometry, list and selection together.
 *
 *  The browser never computes a value or invents a point: numbers come from passport.measurement_profile (CV),
 *  assessments from derived.measurement_insights (rules), coordinates from geometry.json of the same photo. */
import { Lock, Search } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { HoldButton, Stage, useHold } from "@/components/ds";
import { Portrait } from "@/components/passport/portrait";
import type { FaceGeometry } from "@/lib/tint";
import { cn } from "@/lib/utils";
import {
  BASIS_ZH, CONFIDENCE_ZH, NOTE_ZH, arcPath, components, display, formatValue, metricOverlay, missingText,
  type Assessment, type MeasureView, type Metric, type MetricOverlay, type ViewRole, type ViewTab,
} from "./measure-model";
import { EvidenceCard } from "./measure-sections";
import { POINT_ZH } from "./point-names";

const BAND_CLS: Record<string, string> = {
  typical: "bg-paper-sunk text-ink-soft", low: "bg-amber-soft text-amber", high: "bg-amber-soft text-amber",
};
const VIEW_LIMIT: Record<ViewRole, string> = {
  front: "照片上的相对比例与角度（不是毫米）。姿态、表情、镜头距离和光线都会影响结果。",
  noglasses: "在无眼镜正脸照上测得，只用于眼、眉相关项目；比例基准仍以正脸照为准。",
  profile90: "侧面轮廓取自人像分割的外缘：头发、衣领、手或与肤色接近的背景都会影响。所有侧脸数值是夹角或长度比，不受抬头低头影响，也不推算深度。",
  smile: "只在微笑照上测量，并与中性正脸对比；微笑几何不会进入中性比例。",
};

// --- small pieces -----------------------------------------------------------------------------------------------
export function RangeBar({ a, m, compact }: { a: Assessment; m: Metric; compact?: boolean }) {
  const [lo, hi] = a.range;
  return (
    <span className={cn("relative block", compact ? "h-1.5 w-14" : "h-2 w-full")} aria-hidden={compact}
      aria-label={compact ? undefined : `参考范围 ${formatValue(lo, m.unit, m.decimals)}–${formatValue(hi, m.unit, m.decimals)}`}>
      <span className="absolute inset-0 rounded-full bg-paper-sunk" />
      <span className="absolute inset-y-0 left-1/3 right-1/3 rounded-full bg-rule-strong/60" />
      <span className={cn("absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-paper",
        compact ? "size-2.5" : "size-3.5", a.band === "typical" ? "bg-ink-soft" : "bg-amber")}
        style={{ left: `${a.position * 100}%` }} />
    </span>
  );
}

/** A row is "locked" only when there is a value the free view withholds; an unmeasured row is just unmeasured. */
const isLocked = (m: Metric) => Boolean(m.locked) && m.availability === "measured";

function rowStatus(m: Metric): string {
  if (isLocked(m)) return "完整护照可见";
  if (m.availability === "measured") return display(m);
  return m.availability === "needs_photo" ? "需补充照片" : "未测量";
}

function Row({ m, a, label, pinned, onHover, onPin }: {
  m: Metric; a: Assessment | undefined; label: string | null; pinned: boolean;
  onHover: (id: string | null) => void; onPin: (id: string) => void;
}) {
  const measured = m.availability === "measured" && !m.locked;
  const locked = isLocked(m);
  return (
    <button type="button" data-metric={m.id} aria-pressed={pinned}
      onPointerEnter={(e) => { if (e.pointerType !== "touch") onHover(m.id); }}
      onPointerLeave={(e) => { if (e.pointerType !== "touch") onHover(null); }}
      onFocus={() => onHover(m.id)} onBlur={() => onHover(null)} onClick={() => onPin(m.id)}
      className={cn("grid min-h-11 w-full scroll-mt-[calc(34dvh+9rem)] grid-cols-[minmax(0,1fr)_auto] items-center lg:scroll-mt-4 gap-x-3 px-3 py-1.5 text-left transition-colors sm:grid-cols-[minmax(0,1fr)_auto_3.5rem]",
        "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--ap-primary)]",
        pinned ? "bg-stage text-stage-ink" : "hover:bg-paper-sunk")}>
      <span className="min-w-0">
        <span className="block truncate text-[13.5px]">{m.name_zh}</span>
        <span className={cn("block truncate text-[11.5px]", pinned ? "text-stage-muted" : "text-muted")}>
          {label ?? (measured ? CONFIDENCE_ZH[m.confidence ?? "low"] : locked ? "已测，明细在完整护照" : "")}
        </span>
      </span>
      <span className={cn("tnum flex items-center gap-1 text-right", measured ? "text-[14px]" : "text-[11.5px] opacity-70")}>
        {locked && <Lock className="size-3" aria-hidden />}{rowStatus(m)}
      </span>
      <span className="hidden justify-end sm:flex">{a && measured ? <RangeBar a={a} m={m} compact /> : null}</span>
    </button>
  );
}

// --- the stage --------------------------------------------------------------------------------------------------
function OverlaySvg({ o, label }: { o: MetricOverlay; label: string }) {
  const W = o.width, H = o.height;
  const X = (x: number) => x * W, Y = (y: number) => y * H;
  const r = Math.max(W, H) * 0.035;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="pointer-events-none absolute inset-0 size-full"
      aria-hidden data-measure-overlay={label}>
      <g key={label} className="ap-rise" style={{ filter: "drop-shadow(0 0 1.5px rgba(0,0,0,.6))" }}>
        {o.silhouette && (
          <polyline points={o.silhouette.map(([x, y]) => `${X(x)},${Y(y)}`).join(" ")} fill="none" data-role="silhouette"
            stroke="rgba(255,255,255,.75)" strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
        )}
        {o.outline && (
          <polygon points={o.outline.map(([x, y]) => `${X(x)},${Y(y)}`).join(" ")} fill="none"
            stroke="rgba(255,255,255,.55)" strokeWidth={1} strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />
        )}
        {o.segments.map((s, i) => (
          <line key={i} x1={X(s.a[0])} y1={Y(s.a[1])} x2={X(s.b[0])} y2={Y(s.b[1])} data-role={s.role}
            stroke={s.role === "measure" ? "var(--ap-amber)" : "rgba(255,255,255,.85)"}
            strokeWidth={s.role === "measure" ? 2.2 : 1.2} strokeDasharray={s.role === "measure" ? undefined : "6 5"}
            strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        ))}
        {o.arcs.map((a, i) => (
          <path key={i} d={arcPath(a, W, H, r)} fill="none" stroke="var(--ap-amber)" strokeWidth={1.8} data-role="arc"
            vectorEffect="non-scaling-stroke" />
        ))}
        {[...o.segments.flatMap((s) => (s.role === "measure" ? [s.a, s.b] : [])), ...o.dots].map(([x, y], i) => (
          <circle key={i} cx={X(x)} cy={Y(y)} r={Math.max(W, H) * 0.006} fill="var(--ap-amber)" stroke="#fff"
            strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
        ))}
      </g>
    </svg>
  );
}

function WorkStage({ src, tab, overlay, metric, expired, onAdd, reasonText }: {
  src: string | null; tab: ViewTab; overlay: MetricOverlay | null; metric: Metric | null; expired: boolean;
  onAdd?: () => void; reasonText?: string | null;
}) {
  const hold = useHold();
  if (tab.role === "profile90" && tab.status !== "measured") {
    return (
      <div className="flex aspect-[4/5] flex-col items-center justify-center gap-3 rounded-[4px] border border-dashed border-rule-strong bg-paper-raised p-6 text-center"
        data-testid="side-empty">
        <p className="font-serif text-[17px] font-semibold">{tab.status === "not_provided" ? "还没有侧脸照" : "侧脸照未能测量"}</p>
        <p className="max-w-xs text-[13px] leading-6 text-ink-soft">
          {tab.status === "not_provided"
            ? `侧脸的鼻唇角、E 线、颏唇角等 ${tab.total} 项只能在一张接近 90° 的侧脸照上测量，不会用正脸推算。正脸报告已经完整。`
            : <span data-missing={tab.reason ?? ""}>{reasonText}</span>}
        </p>
        {onAdd && <button type="button" onClick={onAdd} className="min-h-11 rounded-full bg-accent px-4 text-[14px] text-[var(--ap-on-primary)]">补充一张侧脸照</button>}
      </div>
    );
  }
  const aspect = overlay?.aspect ?? (tab.role === "profile90" ? 0.8 : 0.8);
  const tag = metric && overlay && metric.availability === "measured" ? display(metric) : null;
  return (
    <div>
      {src && !expired ? (
        <Stage className="relative mx-auto overflow-hidden rounded-[4px]"
          style={{ aspectRatio: `${aspect}`, width: `min(100%, calc(var(--stage-h) * ${aspect}))` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={`你的${tab.name}照片${metric ? `，标注：${metric.name_zh}` : ""}`}
            className="absolute inset-0 block size-full object-contain" data-testid="stage-photo" />
          {!hold.holding && overlay && metric && <OverlaySvg o={overlay} label={metric.name_zh} />}
          {!hold.holding && tag && overlay?.tag && (
            <span className="tnum pointer-events-none absolute -translate-x-1/2 -translate-y-[150%] whitespace-nowrap rounded-[4px] bg-black/75 px-1.5 py-px text-[12px] leading-4 text-white"
              style={{ left: `${Math.min(90, Math.max(10, overlay.tag[0] * 100))}%`, top: `${Math.min(95, Math.max(7, overlay.tag[1] * 100))}%` }}
              data-testid="stage-tag">
              {tag}
            </span>
          )}
        </Stage>
      ) : (
        <Portrait className="mx-auto max-w-sm" />
      )}
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="min-w-0 text-[12.5px] leading-5 text-muted" aria-live="polite" data-testid="stage-caption">
          {expired ? "照片已按承诺删除，测量线不再显示；数字仍然保留。"
            : metric ? (overlay ? <>正在显示：<span className="text-ink">{metric.name_zh}</span> · 实线 = 被测量，虚线 = 参照</>
              : <>{metric.name_zh}：{metric.locked ? "完整护照中可在照片上查看" : metric.availability === "measured" ? "这一项没有可画在照片上的测量线" : "未测量，照片上不画线"}</>)
              : "选一项，照片上只画它用到的点和线。"}
        </p>
        {overlay && <HoldButton {...hold} />}
      </div>
    </div>
  );
}

// --- the detail panel -------------------------------------------------------------------------------------------
function pointList(m: Metric): string[] {
  const ov = m.overlay;
  const names = new Set<string>();
  for (const s of ov.segments) { names.add(s.from); names.add(s.to); }
  for (const a of ov.angles) { names.add(a.a); names.add(a.vertex); names.add(a.b); }
  ov.points.forEach((p) => names.add(p));
  return [...new Set([...names].map((n) => POINT_ZH[n.replace(/_(l|r)(?=_|$)/, "")] ?? POINT_ZH[n]).filter(Boolean) as string[])];
}

export function MetricDetail({ v, m, id, tab, onAddSide }: {
  v: MeasureView; m: Metric; id: string; tab: ViewTab; onAddSide?: () => void;
}) {
  const a = v.assessments[m.id];
  const insight = v.insights[m.id];
  const measured = m.availability === "measured" && !m.locked;
  const pts = pointList(m);
  return (
    <article className="rounded-[4px] border border-rule bg-paper-raised p-4" data-detail={m.id} aria-label={`${m.name_zh} 详情`}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h3 className="font-serif text-[17px] font-semibold">{m.name_zh}</h3>
        <span className="text-[11.5px] text-muted">{m.id} · {tab.name}</span>
        {measured && <span className="text-[11.5px] text-muted">· {CONFIDENCE_ZH[m.confidence ?? "low"]}</span>}
      </div>
      {measured ? (
        <dl className="mt-3 grid gap-3 text-[13px] leading-6 sm:grid-cols-2">
          <div>
            <dt className="text-[11.5px] tracking-wide text-muted">测量值（照片上的相对值）</dt>
            <dd className="tnum font-serif text-[26px] leading-8" data-testid="detail-value">{display(m)}</dd>
            {components(m).length > 0 && (
              <dd className="tnum text-[12px] text-muted">{components(m).map((c) => `${c.label} ${c.value}`).join(" · ")}</dd>
            )}
          </div>
          <div>
            <dt className="text-[11.5px] tracking-wide text-muted">评估（规则层，不是分数）</dt>
            {a ? (
              <dd>
                <span className={cn("inline-block rounded-full px-2 py-0.5 text-[12.5px]", BAND_CLS[a.band])} data-testid="detail-band">{a.label_zh}</span>
                <span className="mt-2 block"><RangeBar a={a} m={m} /></span>
                <span className="tnum mt-1 block text-[11.5px] text-muted">
                  参考 {formatValue(a.range[0], m.unit, m.decimals)}–{formatValue(a.range[1], m.unit, m.decimals)} · {BASIS_ZH[a.basis]}
                </span>
              </dd>
            ) : <dd className="text-[12.5px] text-muted">这一项只描述，不做区间定位。</dd>}
          </div>
        </dl>
      ) : (
        <p className="mt-2 rounded-[8px] bg-paper px-3 py-2 text-[13px] leading-6 text-ink-soft" data-missing={m.missing_reason ?? (isLocked(m) ? "locked" : "")}>
          {isLocked(m) ? <>这一项已经测量，数值、照片标注与评估在完整护照中。 <Link href={`/p/${id}/unlock`} className="text-accent underline-offset-4 hover:underline">解锁完整护照 →</Link></>
            : missingText(v.profile, m)}
          {!isLocked(m) && m.missing_reason === "needs_side_photo" && onAddSide && (
            <button type="button" onClick={onAddSide} className="ml-2 text-accent underline-offset-4 hover:underline">补充侧脸照 →</button>
          )}
        </p>
      )}
      <div className="mt-3 space-y-2 text-[12.5px] leading-6">
        <p><span className="text-muted">怎么量的 · </span>{m.definition_zh}</p>
        {pts.length > 0 && <p><span className="text-muted">依据的点 · </span>{pts.join("、")}</p>}
        <p className="text-muted"><span>局限 · </span>{VIEW_LIMIT[tab.role]}</p>
        {(m.notes ?? []).map((n) => <p key={n} className="rounded-[8px] bg-amber-soft px-2.5 py-1 text-amber">{NOTE_ZH[n] ?? n}</p>)}
      </div>
      {insight && measured && <div className="mt-3"><EvidenceCard id={id} v={insight} compact /></div>}
    </article>
  );
}

// --- the workbench ----------------------------------------------------------------------------------------------
export function Workbench2({ v, id, geometry, photos, expired, onAddSide }: {
  v: MeasureView; id: string; geometry: FaceGeometry | null; photos: Partial<Record<ViewRole, string | null>>;
  expired: boolean; onAddSide?: () => void;
}) {
  const [role, setRole] = React.useState<ViewRole>("front");
  const [pinned, setPinned] = React.useState<Partial<Record<ViewRole, string>>>({});
  const [hover, setHover] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [group, setGroup] = React.useState<string>("all");
  const tab = v.views.find((t) => t.role === role) ?? v.views[0];
  const list = tab.metrics;
  const firstDrawable = React.useMemo(() => {
    const ok = (m: Metric) => Boolean(metricOverlay(m, geometry));
    const h = v.highlights.map((x) => v.byId[x.metricId]).find((m) => m && list.includes(m) && ok(m));
    return (h ?? list.find(ok) ?? list.find((m) => m.availability === "measured") ?? list[0])?.id ?? null;
  }, [v, list, geometry]);
  const shownId = (hover && list.some((m) => m.id === hover) ? hover : null) ?? pinned[role] ?? firstDrawable;
  const shown = shownId ? v.byId[shownId] : null;
  const pinnedId = pinned[role] ?? firstDrawable;
  const overlay = shown ? metricOverlay(shown, geometry) : null;
  const groups = v.groups.map((g) => ({ ...g, metrics: g.metrics.filter((m) => list.includes(m)) })).filter((g) => g.metrics.length);
  const q = query.trim().toLowerCase();
  const filtered = list.filter((m) => (group === "all" || m.group === group)
    && (!q || m.name_zh.toLowerCase().includes(q) || m.id.toLowerCase().includes(q) || m.definition_zh.includes(q)));
  const pin = (mid: string) => setPinned((p) => ({ ...p, [role]: mid }));
  const switchView = (r: ViewRole) => { setRole(r); setHover(null); setGroup("all"); setQuery(""); };
  const pinnedMetric = pinnedId ? v.byId[pinnedId] : null;
  const unavailable = list.filter((m) => m.availability !== "measured").length;
  const locked = list.filter(isLocked).length;

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-8" data-testid="workbench" data-view={role}>
      {/* left: view tabs + stage (+ detail on desktop) */}
      <div className="sticky top-12 z-20 -mx-4 bg-paper px-4 pb-2 pt-1 shadow-[0_8px_12px_-12px_rgba(0,0,0,.25)] lg:top-16 lg:mx-0 lg:self-start lg:p-0 lg:shadow-none">
        <div role="tablist" aria-label="照片视图" className="mb-1.5 flex gap-1.5 overflow-x-auto pb-1">
          {v.views.map((t) => (
            <button key={t.role} type="button" role="tab" aria-selected={t.role === role} onClick={() => switchView(t.role)}
              data-view-tab={t.role}
              className={cn("flex min-h-12 shrink-0 items-center gap-2 rounded-[4px] border px-2 py-1 text-left transition-colors",
                t.role === role ? "border-stage bg-stage text-stage-ink" : "border-rule bg-paper-raised hover:bg-paper-sunk")}>
              {photos[t.role] && !expired ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photos[t.role]!} alt="" className="size-9 rounded-[6px] object-cover" />
              ) : <span className="flex size-9 items-center justify-center rounded-[6px] bg-paper-sunk text-[11px] text-muted">{t.name}</span>}
              <span>
                <span className="block text-[13.5px] font-medium">{t.name}</span>
                <span className="tnum block text-[11px] opacity-75">{t.status === "measured" ? `已测 ${t.measured} 项 · 共 ${t.total}` : t.status === "not_provided" ? "未上传" : "未能测量"}</span>
              </span>
            </button>
          ))}
        </div>
        <div>
          <div className="mx-auto [--stage-h:34dvh] lg:[--stage-h:calc(100dvh-13rem)]">
            <WorkStage src={photos[role] ?? null} tab={tab} overlay={overlay} metric={shown} expired={expired} onAdd={onAddSide}
              reasonText={tab.reason ? (v.profile.missing_reasons_zh as Record<string, string>)[tab.reason] ?? null : null} />
          </div>
        </div>
        {pinnedMetric && tab.status === "measured" && (
          <div className="mt-3 hidden lg:block"><MetricDetail v={v} m={pinnedMetric} id={id} tab={tab} onAddSide={onAddSide} /></div>
        )}
      </div>

      {/* right: counts, search, groups, the dense list */}
      <div className="mt-4 min-w-0 lg:mt-0">
        <p className="text-[12.5px] leading-5 text-ink-soft" data-testid="coverage">
          本次实际测得 <b className="tnum font-medium text-ink">{v.totalMeasured}</b> 项（共定义 <span className="tnum">{v.totalDefined}</span> 项）。
          {tab.name}：已测 <span className="tnum">{tab.measured}</span>，未测 <span className="tnum">{unavailable}</span>
          {locked ? <>，其中 <span className="tnum">{locked}</span> 项明细在完整护照</> : null}。
        </p>
        <div className="mt-2 flex items-center gap-2 rounded-[4px] border border-rule bg-paper-raised px-2.5">
          <Search className="size-4 text-muted" aria-hidden />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索测量项，如“眉”“E 线”"
            aria-label="搜索测量项" className="min-h-11 w-full bg-transparent text-[13.5px] outline-none" />
        </div>
        <div role="tablist" aria-label="测量分组" className="-mx-1 mt-2 flex gap-1 overflow-x-auto px-1 pb-1 lg:flex-wrap">
          {[{ key: "all", name: "全部", metrics: list }, ...groups].map((g) => (
            <button key={g.key} type="button" role="tab" aria-selected={group === g.key} onClick={() => setGroup(g.key)}
              className={cn("min-h-11 shrink-0 rounded-full border px-3 text-[12.5px]",
                group === g.key ? "border-stage bg-stage text-stage-ink" : "border-rule text-ink-soft hover:bg-paper-sunk")}>
              {g.name}<span className="tnum ml-1 text-[10.5px] opacity-70" title={`已测 ${g.metrics.filter((m) => m.availability === "measured").length} 项，共 ${g.metrics.length} 项`}>
                {g.metrics.filter((m) => m.availability === "measured").length}</span>
            </button>
          ))}
        </div>
        <ul className="mt-2 divide-y divide-rule overflow-hidden rounded-[4px] border border-rule bg-paper-raised lg:max-h-[calc(100vh-15rem)] lg:overflow-y-auto"
          aria-label={`${tab.name}测量项`} data-testid="metric-list">
          {filtered.map((m) => (
            <li key={m.id}>
              <Row m={m} a={v.assessments[m.id]} label={v.assessments[m.id]?.label_zh ?? null}
                pinned={pinnedId === m.id} onHover={setHover} onPin={pin} />
              {pinnedId === m.id && (
                <div className="px-2 pb-2 pt-1 lg:hidden"><MetricDetail v={v} m={m} id={id} tab={tab} onAddSide={onAddSide} /></div>
              )}
            </li>
          ))}
          {!filtered.length && <li className="px-3 py-4 text-[13px] text-muted">没有匹配的测量项。</li>}
        </ul>
        {v.catalog && (
          <p className="mt-2 text-[11.5px] leading-5 text-muted" data-testid="catalog">
            候选池 {v.catalog.candidates} 项：已实现 {v.catalog.computed}，与已实现项等价而合并 {v.catalog.covered}，待研究 {v.catalog.deferred}，
            只做文字描述 {v.catalog.qualitative}，不做（涉及皮肤状态）{v.catalog.excluded}，分析元信息 {v.catalog.meta}；另有自定义 {v.catalog.own_definitions} 项。
          </p>
        )}
      </div>
    </div>
  );
}
