import { describe, expect, it } from "vitest";
import { demoCaseByKey, type DemoCase } from "@/lib/fixtures/demo_cases";
import { camera, chapters, decisions, heroView } from "./model";

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
    expect(list.map((x) => x.metricId)).toEqual(["M001", "M017", "M139"]);
    const items = c.passport.derived.measurement_insights!.items;
    for (const ch of list) {
      if (ch.metricId === "M139") continue;
      const ins = items.find((i) => i.metric_id === ch.metricId)!;
      expect(ch.seen).toBe(ins.seen_zh);
      expect(ch.means).toBe(ins.means_zh);
      expect(ch.advice.every((a) => ins.advice.some((original) => original.text_zh === a.text))).toBe(true);
    }
    expect(list[0].value).toBe("1.19");
  });

  it("fails closed when the photo and landmarks disagree in size", () => {
    const bad = { ...c, geometry: { ...c.geometry, width: 1000 } } as DemoCase;
    expect(heroView(bad)).toBeNull();
    expect(chapters(bad, 0.8)).toEqual([]);
  });

  it("drops a chapter whose insight is missing instead of inventing one", () => {
    const items = c.passport.derived.measurement_insights!.items.filter((i) => i.metric_id !== "M017");
    const p = { ...c.passport, derived: { ...c.passport.derived, measurement_insights: { ...c.passport.derived.measurement_insights!, items } } };
    expect(chapters({ ...c, passport: p } as DemoCase, 0.8).map((x) => x.metricId)).not.toContain("M017");
  });

  it("camera keeps the photo covering the frame and zooms in on small features", () => {
    const eyes = chapters(c, 0.8).find((x) => x.metricId === "M139")!;
    const cam = camera(eyes.focus, 600, 750, 1122, 1402);
    expect(cam.s).toBeGreaterThan(Math.max(600 / 1122, 750 / 1402));
    expect(cam.tx).toBeLessThanOrEqual(0);
    expect(cam.tx + 1122 * cam.s).toBeGreaterThanOrEqual(600 - 1e-6);
    expect(cam.ty + 1402 * cam.s).toBeGreaterThanOrEqual(750 - 1e-6);
  });

  it("curates actions for the subject's goals without changing his report", () => {
    const original = JSON.stringify(c.passport);
    const list = chapters(c, 0.8);
    expect(list.map((x) => x.action)).toEqual([
      "选细金属框、宽度与脸宽匹配的矩形或半框眼镜",
      "两侧推短至6-9mm，顶部保留5-7cm做纹理，改为7:3偏分并露出额头",
      "把靠近面部的颜色换成深海军蓝、炭灰、米白与驼色",
    ]);
    expect(list.flatMap((x) => x.advice).some((a) => /下巴到锁骨|眼线|眼影/.test(a.text))).toBe(false);
    expect(list[2].note).toBe(c.passport.analysis.color_profile.lighting_caveat);
    expect(list[2].seen).toContain("头发与眉毛颜色很深");
    expect(JSON.stringify(c.passport)).toBe(original);
  });

  it("drops color advice when its linked observation is absent", () => {
    const bad = structuredClone(c);
    bad.passport.analysis.observations = bad.passport.analysis.observations.filter((o) => o.id !== "o13");
    expect(chapters(bad, 0.8).map((x) => x.metricId)).not.toContain("M139");
  });

  it("builds all three decisions from Person-001's own exact evidence", () => {
    const female = demoCaseByKey("p001")!;
    const list = decisions(female);
    expect(list.map((x) => [x.kicker, x.value])).toEqual([["发型", "29%"], ["眉形", "1.35"], ["眼镜", "1.21"]]);
    expect(list.map((x) => x.advice[0].text)).toEqual([
      "适合露额或后梳，顶部做一点蓬松；厚重齐刘海会让上庭更短。",
      "眉头可以略向内延伸，让眉眼更集中。",
      "镜框宽度不超过颧骨，上下略窄的款式更协调。",
    ]);
    for (const ch of list) {
      const source = female.passport.derived.measurement_insights!.items.find((i) => i.metric_id === ch.metricId)!;
      expect(ch.seen).toBe(source.seen_zh);
      expect(ch.means).toBe(source.means_zh);
      expect(female.passport.analysis.recommendations.some((r) => r.action === ch.action)).toBe(true);
      expect(ch.overlay.width).toBe(female.geometry.width);
    }
    expect(list[1].overlay.segments[0].a).toEqual(female.geometry.points!.eye_l_inner);
  });

  it("omits unsupported decisions instead of substituting another face or overlay", () => {
    const c = demoCaseByKey("p001")!;
    const points = { ...c.geometry.points! };
    delete points.eye_l_inner;
    const bad = { ...c, geometry: { ...c.geometry, points } };
    expect(decisions(bad).map((x) => x.kicker)).toEqual(["发型", "眼镜"]);
    expect(decisions({ ...bad, geometry: { ...bad.geometry, height: 1 } })).toEqual([]);
  });
});
