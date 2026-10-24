"use client";

/** Draws one saved look on the person's own front photo with the Look Studio's pipeline (useStudioCanvas + compose):
 *  the AI hair preview laid onto the original, then local colour layers on top. Returns the canvas ref and an honest
 *  per-layer account of what was generated, what was simulated locally and what could not be drawn. */
import * as React from "react";
import type { Passport, PassportResponse } from "@/lib/api";
import { backendFor } from "@/lib/api";
import type { FaceGeometry } from "@/lib/tint";
import type { BlushPlacement } from "@/lib/tint";
import { EMPTY_LOOK, hairTargetId, layersForLook, restoreLook, type HairTier } from "@/components/studio/compose";
import { useStudioCanvas } from "@/components/studio/use-studio-canvas";
import { layerNotes, renderLabel, type LayerNote } from "./diff";
import type { LookLike } from "./names";

export interface LookRender {
  canvas: React.RefObject<HTMLCanvasElement | null>;
  status: ReturnType<typeof useStudioCanvas>["status"];
  /** Image to show when the browser cannot read pixels (the generated hair picture or the original). */
  fallbackSrc: string | null;
  notes: LayerNote[];
  label: string;
  /** A JPEG data URL of what is on screen, or null when nothing readable is drawn. Only called for a consented export. */
  snapshot: () => string | null;
}

export function useLookRender(opts: {
  id: string; passport: Passport; data: PassportResponse; expired: boolean; geometry: FaceGeometry | null | undefined; look: LookLike | null;
}): LookRender {
  const { id, passport, data, expired, geometry } = opts;
  const look = React.useMemo(() => restoreLook({ ...EMPTY_LOOK, ...(opts.look ?? {}), hair: (opts.look?.hair ?? null) as HairTier | null }), [opts.look]);
  const previews = data.partial.previews;
  const hairTarget = hairTargetId(look.hair, look.hairColor);
  const pv = hairTarget ? previews.find((p) => p.kind === "hair" && p.target_id === hairTarget) ?? null : null;
  const hairReady = React.useMemo(() => pv?.status === "succeeded" && pv.after_url ? { src: pv.after_url, box: pv.crop_box ?? null, target: pv.target_id } : null, [pv]);
  const dir = look.hairColor !== null ? passport.analysis.color_profile.hair_color_directions[look.hairColor] : null;
  const hairHex = look.hairHex ?? dir?.hex ?? null;
  const md = passport.analysis.makeup_direction;
  const recommendedBlush = React.useMemo(() => ({ hex: md.blush.hex, placement: md.blush.placement as BlushPlacement }), [md]);
  const layers = React.useMemo(() => layersForLook(look, recommendedBlush), [look, recommendedBlush]);
  const front = !expired ? data.media.front : null;
  const r = useStudioCanvas({ id, front, expired, geometry, hair: hairReady, layers, hex: hairHex, strength: look.hairStrength ?? 0.8,
    holding: false, fixture: backendFor(id).kind === "fixture" });

  const canvasState = r.status === "ready" ? "ready" : r.status === "plain" ? "plain" : r.status === "loading" ? "loading" : "unavailable";
  const notes = React.useMemo(() => layerNotes(passport, look, {
    expired, canvas: canvasState, geometry, maskState: r.maskState, makeup: r.makeup, eyewearReason: r.eyewearReason,
    hairPreview: !pv ? "none" : pv.status === "skipped" ? "failed" : pv.status,
    hairShapeLoaded: r.hairState === "ready" || (r.status === "plain" && Boolean(hairReady)),
  }), [passport, look, expired, canvasState, geometry, r.maskState, r.makeup, r.eyewearReason, pv, r.hairState, r.status, hairReady]);

  const snapshot = React.useCallback(() => {
    try { return r.status === "ready" && r.canvas.current ? r.canvas.current.toDataURL("image/jpeg", 0.9) : null; } catch { return null; }
  }, [r.status, r.canvas]);
  return { canvas: r.canvas, status: r.status, fallbackSrc: front ? hairReady?.src ?? front : null, notes, label: renderLabel(notes), snapshot };
}
