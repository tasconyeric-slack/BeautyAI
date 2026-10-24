/** Issue #23: grounded outfit boards, capsule, checklist text and local persistence. */
import { beforeEach, describe, expect, it } from "vitest";
import female from "@/lib/fixtures/sample_passport.json";
import male from "@/lib/fixtures/sample_passport_male.json";
import { freeView } from "@/lib/fixture/free-view";
import type { Passport } from "@/lib/api";
import { hasForbidden } from "@/components/share/caption";
import {
  boardChecklist, buildBoards, buildCapsule, catalogGarment, formulaContext, missingFor, parseOutfit, pickContexts, planCapsule, readOutfit,
  shoppingChecklist, writeOutfit, EMPTY_OUTFIT, FIRST_BUY, type Board,
} from "./index";

const F = female as unknown as Passport;
const M = male as unknown as Passport;
const clone = (p: Passport) => JSON.parse(JSON.stringify(p)) as Passport;
const hexes = (p: Passport) => new Set([
  ...p.analysis.outfit_direction.items.map((i) => i.hex.toLowerCase()),
  ...[...p.analysis.color_profile.favor_families, ...p.analysis.color_profile.neutral_families, ...p.analysis.color_profile.caution_families].flatMap((f) => f.hex_examples.map((h) => h.toLowerCase())),
]);

describe("contexts", () => {
  it("puts the person's own occasions first, then the dress code, and offers at most three", () => {
    expect(pickContexts(F)).toEqual(["commute", "date", "formal"]);
    expect(pickContexts(M)).toEqual(["commute", "formal", "casual"]);
  });
  it("reads a context out of a formula title", () => {
    expect(formulaContext("柔和通勤")).toBe("commute");
    expect(formulaContext("温柔约会")).toBe("date");
    expect(formulaContext("周末松弛")).toBe("casual");
    expect(formulaContext("某个新名字")).toBeNull();
  });
});

describe.each([["female", F], ["male", M]] as const)("boards (%s fixture)", (_n, p) => {
  const { boards, status } = buildBoards(p);
  it("builds 2–3 boards", () => {
    expect(status).toBe("ok");
    expect(boards.length).toBeGreaterThanOrEqual(2);
    expect(boards.length).toBeLessThanOrEqual(3);
  });
  it("is internally consistent: one piece per slot, a dress never beside a top or bottom, every board is wearable", () => {
    for (const b of boards) {
      const slots = b.pieces.map((x) => x.slot);
      expect(new Set(slots).size).toBe(slots.length);
      if (slots.includes("dress")) expect(slots).not.toContain("top");
      else expect(slots).toEqual(expect.arrayContaining(["top", "bottom"]));
      expect(slots).toContain("shoes");
    }
  });
  it("only uses garment ids from the catalog and colours from the passport", () => {
    const known = hexes(p);
    for (const b of boards) for (const x of b.pieces) {
      if (x.garmentId) expect(catalogGarment(x.garmentId)).toBeTruthy();
      if (x.hex) expect(known.has(x.hex.toLowerCase())).toBe(true);
      if (x.garmentId) expect(x.search.length).toBeGreaterThan(0);
    }
    for (const b of boards) for (const c of b.palette) expect(known.has(c.hex.toLowerCase())).toBe(true);
  });
  it("marks everything the report did not write as optional/fill/generic, never as a report piece", () => {
    for (const b of boards) for (const x of b.pieces) {
      if (x.origin === "fill") expect(x.optional).toBe(true);
      if (x.origin === "generic") expect(x.garmentId).toBeNull();
    }
  });
  it("keeps the report's own wording and why-note", () => {
    for (const b of boards) {
      expect(b.why.text.length).toBeGreaterThan(0);
      const look = p.analysis.outfit_direction.occasions.find((o) => o.occasion === b.key)?.look ?? null;
      expect(b.lookText).toBe(look);
    }
  });
  it("copy has no scoring / medical / promise words", () => {
    for (const b of boards) {
      for (const s of [b.title, b.why.text, ...b.caveats, ...b.notes, boardChecklist(b, {})]) expect(hasForbidden(s), s).toBe(false);
    }
  });
});

