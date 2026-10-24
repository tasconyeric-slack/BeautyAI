/** Issue #4: personalized complete-look directions and the A/B difference model. */
import { describe, expect, it } from "vitest";
import female from "@/lib/fixtures/sample_passport.json";
import male from "@/lib/fixtures/sample_passport_male.json";
import type { Passport } from "@/lib/api";
import { FRAME_COLORS, FRAME_SHAPES } from "@/lib/tint/eyewear";
import { NO_MAKEUP } from "@/lib/tint/makeup";
import { hasForbidden } from "@/components/share/caption";
import { buildDirections, diffLooks, layerNotes, lookParts, renderLabel, savedDirection, type RenderContext } from "./index";
import type { SavedLook } from "@/lib/state/choices";

const F = female as unknown as Passport;
const M = male as unknown as Passport;
const clone = (p: Passport) => JSON.parse(JSON.stringify(p)) as Passport;

describe("complete-look directions", () => {
  it("offers three distinct, coherent looks, each set from this passport", () => {
    const d = buildDirections(F);
    expect(d.map((x) => x.key).sort()).toEqual(["bold", "polished", "relaxed"]);
    expect(new Set(d.map((x) => x.look.name)).size).toBe(3);
    const lips = F.analysis.color_profile.lip_families.map((l) => l.hex.toUpperCase());
    const palette = [...F.analysis.color_profile.favor_families, ...F.analysis.color_profile.neutral_families].flatMap((f) => f.hex_examples.map((h) => h.toUpperCase()));
    for (const { look } of d) {
      expect(lips).toContain(look.lip!.toUpperCase());
      expect(look.blush).toBe(true);
      expect(look.blushHex).toBe(F.analysis.makeup_direction.blush.hex);
      expect(palette).toContain(look.drape!.toUpperCase());
      expect(look.eyeshadow && look.eyeliner && look.brows).toBeTruthy();
    }
    // near-face colour and hair shape are not repeated across directions
    expect(new Set(d.map((x) => x.look.drape)).size).toBe(3);
    expect(new Set(d.map((x) => x.look.hair).filter(Boolean)).size).toBe(d.filter((x) => x.look.hair).length);
  });

  it("only uses values the Studio can render", () => {
    for (const p of [F, M]) for (const { look } of buildDirections(p)) {
      if (look.eyewear) {
        expect(FRAME_SHAPES.map((s) => s.id)).toContain(look.eyewear.shape);
        expect(FRAME_COLORS.map((c) => c.id)).toContain(look.eyewear.color);
      }
      if (look.hairColor !== null) expect(p.analysis.color_profile.hair_color_directions[look.hairColor].hex).toBe(look.hairHex);
      if (look.hair) expect(p.analysis.hair_options.map((o) => o.tier)).toContain(look.hair);
    }
  });

  it("is deterministic and puts the person's own goal first", () => {
    expect(buildDirections(F)).toEqual(buildDirections(F));
    const pro = clone(F); pro.user_context.desired_impression = ["professional"];
    expect(buildDirections(pro)[0].key).toBe("polished");
    const bold = clone(F); bold.user_context.desired_impression = ["distinctive"];
    expect(buildDirections(bold)[0].key).toBe("bold");
    const easy = clone(F); easy.user_context.desired_impression = ["relaxed"];
    expect(buildDirections(easy)[0].key).toBe("relaxed");
    expect(buildDirections(easy).filter((x) => x.matchesGoal)).toHaveLength(1);
  });

  it("respects declined dye, declined glasses changes and grooming mode", () => {
    const noDye = clone(F); noDye.user_context.constraints.accepts_dye = false;
    const dyed = new Set(F.analysis.color_profile.hair_color_directions.filter((c) => c.requires_dye).map((c) => c.hex));
    for (const { look } of buildDirections(noDye)) expect(look.hairHex && dyed.has(look.hairHex)).toBeFalsy();
    const noGlasses = clone(F); noGlasses.user_context.constraints.accepts_glasses_change = false;
    expect(buildDirections(noGlasses).every((d) => !d.look.eyewear)).toBe(true);
    expect(buildDirections(F).some((d) => d.look.eyewear)).toBe(true);
    // the masculine sample's makeup_direction is grooming: no cosmetics in any direction
    for (const { look } of buildDirections(M)) expect([look.lip, look.blush, look.eyeshadow, look.eyeliner, look.brows].filter(Boolean)).toHaveLength(0);
    const noPerm = clone(F); noPerm.user_context.constraints.accepts_perm = false;
    for (const d of buildDirections(noPerm)) if (d.look.hair) expect(noPerm.analysis.hair_options.find((o) => o.tier === d.look.hair)!.requires).not.toContain("perm");
  });

  it("explains itself without scoring words and discloses that hair needs generation", () => {
    for (const d of buildDirections(F)) {
      for (const t of [d.title, d.tagline, d.look.name, ...d.why]) expect(hasForbidden(t), t).toBe(false);
      expect(d.why.length).toBeGreaterThan(0);
      expect(d.needsHairGeneration).toBe(Boolean(d.look.hair));
    }
  });

  it("recognises an already saved direction so saving twice does not fill the list", () => {
    const d = buildDirections(F)[0];
    const saved: SavedLook = { ...d.look, id: "look_1", savedAt: "2026-10-24T00:00:00Z" };
    expect(savedDirection([saved], d)?.id).toBe("look_1");
    expect(savedDirection([], d)).toBeNull();
  });
});

