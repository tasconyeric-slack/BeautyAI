"use client";

/** Digital drape source (A6): front photo + geometry → local pixels; paints the cloth into any canvas.
 *
 *  Same loading approach as components/passport/tint-canvas.tsx, but one source feeds several canvases (two-colour
 *  compare) and only the cloth's bounding box is repainted. K5 `drape` (pure) runs once per photo to read the cloth
 *  weights (see helpers.ts · clothWeights); each colour is then a few-ms blend + putImageData. Nothing leaves the browser.
 */
import * as React from "react";
import { backendFor } from "@/lib/api";
import { drape, type FaceGeometry } from "@/lib/tint";
import { usePassport } from "@/lib/state/passport-store";
import { blendCloth, clothWeights, fitLongSide, polygonBox } from "./helpers";

export type DrapeStatus = "loading" | "ready" | "expired" | "no_geometry" | "unavailable";

const MAX_SIDE = 900;
const CACHE_SIZE = 16;

type Box = { x: number; y: number; w: number; h: number };

function crop(img: ImageData, b: Box): ImageData {
  const out = new ImageData(b.w, b.h);
  for (let y = 0; y < b.h; y++) {
    const from = ((b.y + y) * img.width + b.x) * 4;
    out.data.set(img.data.subarray(from, from + b.w * 4), y * b.w * 4);
  }
  return out;
}

interface Source { original: ImageData; box: Box; base: ImageData; weights: Float32Array }

export function useDrape() {
  const { id, data } = usePassport();
  const expired = Boolean(data?.media.expired);
  const src = data && !expired ? data.media.front : null;
  const [geometry, setGeometry] = React.useState<FaceGeometry | null | undefined>(undefined);
  const [loaded, setLoaded] = React.useState<"pending" | "ok" | "error">("pending");
  const source = React.useRef<Source | null>(null);
  const cache = React.useRef(new Map<string, ImageData>());

  React.useEffect(() => {
    if (expired) return;
    let live = true;
    backendFor(id).geometry(id).then((g) => live && setGeometry(g)).catch(() => live && setGeometry(null));
    return () => { live = false; };
  }, [id, expired]);

  React.useEffect(() => {
    if (!src || !geometry) return;
    let live = true;
    setLoaded("pending");
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (!live) return;
      const { w, h } = fitLongSide(img.naturalWidth || geometry.width, img.naturalHeight || geometry.height, MAX_SIDE);
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (!ctx) return setLoaded("error");
      ctx.drawImage(img, 0, 0, w, h);
      let original: ImageData;
      try {
        original = ctx.getImageData(0, 0, w, h);
      } catch {
        return setLoaded("error"); // cross-origin photo without CORS: colour cards only
      }
      const box = polygonBox(geometry.neck, w, h) ?? { x: 0, y: 0, w, h };
      const white = new ImageData(new Uint8ClampedArray(w * h * 4).fill(255), w, h);
      const weights = clothWeights(crop(drape(white, geometry, "#000000"), box).data);
      source.current = { original, box, base: crop(original, box), weights };
      cache.current.clear();
      setLoaded("ok");
    };
    img.onerror = () => live && setLoaded("error");
    img.src = src;
    return () => { live = false; };
  }, [src, geometry]);

  /** Box pixels for one colour (null = original), cached. */
  const patch = React.useCallback((hex: string | null): ImageData | null => {
    const s = source.current;
    if (!s) return null;
    if (!hex) return s.base;
    const key = hex.toLowerCase();
    let p = cache.current.get(key);
    if (!p) {
      p = new ImageData(blendCloth(s.base.data, s.weights, hex), s.box.w, s.box.h);
      cache.current.set(key, p);
      if (cache.current.size > CACHE_SIZE) cache.current.delete(cache.current.keys().next().value as string);
    }
    return p;
  }, []);

  /** Paint `hex` (null = original photo) into a canvas; the first paint also sizes it and draws the photo. */
  const paint = React.useCallback((canvas: HTMLCanvasElement | null, hex: string | null) => {
    const s = source.current;
    if (!canvas || !s) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (canvas.width !== s.original.width || canvas.height !== s.original.height || canvas.dataset.painted !== "1") {
      canvas.width = s.original.width;
      canvas.height = s.original.height;
      ctx.putImageData(s.original, 0, 0);
      canvas.dataset.painted = "1";
    }
    let p: ImageData | null = null;
    try {
      p = patch(hex);
    } catch {
      p = s.base; // not a hex colour: show the original rather than break the page
    }
    if (p) ctx.putImageData(p, s.box.x, s.box.y);
  }, [patch]);

  let status: DrapeStatus;
  if (expired) status = "expired";
  else if (!data?.media.front) status = "unavailable";
  else if (geometry === null) status = "no_geometry";
  else if (geometry === undefined || loaded === "pending") status = "loading";
  else status = loaded === "ok" ? "ready" : "unavailable";

  return { status, paint };
}
