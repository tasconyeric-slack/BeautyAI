import type { FaceGeometry } from "./geometry";
import { render } from "./mask";

/** Very subtle face color direction, excluding brows, lips and both eyes. */
export function tone(
  src: ImageData,
  g: FaceGeometry,
  hex: string,
  intensity: number,
): ImageData {
  return render(
    src,
    g,
    hex,
    intensity,
    (geometry) => ({
      regions: [
        {
          polygon: geometry.jaw,
          sigma: Math.max(0.75, Math.min(src.width, src.height) * 0.012),
        },
      ],
      exclude: [geometry.brow_l, geometry.brow_r, geometry.lip_outer],
    }),
    { chroma: 0.1, lightness: 0.025 },
  );
}
