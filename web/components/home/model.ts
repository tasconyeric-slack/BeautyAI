/** Homepage: sample report → view data. Pure, no React.
 *
 *  Every number, landmark and sentence comes from one pipeline-backed sample (passport + geometry of the same
 *  person). Nothing is computed in the browser except layout: which chapter to show and where to point the camera.
 *  Anything missing (photo, geometry, metric, insight, overlay point) drops that piece instead of drawing a guess. */
import { display, metricOverlay, viewGeometry, type Metric, type MetricOverlay } from "@/components/face/measure-model";
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
  /** The same person's accepted side photo with its own measurements; null drops the view switch entirely. */
  profile: ProfileView | null;
}

/** A side-view measurement drawn on the profile photo, with the passport's own value. */
export interface ProfileMark { id: string; name: string; value: string; overlay: MetricOverlay }

export interface ProfileView {
  plate: Plate;
  /** CV facial-profile silhouette of the side photo (forehead → chin), drawn as one open line. */
  silhouette: readonly Pt[];
  marks: ProfileMark[];
  /** Side metrics the pipeline measured on this photo. */
  measured: number;
  /** Display registration onto the front plate (layout only — nothing is computed from it).
   *  `scale` = front px per profile px, from the nasion→subnasale height measured on each photo; `nasion` is the
   *  profile nasion (pinned to the front nasion's screen height); `pivot` is the head's horizontal centre in the
   *  profile frame, placed on the front face axis so the head turns in place. */
  fit: { scale: number; nasion: Pt; frontNasion: Pt; pivot: number };
}

/** Hero side view: overall profile line first, then the nose–lip angle (both measured on profile90). */
export const HERO_PROFILE = {
  metrics: ["M131", "M117"],
  /** Person-002's head in the published profile90 frame spans nose tip ≈0.19 → back of hair ≈0.87. Layout only. */
  pivot: 0.53,
} as const;

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
  /** The same report's model recommendation, separate from the rules-layer advice. */
  action: string;
  note?: string;
  swatches?: { name: string; hex: string }[];
  overlay: MetricOverlay;
  /** Normalized box the camera frames for this chapter. */
  focus: { x: number; y: number; w: number; h: number };
}

/** Curated for Person-002's stated goals. The full report remains unchanged. */
export const CHAPTER_PLAN = [
  { metric: "M001", kicker: "眼镜", area: "glasses" },
  { metric: "M017", kicker: "发型", area: "hair" },
] as const;

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
    profile: profileView(c),
  };
}

/** Fails closed: QC-accepted side photo, published at exactly the size its landmarks were normalized to, and every
 *  mark measured on that photo. Anything else → no side view (the hero stays the approved front composition). */
