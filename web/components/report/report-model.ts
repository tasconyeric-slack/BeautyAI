/** The continuous facial assessment report (Issue #33): passport → chapter data. Pure functions, no React.
 *
 *  Nothing here measures, scores or recommends. Every number is read from the passport (CV `measurement_profile`,
 *  scoring-layer `aesthetic_score`), every reading from the rules layer (`derived.measurement_insights`) and every
 *  sentence about the face from the model's `analysis`. The report only regroups them into one narrative. */
import { rankedRecs } from "@/lib/adapters";
import { report as copy } from "@/lib/copy/zh";
import type { Passport } from "@/lib/api";
import type { FaceGeometry, Pt } from "@/lib/tint";
import {
  display, metricOverlay, metricRole, missingText, viewGeometry,
  type Assessment, type InsightView, type MeasureView, type Metric, type MetricOverlay,
} from "@/components/face/measure-model";

export type ChapterKey = keyof typeof copy.chapters;
export const CHAPTER_KEYS: ChapterKey[] = ["overview", "findings", "interpretation", "improvements", "options", "plan", "methods"];
export const chapterNo = (k: ChapterKey) => String(CHAPTER_KEYS.indexOf(k) + 1).padStart(2, "0");

// --- regions ---------------------------------------------------------------------------------------------------

type Observation = Passport["analysis"]["observations"][number];

export interface RegionDef {
  key: string;
  title: string;
  /** measurement_profile group keys (config/face_metrics.yaml) shown in this chapter. */
  groups: string[];
  /** analysis.observations[].region values quoted in this chapter. */
  regions: Observation["region"][];
}

/** Region chapters, in reading order (benchmark: proportions, eyes/brows, nose, lips/smile, jaw/chin, skin). */
export const REGIONS: RegionDef[] = [
  { key: "proportions", title: "比例与对称", groups: ["overall", "proportions", "symmetry"], regions: ["overall", "hairline"] },
  { key: "eyes", title: "眼与眉", groups: ["eyes", "brows"], regions: ["eye", "brow"] },
  { key: "nose", title: "鼻", groups: ["nose"], regions: ["nose"] },
  { key: "lips", title: "口唇与微笑", groups: ["lips", "smile"], regions: ["lip"] },
  { key: "jaw", title: "下颌、下巴与侧脸", groups: ["jaw", "profile"], regions: ["jaw", "cheekbone"] },
  { key: "skin", title: "皮相与拍摄条件", groups: ["skin"], regions: ["skin"] },
];

const MAX_ROWS = 6;

export interface RegionRow {
  id: string;
  name: string;
  value: string;
  definition: string;
  assessment: Assessment | null;
  metric: Metric;
  confidence: Metric["confidence"];
}

export interface RegionView {
  key: string;
  title: string;
  rows: RegionRow[];
  /** Measured, visible metrics beyond the rows shown here (all are in the workbench). */
  more: number;
  /** Measured metrics whose values the free view withholds. */
  locked: number;
  measured: number;
  total: number;
  /** Unmeasured metrics, grouped by reason ("需要补充侧脸照" × 3). */
  missing: { reason: string; count: number }[];
  insights: InsightView[];
  observations: { text: string; polarity: Observation["polarity"] }[];
  /** Front-photo metrics whose own geometry can be drawn in the region crop. */
  drawable: Metric[];
}

const visible = (m: Metric) => m.availability === "measured" && !m.locked && m.value != null;

/** Rows first show what the rules layer explained, then what stands out, then the rest of the measured values. */
function rowOrder(m: Metric, v: MeasureView): number {
  const a = v.assessments[m.id];
  if (v.insights[m.id]?.highlight) return 0;
  if (v.insights[m.id]) return 1;
  if (a && a.band !== "typical") return 2;
  if (a) return 3;
  return 4;
}

