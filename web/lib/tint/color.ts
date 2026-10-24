export type RGB = readonly [number, number, number];
export type Lab = readonly [number, number, number];

/** CSS short/long RGB hex only; color names and alpha channels are deliberately rejected. */
export function parseHex(hex: string): RGB {
  if (typeof hex !== "string" || !/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(hex)) {
    throw new TypeError("Expected an RGB hex color such as #b42863 or #b46.");
  }
  const full =
    hex.length === 4
      ? hex
          .slice(1)
          .split("")
          .map((n) => n + n)
          .join("")
      : hex.slice(1);
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}
const linear = Float64Array.from({ length: 256 }, (_, i) => {
  const n = i / 255;
  return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
});
const epsilon = 216 / 24389,
  kappa = 24389 / 27;
const labCurve = (n: number) =>
  n > epsilon ? Math.cbrt(n) : (kappa * n + 16) / 116;
const inverseLabCurve = (n: number) =>
  n ** 3 > epsilon ? n ** 3 : (116 * n - 16) / kappa;
const encoded = (n: number) =>
  Math.round(
    255 *
      Math.max(
        0,
        Math.min(
          1,
          n <= 0.0031308 ? 12.92 * n : 1.055 * n ** (1 / 2.4) - 0.055,
        ),
      ),
  );

/** CIE Lab, D65 white, from an sRGB byte triplet. */
export function rgbToLab(r: number, g: number, b: number): Lab {
  const red = linear[r],
    green = linear[g],
    blue = linear[b];
  const x = labCurve(
    (0.4124564 * red + 0.3575761 * green + 0.1804375 * blue) / 0.95047,
  );
  const y = labCurve(0.2126729 * red + 0.7151522 * green + 0.072175 * blue);
  const z = labCurve(
    (0.0193339 * red + 0.119192 * green + 0.9503041 * blue) / 1.08883,
  );
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
export function labToRgb(l: number, a: number, b: number): RGB {
  const y = (l + 16) / 116;
  const x = 0.95047 * inverseLabCurve(y + a / 500);
  const yy = inverseLabCurve(y),
    z = 1.08883 * inverseLabCurve(y - b / 200);
  return [
    encoded(3.2404542 * x - 1.5371385 * yy - 0.4985314 * z),
    encoded(-0.969266 * x + 1.8760108 * yy + 0.041556 * z),
    encoded(0.0556434 * x - 0.2040259 * yy + 1.0572252 * z),
  ];
}
