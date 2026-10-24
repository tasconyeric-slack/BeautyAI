"use client";

import * as React from "react";
import { backendFor } from "@/lib/api";
import type { FaceGeometry } from "@/lib/tint";
import { usePassport } from "@/lib/state/passport-store";

/** Loads the front photo + geometry once; `render(fn)` paints fn(original pixels, geometry) — deterministic, local. */
export function useTintCanvas() {
  const { id, data } = usePassport();
  const canvas = React.useRef<HTMLCanvasElement>(null);
  const original = React.useRef<ImageData | null>(null);
  const [geometry, setGeometry] = React.useState<FaceGeometry | null>(null);
  const [ready, setReady] = React.useState(false);
  const src = data && !data.media.expired ? data.media.front : null;
  React.useEffect(() => {
    let live = true;
    backendFor(id).geometry(id).then((g) => live && setGeometry(g)).catch(() => live && setGeometry(null));
    return () => { live = false; };
  }, [id]);
  React.useEffect(() => {
    if (!src || !geometry) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const c = canvas.current;
      if (!c) return;
      const w = img.naturalWidth || geometry.width;
      const h = img.naturalHeight || geometry.height;
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, w, h);
      try {
        original.current = ctx.getImageData(0, 0, w, h);
        setReady(true);
      } catch {
        setReady(false); // cross-origin image without CORS: show the photo without try-on
      }
    };
    img.src = src;
  }, [src, geometry]);
  const render = React.useCallback((fn: ((src: ImageData, g: FaceGeometry) => ImageData) | null) => {
    const c = canvas.current;
    const o = original.current;
    if (!c || !o || !geometry) return;
    const ctx = c.getContext("2d");
    ctx?.putImageData(fn ? fn(o, geometry) : o, 0, 0);
  }, [geometry]);
  return { canvas, ready, available: Boolean(src && geometry), geometry, render };
}
