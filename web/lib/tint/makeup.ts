import type { BlushPlacement } from "./blush";
import type { LipFinish } from "./lip";
import type { EyeshadowOptions } from "./eyeshadow";
import type { EyelinerOptions } from "./eyeliner";
import { prepareEyes } from "./eye-geometry";
import type { BrowOptions } from "./brow";
import { prepareGeometry, type FaceGeometry, type Polygon } from "./geometry";
import { prepareBrows } from "./brow";

export interface MakeupAvailability { lip: string | null; blush: string | null; brows: string | null; eyeshadow: string | null; eyeliner: string | null }
export const NO_MAKEUP: MakeupAvailability = {
  eyeshadow: "眼部轮廓或细节不足，或可能被遮挡，暂时无法可靠试眼影；请使用清晰、睁眼且无遮挡的正脸照片。",
  eyeliner: "眼睑轮廓或细节不足，或可能被遮挡，暂时无法可靠贴合眼线；请使用清晰、睁眼且无遮挡的正脸照片。",
  lip: "这张照片暂时无法准确定位唇部，请使用清晰、无遮挡的正脸照片。",
  blush: "这张照片暂时无法准确定位双颊，请使用清晰、无遮挡的正脸照片。",
  brows: "这张照片的眉部细节不足或被遮挡，暂时不能可靠试眉。",
};
/** Null means available. Missing/invalid landmarks disable only the affected modules. */
export function makeupAvailability(src: ImageData, g: FaceGeometry | null | undefined): MakeupAvailability {
  if (!g) return NO_MAKEUP;
  try {
    const p=prepareGeometry(g,src.width,src.height);
    const size=(v: Polygon | null,w:number,h:number) => Boolean(v && v.maxX-v.minX>=w && v.maxY-v.minY>=h);
    const common=Boolean(p.jaw && p.eye_l && p.eye_r);
    const lip=common && size(p.lip_outer,10,3) && Boolean(p.lip_inner);
    const cheeks=common && Boolean(p.lip_outer) && size(p.cheek_l,10,5) && size(p.cheek_r,10,5);
    const eyes=prepareEyes(src,g);
    return { eyeshadow:eyes ? null:NO_MAKEUP.eyeshadow, eyeliner:eyes ? null:NO_MAKEUP.eyeliner, lip:lip ? null:NO_MAKEUP.lip, blush:cheeks ? null:NO_MAKEUP.blush, brows:common && prepareBrows(src,g,p) ? null:NO_MAKEUP.brows };
  } catch { return NO_MAKEUP; }
}

/** Optional additions keep pre-Phase-1 saved combinations compatible. */
export interface MakeupSelection {
  eyeshadow?: EyeshadowOptions | null;
  eyeliner?: EyelinerOptions | null;
  /** A person can flag glasses or hair that automatic visibility checks cannot reliably identify. */
  eyesObscured?: boolean;
  blushHex?: string | null;
  blushPlacement?: BlushPlacement;
  blushIntensity?: number;
  blushOpacity?: number;
  blushFeather?: number;
  lipIntensity?: number;
  lipFinish?: LipFinish;
  brows?: BrowOptions | null;
}
