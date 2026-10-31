import { describe, expect, it } from "vitest";
import female from "@/lib/fixtures/sample_passport.json";
import male from "@/lib/fixtures/sample_passport_male.json";
import type { Passport } from "@/lib/passport";
import {
  aestheticScore, avatarProps, colorGroups, cover, firstThing, hairOptions, profileCardProps, rankedRecs, stylePlane, stylistCardProps, triptych,
} from "./index";

const F = female as unknown as Passport;
const M = male as unknown as Passport;

describe("adapters", () => {
  it("cover and triptych read the passport, not invented text", () => {
    const c = cover(F);
    expect(c.oneLiner).toBe(F.analysis.profile_summary.one_liner);
    expect(c.signature).toHaveLength(3);
    expect(c.styleLine).toBe("优雅型，靠近古典型");
    const t = triptych(F);
    expect(t.color.value).toBe(F.derived.display_labels.color.summary_zh);
    expect(t.color.swatches.length).toBeGreaterThan(0);
  });

  it("eight-style names are unified across presentations (D25)", () => {
    expect(stylePlane(F).prototypes.map((p) => p.name)).toEqual(stylePlane(M).prototypes.map((p) => p.name));
    expect(stylePlane(M).prototypes.find((p) => p.key === "modern")?.name).toBe("前卫型");
  });

  it("style plane: me = face_only; target appears only when set", () => {
    const sp = stylePlane(F);
    expect(sp.me).toMatchObject({ x: 2.9, y: 0.7 });
    expect(sp.target).toBeUndefined();
    expect(sp.between).toEqual(["优雅型", "古典型"]);
    const withTarget = structuredClone(F);
    withTarget.derived.style_profile.preference_overlay.target = "dramatic";
    expect(stylePlane(withTarget).target).toEqual({ x: 4.2, y: -1.3 });
    expect(stylePlane(withTarget).me).toEqual(sp.me);
  });

  it("color groups map favor / neutral / caution", () => {
    const g = colorGroups(F);
    expect(g.map((x) => x.title)).toEqual(["近脸色", "衣橱底色", "慎用"]);
    expect(g[0].colors[0]).toEqual({ hex: "#7A8FA6", name_zh: "雾霾蓝1" });
    expect(g[2].colors.some((c) => c.name_zh === "芥末黄")).toBe(true);
  });

  it("hair options follow derived rank and carry checks", () => {
    const h = hairOptions(F, [{ target_id: "safe", kind: "hair", status: "succeeded", image_model: "x", after_url: "/a", before_url: "/b", error: null, ai_label: "AI 试看" }]);
    expect(h.map((x) => x.tier)).toEqual(["safe", "bold", "easy"]);
    expect(h[0].preview?.status).toBe("succeeded");
    const m = hairOptions(M);
    expect(m.at(-1)).toMatchObject({ tier: "bold", status: "excluded" });
  });

  it("first thing is rank 1 and links to its page", () => {
    expect(firstThing(F)).toMatchObject({ id: F.derived.top5[0], page: "hair" });
    expect(rankedRecs(F)[0].rank).toBe(1);
  });

  it("cards: avatar from parameters, portrait only with a source", () => {
    const a = avatarProps(F);
    expect(a.hair).toMatchObject({ length: "collarbone", fringe: "air", curl: "c_curl" });
    expect(avatarProps(M).presentation).toBe("masculine");
    expect(profileCardProps(F, { mode: "portrait", shortLink: "x" }).mode).toBe("avatar");
    expect(profileCardProps(F, { mode: "portrait", shortLink: "x", portraitSrc: "/p.jpg" }).mode).toBe("portrait");
    const s = stylistCardProps(F, "safe");
    expect(s?.scripts).toHaveLength(3);
    expect(s?.hideFace).toBe(true);
  });

  it("aestheticScore: rounds the computed score, keeps four parts in weight order, and reads strengths from the passport", () => {
    const v = aestheticScore(F);
    expect(v).not.toBeNull();
    expect(v!.score).toBe(Number((F.aesthetic_score!.overall_score! / 10).toFixed(2)));
    expect(v!.components.map((c) => [c.key, c.weightPct])).toEqual([["symmetry", 35], ["thirds", 25], ["fifths", 25], ["golden_ratio", 15]]);
    expect(v!.components[1].detail).toMatch(/^测得 \d+ \/ \d+ \/ \d+$/);
    expect(v!.components[1].about).toContain("18 / 41 / 41");
    expect(v!.strengths).toEqual(F.aesthetic_score!.strengths.map((x) => x.text_zh));
    expect(v!.state).toBe("scored");
  });

  it("aestheticScore: null for passports that predate the score; unavailable keeps the number null", () => {
    expect(aestheticScore({ ...F, aesthetic_score: undefined })).toBeNull();
    const s = F.aesthetic_score!;
    const off = { ...s, status: "unavailable" as const, overall_score: null, tier: null, quality_flags: ["pose_off_axis" as const],
      copy_zh: { ...s.copy_zh, flags: { pose_off_axis: "头部转动或俯仰过大" } },
      components: s.components.map((c) => (c.key === "symmetry" ? { ...c, score: null, status: "not_measured" as const, measured: null } : c)) };
    const v = aestheticScore({ ...F, aesthetic_score: off })!;
    expect(v.state).toBe("unavailable");
    expect(v.score).toBeNull();
    expect(v.components[0]).toMatchObject({ score: null, detail: "未测量" });
    expect(v.flags).toEqual(["头部转动或俯仰过大"]);
  });
});
