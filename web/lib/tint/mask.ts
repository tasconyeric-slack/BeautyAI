import { labToRgb, parseHex, rgbToLab } from "./color";
import { boundaryDistance, contains, prepareGeometry } from "./geometry";
import type { FaceGeometry, Polygon, PreparedGeometry } from "./geometry";

export interface Region {
  readonly polygon: Polygon | null;
  readonly sigma: number;
  readonly falloff?: (x: number, y: number) => number;
}
interface TintOptions {
  readonly chroma: number;
  readonly lightness: number;
  readonly solid?: boolean;
  readonly highlight?: number;
  readonly lightnessReference?: number;
  readonly pixelWeight?: (r: number, g: number, b: number) => number;
}
export function intensityInRange(intensity: number): number {
  if (!Number.isFinite(intensity))
    throw new RangeError("Tint intensity must be finite.");
  return Math.max(0, Math.min(1, intensity));
}

/** Inward Gaussian feather: zero on the boundary, approaching one inside. */
export function feather(distance: number, sigma: number): number {
  return 1 - Math.exp(-0.5 * (distance / sigma) ** 2);
}

/** Eyes and inner lip are mandatory exclusions for every caller, including drape. */
export function protectedFeatures(g: PreparedGeometry): (Polygon | null)[] {
  return [g.eye_l, g.eye_r, g.lip_inner];
}
export function render(
  src: ImageData,
  g: FaceGeometry,
  hex: string,
  intensity: number,
  select: (geometry: PreparedGeometry) => {
    regions: Region[];
    exclude?: (Polygon | null)[];
  },
  options: TintOptions,
): ImageData {
  if (
    !src ||
    !Number.isInteger(src.width) ||
    !Number.isInteger(src.height) ||
    src.width <= 0 ||
    src.height <= 0 ||
    !(src.data instanceof Uint8ClampedArray) ||
    src.data.length !== src.width * src.height * 4
  ) {
    throw new TypeError(
      "Expected 8-bit RGBA ImageData with positive dimensions and a complete buffer.",
    );
  }
  if (src.colorSpace && src.colorSpace !== "srgb")
    throw new RangeError("Tint transforms require sRGB ImageData.");
  const rgb = parseHex(hex),
    target = rgbToLab(...rgb),
    strength = intensityInRange(intensity);
  const geometry = prepareGeometry(g, src.width, src.height);
  const selected = select(geometry);
  const lightnessShift = options.lightnessReference === undefined
    ? Math.max(-12, Math.min(12, target[0] - 50))
    : Math.max(-25, Math.min(15, target[0] - options.lightnessReference));
  const regions = selected.regions.filter(
    (region): region is Region & { polygon: Polygon } =>
      region.polygon !== null,
  );
  const exclude = [
    ...protectedFeatures(geometry),
    ...(selected.exclude ?? []),
  ].filter((p): p is Polygon => p !== null);
  const output = new ImageData(
    new Uint8ClampedArray(src.data),
    src.width,
    src.height,
    { colorSpace: "srgb" },
  );
  if (!strength || !regions.length) return output;
  const x0 = Math.max(
    0,
    Math.floor(Math.min(...regions.map((r) => r.polygon.minX))),
  );
  const y0 = Math.max(
    0,
    Math.floor(Math.min(...regions.map((r) => r.polygon.minY))),
  );
  const x1 = Math.min(
    src.width,
    Math.ceil(Math.max(...regions.map((r) => r.polygon.maxX))),
  );
  const y1 = Math.min(
    src.height,
    Math.ceil(Math.max(...regions.map((r) => r.polygon.maxY))),
  );
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const i = (y * src.width + x) * 4,
        px = x + 0.5,
        py = y + 0.5;
      if (!src.data[i + 3] || exclude.some((p) => contains(p, px, py)))
        continue;
      let weight = 0;
      for (const region of regions)
        if (contains(region.polygon, px, py)) {
          const edge = feather(
            boundaryDistance(region.polygon, px, py),
            region.sigma,
          );
          weight = Math.max(weight, edge * (region.falloff?.(px, py) ?? 1));
        }
      const amount = strength * weight * (options.pixelWeight?.(src.data[i], src.data[i + 1], src.data[i + 2]) ?? 1);
      if (!amount) continue;
      if (options.solid) {
        // The digital cloth is a solid swatch; makeup below uses texture-preserving Lab.
        for (let c = 0; c < 3; c++)
          output.data[i + c] =
            src.data[i + c] + (rgb[c] - src.data[i + c]) * amount;
      } else {
        const [l, a, b] = rgbToLab(
          src.data[i],
          src.data[i + 1],
          src.data[i + 2],
        );
        // A small uniform L* offset preserves local contrast instead of pulling every pixel toward the target.
        const nextL = Math.max(
          0,
          Math.min(
            100,
            l +
              lightnessShift *
                options.lightness *
                amount + (options.highlight ?? 0) * Math.max(0, (l - 45) / 55) * amount,
          ),
        );
        const next = labToRgb(
          nextL,
          a + (target[1] - a) * options.chroma * amount,
          b + (target[2] - b) * options.chroma * amount,
        );
        output.data[i] = next[0];
        output.data[i + 1] = next[1];
        output.data[i + 2] = next[2];
      }
    }
  return output;
}
