/** Studio composition (D30), pure functions so they can be tested without a browser.
 *
 *  base     = the original front photo, or the original with the generated hair crop laid back at its crop_box
 *             (outside the edit mask a generated crop equals the original, so geometry still fits)
 *  layers   = local hair color (its own segmentation) → near-face colour → blush → lip → shadow → liner → brows → eyewear
 */
import { eyewear, normalizeEyewear, type EyewearOptions } from "@/lib/tint/eyewear";
import { eyeshadow, type EyeshadowOptions } from "@/lib/tint/eyeshadow";
import { eyeliner, type EyelinerOptions } from "@/lib/tint/eyeliner";
import { browTint, type BrowOptions } from "@/lib/tint/brow";
import { makeupAvailability, type MakeupAvailability, type MakeupSelection } from "@/lib/tint/makeup";
import type { LipFinish } from "@/lib/tint/lip";
import { blush, drape, lipTint, type BlushPlacement, type FaceGeometry } from "@/lib/tint";

export type HairTier = "safe" | "bold" | "easy";

export type { MakeupSelection } from "@/lib/tint/makeup";
export interface LookSelection extends MakeupSelection {
  eyewear?: EyewearOptions | null;
  hair: HairTier | null;        // null = keep the current haircut
  hairHex?: string | null;
  hairStrength?: number;
  hairColor: number | null;     // index into hair_color_directions, null = keep the current colour
  lip: string | null;
  blush: boolean;
  drape: string | null;
}

export const MAKEUP_DEFAULTS = { eyeshadow: null, eyeliner: null, eyesObscured: false, blushHex: null, blushPlacement: "apple" as BlushPlacement, blushIntensity: .45,
  blushOpacity: 1, blushFeather: .5, lipIntensity: .6, lipFinish: "satin" as LipFinish, brows: null };
export const EMPTY_LOOK: LookSelection = { eyewear: null, hair: null, hairColor: null, hairHex: null, hairStrength: .8, lip: null, blush: false, drape: null, ...MAKEUP_DEFAULTS };

/** Legacy boolean blushes retain the passport recommendation, including its placement. */
export function restoreLook(saved: Partial<LookSelection>): LookSelection {
  return { ...EMPTY_LOOK, ...saved, eyewear: normalizeEyewear(saved.eyewear), ...Object.fromEntries(Object.entries(MAKEUP_DEFAULTS).map(([k,v]) =>
    [k, saved[k as keyof LookSelection] ?? v])) };
}
export function layersForLook(look: LookSelection, recommended?: {hex: string; placement: BlushPlacement}): LocalLayers {
  return {
    eyewear: look.eyesObscured ? null : normalizeEyewear(look.eyewear),
    eyeshadow: look.eyesObscured ? null : look.eyeshadow ?? null,
    eyeliner: look.eyesObscured ? null : look.eyeliner ?? null,
    drape: look.drape,
    blush: look.blush ? { hex: look.blushHex ?? recommended?.hex ?? "#D56870",
      placement: !look.blushHex && recommended ? recommended.placement : look.blushPlacement ?? "apple",
      intensity: look.blushIntensity ?? .45, opacity: look.blushOpacity ?? 1, feather: look.blushFeather ?? .5 } : null,
    lip: look.lip ? {hex:look.lip,intensity:look.lipIntensity ?? .6,finish:look.lipFinish ?? "satin"} : null,
    brows: look.brows ?? null,
  };
}

/** Only haircut shape is generative. The optional legacy colour index never enters a target. */
export function hairTargetId(hair: HairTier | null, _hairColor?: number | null, source: "front" | "noglasses" | "glasses" = "front"): string | null {
  return hair && source !== "front" ? `${hair}_src${source}` : hair;
}

export interface LocalLayers {
  eyewear?: EyewearOptions | null;
  eyeshadow?: EyeshadowOptions | null;
  eyeliner?: EyelinerOptions | null;
  drape: string | null;
  blush: { hex: string; placement: BlushPlacement; intensity?: number; opacity?: number; feather?: number } | null;
  lip: string | {hex:string; intensity:number; finish:LipFinish} | null;
  brows?: BrowOptions | null;
}

export const LIP_INTENSITY = 0.6;
export const BLUSH_INTENSITY = 0.45;

/** Apply the local colour layers in a fixed order. Returns `base` itself when there is nothing to apply. */
export function composeLayers(base: ImageData, g: FaceGeometry, l: LocalLayers, available?: MakeupAvailability): ImageData {
  const ready=available ?? makeupAvailability(base,g);
  let out = base;
  if (l.drape) out = drape(out, g, l.drape);
  if (l.blush && !ready.blush) out = blush(out, g, l.blush.hex, l.blush.placement, l.blush.intensity ?? BLUSH_INTENSITY, l.blush);
  if (l.lip && !ready.lip) out = typeof l.lip === "string" ? lipTint(out,g,l.lip,LIP_INTENSITY)
    : lipTint(out,g,l.lip.hex,l.lip.intensity,l.lip.finish);
  if (l.eyeshadow && !ready.eyeshadow) out = eyeshadow(out,g,l.eyeshadow);
  if (l.eyeliner && !ready.eyeliner) out = eyeliner(out,g,l.eyeliner);
  if (l.brows && !ready.brows) out = browTint(out,g,l.brows);
  if (l.eyewear) out = eyewear(out, g, l.eyewear);
  return out;
}

/** Pixel rectangle of a normalised crop box on a W×H canvas. */
export function cropRect(box: readonly number[], w: number, h: number) {
  const [x0, y0, x1, y1] = box;
  return { x: Math.round(x0 * w), y: Math.round(y0 * h), w: Math.round((x1 - x0) * w), h: Math.round((y1 - y0) * h) };
}

/** Short, honest description of what the main image shows. */
export function describeLook(parts: { hairName?: string | null; hairColorName?: string | null; lipName?: string | null;
  eyewearName?: string | null; eyeshadowName?: string | null; eyelinerName?: string | null;
  blush?: boolean; browName?: string | null; drapeName?: string | null }): string {
  const out = [
    parts.hairName ?? null,
    parts.hairColorName ?? null,
    parts.lipName ? `${parts.lipName}唇色` : null,
    parts.blush ? "腮红" : null,
    parts.eyeshadowName ? `${parts.eyeshadowName}眼影` : null,
    parts.eyelinerName ?? null,
    parts.browName ? `${parts.browName}眉形` : null,
    parts.eyewearName ? `${parts.eyewearName}眼镜` : null,
    parts.drapeName ? `${parts.drapeName}近脸色` : null,
  ].filter(Boolean);
  return out.length ? out.join(" + ") : "原图";
}
