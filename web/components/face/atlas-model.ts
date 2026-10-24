/** Facial feature atlas (Issue #32, D39): passport + measure view + geometry → twelve regional views and an overview.
 *  Pure functions, no React.
 *
 *  The atlas only regroups what the passport already carries, and keeps each fact's origin visible:
 *    measured — values from measurement_profile (CV), bands / labels from derived.measurement_insights (rules);
 *    observed — sentences the analysis model wrote about the photo (never presented as a measurement);
 *    entered  — what the person chose or typed (user_context).
 *  Region membership, the benchmark coverage matrix, cross-region relations and band-keyed cues come from
 *  config/face_atlas.yaml (exported to lib/generated/face-atlas.json). Nothing here measures, scores or infers; a region
 *  without evidence says so. */
import atlasJson from "@/lib/generated/face-atlas.json";
import { CATEGORY_ZH, faceNameZh, rankedRecs } from "@/lib/adapters";
import type { Passport } from "@/lib/api";
import { atlas as copy, presentation as presentationCopy } from "@/lib/copy/zh";
import type { FaceGeometry, Pt } from "@/lib/tint";
import {
  display, metricOverlay, metricRole, missingText, viewGeometry,
  type Assessment, type MeasureView, type Metric, type MetricOverlay, type ViewRole,
} from "./measure-model";

// --- catalog ---------------------------------------------------------------------------------------------------

type Band = "low" | "typical" | "high";
type ConceptSpec = { zh: string; status: "measured" | "observed" | "deferred" | "unsupported"; metrics?: string[]; catalog?: string; note_zh?: string };
type CueSpec = { metric: string; band: Band; area: string; text_zh: string };
export interface RegionSpec {
  key: string; name_zh: string; about_zh: string; view: "front" | "side";
  metrics: string[]; related: string[]; observation_regions: string[]; features: string[]; signature_regions: string[];
  crop: { points: string[]; extend?: "top" | "bottom" }; focus: string[]; concepts: ConceptSpec[]; cues: CueSpec[];
}
interface AtlasCatalog {
  version: string;
  benchmark: { name_zh: string; source: string; note_zh: string };
  provenance_zh: Record<Provenance, string>;
  facial_observation_categories: string[];
  concept_status_zh: Record<ConceptState, string>;
  regions: RegionSpec[];
  relations: { metric: string; regions: [string, string]; zh: string }[];
  overview: { strongest: number; relations: number; opportunities: number; implications: number; facts: number };
  areas: Record<string, { page: string; label_zh: string }>;
}
export const ATLAS = atlasJson as unknown as AtlasCatalog;

// --- view types ------------------------------------------------------------------------------------------------

export type Provenance = "measured" | "rules" | "observed" | "entered";
export type ConceptState = "measured" | "needs_photo" | "locked" | "not_measured" | "observed" | "not_observed" | "deferred" | "unsupported";
/** observed: something in this region was measured or described; needs_photo: only an extra photo would show it;
 *  unavailable: neither the measurements nor the model's description cover it in these photos. */
export type RegionState = "observed" | "needs_photo" | "unavailable";

export interface AtlasFact {
  metricId: string; name: string; value: string; definition: string;
  assessment: Assessment | null; confidence: Metric["confidence"]; role: ViewRole; related: boolean;
}
export interface AtlasTrait { text: string; provenance: Provenance; metricId: string | null; detail: string | null }
export interface AtlasImplication {
  text: string; provenance: Provenance; href: string; label: string;
  /** What it rests on: a measured reading ("眉毛倾斜 · 眉尾偏低") or the model's evidence. */
  basis: string | null; metricId: string | null;
}
export interface AtlasConcept { zh: string; state: ConceptState; stateZh: string; note: string | null; count: string | null }
/** `facial` = describes the face itself; otherwise context (glasses, clothing, the photo). */
export interface AtlasObservation { id: string; text: string; polarity: "strength" | "neutral" | "issue"; facial: boolean }
export interface AtlasEntered { label: string; value: string }

