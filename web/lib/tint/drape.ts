import type { FaceGeometry } from "./geometry";
import { render } from "./mask";

/** Solid digital cloth within neck, clipped away from the jaw/face and all features. */
export function drape(src: ImageData, g: FaceGeometry, hex: string): ImageData {
  return render(
    src,
    g,
    hex,
    1,
    (geometry) => ({
      regions: [
        {
          polygon: geometry.neck,
          sigma: Math.max(0.5, Math.min(src.width, src.height) * 0.002),
        },
      ],
      exclude: [
        geometry.jaw,
        geometry.brow_l,
        geometry.brow_r,
        geometry.lip_outer,
      ],
    }),
    { chroma: 0, lightness: 0, solid: true },
  );
}
