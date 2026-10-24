/** Complete-look starting directions (Issue #4): relaxed / polished / expressive, each a coherent combination built only
 *  from what this passport already recommends and what the Look Studio can actually render.
 *
 *  - hair shape  → one of the passport's own hair_options (needs a generated preview; otherwise it is disclosed as not drawn)
 *  - hair colour → the passport's hair_color_directions, never one that needs dye if the person declined dye
 *  - makeup      → a Studio makeup preset, re-coloured with the passport's lip families and blush recommendation;
 *                  none at all when the passport's makeup_direction is grooming mode
 *  - near-face   → the favoured / neutral colours of the personal palette, never a "caution" colour
 *  - glasses     → the passport's frame shapes mapped onto the three supported shapes, only when the person accepts a glasses change
 *
 *  Deterministic and local: no model call, no photo data. The person's own goal (desired_impression) decides which
 *  direction is listed first. */
import { colorGroups, hairOptions, type Tier } from "@/lib/adapters";
import type { Passport } from "@/lib/api";
import { defaultPreferences } from "@/lib/plan/engine";
import { DEFAULT_EYEWEAR, FRAME_COLORS, FRAME_SHAPES, type EyewearOptions } from "@/lib/tint/eyewear";
import { presetSelection, type MakeupPresetId } from "@/lib/tint/makeup-presets";
import type { LipFinish } from "@/lib/tint/lip";
import { EMPTY_LOOK } from "@/components/studio/compose";
import type { SavedLook } from "@/lib/state/choices";
import { lookParts, summarizeLook } from "./names";

export type DirectionKey = "relaxed" | "polished" | "bold";
export type NewLook = Omit<SavedLook, "id" | "savedAt">;

export interface Direction {
  key: DirectionKey;
  title: string;
  tagline: string;
  /** Short reasons, each grounded in the passport or the person's own answers. */
  why: string[];
  look: NewLook;
  /** The look names a hair shape that needs an AI-generated preview to be drawn. */
  needsHairGeneration: boolean;
  /** This direction matches the goal the person gave. */
  matchesGoal: boolean;
}

const IMPRESSION_ZH: Record<string, string> = {
  clean: "干净", sharp: "利落", mature: "成熟", relaxed: "放松", approachable: "亲和", refined: "精致", energetic: "有活力",
  authoritative: "有分量", gentle: "柔和", distinctive: "有辨识度", youthful: "年轻", professional: "专业",
};
const META: Record<DirectionKey, { title: string; tagline: string; preset: MakeupPresetId; tiers: Tier[] }> = {
  relaxed: { title: "轻松日常", tagline: "改动小、好打理，贴近现在的自己", preset: "natural", tiers: ["easy", "safe", "bold"] },
  polished: { title: "精致利落", tagline: "线条更整齐，适合通勤和正式一点的场合", preset: "polished", tiers: ["safe", "easy", "bold"] },
  bold: { title: "个性表达", tagline: "对比更明显，想让人记住的方向", preset: "occasion", tiers: ["bold", "safe", "easy"] },
};
const ORDER: DirectionKey[] = ["relaxed", "polished", "bold"];

/** Same mapping as the action plan, so the goal the person sees there is the goal used here. */
export const goalOf = (p: Passport): DirectionKey => defaultPreferences(p).goal as DirectionKey;

/** The passport's frame shapes onto the Studio's three. Shapes the Studio cannot draw (aviator, rimless, ...) are skipped, not approximated. */
const SHAPE_MAP: Record<string, EyewearOptions["shape"]> = {
  round: "round", oval: "round", cat_eye: "cat-eye", rectangular: "rectangle", square: "rectangle", browline: "rectangle", geometric: "rectangle",
};
const WIDTH_MAP = { matched: "regular", wider: "wide", narrower: "narrow" } as const;

