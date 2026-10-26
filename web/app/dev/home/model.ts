/** Homepage art-direction preview: sample report → view data. Pure, no React.
 *
 *  Every number, landmark and sentence comes from one pipeline-backed sample (passport + geometry of the same
 *  person). Nothing is computed in the browser except layout: which chapter to show and where to point the camera.
 *  Anything missing (photo, geometry, metric, insight, overlay point) drops that piece instead of drawing a guess. */
import { display, metricOverlay, type Metric, type MetricOverlay } from "@/components/face/measure-model";
import type { DemoCase } from "@/lib/fixtures/demo_cases";
import type { Pt } from "@/lib/tint";

export interface Plate {
  src: string;
  /** Native pixel size; the overlay viewBox. */
  width: number;
  height: number;
}

export interface HeroView {
  plate: Plate;
  /** Closed face contour (CV outline) — drawn as one fine line. */
  contour: readonly Pt[];
  /** Face length (forehead top → chin) and cheek width, from M001's own overlay segments. */
  length: { a: Pt; b: Pt } | null;
  width: { a: Pt; b: Pt } | null;
  /** Height of the measured iris line; the headline rule is aligned to it. */
  eyeLine: number | null;
  /** Outer eye corners, so the guide stops at the face instead of crossing it. */
  eyeOuter: Pt | null;
  reportHref: string;
}

export interface Advice { area: string; text: string }

export interface Chapter {
  metricId: string;
  /** Editorial chapter name (our own wording; the reading below it is the report's). */
  kicker: string;
  /** Rules-layer label, e.g. 脸型偏短宽 */
  title: string;
  metricName: string;
  value: string;
  seen: string;
  means: string;
  confidence: string | null;
  advice: Advice[];
  overlay: MetricOverlay;
  /** Normalized box the camera frames for this chapter. */
  focus: { x: number; y: number; w: number; h: number };
}

/** Chapters, in reading order: overall shape → vertical balance → eyes → lower face. One per styling area. */
export const CHAPTER_PLAN: { metric: string; kicker: string }[] = [
  { metric: "M001", kicker: "轮廓" },
  { metric: "M017", kicker: "三庭" },
  { metric: "M033", kicker: "眉眼" },
  { metric: "M006", kicker: "下颌" },
];

const CONFIDENCE: Record<string, string> = { high: "可信度高", medium: "可信度中", low: "可信度低" };

function plateOf(c: DemoCase): Plate | null {
  const img = c.provenance.published_images.front;
  const src = c.photos.front;
  if (!img || !src) return null;
  // The overlay is only valid on the exact image the landmarks were normalized to.
  if (img.width !== c.geometry.width || img.height !== c.geometry.height) return null;
  return { src, width: img.width, height: img.height };
}

const metricById = (c: DemoCase, id: string): Metric | undefined =>
  c.passport.measurement_profile?.metrics.find((m) => m.id === id);

export function heroView(c: DemoCase): HeroView | null {
  const plate = plateOf(c);
  const pts = c.geometry.points;
  if (!plate || !pts || !c.geometry.jaw?.length) return null;
  const m = metricById(c, "M001");
  const ov = m ? metricOverlay(m, c.geometry) : null;
  const seg = (i: number) => (ov?.segments[i] ? { a: ov.segments[i].a, b: ov.segments[i].b } : null);
  const il = pts.iris_l, ir = pts.iris_r;
  return {
    plate,
    contour: c.geometry.jaw,
    length: seg(0),
    width: seg(1),
    eyeLine: il && ir ? (il[1] + ir[1]) / 2 : null,
    eyeOuter: pts.eye_l_outer ?? null,
    reportHref: `/report/sample?v=${c.key}`,
  };
}

/** Bounding box of everything an overlay draws, padded so the feature keeps some context. */
export function focusBox(ov: MetricOverlay, aspect: number, pad = 0.09): Chapter["focus"] {
  const pts: Pt[] = [];
  for (const s of ov.segments) pts.push(s.a, s.b);
  for (const a of ov.arcs) pts.push(a.a, a.vertex, a.b);
  pts.push(...ov.dots);
  if (ov.outline) pts.push(...ov.outline);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  let x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad;
  let y0 = Math.min(...ys) - pad, y1 = Math.max(...ys) + pad;
  // Grow the short side so the box matches the frame's aspect (w/h in image-normalized units).
  const want = aspect * (ov.height / ov.width);
  const w = x1 - x0, h = y1 - y0;
  if (w / h < want) { const d = (h * want - w) / 2; x0 -= d; x1 += d; }
  else { const d = (w / want - h) / 2; y0 -= d; y1 += d; }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function chapters(c: DemoCase, frameAspect: number): Chapter[] {
  if (!plateOf(c)) return [];
  const items = c.passport.derived.measurement_insights?.items ?? [];
  const out: Chapter[] = [];
  for (const { metric, kicker } of CHAPTER_PLAN) {
    const m = metricById(c, metric);
    const ins = items.find((i) => i.metric_id === metric);
    if (!m || !ins || m.availability !== "measured" || m.value == null) continue;
    const overlay = metricOverlay(m, c.geometry);
    if (!overlay || overlay.width !== c.geometry.width) continue;
    out.push({
      metricId: metric, kicker, title: ins.label_zh, metricName: m.name_zh, value: display(m),
      seen: ins.seen_zh, means: ins.means_zh, confidence: CONFIDENCE[ins.confidence] ?? null,
      advice: ins.advice.map((a) => ({ area: a.label_zh, text: a.text_zh })),
      overlay, focus: focusBox(overlay, frameAspect),
    });
  }
  return out;
}

/** Camera transform that fits `focus` inside a frame of fw × fh px showing a plate of pw × ph px (cover-fit at 1×).
 *  Returns scale + translate for `transform: translate(tx,ty) scale(s)` with origin 0 0. Never zooms out past cover. */
export function camera(focus: Chapter["focus"], fw: number, fh: number, pw: number, ph: number, maxZoom = 2.4) {
  const base = Math.max(fw / pw, fh / ph);
  const fit = Math.min(fw / (focus.w * pw), fh / (focus.h * ph));
  const s = Math.min(Math.max(fit, base), base * maxZoom);
  const cx = (focus.x + focus.w / 2) * pw * s, cy = (focus.y + focus.h / 2) * ph * s;
  // Keep the plate covering the frame (no empty edges).
  const tx = Math.min(0, Math.max(fw - pw * s, fw / 2 - cx));
  const ty = Math.min(0, Math.max(fh - ph * s, fh / 2 - cy));
  return { s, tx, ty };
}