export interface AtlasRegion {
  key: string; name: string; about: string; role: ViewRole; state: RegionState;
  traits: AtlasTrait[];
  implications: AtlasImplication[];
  facts: AtlasFact[];
  /** Visible measured facts beyond `facts` (all of them are in the workbench). */
  more: number;
  /** Measured facts whose values the free view withholds. */
  locked: number;
  measured: number;
  total: number;
  missing: { reason: string; count: number }[];
  observations: AtlasObservation[];
  descriptors: string[];
  entered: AtlasEntered[];
  concepts: AtlasConcept[];
  /** Metrics whose own lines can be drawn on the crop, in preference order. */
  focus: Metric[];
  spec: RegionSpec;
}

export interface AtlasOverview {
  strongest: { region: string; regionName: string; text: string; provenance: Provenance; metricId: string | null }[];
  relations: { metricId: string; zh: string; regions: [string, string]; regionNames: [string, string]; value: string; label: string; band: Band }[];
  opportunities: { recId: string; action: string; category: string; href: string; regions: { key: string; name: string }[] }[];
  observable: number;
  total: number;
  conceptCounts: Record<"measured" | "observed" | "pending" | "unsupported", number>;
}

export interface Atlas { regions: AtlasRegion[]; overview: AtlasOverview }

// --- helpers ---------------------------------------------------------------------------------------------------

const visible = (m: Metric | undefined): m is Metric => Boolean(m && m.availability === "measured" && !m.locked && m.value != null);
const roleOf = (r: RegionSpec): ViewRole => (r.view === "side" ? "profile90" : "front");
/** Photos a region's crop may be cut from: the side region uses the side photo; front regions use the front photo, or
 *  the glasses-free front photo for metrics that were measured on it (eye / brow items, D35). */
const cropRoles = (r: RegionSpec): ViewRole[] => (r.view === "side" ? ["profile90"] : ["front", "noglasses"]);
const DENSITY_ZH: Record<string, string> = { fine: "偏少、细软", medium: "适中", thick: "偏多" };
const TEXTURE_ZH: Record<string, string> = { straight: "直发", wavy: "自然波浪", curly: "自然卷", coily: "小卷" };
const IMPRESSION_ZH: Record<string, string> = {
  clean: "干净", sharp: "利落", mature: "成熟", relaxed: "松弛", approachable: "亲和", refined: "低调精致", energetic: "有活力",
  authoritative: "有气场", gentle: "柔和", distinctive: "有辨识度", youthful: "年轻感", professional: "专业",
};
const CHEEK_ZH: Record<string, string> = { flat: "颧骨平缓", moderate: "颧骨适中", prominent: "颧骨立体" };
const JAW_ZH: Record<string, string> = { soft: "下颌线条柔和", moderate: "下颌线条适中", defined: "下颌线条清晰" };
const JAW_SHAPE_ZH: Record<string, string> = { rounded: "转角圆润", tapered: "向下巴收窄", angular: "转角有棱线", square: "下颌偏方" };
const LEVEL: Record<string, number> = { high: 2, medium: 1, low: 0 };

/** Facts first show what the rules layer explained, then what stands out, then the rest. */
function factOrder(m: Metric, v: MeasureView): number {
  const a = v.assessments[m.id];
  if (v.insights[m.id]?.highlight) return 0;
  if (v.insights[m.id] && v.insights[m.id].band !== "typical") return 1;
  if (a && a.band !== "typical") return 2 - (LEVEL[m.confidence ?? "low"] ?? 0) / 10;
  if (v.insights[m.id]) return 3;
  return a ? 4 : 5;
}

function pushUnique<T extends { text: string }>(out: T[], item: T, max: number) {
  if (out.length >= max || !item.text.trim() || out.some((x) => x.text === item.text)) return;
  out.push(item);
}

