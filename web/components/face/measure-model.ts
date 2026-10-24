/** Face measurement workbench (V3A, D34): passport.measurement_profile + derived.measurement_insights + geometry
 *  points → plain view data. Pure functions, no React.
 *
 *  The browser never computes a measurement and never invents a landmark: values come from the passport (CV layer),
 *  overlay coordinates from geometry.json `points` (same landmarks, 24 h). A metric whose points are missing simply
 *  has no overlay. */
import { CATEGORY_ZH, rankedRecs } from "@/lib/adapters";
import type { Passport } from "@/lib/api";
import type { FaceGeometry, Pt, ViewGeometry } from "@/lib/tint";

export type Profile = NonNullable<Passport["measurement_profile"]>;
export type Metric = Profile["metrics"][number];
export type Insights = NonNullable<Passport["derived"]["measurement_insights"]>;
export type Insight = Insights["items"][number];
export type PillarKey = Metric["pillar"];
export type Assessment = NonNullable<Insights["assessments"]>[number];
export type ViewRole = "front" | "noglasses" | "profile90" | "smile";
export const VIEW_ZH: Record<ViewRole, string> = { front: "正脸", noglasses: "无眼镜", profile90: "侧脸", smile: "微笑" };
export const BASIS_ZH: Record<string, string> = {
  literature: "文献参考范围（成人样本，人群间有差异）", mesh: "以平均人脸网格为参照中心（不是标准）", illustrative: "示意范围（尚未用真实照片校准）",
};
export const NOTE_ZH: Record<string, string> = { eyewear: "戴眼镜：镜框可能影响眼、眉关键点，可信度已下调。补充一张无眼镜正脸照可以测得更准。" };

export const CONFIDENCE_ZH: Record<string, string> = { high: "可信度高", medium: "可信度中", low: "可信度低" };
export const COMPONENT_ZH: Record<string, string> = { image_left: "照片左侧", image_right: "照片右侧", contour: "外轮廓" };
const UNIT_PREFIX: Record<string, string> = { lab_l: "L* ", lab_b: "b* ", lab_a: "a* ", lab_c: "C* ", delta_e: "ΔE " };

/** Display a value with the precision the photo supports (registry `decimals`), never more. */
export function formatValue(v: number | null | undefined, unit: Metric["unit"], decimals: number): string {
  if (v == null) return "—";
  if (unit === "fraction" || unit === "pct_face") return `${(v * 100).toFixed(decimals)}%`;
  if (unit === "deg") return `${v.toFixed(decimals)}°`;
  if (unit === "px") return `${v.toFixed(decimals)} px`;
  return `${UNIT_PREFIX[unit] ?? ""}${v.toFixed(decimals)}`;
}

export const display = (m: Metric) => formatValue(m.value, m.unit, m.decimals);

export function components(m: Metric): { label: string; value: string }[] {
  if (!m.components) return [];
  return Object.entries(m.components).map(([k, v]) => ({ label: COMPONENT_ZH[k] ?? k, value: formatValue(v, m.unit, m.decimals) }));
}

export function missingText(p: Profile, m: Metric): string | null {
  if (m.availability === "measured") return null;
  const r = m.missing_reason;
  return (r && (p.missing_reasons_zh as Record<string, string>)[r]) || "本项未测量。";
}

// --- overlay ---------------------------------------------------------------------------------------------------

export interface Seg { a: Pt; b: Pt; role: "measure" | "reference" }
export interface Arc { vertex: Pt; a: Pt; b: Pt }
export interface MetricOverlay {
  aspect: number;
  /** Native pixel size of the photo the coordinates are normalized to (the SVG viewBox). */
  width: number;
  height: number;
  segments: Seg[];
  arcs: Arc[];
  dots: Pt[];
  outline: readonly Pt[] | null;
  silhouette: readonly Pt[] | null;
  /** Where the value tag goes: the midpoint of the first measured segment (or the first dot). */
  tag: Pt | null;
}

/** The photo a metric was measured on: its own role, never another photo's coordinates. */
export function metricRole(m: Metric): ViewRole {
  if (m.view === "side") return "profile90";
  if (m.view === "smile") return "smile";
  return m.source_photo === "noglasses" ? "noglasses" : "front";
}