export function regionViews(p: Passport, v: MeasureView): RegionView[] {
  return REGIONS.map((r) => {
    const metrics = v.profile.metrics.filter((m) => r.groups.includes(m.group));
    const shown = metrics.filter(visible);
    const sorted = [...shown].sort((a, b) => rowOrder(a, v) - rowOrder(b, v));
    const rows: RegionRow[] = sorted.slice(0, MAX_ROWS).map((m) => ({
      id: m.id, name: m.name_zh, value: display(m), definition: m.definition_zh, assessment: v.assessments[m.id] ?? null,
      metric: m, confidence: m.confidence,
    }));
    const missingMap = new Map<string, number>();
    for (const m of metrics) {
      if (m.availability === "measured") continue;
      const reason = missingText(v.profile, m) ?? copy.regionMissing;
      missingMap.set(reason, (missingMap.get(reason) ?? 0) + 1);
    }
    return {
      key: r.key, title: r.title, rows,
      more: Math.max(0, shown.length - rows.length),
      locked: metrics.filter((m) => m.locked && m.availability === "measured").length,
      measured: metrics.filter((m) => m.availability === "measured").length,
      total: metrics.length,
      missing: [...missingMap].map(([reason, count]) => ({ reason, count })),
      insights: metrics.map((m) => v.insights[m.id]).filter((x): x is InsightView => Boolean(x)),
      observations: p.analysis.observations.filter((o) => r.regions.includes(o.region)).map((o) => ({ text: o.text, polarity: o.polarity })),
      drawable: sorted.filter((m) => metricRole(m) === "front").slice(0, 3),
    };
  });
}

// --- evidence ↔ recommendation ---------------------------------------------------------------------------------

export interface RecRef { recId: string; rank: number; action: string }
export interface RecEvidence {
  /** The report's region chapters this recommendation rests on (via its cited observations and the readings that point at it). */
  regions: { key: string; title: string }[];
  /** The rules layer's readings ("眉尾偏低") whose advice points at this recommendation. */
  readings: { metricId: string; label: string; regionKey: string }[];
}
export interface EvidenceLinks {
  byRec: Record<string, RecEvidence>;
  /** Region key → the shown recommendations that rest on it, best-ranked first. */
  byRegion: Record<string, RecRef[]>;
}

/** The report region an observation belongs to, or null (hair, crown and neck sit outside the six measured regions). */
export const regionOfObservation = (region: Observation["region"]): string | null =>
  REGIONS.find((r) => r.regions.includes(region))?.key ?? null;

/** Links both ways between findings and the recommendations shown in the report: a recommendation cites observations
 *  (analysis.recommendations[].evidence) and measurement readings advise it (derived.measurement_insights[].advice).
 *  Only recommendations the report actually shows (the top `shown`, same order as the chapter) get a link. */
export function evidenceLinks(p: Passport, regions: RegionView[], shown = 5): EvidenceLinks {
  const ranked = rankedRecs(p).slice(0, shown);
  const rank = new Map(ranked.map((r, i) => [r.id, i + 1]));
  const action = new Map(ranked.map((r) => [r.id, r.action]));
  const title = new Map(REGIONS.map((r) => [r.key, r.title]));
  const obs = new Map(p.analysis.observations.map((o) => [o.id, o]));
  const byRec: Record<string, RecEvidence> = {};
  const touch = (recId: string, regionKey: string, reading?: RecEvidence["readings"][number]) => {
    const e = (byRec[recId] ??= { regions: [], readings: [] });
    if (!e.regions.some((g) => g.key === regionKey)) e.regions.push({ key: regionKey, title: title.get(regionKey) ?? regionKey });
    if (reading && !e.readings.some((x) => x.metricId === reading.metricId)) e.readings.push(reading);
  };
  for (const rec of p.analysis.recommendations) {
    if (!rank.has(rec.id)) continue;
    for (const ev of rec.evidence) {
      const o = obs.get(ev);
      const key = o ? regionOfObservation(o.region) : null;
      if (key) touch(rec.id, key);
    }
  }
  for (const rg of regions) {
    for (const ins of rg.insights) {
      for (const a of ins.advice) {
        if (a.recId && rank.has(a.recId)) touch(a.recId, rg.key, { metricId: ins.metricId, label: ins.label, regionKey: rg.key });
      }
    }
  }
  const byRegion: Record<string, RecRef[]> = {};
  for (const [recId, e] of Object.entries(byRec)) {
    for (const g of e.regions) (byRegion[g.key] ??= []).push({ recId, rank: rank.get(recId) as number, action: action.get(recId) as string });
  }
  for (const list of Object.values(byRegion)) list.sort((a, b) => a.rank - b.rank);
  return { byRec, byRegion };
}