function conceptState(c: ConceptSpec, p: MeasureView, hasObservation: boolean): Pick<AtlasConcept, "state" | "count"> {
  if (c.status === "deferred" || c.status === "unsupported") return { state: c.status, count: null };
  if (c.status === "observed") return { state: hasObservation ? "observed" : "not_observed", count: null };
  const ms = (c.metrics ?? []).map((id) => p.byId[id]).filter((m): m is Metric => Boolean(m));
  const shown = ms.filter(visible).length;
  if (shown) return { state: "measured", count: ms.length > 1 ? `${shown}/${ms.length}` : null };
  if (ms.some((m) => m.locked && m.availability === "measured")) return { state: "locked", count: null };
  if (ms.some((m) => m.availability === "needs_photo")) return { state: "needs_photo", count: null };
  return { state: "not_measured", count: null };
}

function entered(p: Passport, key: string): AtlasEntered[] {
  const uc = p.user_context;
  const out: AtlasEntered[] = [];
  if (key === "general") {
    const pres = uc.presentation as keyof typeof presentationCopy.options | null | undefined;
    if (pres && presentationCopy.options[pres]) out.push({ label: copy.enteredPresentation, value: presentationCopy.options[pres].label });
    const imp = (uc.desired_impression ?? []).map((x) => IMPRESSION_ZH[x]).filter(Boolean);
    if (imp.length) out.push({ label: copy.enteredImpression, value: imp.join("、") });
  }
  if (key === "hair" && uc.hair) {
    if (TEXTURE_ZH[uc.hair.texture]) out.push({ label: copy.enteredTexture, value: TEXTURE_ZH[uc.hair.texture] });
    if (DENSITY_ZH[uc.hair.density]) out.push({ label: copy.enteredDensity, value: DENSITY_ZH[uc.hair.density] });
  }
  return out;
}

/** The model's structural description that belongs to a region (face shape, cheekbones, jawline). */
function structureTraits(p: Passport, key: string): string[] {
  const fs = p.analysis.face_structure;
  if (key === "general") {
    const label = p.derived.display_labels.face_shape;
    return [label.ambiguous_with ? `脸型介于${label.label_zh}与${faceNameZh(label.ambiguous_with)}之间` : `脸型接近${label.label_zh}`];
  }
  if (key === "cheeks") return [CHEEK_ZH[fs.cheekbones]].filter(Boolean) as string[];
  if (key === "jaw") return [[JAW_ZH[fs.jawline.definition], JAW_SHAPE_ZH[fs.jawline.shape]].filter(Boolean).join("，")].filter(Boolean);
  return [];
}

// --- regions ---------------------------------------------------------------------------------------------------