/** Geometry of one view: front = the top-level file, others = `views[role]`. */
export function viewGeometry(g: FaceGeometry | null, role: ViewRole): ViewGeometry | null {
  if (!g) return null;
  if (role === "front") return g.points ? { width: g.width, height: g.height, points: g.points } : null;
  return g.views?.[role] ?? null;
}

/** Resolve a metric's overlay spec against its own photo's points. Null when anything it needs is missing. */
export function metricOverlay(m: Metric, g: FaceGeometry | null): MetricOverlay | null {
  const role = metricRole(m);
  const vg = viewGeometry(g, role);
  const pts = vg?.points;
  if (!g || !vg || !pts || m.availability !== "measured" || m.locked) return null;
  const P = (n: string): Pt | null => (pts[n] ? pts[n] : null);
  const ov = m.overlay;
  const segments: Seg[] = [];
  for (const s of ov.segments) {
    const a = P(s.from), b = P(s.to);
    if (!a || !b) return null;
    segments.push({ a, b, role: s.role });
  }
  const arcs: Arc[] = [];
  for (const x of ov.angles) {
    const a = P(x.a), v = P(x.vertex), b = P(x.b);
    if (!a || !v || !b) return null;
    arcs.push({ vertex: v, a, b });
  }
  const dots: Pt[] = [];
  for (const n of ov.points) {
    const d = P(n);
    if (!d) return null;
    dots.push(d);
  }
  const silhouette = ov.silhouette && vg.silhouette ? vg.silhouette : null;
  if (!segments.length && !arcs.length && !dots.length) return null;
  const first = segments.find((s) => s.role === "measure") ?? segments[0];
  const tag: Pt | null = arcs[0] ? arcs[0].vertex : first ? [(first.a[0] + first.b[0]) / 2, (first.a[1] + first.b[1]) / 2] : dots[0] ?? null;
  return {
    aspect: vg.width / vg.height, width: vg.width, height: vg.height, segments, arcs, dots,
    outline: ov.outline && role === "front" ? g.jaw : null, silhouette, tag,
  };
}

/** SVG arc path (in viewBox units) at `vertex` between the rays to a and b. */
export function arcPath(arc: Arc, W: number, H: number, r = 34): string {
  const X = (p: Pt) => [p[0] * W, p[1] * H] as const;
  const [vx, vy] = X(arc.vertex);
  const ang = (p: Pt) => { const [x, y] = X(p); return Math.atan2(y - vy, x - vx); };
  const a0 = ang(arc.a), a1 = ang(arc.b);
  let d = a1 - a0;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  const p0 = [vx + r * Math.cos(a0), vy + r * Math.sin(a0)];
  const p1 = [vx + r * Math.cos(a0 + d), vy + r * Math.sin(a0 + d)];
  return `M ${p0[0].toFixed(1)} ${p0[1].toFixed(1)} A ${r} ${r} 0 0 ${d > 0 ? 1 : 0} ${p1[0].toFixed(1)} ${p1[1].toFixed(1)}`;
}

// --- page model ------------------------------------------------------------------------------------------------

export interface AdviceLink { area: string; label: string; text: string; href: string; recId: string | null; recAction: string | null }
export interface InsightView {
  metricId: string; label: string; seen: string; means: string; band: Insight["band"]; confidence: string;
  highlight: boolean; advice: AdviceLink[];
}
export interface PillarView {
  key: PillarKey; name: string; about: string; summary: string; measured: number; total: number;
  notable: { id: string; label: string }[];
}
export interface GroupView { key: string; name: string; metrics: Metric[] }
export interface ViewTab {
  role: ViewRole; name: string; status: "measured" | "not_provided" | "unavailable"; reason: string | null;
  measured: number; total: number; metrics: Metric[];
}

export interface MeasureView {
  profile: Profile;
  byId: Record<string, Metric>;
  insights: Record<string, InsightView>;
  highlights: InsightView[];
  pillars: PillarView[];
  groups: GroupView[];
  priorities: { id: string; action: string; category: string; href: string }[];
  assessments: Record<string, Assessment>;
  views: ViewTab[];
  catalog: Record<string, number> | null;
  totalMeasured: number;
  totalDefined: number;
  measured: number;
  frontTotal: number;
  /** Detailed metrics the server removed for a free entitlement (front metrics only). */
  lockedCount: number;
}

