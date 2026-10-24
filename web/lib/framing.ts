/** Per-photo framing (V3B, D35): zoom, pan, crop aspect and a small rotation, chosen before QC and measurement.
 *
 *  One transform drives both the live editor preview (CSS) and the uploaded pixels (canvas):
 *      output(u, v) = source( R(−θ) · ((u, v) − out/2) / s + c )
 *  so what the person confirms is exactly the image that is checked, measured and drawn on. The output is always
 *  rendered from the ORIGINAL source (never from a previous output), and never upscaled: zooming crops native
 *  pixels, it does not add detail. */
import type { CaptureRecord } from "./api";

export type Aspect = "source" | "3:4" | "4:5" | "1:1";
export const ASPECTS: Aspect[] = ["source", "3:4", "4:5", "1:1"];
export const MAX_LONG_SIDE = 1600;
export const ZOOM_MAX = 4;
export const ROTATE_MAX = 15;

export interface Framing {
  zoom: number;    // ≥ 1: 1 = the largest crop of this aspect inside the photo
  rotate: number;  // degrees, clockwise, |θ| ≤ ROTATE_MAX
  cx: number;      // crop centre in source pixels
  cy: number;
  aspect: Aspect;
}

export const defaultFraming = (w: number, h: number): Framing => ({ zoom: 1, rotate: 0, cx: w / 2, cy: h / 2, aspect: "source" });

const ratio = (a: Aspect, w: number, h: number) => (a === "source" ? w / h : a === "1:1" ? 1 : a === "3:4" ? 3 / 4 : 4 / 5);

/** Crop size in source pixels. */
export function cropSize(w: number, h: number, f: Framing): { cw: number; ch: number } {
  const r = ratio(f.aspect, w, h);
  let cw = w, ch = h;
  if (w / h > r) cw = h * r;
  else ch = w / r;
  return { cw: cw / f.zoom, ch: ch / f.zoom };
}

/** Keep zoom / rotation in range and the crop centre inside the photo. */
export function clampFraming(w: number, h: number, f: Framing): Framing {
  const zoom = Math.min(ZOOM_MAX, Math.max(1, f.zoom));
  const rotate = Math.min(ROTATE_MAX, Math.max(-ROTATE_MAX, f.rotate));
  const { cw, ch } = cropSize(w, h, { ...f, zoom });
  const cx = Math.min(w - cw / 2, Math.max(cw / 2, f.cx));
  const cy = Math.min(h - ch / 2, Math.max(ch / 2, f.cy));
  return { ...f, zoom, rotate, cx, cy };
}

/** Keep the selected centre and height when changing ratios; shrink around that centre near an edge. */
export function changeAspect(w: number, h: number, f: Framing, aspect: Aspect): Framing {
  const { ch } = cropSize(w, h, f);
  const base = cropSize(w, h, { ...f, aspect, zoom: 1 });
  const height = Math.min(ch, 2 * Math.min(f.cx, w - f.cx) / ratio(aspect, w, h), 2 * Math.min(f.cy, h - f.cy));
  return clampFraming(w, h, { ...f, aspect, zoom: base.ch / height });
}

export interface CropRect { x: number; y: number; width: number; height: number }

/** A suggestion, never a forced crop. Leave generous hair/ear/chin margins and keep close-ups untouched. */
export function suggestFaceFraming(w: number, h: number, faces: CropRect[]): Framing | null {
  if (faces.length !== 1) return null;
  const face = faces[0];
  if (![w, h, face.x, face.y, face.width, face.height].every(Number.isFinite)
    || face.width < Math.max(80, w * 0.08) || face.height < Math.max(80, h * 0.08)
    || face.width / face.height < 0.55 || face.width / face.height > 1.15) return null;
  const ch = Math.max(face.height * 2.1, face.width * 2.1 / 0.75);
  const cw = ch * 0.75;
  const cx = face.x + face.width / 2, cy = face.y + face.height * 0.4;
  // Do not squeeze away missing headroom, force extra zoom on headshots, or discard native face detail.
  if (cw > w * 0.9 || ch > h * 0.9 || cx - cw / 2 < 0 || cx + cw / 2 > w
    || cy - ch / 2 < 0 || cy + ch / 2 > h) return null;
  const base = cropSize(w, h, { ...defaultFraming(w, h), aspect: "3:4" });
  const zoom = base.cw / cw;
  if (zoom > ZOOM_MAX) return null;
  return { zoom, rotate: 0, cx, cy, aspect: "3:4" };
}

