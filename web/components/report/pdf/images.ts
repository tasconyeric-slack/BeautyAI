/** Browser-only: the images a photo-inclusive PDF may contain (Issue #33, Phase 2).
 *
 *  Only URLs this viewer is already served (the passport's own front photo and succeeded previews, or the sample's
 *  drawn illustrations) are read, and only after the viewer asked for photos in the PDF. Each image is drawn on a
 *  canvas in memory and handed to the PDF as a data URL; nothing is uploaded, cached or stored. */
import { measureView } from "@/components/face/measure-model";
import { hairOptions, type Tier } from "@/lib/adapters";
import type { PassportResponse } from "@/lib/api";
import type { FaceGeometry } from "@/lib/tint";
import { photosGone, previewNote, regionCrop, regionViews } from "../report-model";
import type { PhotoMode, ReportImages } from "./document";

const JPEG_Q = 0.86;

/** Thrown when the front photo is gone (TTL): the export continues image-free. */
export class PhotoExpired extends Error {}

async function load(url: string): Promise<HTMLImageElement> {
  // never a cached copy: a photo deleted on the server (TTL or the user's delete) must not reach a new PDF
  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 404 || res.status === 410) throw new PhotoExpired(String(res.status));
  if (!res.ok) throw new Error(`image ${res.status}`);
  const blobUrl = URL.createObjectURL(await res.blob());
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = blobUrl;
    await img.decode();
    return img;
  } finally {
    // the decoded image stays usable for drawing after the object URL is released
    setTimeout(() => URL.revokeObjectURL(blobUrl), 0);
  }
}

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = Math.round(w);
  c.height = Math.round(h);
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  ctx.fillStyle = "#141618";
  ctx.fillRect(0, 0, c.width, c.height);
  return [c, ctx] as const;
}

/** Center crop to `aspect` (w / h), like object-fit: cover. */
function cover(img: HTMLImageElement, aspect: number, outW: number): string {
  const iw = img.naturalWidth, ih = img.naturalHeight;
  const sw = Math.min(iw, ih * aspect), sh = sw / aspect;
  const [c, ctx] = canvas(outW, outW / aspect);
  ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", JPEG_Q);
}

function regionImage(img: HTMLImageElement, crop: NonNullable<ReturnType<typeof regionCrop>>, outW = 420) {
  const iw = img.naturalWidth, ih = img.naturalHeight;
  const [x0, y0, x1, y1] = crop.box;
  const sw = (x1 - x0) * iw, sh = (y1 - y0) * ih;
  const [c, ctx] = canvas(outW, (outW * sh) / sw);
  ctx.drawImage(img, x0 * iw, y0 * ih, sw, sh, 0, 0, c.width, c.height);
  const k = c.width / ((x1 - x0) * crop.width);
  const at = (q: readonly number[]) => [(q[0] - x0) * crop.width * k, (q[1] - y0) * crop.height * k] as const;
  ctx.lineCap = "round";
  ctx.shadowColor = "rgba(0,0,0,.6)";
  ctx.shadowBlur = 2;
  for (const o of crop.overlays) {
    for (const sgm of o.segments) {
      const [ax, ay] = at(sgm.a), [bx, by] = at(sgm.b);
      ctx.setLineDash(sgm.role === "measure" ? [] : [6, 5]);
      ctx.strokeStyle = sgm.role === "measure" ? "#e2b27f" : "rgba(255,255,255,.85)";
      ctx.lineWidth = sgm.role === "measure" ? 2.4 : 1.4;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    }
    ctx.setLineDash([]);
    const dots = [...o.segments.flatMap((sg) => (sg.role === "measure" ? [sg.a, sg.b] : [])), ...o.dots];
    for (const d of dots) {
      const [x, y] = at(d);
      ctx.fillStyle = "#e2b27f"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y, 3.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  }
  return { src: c.toDataURL("image/jpeg", JPEG_Q), aspect: c.width / c.height };
}

/** The photo-inclusive image set, or an image-free result when the photo has expired. */
export async function collectImages(data: PassportResponse, geometry: FaceGeometry | null, sample: boolean): Promise<{ images: ReportImages | null; photoMode: PhotoMode }> {
  const p = data.passport!;
  if (photosGone(data.media) || !data.media.front) return { images: null, photoMode: "expired" };
  let front: HTMLImageElement;
  try {
    front = await load(data.media.front);
  } catch (e) {
    if (e instanceof PhotoExpired) return { images: null, photoMode: "expired" };
    throw e;
  }
  const images: ReportImages = { portrait: cover(front, 4 / 5, 600), regions: {}, hair: {} };

  const mv = measureView(p, data.id, data.entitlement.locked);
  if (mv && geometry) {
    for (const r of regionViews(p, mv)) {
      const crop = regionCrop(r.drawable, geometry);
      if (!crop) continue;
      const names = r.drawable.slice(0, crop.overlays.length).map((m) => m.name_zh).join("、");
      images.regions[r.key] = { ...regionImage(front, crop), caption: `正脸照局部 · 线条是 ${names} 的测量位置` };
    }
  }

  for (const h of hairOptions(p, data.partial.previews)) {
    const pv = h.preview;
    const note = previewNote({ status: pv?.status ?? null, imageModel: pv?.image_model ?? null, paid: data.entitlement.paid, expired: data.media.expired });
    if ((note !== "ai" && note !== "illustration") || !pv?.after_url) continue;
    try {
      images.hair[h.tier as Tier] = cover(await load(pv.after_url), 1, 480);
    } catch {
      /* a preview that can no longer be read is described in text instead */
    }
  }
  return { images, photoMode: "included" };
}