describe("A/B differences", () => {
  const [x, y] = buildDirections(F);
  it("names what differs, and says nothing about which is better", () => {
    const d = diffLooks(F, x.look, y.look);
    expect(d.level).toBe("clear");
    expect(d.differing.map((r) => r.key)).toEqual(expect.arrayContaining(["lip", "drape"]));
    expect(d.summary).toContain("差别在");
    expect(hasForbidden(d.summary)).toBe(false);
    // the summary leads with what is most noticeable, and every named layer really differs
    expect(d.summary).toMatch(/差别在发型、发色/);
    for (const r of d.differing.slice(0, 2)) expect(d.summary).toContain(r.label);
  });
  it("detects identical and nearly identical looks", () => {
    const renamed = { ...x.look, name: "另一个名字" };
    expect(diffLooks(F, x.look, renamed)).toMatchObject({ level: "none", differing: [] });
    const one = diffLooks(F, x.look, { ...x.look, lip: "#C98E8E" });
    expect(one.level).toBe("subtle");
    expect(one.differing.map((r) => r.key)).toEqual(["lip"]);
    // same colour *name* is not enough to look the same: intensity is part of identity
    expect(diffLooks(F, x.look, { ...x.look, lipIntensity: 0.9 }).differing.map((r) => r.key)).toEqual(["lip"]);
  });
  it("lists the layers a look does not set as unchanged, not as a difference", () => {
    const d = diffLooks(F, { ...x.look, eyewear: null }, { ...x.look, eyewear: null });
    expect(d.rows.find((r) => r.key === "eyewear")).toMatchObject({ differs: false, a: "不加 / 保持现在" });
  });
  it("describes both parts with the same words as the Studio", () => {
    expect(lookParts(F, x.look).lip).toBe(F.analysis.color_profile.lip_families.find((l) => l.hex.toUpperCase() === x.look.lip!.toUpperCase())!.name);
  });
});

describe("what was actually drawn", () => {
  const look = buildDirections(F).find((d) => d.look.hair && d.look.eyewear && d.look.hairHex)!.look;
  const ok: RenderContext = { expired: false, canvas: "ready", geometry: {}, hairPreview: "none", hairShapeLoaded: false, maskState: "ready",
    makeup: { lip: null, blush: null, brows: null, eyeshadow: null, eyeliner: null }, eyewearReason: null };
  const state = (ctx: RenderContext, key: string) => layerNotes(F, look, ctx).find((n) => n.key === key)!;

  it("labels local colour layers as local simulation and an ungenerated hair shape as not drawn", () => {
    expect(state(ok, "lip").state).toBe("local");
    expect(state(ok, "eyewear").state).toBe("local");
    const hair = state(ok, "hair");
    expect(hair.state).toBe("unavailable");
    expect(hair.detail).toContain("还没有生成");
    expect(renderLabel(layerNotes(F, look, ok))).toBe("本地模拟 · 1 项未画出");
  });
  it("labels a generated hair shape as AI generated only once the picture loaded", () => {
    const generated = { ...ok, hairPreview: "succeeded" as const, hairShapeLoaded: true };
    expect(state(generated, "hair").state).toBe("generated");
    expect(renderLabel(layerNotes(F, look, generated))).toBe("AI 生成发型 + 本地模拟");
    expect(state({ ...generated, hairShapeLoaded: false }, "hair").state).toBe("unavailable");
    expect(state({ ...ok, hairPreview: "failed" }, "hair").detail).toContain("没有生成成功");
    expect(state({ ...ok, hairPreview: "pending" }, "hair").detail).toContain("生成中");
  });
  it("discloses an expired photo, missing measurements and unreadable layers instead of pretending", () => {
    for (const n of layerNotes(F, look, { ...ok, expired: true })) {
      expect(n.state).toBe("unavailable");
      expect(n.detail).toContain("24 小时");
    }
    expect(state({ ...ok, geometry: null }, "lip").detail).toContain("没有可用的面部测量");
    expect(state({ ...ok, makeup: NO_MAKEUP }, "lip").detail).toBe(NO_MAKEUP.lip);
    expect(state({ ...ok, maskState: "error" }, "hairColor").detail).toContain("无法分割头发");
    expect(state({ ...ok, eyewearReason: "无法定位" }, "eyewear").detail).toBe("无法定位");
    expect(state({ ...ok, canvas: "plain" }, "lip").detail).toContain("读不到");
    expect(state({ ...ok, canvas: "loading" }, "lip").detail).toContain("载入");
  });
});
