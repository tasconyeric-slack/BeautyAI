import { describe, expect, it } from "vitest";
import { DEMO_CASES, type DemoCase } from "@/lib/fixtures/demo_cases";
import { heroInsight } from "./model";

describe("Hero analytical provenance", () => {
  it("uses each portrait's own measured value, advice and landmark segments", () => {
    for (const subject of DEMO_CASES) {
      const result = heroInsight(subject)!;
      const metric = subject.passport.measurement_profile!.metrics.find(m => m.id === "M006")!;
      expect(result.value).toBe(metric.value!.toFixed(metric.decimals));
      const points = subject.geometry.points!;
      expect(result.overlay.segments[0].a).toEqual(points.jaw_l);
      expect(result.overlay.segments[0].b).toEqual(points.jaw_r);
      expect(result.overlay.segments[1].a).toEqual(points.cheek_l);
      const reading = subject.passport.derived.measurement_insights!.items.find(i => i.metric_id === "M006")!;
      expect(result.advice).toBe(reading.advice.find(a => a.area === "hair")!.text_zh);
      expect(result.overlay.contour.every(p => subject.geometry.jaw.includes(p))).toBe(true);
    }
  });
  it("withholds graphics and numbers when unavailable or when photo geometry does not match", () => {
    for (const change of ["unavailable", "point", "photo"] as const) {
      const subject = structuredClone(DEMO_CASES[1]) as DemoCase;
      if (change === "unavailable") subject.passport.measurement_profile!.metrics.find(m => m.id === "M006")!.availability = "not_measured";
      if (change === "point") subject.geometry = { ...subject.geometry, points: Object.fromEntries(Object.entries(subject.geometry.points!).filter(([key]) => key !== "jaw_l")) };
      if (change === "photo") subject.geometry = { ...subject.geometry, width: subject.geometry.width + 1 };
      expect(heroInsight(subject)).toBeNull();
    }
  });
});
