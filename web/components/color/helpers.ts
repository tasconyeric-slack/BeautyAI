/** Pure helpers for the colour page (A6). No passport types: plain values in, plain values out. */
import { searchPhrase } from "@/lib/adapters";

export type GroupKey = "favor" | "neutral" | "caution";

export interface Chip {
  hex: string;
  /** Family name without the adapter's index suffix ("雾霾蓝"). */
  family: string;
  /** Readable label; families with several examples get 浅 / 中 / 深 ("雾霾蓝 · 浅"). */
  label: string;
  group: GroupKey;
}

/** What each group is for, used for the shopping search phrase and the drape caption. */
export const GROUP_USE: Record<GroupKey, { item: string; role: string }> = {
  favor: { item: "针织衫", role: "放在脸旁" },
  neutral: { item: "外套", role: "衣橱底色" },
  caution: { item: "运动鞋", role: "远离脸部" },
};

/** "雾霾蓝2" → "雾霾蓝" (colorGroups numbers families that have several hex examples). */
export const familyName = (nameZh: string) => nameZh.replace(/\d+$/, "").trim() || nameZh;

/** Relative luminance (0..1) of a #rgb / #rrggbb colour; NaN for anything else. */
export function luminance(hex: string): number {
  const m = /^#?([\da-f]{3}|[\da-f]{6})$/i.exec(hex.trim());
  if (!m) return Number.NaN;
  const h = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  const lin = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/** Turns adapter swatches into chips with readable, unique labels (浅 / 中 / 深 within a family). */
export function toChips(colors: { hex: string; name_zh: string }[], group: GroupKey): Chip[] {
  const byFamily = new Map<string, string[]>();
  for (const c of colors) {
    const f = familyName(c.name_zh);
    byFamily.set(f, [...(byFamily.get(f) ?? []), c.hex]);
  }
  return colors.map((c) => {
    const family = familyName(c.name_zh);
    const hexes = byFamily.get(family) ?? [c.hex];
    if (hexes.length < 2) return { hex: c.hex, family, label: family, group };
    const order = [...hexes].sort((a, b) => luminance(b) - luminance(a)); // lightest first
    const i = order.indexOf(c.hex);
    const tone = hexes.length === 2 ? ["浅", "深"][i] : i === 0 ? "浅" : i === order.length - 1 ? "深" : "中";
    return { hex: c.hex, family, label: `${family} · ${tone ?? i + 1}`, group };
  });
}

/** Shopping search phrase for one colour: "雾霾蓝 针织衫". */
export const colorSearchPhrase = (chip: Pick<Chip, "family" | "group">) => searchPhrase(chip.family, GROUP_USE[chip.group].item);

/** Feedback target id: lowercase hex without "#" (must match ^[a-z0-9_]{1,48}$). */
export function colorTargetId(hex: string): string {
  const id = hex.replace(/^#/, "").toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 48);
  return id || "color";
}

/** Pixel bounding box of a normalized polygon on a w×h image, padded and clamped (where `drape` can change pixels). */
export function polygonBox(points: readonly (readonly [number, number])[], w: number, h: number, pad = 2) {
  if (!points.length) return null;
  const xs = points.map((p) => p[0] * w);
  const ys = points.map((p) => p[1] * h);
  const x0 = Math.max(0, Math.floor(Math.min(...xs)) - pad);
  const y0 = Math.max(0, Math.floor(Math.min(...ys)) - pad);
  const x1 = Math.min(w, Math.ceil(Math.max(...xs)) + pad);
  const y1 = Math.min(h, Math.ceil(Math.max(...ys)) + pad);
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

/** Scale an image so its long side is at most `max` px (drape cost grows with pixels; display is ≤ ~1000 px). */
export function fitLongSide(w: number, h: number, max: number) {
  const s = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}

const CONTRAST_ZH: Record<string, string> = {
  low: "低对比", medium_low: "中低对比", medium: "中等对比", medium_high: "中高对比", high: "高对比",
};
export const contrastZh = (v: string) => CONTRAST_ZH[v] ?? v;

/** One sentence on what the contrast level means for outfits. */
export function contrastAdvice(v: string): string {
  if (v === "high" || v === "medium_high") return "发色与肤色明暗差较大，深浅分明的搭配（如深色上衣配浅色内搭）更能撑住。";
  if (v === "low" || v === "medium_low") return "发色与肤色明暗差较小，相近明度的同色系搭配更协调，避免黑白强对比。";
  return "发色与肤色明暗差适中，一深一浅的柔和搭配最稳妥，强烈的黑白对比少量点缀即可。";
}

// --- fast cloth repaint -------------------------------------------------------------------------------------------
// K5 `drape` lays a solid cloth: out = src + (rgb − src) · w, with w ∈ [0, 1] from the neck polygon, its feathered edge
// and the face/feature exclusions — w depends only on geometry, never on colour. So the page runs `drape` once on an
// all-white image with black cloth to read w, then repaints any colour in a few ms (equal to `drape` within ±1 level,
// see color.test.tsx). The cloth shape and exclusions stay owned by `drape`.

/** Cloth weights from `drape(white, g, "#000000")` cropped to the box: w = 1 − R/255. */
export function clothWeights(drapedWhite: Uint8ClampedArray): Float32Array {
  const w = new Float32Array(drapedWhite.length / 4);
  for (let i = 0; i < w.length; i++) w[i] = 1 - drapedWhite[i * 4] / 255;
  return w;
}

/** Parses #rgb / #rrggbb into [r, g, b]; throws on anything else. */
export function hexRgb(hex: string): [number, number, number] {
  const m = /^#?([\da-f]{3}|[\da-f]{6})$/i.exec(hex.trim());
  if (!m) throw new RangeError(`Not a hex colour: ${hex}`);
  const h = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

/** Blend a solid colour into `base` (original RGBA pixels of the box) with the cloth weights; returns new pixels. */
export function blendCloth(base: Uint8ClampedArray, weights: Float32Array, hex: string): Uint8ClampedArray<ArrayBuffer> {
  const rgb = hexRgb(hex);
  const out = new Uint8ClampedArray(base);
  for (let p = 0, i = 0; p < weights.length; p++, i += 4) {
    const a = weights[p];
    if (!a || !base[i + 3]) continue;
    out[i] = base[i] + (rgb[0] - base[i]) * a;
    out[i + 1] = base[i + 1] + (rgb[1] - base[i + 1]) * a;
    out[i + 2] = base[i + 2] + (rgb[2] - base[i + 2]) * a;
  }
  return out;
}