export function atlasRegion(p: Passport, v: MeasureView, id: string, r: RegionSpec): AtlasRegion {
  const lim = ATLAS.overview;
  const own = r.metrics.map((x) => v.byId[x]).filter((m): m is Metric => Boolean(m));
  const related = r.related.map((x) => v.byId[x]).filter((m): m is Metric => Boolean(m));
  const all = [...own, ...related];
  const shown = all.filter(visible).sort((a, b) => factOrder(a, v) - factOrder(b, v));
  const facts: AtlasFact[] = shown.slice(0, lim.facts).map((m) => ({
    metricId: m.id, name: m.name_zh, value: display(m), definition: m.definition_zh, assessment: v.assessments[m.id] ?? null,
    confidence: m.confidence, role: metricRole(m), related: !r.metrics.includes(m.id),
  }));

  const observations: AtlasObservation[] = p.analysis.observations
    .filter((o) => r.observation_regions.includes(o.region))
    .map((o) => ({ id: o.id, text: o.text, polarity: o.polarity, facial: ATLAS.facial_observation_categories.includes(o.category) }));
  const obsIds = new Set(observations.map((o) => o.id));
  const featureRows = p.analysis.feature_characteristics.filter((f) => r.features.includes(f.feature));
  const descriptors = [...new Set(featureRows.flatMap((f) => f.descriptors))];
  const signatures = p.analysis.feature_signature.filter((s) =>
    r.signature_regions.includes(s.region) || s.observation_ids.some((o) => obsIds.has(o)));
  const described = observations.some((o) => o.facial) || descriptors.length > 0;

  // traits: rules-layer readings that stand out, then the model's own description, then typical readings
  const traits: AtlasTrait[] = [];
  const max = 4;
  const label = (m: Metric) => v.assessments[m.id]?.label_zh ?? null;
  for (const m of shown) {
    const ins = v.insights[m.id];
    if (ins && ins.band !== "typical") pushUnique(traits, { text: ins.label, provenance: "rules", metricId: m.id, detail: ins.seen }, max);
  }
  for (const m of shown) {
    const a = v.assessments[m.id];
    if (a && a.band !== "typical" && m.confidence !== "low") {
      pushUnique(traits, { text: a.label_zh, provenance: "rules", metricId: m.id, detail: `${m.name_zh} ${display(m)}` }, max);
    }
  }
  for (const s of signatures) pushUnique(traits, { text: s.title, provenance: "observed", metricId: null, detail: null }, max);
  for (const t of structureTraits(p, r.key)) pushUnique(traits, { text: t, provenance: "observed", metricId: null, detail: null }, max);
  if (descriptors.length) pushUnique(traits, { text: descriptors.slice(0, 3).join("、"), provenance: "observed", metricId: null, detail: null }, max);
  if (!traits.length) {
    const o = observations.find((x) => x.facial);
    if (o) pushUnique(traits, { text: o.text, provenance: "observed", metricId: null, detail: null }, max);
  }
  if (!traits.length) {
    for (const m of shown) {
      const ins = v.insights[m.id];
      const t = ins?.label ?? label(m);
      if (t && ins) pushUnique(traits, { text: t, provenance: "rules", metricId: m.id, detail: ins.seen }, max);
    }
    const first = shown.find((m) => v.assessments[m.id]);
    if (!traits.length && first) {
      pushUnique(traits, { text: `${first.name_zh}${label(first)}`, provenance: "rules", metricId: first.id, detail: display(first) }, max);
    }
  }

  // implications: the rules layer's advice for distinctive readings → band-keyed cues → the model's recommendations
  // citing this region → the model's signature implications → advice for typical readings
  const out: AtlasImplication[] = [];
  const n = lim.implications;
  const area = (k: string) => ATLAS.areas[k] ?? { page: "plan", label_zh: CATEGORY_ZH[k] ?? k };
  const basisOf = (m: Metric) => `${m.name_zh} · ${v.assessments[m.id]?.label_zh ?? display(m)}`;
  const insightAdvice = (typical: boolean) => {
    for (const m of shown) {
      const ins = v.insights[m.id];
      if (!ins || (ins.band === "typical") !== typical) continue;
      for (const a of ins.advice) {
        pushUnique(out, { text: a.text, provenance: "rules", href: a.href, label: a.label, basis: basisOf(m), metricId: m.id }, n);
      }
    }
  };
  const cues = (typical: boolean) => {
    for (const c of r.cues) {
      const m = v.byId[c.metric];
      const a = v.assessments[c.metric];
      if (!visible(m) || !a || a.band !== c.band || m.confidence === "low" || (c.band === "typical") !== typical) continue;
      const ar = area(c.area);
      pushUnique(out, { text: c.text_zh, provenance: "rules", href: `/p/${id}/${ar.page}`, label: ar.label_zh, basis: basisOf(m), metricId: m.id }, n);
    }
  };
  insightAdvice(false);
  cues(false);
  for (const rec of rankedRecs(p)) {
    const raw = p.analysis.recommendations.find((x) => x.id === rec.id);
    if (!raw || !raw.evidence.some((e) => obsIds.has(e))) continue;
    const cited = observations.filter((o) => raw.evidence.includes(o.id)).map((o) => o.text);
    pushUnique(out, { text: rec.action, provenance: "observed", href: `/p/${id}/${rec.page}`, label: rec.categoryZh, basis: cited[0] ?? null, metricId: null }, n);
  }
  for (const s of signatures) {
    pushUnique(out, { text: s.styling_implication, provenance: "observed", href: `/p/${id}/style`, label: copy.styleLabel, basis: s.title, metricId: null }, n);
  }
  insightAdvice(true);
  cues(true);

  const missingMap = new Map<string, number>();
  for (const m of own) {
    if (m.availability === "measured") continue;
    const reason = missingText(v.profile, m) ?? copy.notMeasured;
    missingMap.set(reason, (missingMap.get(reason) ?? 0) + 1);
  }
  const lockedN = all.filter((m) => m.locked && m.availability === "measured").length;
  const measuredN = own.filter((m) => m.availability === "measured").length;
  const state: RegionState = shown.length || lockedN || described ? "observed"
    : own.some((m) => m.availability === "needs_photo") ? "needs_photo" : "unavailable";
  const drawable = (m: Metric) => cropRoles(r).includes(metricRole(m));
  const focus = r.focus.map((x) => v.byId[x]).filter(visible).filter(drawable);
  for (const f of facts) if (!focus.includes(v.byId[f.metricId]) && drawable(v.byId[f.metricId])) focus.push(v.byId[f.metricId]);

  return {
    key: r.key, name: r.name_zh, about: r.about_zh, role: roleOf(r), state,
    traits, implications: out, facts, more: Math.max(0, shown.length - facts.length), locked: lockedN,
    measured: measuredN, total: own.length,
    missing: [...missingMap].map(([reason, count]) => ({ reason, count })),
    observations, descriptors, entered: entered(p, r.key),
    concepts: r.concepts.map((c) => {
      const s = conceptState(c, v, described);
      return { zh: c.zh, state: s.state, stateZh: ATLAS.concept_status_zh[s.state], note: c.note_zh ?? null, count: s.count };
    }),
    focus, spec: r,
  };
}

