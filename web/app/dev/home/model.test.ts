import { describe, expect, it } from "vitest";
import { demoCaseByKey, type DemoCase } from "@/lib/fixtures/demo_cases";
import { CHAPTER_PLAN, camera, chapters, heroView } from "./model";

const c = demoCaseByKey("p002") as DemoCase;

describe("home preview model", () => {
  it("builds the hero from the same person's photo and landmarks", () => {
    const v = heroView(c)!;
    expect(v.plate).toEqual({ src: "/sample/demo/person-002/front.jpg", width: 1122, height: 1402 });
    expect(v.length?.a).toEqual(c.geometry.points!.forehead_top);
    expect(v.width?.a).toEqual(c.geometry.points!.cheek_l);
    expect(v.eyeLine).toBeCloseTo(0.3901, 4);
    expect(v.reportHref).toBe("/report/sample?v=p002");
  });

  it("takes every chapter's reading verbatim from the report", () => {
    const list = chapters(c, 0.8);
    expect(list.map((x) => x.metricId)).toEqual(CHAPTER_PLAN.map((p) => p.metric));
    const items = c.passport.derived.measurement_insights!.items;
    for (const ch of list) {
      const ins = items.find((i) => i.metric_id === ch.metricId)!;
      expect(ch.seen).toBe(ins.seen_zh);
      expect(ch.means).toBe(ins.means_zh);
      expect(ch.advice.map((a) => a.text)).toEqual(ins.advice.map((a) => a.text_zh));
    }
    expect(list[0].value).toBe("1.19");
  });

  it("fails closed when the photo and landmarks disagree in size", () => {
    const bad = { ...c, geometry: { ...c.geometry, width: 1000 } } as DemoCase;
    expect(heroView(bad)).toBeNull();
    expect(chapters(bad, 0.8)).toEqual([]);
  });

  it("drops a chapter whose insight is missing instead of inventing one", () => {
    const items = c.passport.derived.measurement_insights!.items.filter((i) => i.metric_id !== "M033");
    const p = { ...c.passport, derived: { ...c.passport.derived, measurement_insights: { ...c.passport.derived.measurement_insights!, items } } };
    expect(chapters({ ...c, passport: p } as DemoCase, 0.8).map((x) => x.metricId)).not.toContain("M033");
  });

  it("camera keeps the photo covering the frame and zooms in on small features", () => {
    const eyes = chapters(c, 0.8).find((x) => x.metricId === "M033")!;
    const cam = camera(eyes.focus, 600, 750, 1122, 1402);
    expect(cam.s).toBeGreaterThan(Math.max(600 / 1122, 750 / 1402));
    expect(cam.tx).toBeLessThanOrEqual(0);
    expect(cam.tx + 1122 * cam.s).toBeGreaterThanOrEqual(600 - 1e-6);
    expect(cam.ty + 1402 * cam.s).toBeGreaterThanOrEqual(750 - 1e-6);
  });
});
