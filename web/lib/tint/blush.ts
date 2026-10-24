import type { FaceGeometry, Polygon } from "./geometry";
import { intensityInRange, render } from "./mask";
export type BlushPlacement = "horizontal" | "diagonal" | "apple";

function falloff(
  polygon: Polygon,
  placement: BlushPlacement,
  side: number,
): (x: number, y: number) => number {
  const width = polygon.maxX - polygon.minX,
    height = polygon.maxY - polygon.minY;
  const cx = (polygon.minX + polygon.maxX) / 2 - (placement === "diagonal" ? side * width * .12 : 0);
  const cy = polygon.minY + height * (placement === "apple" ? 0.58 : placement === "diagonal" ? 0.32 : 0.48);
  const angle = placement === "diagonal" ? (side * Math.PI) / 5 : 0;
  const cosine = Math.cos(angle),
    sine = Math.sin(angle);
  const rx = width * (placement === "apple" ? 0.38 : 0.55);
  const ry = height * (placement === "horizontal" ? 0.25 : 0.4);
  return (x, y) => {
    const dx = x - cx,
      dy = y - cy;
    const u = (dx * cosine + dy * sine) / rx,
      v = (-dx * sine + dy * cosine) / ry;
    return Math.exp(-2 * (u * u + v * v));
  };
}
export interface BlushOptions { opacity?: number; feather?: number }

/** Cheek-local radial gradients with inward Gaussian feathering and no mask bleed. */
export function blush(
  src: ImageData,
  g: FaceGeometry,
  hex: string,
  placement: BlushPlacement,
  intensity: number,
  options: BlushOptions = {},
): ImageData {
  if (!["horizontal", "diagonal", "apple"].includes(placement))
    throw new TypeError("Unknown blush placement.");
  return render(
    src,
    g,
    hex,
    intensityInRange(intensity) * intensityInRange(options.opacity ?? 1),
    (geometry) => ({
      regions: [geometry.cheek_l, geometry.cheek_r].map((polygon, index) => ({
        polygon,
        sigma: polygon
          ? Math.max(
              0.75,
              Math.min(
                polygon.maxX - polygon.minX,
                polygon.maxY - polygon.minY,
              ) * (.035 + intensityInRange(options.feather ?? .5) * .25),
            )
          : 1,
        falloff: polygon
          ? falloff(polygon, placement, index ? -1 : 1)
          : undefined,
      })),
      exclude: [geometry.brow_l, geometry.brow_r, geometry.lip_outer],
    }),
    { chroma: 0.7, lightness: 0.035,
      pixelWeight: (r,g,b) => {
        const l=.2126*r+.7152*g+.0722*b;
        return Math.min(1,Math.max(0,(l-12)/28)) * (1-Math.max(0,(l-215)/50));
      } },
  );
}
