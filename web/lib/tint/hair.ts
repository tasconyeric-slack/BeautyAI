/** Texture-preserving, local CIE Lab hair transfer. Preparation runs once per image/mask. */
import { labToRgb, parseHex, rgbToLab } from './color';
import { intensityInRange } from './mask';

export function prepareHair(source: ImageData, mask: Uint8ClampedArray) {
  if (mask.length !== source.width * source.height) throw new RangeError('Hair mask must match the image dimensions.');
  const pixels: number[] = [], labs: number[] = [], weights: number[] = [];
  let sum = 0, count = 0;
  for (let p = 0; p < mask.length; p++) {
    const i = p * 4;
    if (!mask[p] || !source.data[i + 3]) continue;
    const lab = rgbToLab(source.data[i], source.data[i + 1], source.data[i + 2]);
    pixels.push(i); labs.push(...lab); weights.push(mask[p] / 255);
    sum += lab[0] * mask[p]; count += mask[p];
  }
  const mean = count ? sum / count : 50;
  return { source, pixels: Uint32Array.from(pixels), labs: Float32Array.from(labs), weights: Float32Array.from(weights), mean,
    approximate: (hex: string) => rgbToLab(...parseHex(hex))[0] - mean > 22 };
}
export type PreparedHair = ReturnType<typeof prepareHair>;

export function recolorHair(hair: PreparedHair, hex: string, intensity: number): ImageData {
  const target = rgbToLab(...parseHex(hex)), strength = intensityInRange(intensity);
  const out = new ImageData(new Uint8ClampedArray(hair.source.data), hair.source.width, hair.source.height);
  if (!strength) return out;
  // A bounded uniform offset keeps strands and shadows; it cannot simulate bleaching dark hair to platinum.
  const offset = Math.max(-28, Math.min(18, (target[0] - hair.mean) * 0.65));
  for (let p = 0; p < hair.pixels.length; p++) {
    const i = hair.pixels[p], l = hair.labs[p * 3], a = hair.labs[p * 3 + 1], b = hair.labs[p * 3 + 2];
    // Specular glints stay neutral and unchanged. Near-black shadows receive less chroma.
    const highlight = Math.max(0, Math.min(1, (96 - l) / 18));
    const amount = strength * hair.weights[p] * highlight;
    if (!amount) continue;
    const chroma = amount * Math.max(0.25, Math.min(1, l / 30));
    const rgb = labToRgb(Math.max(0, Math.min(100, l + offset * amount)),
      a + (target[1] - a) * chroma, b + (target[2] - b) * chroma);
    out.data[i] = rgb[0]; out.data[i + 1] = rgb[1]; out.data[i + 2] = rgb[2];
  }
  return out;
}