export function atlasView(p: Passport, v: MeasureView, id: string): Atlas {
  const regions = ATLAS.regions.map((r) => atlasRegion(p, v, id, r));
  const name = Object.fromEntries(regions.map((r) => [r.key, r.name])) as Record<string, string>;
  const regionOfMetric = new Map<string, string>();
  for (const r of ATLAS.regions) for (const m of r.metrics) regionOfMetric.set(m, r.key);
  const lim = ATLAS.overview;

  // strongest: the rules layer's own highlights first, then the model's signature traits
  const strongest: AtlasOverview["strongest"] = [];
  for (const h of v.highlights) {
    const rk = regionOfMetric.get(h.metricId);
    if (!rk || strongest.length >= lim.strongest || strongest.some((s) => s.text === h.label)) continue;
    strongest.push({ region: rk, regionName: name[rk], text: h.label, provenance: "rules", metricId: h.metricId });
  }
  for (const s of p.analysis.feature_signature) {
    const rk = ATLAS.regions.find((r) => r.signature_regions.includes(s.region))?.key;
    if (!rk || strongest.length >= lim.strongest || strongest.some((x) => x.text === s.title)) continue;
    strongest.push({ region: rk, regionName: name[rk], text: s.title, provenance: "observed", metricId: null });
  }

  const relations: AtlasOverview["relations"] = ATLAS.relations.flatMap((rel) => {
    const m = v.byId[rel.metric];
    const a = v.assessments[rel.metric];
    if (!visible(m) || !a) return [];
    return [{ metricId: m.id, zh: rel.zh, regions: rel.regions, regionNames: [name[rel.regions[0]], name[rel.regions[1]]] as [string, string],
      value: display(m), label: a.label_zh, band: a.band }];
  }).sort((x, y) => Number(x.band === "typical") - Number(y.band === "typical")).slice(0, lim.relations);

  const obsRegion = new Map<string, string>();
  for (const o of p.analysis.observations) {
    const rk = ATLAS.regions.find((r) => r.observation_regions.includes(o.region))?.key;
    if (rk) obsRegion.set(o.id, rk);
  }
  const opportunities = rankedRecs(p).slice(0, lim.opportunities).map((rec) => {
    const raw = p.analysis.recommendations.find((x) => x.id === rec.id);
    const keys = [...new Set((raw?.evidence ?? []).map((e) => obsRegion.get(e)).filter((k): k is string => Boolean(k)))];
    return { recId: rec.id, action: rec.action, category: rec.categoryZh, href: `/p/${id}/${rec.page}`, regions: keys.map((k) => ({ key: k, name: name[k] })) };
  });

  const conceptCounts = { measured: 0, observed: 0, pending: 0, unsupported: 0 };
  for (const r of regions) {
    for (const c of r.concepts) {
      if (c.state === "measured" || c.state === "locked") conceptCounts.measured += 1;
      else if (c.state === "observed") conceptCounts.observed += 1;
      else if (c.state === "unsupported") conceptCounts.unsupported += 1;
      else conceptCounts.pending += 1;
    }
  }
  return {
    regions,
    overview: {
      strongest, relations, opportunities, conceptCounts,
      observable: regions.filter((r) => r.state === "observed").length, total: regions.length,
    },
  };
}

