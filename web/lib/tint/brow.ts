import { contains, prepareGeometry, type FaceGeometry, type Polygon, type Pt, type PreparedGeometry } from "./geometry";
import { intensityInRange } from "./mask";
import { parseHex } from "./color";

export type BrowShape = "soft" | "straight" | "arched";
export interface BrowOptions {
  shape: BrowShape;
  hex: string;
  density: number;
  intensity: number;
  /** Relative to the measured brow thickness; original hairs are never removed. */
  thickness?: number;
}
interface BrowRegion {
  polygon: Polygon;
  head: Pt;
  ux: number; uy: number; vx: number; vy: number;
  length: number;
  thickness: number;
  skin: number;
  arch: number;
}
const luminance = (d: Uint8ClampedArray, i: number) => .2126 * d[i] + .7152 * d[i + 1] + .0722 * d[i + 2];
const median = (v: number[]) => v.sort((a,b) => a-b)[Math.floor(v.length / 2)];
const clamp = (v: number) => Math.max(0, Math.min(1,v));

/** Brow-local dark-hair segmentation, relative to this person's adjacent skin, not a skin-tone cutoff.
 * No model, photograph upload, synthetic skin replacement or removal of the original brow.
 */
export function prepareBrows(src: ImageData, g: FaceGeometry, geometry: PreparedGeometry): BrowRegion[] | null {
  const result: BrowRegion[] = [];
  for (const side of ["l", "r"] as const) {
    const polygon = geometry[`brow_${side}`];
    if (!polygon || !geometry.jaw || !geometry.eye_l || !geometry.eye_r) return null;
    const w = polygon.maxX - polygon.minX, h = polygon.maxY - polygon.minY;
    if (w < 12 || h < 2 || h > w * .65) return null;
    const inner = side === "l" ? polygon.maxX : polygon.minX;
    const outer = side === "l" ? polygon.minX : polygon.maxX;
    const point = (key: string, x: number): Pt => {
      const p = g.points?.[key];
      return p && p.length === 2 && p.every(v => Number.isFinite(v) && v >= 0 && v <= 1)
        ? [p[0] * src.width, p[1] * src.height]
        : [x, (polygon.minY + polygon.maxY) / 2];
    };
    const head = point(`brow_${side}_head`,inner), tail = point(`brow_${side}_tail`,outer);
    const dx = tail[0]-head[0], dy = tail[1]-head[1], length = Math.hypot(dx,dy);
    if (length < 12 || length > w * 1.4 || length < w * .6) return null;
    const ux = dx/length, uy = dy/length;
    const vx = ux > 0 ? -uy : uy, vy = Math.abs(ux);
    const skin: number[] = [], hairs: number[] = [];
    const pad = Math.max(3,w*.09);
    for (let y = Math.max(0,Math.floor(polygon.minY-pad)); y < Math.min(src.height,polygon.maxY+pad); y++)
      for (let x = Math.max(0,Math.floor(polygon.minX-pad)); x < Math.min(src.width,polygon.maxX+pad); x++) {
        const px=x+.5, py=y+.5, i=(y*src.width+x)*4;
        if (!src.data[i+3] || !contains(geometry.jaw,px,py) || contains(geometry.eye_l,px,py) || contains(geometry.eye_r,px,py)) continue;
        (contains(polygon,px,py) ? hairs : skin).push(luminance(src.data,i));
      }
    if (skin.length < 10 || hairs.length < 10) return null;
    const reference = median(skin);
    const threshold = reference - Math.max(9,reference*.12);
    const fraction = hairs.filter(v => v < threshold).length/hairs.length;
    // Flat, tiny, severely underexposed or fully occluded regions cannot support an honest preview.
    if (reference < 22 || fraction < .025 || fraction > .92) return null;
    const thickness = Math.max(2, Math.min(h*.55,w*.085));
    const measuredArch = -Math.min(...polygon.points.map(p => (p[0]-head[0])*vx+(p[1]-head[1])*vy))-thickness;
    result.push({polygon,head,ux,uy,vx,vy,length,thickness,skin:reference,arch:Math.max(length*.025,Math.min(length*.22,measuredArch))});
  }
  return result;
}

/** Additive brow pencil simulation: tapered, antialiased individual strokes follow three arch/tail templates.
 * Existing hairs retain their luminance variation; skin between new strokes stays visible.
 */
export function browTint(src: ImageData, g: FaceGeometry, options: BrowOptions): ImageData {
  const out = new ImageData(new Uint8ClampedArray(src.data),src.width,src.height);
  const strength = intensityInRange(options.intensity), density = intensityInRange(options.density);
  if (!["soft","straight","arched"].includes(options.shape)) throw new TypeError("Unknown brow shape.");
  const rgb = parseHex(options.hex);
  const geometry = prepareGeometry(g,src.width,src.height);
  const regions = prepareBrows(src,g,geometry);
  if (!regions || !strength || !density) return out;
  const thickness = Math.max(.6,Math.min(1.6,options.thickness ?? 1));
  for (const r of regions) {
    const arch = options.shape === "arched" ? r.arch+r.length*.035 : options.shape === "straight" ? r.arch*.4 : r.arch*.9;
    const thick = r.thickness * thickness * (options.shape === "straight" ? 1.15 : options.shape === "arched" ? .85 : 1);
    const margin = r.length * .2;
    for (let y=Math.max(0,Math.floor(r.polygon.minY-margin));y<Math.min(src.height,r.polygon.maxY+margin);y++)
      for (let x=Math.max(0,Math.floor(r.polygon.minX-margin));x<Math.min(src.width,r.polygon.maxX+margin);x++) {
        const px=x+.5, py=y+.5, i=(y*src.width+x)*4;
        if (!src.data[i+3] || !contains(geometry.jaw,px,py) || [geometry.eye_l,geometry.eye_r,geometry.lip_outer].some(p=>contains(p,px,py))) continue;
        const dx=px-r.head[0],dy=py-r.head[1];
        const u=dx*r.ux+dy*r.uy, v=dx*r.vx+dy*r.vy, t=u/r.length;
        const tail = options.shape === "arched" ? 1.04 : options.shape === "straight" ? .94 : 1;
        if (t<=0 || t>=tail) continue;
        const q=t/tail;
        // Peak toward the outer third; the head and tail stay attached to the measured brow.
        const curve=-arch*Math.sin(Math.PI*Math.pow(q,.8));
        const taper=Math.min(1,q/.14)*Math.pow(1-q,.45);
        const half=thick*taper;
        const edge=clamp((half-Math.abs(v-curve)+.4)/Math.max(.7,thick*.24));
        if (!edge) continue;
        const lum=luminance(src.data,i);
        const native=contains(r.polygon,px,py) ? clamp((r.skin-lum-Math.max(6,r.skin*.06))/(r.skin*.45)) : 0;
        // Do not draw onto dark occluding head hair outside the measured eyebrow.
        if (!contains(r.polygon,px,py) && lum<r.skin*.52) continue;
        const spacing=Math.max(1.5,r.length/(32+18*density));
        const phase=(u+(v-curve)*(1.9-1.3*q))/spacing;
        const strand=Math.pow(Math.max(0,Math.cos(phase*Math.PI*2)),8);
        const alpha=strength*density*edge*Math.max(native*.65,strand*.72)*Math.min(1,q/.09,(1-q)/.09);
        const lighting=Math.max(.55,Math.min(1.35,lum/Math.max(25,r.skin*.6)));
        for(let c=0;c<3;c++) out.data[i+c]=src.data[i+c]+(rgb[c]*lighting-src.data[i+c])*alpha;
      }
  }
  return out;
}