export function measureView(p: Passport, id: string, locked: readonly string[] = []): MeasureView | null {
  const profile = p.measurement_profile;
  if (!profile) return null;
  const recs = new Map(p.analysis.recommendations.map((r) => [r.id, r]));
  const mi = p.derived.measurement_insights;
  const byId = Object.fromEntries(profile.metrics.map((m) => [m.id, m])) as Record<string, Metric>;
  const insights: Record<string, InsightView> = {};
  for (const i of mi?.items ?? []) {
    insights[i.metric_id] = {
      metricId: i.metric_id, label: i.label_zh, seen: i.seen_zh, means: i.means_zh, band: i.band, confidence: i.confidence,
      highlight: i.highlight,
      advice: i.advice.map((a) => ({
        area: a.area, label: a.label_zh, text: a.text_zh, href: `/p/${id}/${a.page}`, recId: a.rec_id,
        recAction: a.rec_id ? recs.get(a.rec_id)?.action ?? null : null,
      })),
    };
  }
  const highlights = (mi?.items ?? []).filter((i) => i.highlight && byId[i.metric_id]).map((i) => insights[i.metric_id]);
  const pillars: PillarView[] = profile.pillars.map((pl) => {
    const d = mi?.pillars.find((x) => x.key === pl.key);
    const front = profile.metrics.filter((m) => m.pillar === pl.key && m.view === "front");
    return {
      key: pl.key, name: pl.name_zh, about: pl.about_zh,
      summary: d?.summary_zh ?? "",
      // the server's counts: a free view hides detailed values, not the fact that they were measured
      measured: d?.measured ?? front.filter((m) => m.availability === "measured").length,
      total: d?.total ?? front.length,
      notable: (d?.notable ?? []).filter((x) => insights[x]).map((x) => ({ id: x, label: insights[x].label })),
    };
  });
  const groups = profile.groups
    .map((g) => ({ key: g.key, name: g.name_zh, metrics: profile.metrics.filter((m) => m.group === g.key) }))
    .filter((g) => g.metrics.length > 0);
  const priorities = rankedRecs(p).slice(0, 2).map((r) => ({
    id: r.id, action: r.action, category: CATEGORY_ZH[r.category] ?? r.categoryZh, href: `/p/${id}/${r.page}`,
  }));
  const front = profile.metrics.filter((m) => m.view === "front");
  const measured = profile.coverage.measured;
  // V3B: locked rows stay in the list (value removed server-side); older free views dropped them entirely
  const lockedRows = profile.metrics.filter((m) => m.locked).length;
  const lockedCount = locked.includes("measurement_profile.full")
    ? lockedRows || Math.max(0, profile.coverage.front_total - front.length) : 0;
  const assessments = Object.fromEntries((mi?.assessments ?? []).map((a) => [a.metric_id, a])) as Record<string, Assessment>;
  const views: ViewTab[] = (["front", "noglasses", "profile90", "smile"] as ViewRole[]).flatMap((role) => {
    const metrics = profile.metrics.filter((m) => metricRole(m) === role);
    const meta = profile.views?.find((v) => v.role === role);
    if (role === "noglasses" && !metrics.length) return [];
    if (role === "smile" && (!meta || meta.status === "not_provided")) return [];
    if (!metrics.length && role !== "profile90") return [];
    return [{
      role, name: VIEW_ZH[role], status: meta?.status ?? (role === "front" ? "measured" : "not_provided"),
      reason: meta?.reason ?? (role === "profile90" ? "needs_side_photo" : null),
      measured: metrics.filter((m) => m.availability === "measured").length, total: metrics.length, metrics,
    }];
  });
  const cov = profile.coverage;
  return {
    profile, byId, insights, highlights, pillars, groups, priorities, measured, frontTotal: cov.front_total, lockedCount,
    assessments, views, catalog: (profile.catalog as Record<string, number> | undefined) ?? null,
    totalMeasured: cov.total_measured ?? measured, totalDefined: cov.total_defined ?? profile.metrics.length,
  };
}

/** The metric the stage shows first: the first highlighted insight with an overlay, else the first measured metric. */
export function defaultMetric(v: MeasureView, g: FaceGeometry | null): string | null {
  const ok = (id: string) => Boolean(v.byId[id] && metricOverlay(v.byId[id], g));
  const h = v.highlights.find((i) => ok(i.metricId));
  if (h) return h.metricId;
  const m = v.profile.metrics.find((x) => ok(x.id)) ?? v.profile.metrics.find((x) => x.availability === "measured");
  return m?.id ?? null;
}