describe("female fixture content", () => {
  const { boards } = buildBoards(F);
  const by = (k: string) => boards.find((b) => b.key === k)!;
  it("maps the report's lines onto catalog pieces", () => {
    expect(by("commute").pieces.map((x) => x.garmentId)).toEqual(expect.arrayContaining(["tie_neck_silk_blouse", "mid_rise_straight_trousers", "mary_jane_flats"]));
    expect(by("date").pieces[0]!.garmentId).toBe("belted_shirt_dress");
    expect(by("date").pieces.some((x) => x.slot === "top")).toBe(false);
    const formal = by("formal");
    expect(formal.pieces.find((x) => x.slot === "outer")!.garmentId).toBe("soft_shoulder_blazer");
    // the report says the blouse is pearl white here although the advised item is dusty blue: the board follows the report
    expect(formal.pieces.find((x) => x.slot === "top")!.colorName).toBe("珍珠白");
  });
  it("shows a generic optional slot when no catalog garment fits the occasion", () => {
    const shoes = by("formal").pieces.find((x) => x.slot === "shoes")!;
    expect(shoes.origin).toBe("generic");
    expect(shoes.optional).toBe(true);
  });
  it("keeps the non-garment parts of the report line as notes", () => {
    expect(by("date").notes.join()).toContain("唇色玫瑰豆沙");
  });
});

describe("capsule", () => {
  const { boards } = buildBoards(F);
  const capsule = buildCapsule(boards);
  it("is small, catalog-only and reuses pieces across boards", () => {
    expect(capsule.pieces.length).toBeLessThanOrEqual(8);
    expect(capsule.pieces.every((c) => c.piece.garmentId && catalogGarment(c.piece.garmentId))).toBe(true);
    expect(capsule.pieces.some((c) => c.usedIn.length > 1)).toBe(true);
    const distinctAcross = new Set(boards.flatMap((b) => b.pieces.filter((x) => x.garmentId).map((x) => x.key))).size;
    const slotsAcross = boards.reduce((n, b) => n + b.pieces.filter((x) => x.garmentId).length, 0);
    expect(distinctAcross).toBeLessThan(slotsAcross);
  });
  it("every board stays wearable from the capsule's pieces", () => {
    for (const b of boards) for (const x of b.pieces.filter((y) => y.garmentId && !y.optional)) {
      expect(capsule.pieces.some((c) => c.piece.key === x.key)).toBe(true);
    }
  });
  it("owned pieces leave the buy list; the budget only changes how many are first buys", () => {
    const none = planCapsule(capsule, boards, {}, "low");
    expect(none.buyNow.length).toBeLessThanOrEqual(FIRST_BUY.low);
    expect(none.buyNow.length + none.later.length).toBe(capsule.pieces.length);
    expect(none.wearableNow).toEqual([]);
    const high = planCapsule(capsule, boards, {}, "high");
    expect(high.buyNow.length).toBeGreaterThanOrEqual(none.buyNow.length);
    const own = Object.fromEntries(capsule.pieces.map((c) => [c.piece.key, true]));
    const all = planCapsule(capsule, boards, own, "medium");
    expect(all.buyNow.length + all.later.length).toBe(0);
    expect(all.wearableNow.sort()).toEqual(boards.map((b) => b.key).sort());
    expect(shoppingChecklist(all, "medium")).toContain("不需要新买");
  });
  it("counts what a board still lacks", () => {
    const b = boards[0]!;
    const first = missingFor(b, {});
    expect(first.length).toBeGreaterThan(0);
    expect(missingFor(b, Object.fromEntries(first.map((x) => [x.key, true]))).length).toBe(0);
  });
});