/** Cropper.js transforms its natural-size image about its centre. These adapters keep our source crop canonical. */
export function imageMatrix(w: number, h: number, f: Framing, rect: CropRect): number[] {
  const { cw } = cropSize(w, h, f);
  const scale = rect.width / cw, t = f.rotate * Math.PI / 180;
  const a = scale * Math.cos(t), b = scale * Math.sin(t);
  const dx = f.cx - w / 2, dy = f.cy - h / 2;
  return [a, b, -b, a, rect.x + rect.width / 2 - w / 2 - a * dx + b * dy,
    rect.y + rect.height / 2 - h / 2 - b * dx - a * dy];
}

export function framingFromSelection(w: number, h: number, aspect: Aspect, rect: CropRect, matrix: number[]): Framing {
  const [a, b, c, d, e, f] = matrix, det = a * d - b * c;
  const x = rect.x + rect.width / 2 - w / 2 - e, y = rect.y + rect.height / 2 - h / 2 - f;
  const base = cropSize(w, h, { ...defaultFraming(w, h), aspect });
  return clampFraming(w, h, {
    aspect, zoom: base.cw * Math.hypot(a, b) / rect.width,
    rotate: Math.atan2(b, a) * 180 / Math.PI,
    cx: w / 2 + (d * x - c * y) / det, cy: h / 2 + (a * y - b * x) / det,
  });
}

export function selectionForFraming(w: number, h: number, f: Framing, matrix: number[]): CropRect {
  const [a, b, c, d, e, g] = matrix, scale = Math.hypot(a, b);
  const { cw, ch } = cropSize(w, h, f);
  const dx = f.cx - w / 2, dy = f.cy - h / 2;
  return { x: w / 2 + e + a * dx + c * dy - cw * scale / 2,
    y: h / 2 + g + b * dx + d * dy - ch * scale / 2, width: cw * scale, height: ch * scale };
}

/** Output pixel size and the source→output scale (≤ 1: downscale only). */
export function outputSize(cw: number, ch: number, maxSide = MAX_LONG_SIDE): { ow: number; oh: number; s: number } {
  const s = Math.min(1, maxSide / Math.max(cw, ch));
  return { ow: Math.max(1, Math.round(cw * s)), oh: Math.max(1, Math.round(ch * s)), s };
}

export function isIdentity(w: number, h: number, f: Framing): boolean {
  return f.zoom === 1 && f.rotate === 0 && f.aspect === "source" && Math.abs(f.cx - w / 2) < 0.5 && Math.abs(f.cy - h / 2) < 0.5;
}

/** Map an output pixel back to the source photo (used by tests and for the provenance record). */
export function outputToSource(u: number, v: number, w: number, h: number, f: Framing): [number, number] {
  const { cw, ch } = cropSize(w, h, f);
  const { ow, oh, s } = outputSize(cw, ch);
  const x = (u - ow / 2) / s, y = (v - oh / 2) / s;
  const t = (-f.rotate * Math.PI) / 180;
  return [f.cx + x * Math.cos(t) - y * Math.sin(t), f.cy + x * Math.sin(t) + y * Math.cos(t)];
}

export function captureRecord(w: number, h: number, f: Framing): CaptureRecord {
  const { cw, ch } = cropSize(w, h, f);
  const { ow, oh } = outputSize(cw, ch);
  const r = (x: number) => Math.round(x * 10) / 10;
  return {
    crop: [r(f.cx - cw / 2), r(f.cy - ch / 2), r(cw), r(ch)], rotate_deg: r(f.rotate),
    source_w: w, source_h: h, output_w: ow, output_h: oh, edited: !isIdentity(w, h, f),
  };
}

/** CSS transform that places the source <img> (natural size, transform-origin 0 0) in a viewport of width `vw`
 *  so that it shows exactly the crop the canvas renders. */
export function cssTransform(w: number, h: number, f: Framing, vw: number): string {
  const { cw, ch } = cropSize(w, h, f);
  const d = vw / cw;
  const vh = ch * d;
  return `translate(${vw / 2}px, ${vh / 2}px) scale(${d}) rotate(${f.rotate}deg) translate(${-f.cx}px, ${-f.cy}px)`;
}

/** Render the framed output from the original source as a JPEG blob. */
export async function renderFraming(src: CanvasImageSource, w: number, h: number, f: Framing, quality = 0.92): Promise<Blob> {
  const { cw, ch } = cropSize(w, h, f);
  const { ow, oh, s } = outputSize(cw, ch);
  const canvas = document.createElement("canvas");
  canvas.width = ow;
  canvas.height = oh;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#e6e3de";                       // corners uncovered by a rotation stay neutral, never invented
  ctx.fillRect(0, 0, ow, oh);
  ctx.imageSmoothingQuality = "high";
  ctx.translate(ow / 2, oh / 2);
  ctx.scale(s, s);
  ctx.rotate((f.rotate * Math.PI) / 180);
  ctx.translate(-f.cx, -f.cy);
  ctx.drawImage(src, 0, 0);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
  if (!blob) throw new Error("render failed");
  return blob;
}
