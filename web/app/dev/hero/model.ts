import type { DemoCase } from "@/lib/fixtures/demo_cases";
import type { Pt } from "@/lib/tint";
import { display, metricOverlay } from "@/components/face/measure-model";

/** One observation, resolved through the same registry/geometry adapter as the real report. */
export function heroInsight(subject: DemoCase) {
  const metric = subject.passport.measurement_profile?.metrics.find(m => m.id === "M006");
  const reading = subject.passport.derived.measurement_insights?.items.find(i => i.metric_id === metric?.id);
  const photo = subject.provenance.published_images.front;
  // No unrelated photo, partial geometry, unavailable result or invented fallback.
  if (!metric || !reading || !photo || metric.availability !== "measured" || metric.source_photo !== "front"
      || photo.width !== subject.geometry.width || photo.height !== subject.geometry.height) return null;
  const overlay = metricOverlay(metric, subject.geometry);
  if (!overlay || overlay.segments.length !== 2 || !overlay.outline || metric.value == null) return null;
  const cheek = overlay.segments.find(s => s.role === "reference");
  if (!cheek) return null;
  const cheekY = Math.min(cheek.a[1], cheek.b[1]);
  const contour = overlay.outline.filter(p => p[1] >= cheekY - 0.002);
  return {
    metricId: metric.id, name: metric.name_zh, value: display(metric), definition: metric.definition_zh,
    seen: reading.seen_zh, meaning: reading.means_zh,
    advice: reading.advice.find(a => a.area === "hair")?.text_zh ?? null,
    overlay: { ...overlay, contour },
  };
}

export type HeroInsight = ReturnType<typeof heroInsight>;

/** Catmull–Rom interpolation through measured contour samples; no hand-drawn face outline. */
export function contourPath(points: readonly Pt[], width: number, height: number): string {
  if (points.length < 2) return "";
  const pts = points.map(([x, y]) => [x * width, y * height] as const);
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[i], c = pts[i + 1], e = pts[Math.min(pts.length - 1, i + 2)];
    d += ` C${b[0] + (c[0] - a[0]) / 6},${b[1] + (c[1] - a[1]) / 6} ${c[0] - (e[0] - b[0]) / 6},${c[1] - (e[1] - b[1]) / 6} ${c[0]},${c[1]}`;
  }
  return d;
}
