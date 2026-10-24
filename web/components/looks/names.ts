/** Plain-language names for the parts of a look, shared by the direction picker, the comparison and the decision card.
 *  Mirrors how the Look Studio names a combination, so a look reads the same wherever it appears. */
import { colorGroups, hairOptions, TIER_ZH, type Tier } from "@/lib/adapters";
import type { Passport } from "@/lib/api";
import { FRAME_COLORS, FRAME_SHAPES } from "@/lib/tint/eyewear";
import { EYESHADOW_SHADES } from "@/lib/tint/eye-palette";
import { HAIR_SHADES } from "@/lib/tint/hair-palette";
import { BLUSH_SHADES, BROW_SHAPES, LIP_SHADES } from "@/lib/tint/makeup-palette";
import { describeLook } from "@/components/studio/compose";
import type { SavedLook } from "@/lib/state/choices";

export type LookLike = Omit<SavedLook, "id" | "name" | "savedAt">;

const sameHex = (a: string | null | undefined, b: string | null | undefined) => Boolean(a && b && a.toUpperCase() === b.toUpperCase());

export interface LookParts {
  hair: string | null;
  hairColor: string | null;
  lip: string | null;
  blush: string | null;
  eyeshadow: string | null;
  eyeliner: string | null;
  brows: string | null;
  eyewear: string | null;
  drape: string | null;
}

export function lookParts(p: Passport, look: LookLike): LookParts {
  const cp = p.analysis.color_profile;
  const hairOpt = look.hair ? hairOptions(p).find((o) => o.tier === look.hair) : null;
  const dir = look.hairColor !== null ? cp.hair_color_directions[look.hairColor] : null;
  const hex = look.hairHex ?? dir?.hex ?? null;
  const groups = colorGroups(p);
  const nearFace = [...groups[0].colors, ...groups[1].colors.slice(0, 4), ...groups[2].colors.slice(0, 2)];
  const blushName = look.blushHex ? BLUSH_SHADES.find((s) => sameHex(s.hex, look.blushHex))?.name ?? "自选" : "推荐";
  const hide = Boolean(look.eyesObscured);
  return {
    hair: hairOpt ? `${hairOpt.tierZh} · ${hairOpt.name}` : look.hair ? TIER_ZH[look.hair as Tier] ?? null : null,
    hairColor: hex ? HAIR_SHADES.find((h) => sameHex(h.hex, hex))?.name ?? cp.hair_color_directions.find((h) => sameHex(h.hex, hex))?.name ?? "自选发色" : null,
    lip: look.lip ? cp.lip_families.find((l) => sameHex(l.hex, look.lip))?.name ?? LIP_SHADES.find((l) => sameHex(l.hex, look.lip))?.name ?? "自选" : null,
    blush: look.blush ? `${blushName}腮红` : null,
    eyeshadow: !hide && look.eyeshadow ? EYESHADOW_SHADES.find((s) => sameHex(s.hex, look.eyeshadow?.hex))?.name ?? "自选" : null,
    eyeliner: !hide && look.eyeliner ? (look.eyeliner.style === "wing" ? "微翘眼线" : "自然眼线") : null,
    brows: look.brows ? BROW_SHAPES.find((b) => b.id === look.brows?.shape)?.name ?? null : null,
    eyewear: !hide && look.eyewear ? FRAME_SHAPES.find((s) => s.id === look.eyewear?.shape)?.name ?? null : null,
    drape: look.drape ? nearFace.find((c) => sameHex(c.hex, look.drape))?.name_zh ?? "自选" : null,
  };
}

export function summarizeLook(p: Passport, look: LookLike): string {
  const n = lookParts(p, look);
  return describeLook({
    hairName: n.hair, hairColorName: n.hairColor, lipName: n.lip, blush: Boolean(n.blush), eyeshadowName: n.eyeshadow,
    eyelinerName: n.eyeliner, browName: n.brows, eyewearName: n.eyewear, drapeName: n.drape,
  });
}

/** A swatch strip for a look: the colours it actually sets, in the order they sit on the face. */
export function lookSwatches(p: Passport, look: LookLike): { label: string; hex: string }[] {
  const n = lookParts(p, look);
  const cp = p.analysis.color_profile;
  const hairHex = look.hairHex ?? (look.hairColor !== null ? cp.hair_color_directions[look.hairColor]?.hex : null) ?? null;
  const out: { label: string; hex: string }[] = [];
  if (hairHex) out.push({ label: n.hairColor ?? "发色", hex: hairHex });
  if (look.eyeshadow && !look.eyesObscured) out.push({ label: `${n.eyeshadow}眼影`, hex: look.eyeshadow.hex });
  const blushHex = look.blushHex ?? p.analysis.makeup_direction.blush.hex;
  if (look.blush && blushHex) out.push({ label: n.blush ?? "腮红", hex: blushHex });
  if (look.lip) out.push({ label: `${n.lip}唇色`, hex: look.lip });
  if (look.eyewear && !look.eyesObscured) {
    const c = FRAME_COLORS.find((f) => f.id === look.eyewear?.color);
    if (c) out.push({ label: `${c.name}${n.eyewear ?? "镜框"}`, hex: c.hex });
  }
  if (look.drape) out.push({ label: `${n.drape}近脸色`, hex: look.drape });
  return out;
}