// --- reading position ------------------------------------------------------------------------------------------

/** Which chapter the reader is in: the last one whose top has reached the reading line. Before any layout exists
 *  (every top is 0, e.g. server render or jsdom) or above the first chapter, the first one. */
export function pickActive(tops: number[], line: number): number {
  if (tops.length === 0 || tops.every((t) => t === 0)) return 0;
  let at = 0;
  tops.forEach((t, i) => { if (t <= line) at = i; });
  return at;
}

// --- region crop -----------------------------------------------------------------------------------------------

export interface RegionCrop {
  /** Normalized crop box on the front photo: [x0, y0, x1, y1]. */
  box: [number, number, number, number];
  /** Native pixel size of the front photo (the coordinates' reference). */
  width: number;
  height: number;
  overlays: MetricOverlay[];
}

/** A tight crop around the region's own measurement points (front photo only), with the lines that were measured.
 *  Null when the photo has no geometry (expired, pre-V3 passport) or none of the region's metrics can be drawn. */
export function regionCrop(metrics: Metric[], g: FaceGeometry | null, pad = 0.45, minSide = 0.22): RegionCrop | null {
  const vg = viewGeometry(g, "front");
  if (!vg) return null;
  const overlays = metrics.map((m) => metricOverlay(m, g)).filter((o): o is MetricOverlay => Boolean(o));
  const pts: Pt[] = overlays.flatMap((o) => [...o.segments.flatMap((s) => [s.a, s.b]), ...o.arcs.flatMap((a) => [a.a, a.vertex, a.b]), ...o.dots]);
  if (!pts.length) return null;
  let x0 = Math.min(...pts.map((q) => q[0])), x1 = Math.max(...pts.map((q) => q[0]));
  let y0 = Math.min(...pts.map((q) => q[1])), y1 = Math.max(...pts.map((q) => q[1]));
  const grow = (lo: number, hi: number): [number, number] => {
    const side = Math.max(hi - lo, minSide);
    const c = (lo + hi) / 2;
    const half = (side * (1 + pad)) / 2;
    let a = c - half, b = c + half;
    if (a < 0) { b -= a; a = 0; }
    if (b > 1) { a -= b - 1; b = 1; }
    return [Math.max(0, a), Math.min(1, b)];
  };
  [x0, x1] = grow(x0, x1);
  [y0, y1] = grow(y0, y1);
  return { box: [x0, y0, x1, y1], width: vg.width, height: vg.height, overlays };
}

// --- photos ---------------------------------------------------------------------------------------------------

/** Whether the photos are gone *now*: the response may be hours old (the report stops polling once settled), so the
 *  TTL is re-checked against the clock, not only the `expired` flag the server sent. */
export function photosGone(media: { expired: boolean; expires_at?: string | null; front?: string | null }, now = Date.now()): boolean {
  if (media.expired || !media.front) return true;
  const t = media.expires_at ? Date.parse(media.expires_at) : NaN;
  return Number.isFinite(t) && t <= now;
}

// --- hair gallery ----------------------------------------------------------------------------------------------

export type PreviewNote = "ai" | "illustration" | "locked" | "not_yet" | "expired" | "failed";

/** Why a hair direction does or does not show an image. Never a placeholder picture presented as a result. */
export function previewNote(opts: { status: string | null; imageModel: string | null; paid: boolean; expired: boolean }): PreviewNote {
  if (opts.status === "succeeded") return (opts.imageModel ?? "").startsWith("fixture") ? "illustration" : "ai";
  if (!opts.paid) return "locked";
  if (opts.status === "failed" || opts.status === "fallback" || opts.status === "skipped") return "failed";
  if (opts.expired) return "expired";
  return "not_yet";
}
