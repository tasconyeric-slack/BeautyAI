'use client';
import * as React from 'react';
import { prepareHair, recolorHair, type PreparedHair } from '@/lib/tint/hair';
import { makeupAvailability, NO_MAKEUP } from '@/lib/tint/makeup';
import type { FaceGeometry } from '@/lib/tint';
import { apiUrl } from '@/lib/utils';
import { composeLayers, cropRect, type LocalLayers } from './compose';

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img); img.onerror = () => reject(new Error('image')); img.src = src;
  });
}
function context(w: number, h: number) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('canvas');
  return ctx;
}
type Base = { key: string; data: ImageData; hair: PreparedHair | null };
/** All pixels stay in memory; the cache is scoped to one mounted passport/photo. */
export function useStudioCanvas(opts: {
  id: string; front: string | null; expired: boolean; geometry: FaceGeometry | null | undefined;
  hair: { src: string; box: readonly number[] | null; target: string } | null;
  layers: LocalLayers; hex: string | null; strength: number; holding: boolean; fixture: boolean;
}) {
  const { id, front, expired, geometry, hair, layers, hex, strength, holding, fixture } = opts;
  const canvas = React.useRef<HTMLCanvasElement>(null);
  const original = React.useRef<ImageData | null>(null);
  const cache = React.useRef(new Map<string, Base>());
  const [status, setStatus] = React.useState<'loading' | 'ready' | 'plain' | 'expired' | 'unavailable'>('loading');
  const [base, setBase] = React.useState<Base | null>(null);
  const [hairState, setHairState] = React.useState<'none' | 'loading' | 'ready' | 'error'>('none');
  const [maskState, setMaskState] = React.useState<'loading' | 'ready' | 'error'>('loading');
  const key = `${id}|${front}|${hair ? `${hair.src}|${hair.box?.join(',')}` : 'original'}`;
  const src = hair?.src, boxKey = hair?.box?.join(','), target = hair?.target ?? 'current';
  React.useEffect(() => {
    original.current = null; cache.current.clear(); setBase(null);
    if (canvas.current) { canvas.current.width = 0; canvas.current.height = 0; }
    if (expired || !front) { setStatus(expired ? 'expired' : 'unavailable'); return; }
    let live = true; setStatus('loading');
    loadImage(front).then(img => {
      if (!live) return;
      const scale = Math.min(1, 900 / Math.max(img.naturalWidth, img.naturalHeight));
      try {
        const ctx = context(Math.round(img.naturalWidth * scale), Math.round(img.naturalHeight * scale));
        ctx.drawImage(img, 0, 0, ctx.canvas.width, ctx.canvas.height);
        original.current = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height); setStatus('ready');
      } catch { setStatus('plain'); }
    }, () => live && setStatus('unavailable'));
    return () => { live = false; original.current = null; cache.current.clear(); };
  }, [id, front, expired]);
  React.useEffect(() => {
    const o = original.current;
    if (expired || status !== 'ready' || !o) return;
    const cached = cache.current.get(key);
    if (cached) { setBase(cached); setMaskState(cached.hair ? 'ready' : 'error'); setHairState(src ? 'ready' : 'none'); return; }
    let live = true; const controller = new AbortController();
    setMaskState('loading'); setHairState(src ? 'loading' : 'none');
    (async () => {
      let data = o;
      if (src) {
        try {
          const img = await loadImage(src); if (!live) return;
          const ctx = context(o.width, o.height); ctx.putImageData(o, 0, 0);
          const r = cropRect(boxKey ? boxKey.split(',').map(Number) : [0, 0, 1, 1], o.width, o.height);
          ctx.drawImage(img, r.x, r.y, r.w, r.h);
          data = ctx.getImageData(0, 0, o.width, o.height); setHairState('ready');
        } catch { if (live) { setHairState('error'); setMaskState('error'); setBase(null); } return; }
      }
      if (!live) return;
      setBase({ key, data, hair: null });
      let prepared: PreparedHair | null = null;
      try {
        if (fixture) throw new Error('Illustrations are not segmented photographs.');
        const response = await fetch(apiUrl(`/api/passport/${id}/hair-mask?target=${target}`)!, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('mask unavailable');
        const url = URL.createObjectURL(await response.blob());
        try {
          const mask = await loadImage(url); if (!live) return;
          if (mask.naturalWidth !== data.width || mask.naturalHeight !== data.height) throw new Error('mask dimensions');
          const ctx = context(data.width, data.height); ctx.drawImage(mask, 0, 0);
          const rgba = ctx.getImageData(0, 0, data.width, data.height).data;
          const alpha = new Uint8ClampedArray(data.width * data.height);
          for (let p = 0; p < alpha.length; p++) alpha[p] = rgba[p * 4];
          prepared = prepareHair(data, alpha);
        } finally { URL.revokeObjectURL(url); }
      } catch { /* Keep the photograph, with an explicit unavailable state. */ }
      if (!live) return;
      const result = { key, data, hair: prepared };
      cache.current.set(key, result); setBase(result); setMaskState(prepared ? 'ready' : 'error');
    })();
    return () => { live = false; controller.abort(); };
  }, [id, front, expired, key, src, boxKey, target, status, fixture]);
  const makeup = React.useMemo(() => base?.key === key && geometry ? makeupAvailability(base.data, geometry) : NO_MAKEUP,
    [base, key, geometry]);
  React.useLayoutEffect(() => {
    const c = canvas.current, o = original.current;
    if (!c || !o || status !== 'ready' || expired) return;
    c.width = o.width; c.height = o.height;
    const ctx = c.getContext('2d'); if (!ctx) return;
    let out = holding || base?.key !== key ? o : base.data;
    if (!holding && base?.key === key) {
      if (hex && base.hair) out = recolorHair(base.hair, hex, strength);
      if (geometry) out = composeLayers(out, geometry, layers, makeup);
    }
    ctx.putImageData(out, 0, 0);
  }, [base, key, geometry, layers, hex, strength, holding, status, expired, makeup]);
  return { canvas, status, hairState, makeup, maskState: base?.key === key ? maskState : 'loading',
    approximate: Boolean(hex && base?.key === key && base.hair?.approximate(hex)) };
}
