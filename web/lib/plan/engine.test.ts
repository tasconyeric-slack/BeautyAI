import { describe, expect, it } from "vitest";
import sample from "@/lib/fixtures/sample_passport.json";
import type { Passport } from "@/lib/api";
import { buildPlan, buildPlanView, defaultPreferences } from "./engine";

const fixture = () => structuredClone(sample) as unknown as Passport;

describe("personal intervention decisions", () => {
  it("selects new actions for different declared goals on the same observations", () => {
    const p = fixture();
    const original = JSON.stringify(p);
    const relaxed = buildPlan(p, { ...defaultPreferences(p), goal: "relaxed" });
    const bold = buildPlan(p, { ...defaultPreferences(p), goal: "bold" });
    expect(relaxed.some(c => c.id === "lip-soft")).toBe(true);
    expect(relaxed.some(c => c.id === "lip-statement")).toBe(false);
    expect(bold.some(c => c.id === "lip-statement")).toBe(true);
    expect(bold.some(c => c.id === "lip-soft")).toBe(false);
    expect(relaxed.find(c => c.id === "hair-easy")?.studioQuery).toBe("hair=easy");
    expect(bold.find(c => c.id === "hair-bold")?.studioQuery).toBe("hair=bold");
    for (const card of [...relaxed, ...bold]) {
      expect(card.evidence.length).toBeGreaterThan(0);
      expect(card.evidence.every(o => p.analysis.observations.some(x => x.id === o.id))).toBe(true);
      expect(card.alternative.action).not.toBe(card.action);
      expect(card.goalReason).toBeTruthy();
      expect(card.mechanism).toBeTruthy();
      expect(card.successCheck).toBeTruthy();
    }
    expect(JSON.stringify(p)).toBe(original);
  });

  it("honors hard limits, excluded hair and hidden recommendations", () => {
    const p = fixture();
    p.user_context.constraints.accepts_perm = false;
    p.user_context.constraints.accepts_dye = false;
    const bold = p.analysis.hair_options.find(h => h.tier === "bold")!;
    bold.requires = ["dye"];
    p.derived.hair_option_checks.find(h => h.tier === "safe")!.status = "excluded";
    p.derived.excluded_recommendations.push({ rec_id: "r2", reason: "user_hidden" });
    const cards = buildPlan(p, { goal: "bold", budget: "low", minutes: 5 });
    expect(cards.some(c => c.id.startsWith("hair-"))).toBe(false);
    expect(cards.some(c => c.id.startsWith("lip-"))).toBe(false);
    expect(cards.every(c => c.minutes <= 5 && ["free", "low"].includes(c.cost))).toBe(true);
    expect(cards.some(c => c.id === "near-face-accent")).toBe(true);
  });

  it("can offer a free new alternative when an expensive report action was excluded", () => {
    const p = fixture();
    p.derived.excluded_recommendations.push({ rec_id: "r3", reason: "violates_constraint" });
    p.analysis.recommendations.find(r => r.id === "r3")!.constraint_check.status = "violates";
    expect(buildPlan(p, { goal: "relaxed", budget: "low", minutes: 1 }).map(c => c.id)).toContain("near-face-soft");
  });

  it("respects uniforms and defers new actions with unchecked free-text restrictions", () => {
    const p = fixture(); p.user_context.constraints.dress_code = "uniform";
    expect(buildPlan(p, { ...defaultPreferences(p), goal: "bold" }).some(c => c.id.startsWith("near-face-"))).toBe(false);
    p.user_context.constraints.other = "不能添加围巾或改变领口";
    const view = buildPlanView(p, defaultPreferences(p));
    expect(view.cards.length).toBeGreaterThan(0);
    expect(view.needsCheck).toBe(true);
    expect(view.cards.filter(c => !c.id.startsWith("photo-")).every(c => c.needsCheck)).toBe(true);
    expect(view.cards.filter(c => c.id.startsWith("photo-")).every(c => !c.needsCheck)).toBe(true);
    const ok = buildPlanView(p, { ...defaultPreferences(p), confirmedOther: "不能添加围巾或改变领口" });
    expect(ok.needsCheck).toBe(false);
    expect(ok.cards.some(c => c.needsCheck)).toBe(false);
  });

  it("gives a supported alternative for a declined action, or says none exists", () => {
    const p = fixture(); const prefs = { ...defaultPreferences(p), goal: "relaxed" as const };
    const before = buildPlan(p, prefs).map(c => c.id);
    const view = buildPlanView(p, { ...prefs, declined: ["lip-soft"] });
    expect(view.cards.map(c => c.id)).not.toContain("lip-soft");
    const r = view.replacements[0];
    expect(r.declined.id).toBe("lip-soft");
    expect(r.replacement).not.toBeNull();
    expect(before).not.toContain(r.replacement!.id);
    expect(r.replacement!.id.startsWith("lip-")).toBe(false);
    expect(r.replacement!.evidence.length).toBeGreaterThan(0);
    // With zero budget and time only free, out-of-goal alternatives must still respect limits.
    const tight = buildPlanView(p, { ...prefs, budget: "low", minutes: 0, declined: ["near-face-soft", "photo-light"] });
    for (const x of tight.replacements) {
      if (x.replacement) expect(x.replacement.minutes).toBeLessThanOrEqual(0);
      else expect(x.note).toContain("没有其他有依据的替代项");
    }
  });

  it("different goals and constraints rank different feasible advice on one face", () => {
    const p = fixture();
    const ids = (prefs: Parameters<typeof buildPlan>[1]) => buildPlan(p, prefs).map(c => c.id).join();
    const base = defaultPreferences(p);
    expect(ids({ ...base, goal: "relaxed" })).not.toBe(ids({ ...base, goal: "bold" }));
    expect(ids({ ...base, goal: "bold", budget: "low", minutes: 1 })).not.toBe(ids({ ...base, goal: "bold" }));
  });

  it("does not invent evidence or require changes when observations are missing", () => {
    const p = fixture(); p.analysis.observations = [];
    expect(buildPlan(p, defaultPreferences(p))).toEqual([]);
  });

  it("keeps grooming-only passports free of cosmetic lip and brow candidates", () => {
    const p = fixture(); p.analysis.makeup_direction.mode = "grooming";
    expect(buildPlan(p, { ...defaultPreferences(p), goal: "bold" }).some(c => c.id.startsWith("lip-") || c.id.startsWith("brow-"))).toBe(false);
  });
});