const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
const dist = (a: string, b: string) => Math.hypot(...rgb(a).map((v, i) => v - rgb(b)[i]));
const validHex = (h: string | undefined): h is string => Boolean(h && /^#[0-9a-fA-F]{6}$/.test(h));

export function supportedFrameShapes(p: Passport): EyewearOptions["shape"][] {
  const out: EyewearOptions["shape"][] = [];
  for (const s of p.analysis.glasses_direction?.frame_shapes ?? []) {
    const m = SHAPE_MAP[s];
    if (m && !out.includes(m)) out.push(m);
  }
  return out;
}

function frameFor(p: Passport, shape: EyewearOptions["shape"]): EyewearOptions {
  const gd = p.analysis.glasses_direction;
  const target = gd?.colors.map((c) => c.hex).find(validHex);
  const color = target ? FRAME_COLORS.reduce((best, c) => (dist(c.hex, target) < dist(best.hex, target) ? c : best)).id : DEFAULT_EYEWEAR.color;
  return { ...DEFAULT_EYEWEAR, shape, color, width: WIDTH_MAP[gd?.frame_width ?? "matched"] ?? "regular" };
}

export function buildDirections(p: Passport): Direction[] {
  const uc = p.user_context;
  const cp = p.analysis.color_profile;
  const goal = goalOf(p);
  const hairViews = hairOptions(p);
  const groups = colorGroups(p);
  const favor = groups[0].colors, neutral = groups[1].colors;
  const hairColors = cp.hair_color_directions
    .map((d, index) => ({ d, index }))
    .filter(({ d }) => validHex(d.hex) && (!d.requires_dye || uc.constraints.accepts_dye));
  const grooming = p.analysis.makeup_direction.mode === "grooming";
  const frames = uc.constraints.accepts_glasses_change === false ? [] : supportedFrameShapes(p);
  const hairAllowed = (tier: Tier) => {
    const h = p.analysis.hair_options.find((o) => o.tier === tier);
    const v = hairViews.find((o) => o.tier === tier);
    if (!h || !v || v.status === "excluded") return false;
    if (!uc.constraints.accepts_perm && h.requires.includes("perm")) return false;
    if (!uc.constraints.accepts_dye && (h.requires.includes("dye") || h.params.color !== "keep")) return false;
    if (uc.hair?.grow_out_ok === false && h.requires.includes("grow_out")) return false;
    return true;
  };

  const usedTiers = new Set<Tier>();
  const usedDrapes = new Set<string>();
  const build = (key: DirectionKey): Direction => {
    const meta = META[key];
    const why: string[] = [];
    const preset = presetSelection(meta.preset);
    const tier = meta.tiers.find((t) => !usedTiers.has(t) && hairAllowed(t)) ?? null;
    if (tier) usedTiers.add(tier);

    // hair colour: relaxed keeps the current colour; polished takes the passport's first suitable direction, bold its most different one
    const first = hairColors[0];
    const far = hairColors.length > 1 ? hairColors.reduce((best, c) => (dist(c.d.hex, first.d.hex) > dist(best.d.hex, first.d.hex) ? c : best)) : null;
    const hairPick = key === "relaxed" ? null : key === "polished" ? first ?? null : far;

    // drape: neutral for relaxed, then favoured colours; never the same near-face colour twice
    const drapePool = key === "relaxed" ? [...neutral, ...favor] : key === "polished" ? [...favor, ...neutral] : [...favor.slice(1), ...favor, ...neutral];
    const drape = drapePool.find((c) => validHex(c.hex) && !usedDrapes.has(c.hex.toUpperCase())) ?? drapePool.find((c) => validHex(c.hex)) ?? null;
    if (drape) usedDrapes.add(drape.hex.toUpperCase());

    // makeup keeps the preset's structure but takes colours from this passport
    const lips = cp.lip_families.filter((l) => validHex(l.hex));
    const lipPick = key === "relaxed" ? lips.find((l) => l.finish === "sheer") ?? lips[lips.length - 1] : key === "polished" ? lips[0] : lips[1] ?? lips[0];
    const blush = p.analysis.makeup_direction.blush;
    const makeup = grooming ? presetSelection("none") : {
      ...preset,
      lip: lipPick?.hex ?? preset.lip,
      lipFinish: (["matte", "satin", "gloss"].includes(lipPick?.finish ?? "") ? lipPick?.finish : preset.lipFinish) as LipFinish,
      blushHex: validHex(blush.hex) ? blush.hex : preset.blushHex,
      blushPlacement: key === "bold" ? preset.blushPlacement : blush.placement,
    };

    const shape = key === "relaxed" ? undefined : frames[key === "polished" ? 0 : Math.min(1, frames.length - 1)];
    const eyewear = shape ? frameFor(p, shape) : null;

    const look: NewLook = {
      ...EMPTY_LOOK, ...makeup, name: "",
      hair: tier, hairColor: hairPick?.index ?? null, hairHex: hairPick?.d.hex ?? null, hairStrength: 0.8,
      drape: drape?.hex ?? null, eyewear,
    };
    const named = { ...look, name: `${meta.title} · ${summarizeLook(p, look)}` };
    const parts = lookParts(p, named);

    const impressions = uc.desired_impression.map((i) => IMPRESSION_ZH[i]).filter(Boolean);
    if (key === goal && impressions.length) why.push(`你想要的印象是「${impressions.join("、")}」，这个方向最贴近。`);
    if (parts.drape) why.push(`近脸色「${parts.drape}」来自你的个人色卡。`);
    if (parts.lip) why.push(`唇色「${parts.lip}」取自你的唇色方向。`);
    if (grooming) why.push("你的建议是整理而不是彩妆，所以这个方向不叠加妆容。");
    if (parts.hairColor && hairPick) why.push(`发色「${parts.hairColor}」是报告里给出的方向${hairPick.d.requires_dye ? "（需要染发）" : ""}。`);
    if (!hairPick && key !== "relaxed") why.push("没有可用的发色方向（不接受染发或没有合适的方向），保持现在的发色。");
    if (parts.eyewear) why.push(`镜框取自报告推荐的${parts.eyewear}。`);
    if (!parts.eyewear && key !== "relaxed" && uc.constraints.accepts_glasses_change === false) why.push("你不打算换眼镜，所以没有加镜框。");
    return { key, title: meta.title, tagline: meta.tagline, why, look: named, needsHairGeneration: Boolean(tier), matchesGoal: key === goal };
  };

  // build in a fixed order so shared choices (hair tier, near-face colour) are assigned the same way every time,
  // then list the person's goal first
  const built = ORDER.map(build);
  return [...built].sort((a, b) => Number(b.matchesGoal) - Number(a.matchesGoal));
}

/** A saved look that is this direction already (same name), so choosing it twice does not fill the 12 slots. */
export const savedDirection = (looks: readonly SavedLook[], d: Direction) => looks.find((l) => l.name === d.look.name) ?? null;