describe("checklists", () => {
  const { boards } = buildBoards(F);
  const b = boards[0]!;
  it("lists each piece with its state and a search term only for what is still to find", () => {
    const first = b.pieces.find((x) => x.garmentId && !x.optional)!;
    const text = boardChecklist(b, { [first.key]: true });
    expect(text).toContain(`[已有] `);
    expect(text).toContain("近脸颜色");
    const searches = text.split("要去找的")[1] ?? "";
    expect(searches).not.toContain(first.search);
  });
  it("carries no link, id or measurement", () => {
    const text = boardChecklist(b, {}) + shoppingChecklist(planCapsule(buildCapsule(boards), boards, {}, "medium"), "medium");
    expect(text).not.toMatch(/https?:|\/p\/|ref=/);
  });
});

describe("entitlement and unsupported states", () => {
  it("free view (no occasions, two formulas) still gives comparable boards from the formulas alone", () => {
    const [free, locked] = freeView(F);
    expect(locked).toContain("outfit.occasions");
    const r = buildBoards(free);
    expect(r.status).toBe("ok");
    expect(r.boards.every((b) => b.lookText === null)).toBe(true);
  });
  it("reports a single board honestly and an empty result without throwing", () => {
    const one = clone(F);
    one.analysis.outfit_direction.occasions = [one.analysis.outfit_direction.occasions[0]!] as never;
    one.analysis.outfit_direction.formulas = [one.analysis.outfit_direction.formulas[0]!, one.analysis.outfit_direction.formulas[0]!, one.analysis.outfit_direction.formulas[0]!] as never;
    expect(buildBoards(one).status).toBe("single");
    const none = clone(F);
    none.analysis.outfit_direction.occasions = [] as never;
    none.analysis.outfit_direction.formulas = [{ title: "某个新名字", pieces: ["x", "y"], why: "z" }] as never;
    const r = buildBoards(none);
    expect(r.status).toBe("empty");
    expect(r.reason).toBeTruthy();
  });
  it("garments the person marked 不喜欢 are flagged and never used as fills", () => {
    const base = buildBoards(F);
    const fills = base.boards.flatMap((b) => b.pieces.filter((x) => x.origin === "fill"));
    expect(fills.length).toBeGreaterThan(0);
    const dis = new Set(fills.map((x) => x.garmentId!));
    const r = buildBoards(F, { disliked: dis });
    expect(r.boards.flatMap((b) => b.pieces.filter((x) => x.origin === "fill" && dis.has(x.garmentId!)))).toEqual([]);
    const reportPiece = base.boards[0]!.pieces.find((x) => x.origin === "report" && x.garmentId)!;
    const flagged = buildBoards(F, { disliked: new Set([reportPiece.garmentId!]) }).boards[0]!.pieces.find((x) => x.key === reportPiece.key)!;
    expect(flagged.disliked).toBe(true);
  });
  it("shows the person's free-text limit as a note only", () => {
    const r = buildBoards(M);
    expect(r.constraintNotes.join()).toContain("工作日需要有正装感");
    expect(r.constraintNotes.join()).toContain("不会据此改搭配");
  });
});

describe("persistence", () => {
  beforeEach(() => localStorage.clear());
  it("round-trips and survives a refresh", () => {
    const s = { chosen: "date" as const, compare: ["commute", "date"] as ["commute", "date"], owned: { "a:1": true as const }, budget: "low" as const, dressed: { "b:2": true as const } };
    expect(writeOutfit("p1", s)).toBe(true);
    expect(readOutfit("p1")).toEqual(s);
    expect(readOutfit("other")).toEqual(EMPTY_OUTFIT);
  });
  it("ignores corrupt or foreign data", () => {
    localStorage.setItem("ap_outfit:p1", "{nope");
    expect(readOutfit("p1")).toEqual(EMPTY_OUTFIT);
    expect(parseOutfit({ v: 2, chosen: "date" })).toEqual(EMPTY_OUTFIT);
    expect(parseOutfit({ v: 1, chosen: "<script>", compare: ["date", "date"], owned: { x: "yes", y: true }, budget: "free", dressed: [] }))
      .toEqual({ ...EMPTY_OUTFIT, owned: { y: true } });
  });
});

it("board objects are plain data (safe to snapshot and compare)", () => {
  const b: Board = buildBoards(F).boards[0]!;
  expect(JSON.parse(JSON.stringify(b))).toEqual(b);
});