// --- crop ------------------------------------------------------------------------------------------------------

export interface AtlasCrop {
  role: ViewRole;
  /** Normalized crop box on the region's photo: [x0, y0, x1, y1]. */
  box: [number, number, number, number];
  width: number;
  height: number;
  /** The lines of the metric shown (null = a plain crop of the photo; nothing is drawn that was not measured). */
  overlay: MetricOverlay | null;
  silhouette: readonly Pt[] | null;
}

/** A crop around the region's landmarks, cut from the photo the shown metric was measured on (its `metricRole`: the
 *  front, glasses-free or side photo), so lines are only ever drawn on the photo whose coordinates they use. Without a
 *  drawable metric the crop is the region's own photo with no lines. Null when that photo has no geometry (expired,
 *  older passport), none of the crop points exist, or the photo does not reach the region. */
export function atlasCrop(region: AtlasRegion, g: FaceGeometry | null, metric: Metric | null, pad = 0.35, minSide = 0.24): AtlasCrop | null {
  let shown = metric && cropRoles(region.spec).includes(metricRole(metric)) ? metric : null;
  if (shown && !viewGeometry(g, metricRole(shown))) shown = null; // its photo's points are gone: plain crop, no lines
  const role = shown ? metricRole(shown) : region.role;
  const vg = viewGeometry(g, role);
  if (!vg) return null;
  const pts: Pt[] = region.spec.crop.points.map((n) => vg.points[n]).filter((q): q is Pt => Boolean(q));
  if (!pts.length) return null;
  const overlay = shown ? metricOverlay(shown, g) : null;
  if (overlay) pts.push(...overlay.segments.flatMap((s) => [s.a, s.b]), ...overlay.arcs.flatMap((a) => [a.a, a.vertex, a.b]), ...overlay.dots);
  const extend = region.spec.crop.extend;
  let y0 = Math.min(...pts.map((q) => q[1])), y1 = Math.max(...pts.map((q) => q[1]));
  if (extend === "bottom") {
    if (1 - y1 < 0.08) return null; // the photo ends at the chin: there is no neck to show
    y1 = 1;
  }
  if (extend === "top") y0 = 0;
  const grow = (lo: number, hi: number): [number, number] => {
    const side = Math.max(hi - lo, minSide);
    const c = (lo + hi) / 2;
    const half = (side * (1 + pad)) / 2;
    let a = c - half, b = c + half;
    if (a < 0) { b -= a; a = 0; }
    if (b > 1) { a -= b - 1; b = 1; }
    return [Math.max(0, a), Math.min(1, b)];
  };
  const [x0, x1] = grow(Math.min(...pts.map((q) => q[0])), Math.max(...pts.map((q) => q[0])));
  const [cy0, cy1] = extend ? [Math.max(0, y0 - (extend === "bottom" ? 0.04 : 0)), Math.min(1, y1 + (extend === "top" ? 0.04 : 0))] : grow(y0, y1);
  const silhouette = role === "profile90" && overlay?.silhouette ? overlay.silhouette : null;
  return { role, box: [x0, cy0, x1, cy1], width: vg.width, height: vg.height, overlay, silhouette };
}