export function profileView(c: DemoCase): ProfileView | null {
  const img = c.provenance.published_images.profile90;
  const src = c.photos.profile90;
  const vg = viewGeometry(c.geometry, "profile90");
  const fp = c.geometry.points;
  if (!img || !src || !vg || !fp || !c.provenance.layers.cv.side_view.qc_accepted) return null;
  if (img.width !== vg.width || img.height !== vg.height || !vg.silhouette?.length) return null;
  const pn = vg.points.p_nasion, ps = vg.points.p_subnasale, fn = fp.nasion, fs = fp.subnasale;
  if (!pn || !ps || !fn || !fs) return null;
  const spanP = (ps[1] - pn[1]) * vg.height, spanF = (fs[1] - fn[1]) * c.geometry.height;
  if (!(spanP > 0 && spanF > 0)) return null;
  const marks: ProfileMark[] = [];
  for (const id of HERO_PROFILE.metrics) {
    const m = metricById(c, id);
    if (!m || m.availability !== "measured" || m.value == null || m.source_photo !== "profile90" || m.view !== "side") return null;
    const overlay = metricOverlay(m, c.geometry);
    if (!overlay || overlay.width !== vg.width || overlay.height !== vg.height) return null;
    marks.push({ id, name: m.name_zh, value: display(m), overlay });
  }
  const measured = (c.passport.measurement_profile?.metrics ?? [])
    .filter((m) => m.view === "side" && m.availability === "measured").length;
  return {
    plate: { src, width: img.width, height: img.height },
    silhouette: vg.silhouette, marks, measured,
    fit: { scale: spanF / spanP, nasion: pn, frontNasion: fn, pivot: HERO_PROFILE.pivot },
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

function finding(c: DemoCase, metric: string, kicker: string, area: string, aspect: number): Chapter | null {
  if (!plateOf(c)) return null;
  const m = metricById(c, metric);
  const ins = c.passport.derived.measurement_insights?.items.find((i) => i.metric_id === metric);
  if (!m || !ins || m.availability !== "measured" || m.value == null || m.source_photo !== "front") return null;
  const advice = ins.advice.filter((a) => a.area === area);
  const rec = c.passport.analysis.recommendations.find((r) => advice.some((a) => a.rec_id === r.id));
  const overlay = metricOverlay(m, c.geometry);
  if (!rec || !advice.length || !overlay || overlay.width !== c.geometry.width || overlay.height !== c.geometry.height) return null;
  return {
    metricId: metric, kicker, title: ins.label_zh, metricName: m.name_zh, value: display(m),
    seen: ins.seen_zh, means: ins.means_zh, confidence: CONFIDENCE[ins.confidence] ?? null,
    advice: advice.map((a) => ({ area: a.label_zh, text: a.text_zh })), action: rec.action,
    overlay, focus: focusBox(overlay, aspect),
  };
}

export function chapters(c: DemoCase, frameAspect: number): Chapter[] {
  if (!plateOf(c)) return [];
  const out = CHAPTER_PLAN.flatMap(({ metric, kicker, area }) => {
    const ch = finding(c, metric, kicker, area, frameAspect);
    return ch ? [ch] : [];
  });
  // b* locates the photographed color samples; it does not determine the wardrobe palette.
  // The interpretation, action and caveat below are the model report's own.
  const m = metricById(c, "M139");
  const rec = c.passport.analysis.recommendations.find((r) => r.category === "color_palette");
  const profile = c.passport.analysis.color_profile;
  const evidence = rec?.evidence.map((id) => c.passport.analysis.observations.find((o) => o.id === id));
  const overlay = m?.source_photo === "front" ? metricOverlay(m, c.geometry) : null;
  if (m && m.value != null && rec && evidence?.length && evidence.every(Boolean) && overlay && profile.lighting_caveat) {
    const observations = evidence.filter((o) => o?.category === "color");
    if (observations.length) out.push({
      metricId: m.id, kicker: "配色", title: "近脸配色", metricName: m.name_zh, value: display(m),
      seen: observations.map((o) => o!.text).join("；"), means: rec.why,
      confidence: CONFIDENCE[m.confidence ?? ""] ?? null, advice: [], action: rec.action,
      note: profile.lighting_caveat,
      swatches: [...profile.favor_families, ...profile.neutral_families]
        .filter((f) => ["深海军蓝", "炭灰", "米白", "驼色"].includes(f.name))
        .map((f) => ({ name: f.name, hex: f.hex_examples[0] })),
      overlay, focus: focusBox(overlay, frameAspect),
    });
  }
  return out;
}

/** Person-001: only the relevant advice from each same-person insight. */
export function decisions(c: DemoCase): Chapter[] {
  return [
    { metric: "M017", kicker: "发型", area: "hair" },
    { metric: "M033", kicker: "眉形", area: "brows" },
    { metric: "M001", kicker: "眼镜", area: "glasses" },
  ].flatMap(({ metric, kicker, area }) => {
    const ch = finding(c, metric, kicker, area, 0.85);
    return ch ? [ch] : [];
  });
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
