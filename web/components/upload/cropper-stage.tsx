"use client";

import * as React from "react";
import type Cropper from "cropperjs";
import {
  clampFraming, cropSize, scaleFraming, framingFromSelection, imageMatrix, selectionForFraming, type CropRect, type Framing,
} from "@/lib/framing";

// Cropper.js owns all pointer, wheel, pinch and handle gestures. Only source-coordinate conversion lives here.
const template = `<cropper-canvas background style="height:100%;touch-action:none">
  <cropper-image scalable translatable></cropper-image>
  <cropper-shade></cropper-shade>
  <cropper-handle action="move" plain></cropper-handle>
  <cropper-selection resizable precise outlined theme-color="#fff">
    <cropper-grid rows="3" columns="3" covered></cropper-grid>
    <cropper-handle action="move" plain style="cursor:grab"></cropper-handle>
    ${["n", "e", "s", "w", "ne", "nw", "se", "sw"].map((side) => {
      const edges = `${side.includes("n") ? "top:-14px;" : ""}${side.includes("s") ? "bottom:-14px;" : ""}${side.includes("e") ? "right:-14px;" : ""}${side.includes("w") ? "left:-14px;" : ""}`;
      const size = side.length === 2 ? "width:28px;height:28px;" : side === "n" || side === "s" ? "height:28px;" : "width:28px;";
      return `<cropper-handle action="${side}-resize" style="--theme-color:#fff;${size}${edges}"></cropper-handle>`;
    }).join("")}
  </cropper-selection>
</cropper-canvas>`;

export function CropperStage({ src, width: w, height: h, framing, onChange }: {
  src: string; width: number; height: number; framing: Framing; onChange: (f: Framing) => void;
}) {
  const host = React.useRef<HTMLDivElement>(null);
  const instance = React.useRef<Cropper | null>(null);
  const current = React.useRef(framing);
  const notify = React.useRef(onChange);
  const emitted = React.useRef<Framing | null>(null);
  const apply = React.useRef<((f: Framing) => void) | null>(null);
  const [ready, setReady] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  current.current = framing;
  notify.current = onChange;

  React.useEffect(() => {
    let disposed = false;
    let observer: ResizeObserver | undefined;
    setReady(false);
    setFailed(false);
    void (async () => {
      const { default: Cropper } = await import("cropperjs");
      if (disposed || !host.current) return;
      const root = host.current;
      const original = new Image();
      original.src = src;
      const cropper = new Cropper(original, { container: root, template });
      instance.current = cropper;
      const image = cropper.getCropperImage()!;
      const selection = cropper.getCropperSelection()!;
      // On cached sources $ready() can resolve before the native load event re-centres the image.
      // Finish that initialization before applying the saved crop or listening for user transforms.
      const nativeImage = image.shadowRoot!.querySelector("img")!;
      const loaded = new Promise<void>((resolve, reject) => {
        nativeImage.addEventListener("load", () => resolve(), { once: true });
        nativeImage.addEventListener("error", () => reject(new Error("Image load failed")), { once: true });
      });
      await Promise.all([image.$ready(), loaded]);
      if (disposed) return;
      let syncing = false;
      const rect = (): CropRect => ({ x: selection.x, y: selection.y, width: selection.width, height: selection.height });
      const setRect = (r: CropRect) => selection.$change(r.x, r.y, r.width, r.height);
      const emit = (f: Framing) => {
        current.current = f;
        emitted.current = f;
        notify.current(f);
      };
      const layout = () => {
        const f = current.current;
        const scale = Math.min(root.clientWidth / w, root.clientHeight / h) * 0.85;
        const { cw, ch } = cropSize(w, h, f);
        const r = { x: (root.clientWidth - cw * scale) / 2, y: (root.clientHeight - ch * scale) / 2,
          width: cw * scale, height: ch * scale };
        syncing = true;
        setRect(r);
        image.$setTransform(imageMatrix(w, h, f, r));
        syncing = false;
      };
      // External changes (scale/reset/rotation) retain the visible selection centre and scale.
      apply.current = (f) => {
        const scale = Math.hypot(...image.$getTransform().slice(0, 2));
        const { cw, ch } = cropSize(w, h, f);
        const old = rect();
        const r = { x: old.x + (old.width - cw * scale) / 2, y: old.y + (old.height - ch * scale) / 2,
          width: cw * scale, height: ch * scale };
        if (r.width > root.clientWidth * 0.95 || r.height > root.clientHeight * 0.95) { layout(); return; }
        syncing = true;
        setRect(r);
        image.$setTransform(imageMatrix(w, h, f, r));
        syncing = false;
      };
      image.addEventListener("transform", (event) => {
        if (syncing) return;
        event.preventDefault();
        const matrix = (event as CustomEvent<{ matrix: number[] }>).detail.matrix;
        const candidate = framingFromSelection(w, h, rect(), matrix);
        const oldScale = Math.hypot(...image.$getTransform().slice(0, 2));
        const factor = Math.hypot(...matrix.slice(0, 2)) / oldScale;
        const f = clampFraming(w, h, { ...scaleFraming(w, h, current.current, factor),
          cx: candidate.cx, cy: candidate.cy, rotate: candidate.rotate });
        // Enforce source bounds without a second, slightly different crop calculation.
        syncing = true;
        image.$setTransform(imageMatrix(w, h, f, rect()));
        syncing = false;
        emit(f);
      });
      selection.addEventListener("change", (event) => {
        if (syncing || event.target !== selection) return;
        event.preventDefault();
        const r = (event as CustomEvent<CropRect>).detail;
        if (r.width <= 0 || r.height <= 0) return;
        const matrix = image.$getTransform();
        const f = framingFromSelection(w, h, r, matrix);
        const bounded = selectionForFraming(w, h, f, matrix);
        // Stop at source/minimum bounds rather than moving the three untouched edges.
        if (["x", "y", "width", "height"].some((key) =>
          Math.abs(bounded[key as keyof CropRect] - r[key as keyof CropRect]) > 0.01)) return;
        syncing = true;
        setRect(bounded);
        syncing = false;
        emit(f);
      });
      layout();
      observer = new ResizeObserver(layout);
      observer.observe(root);
      setReady(true);
    })().catch(() => { if (!disposed) setFailed(true); });
    return () => {
      disposed = true;
      observer?.disconnect();
      apply.current = null;
      instance.current?.destroy();
      instance.current = null;
    };
  }, [src, w, h]);

  React.useEffect(() => {
    if (emitted.current !== framing) apply.current?.(framing);
  }, [framing]);

  return <div className="relative">
    <div ref={host} role="application" aria-label="拖动照片调整位置，拖动边角裁剪，滚轮或双指缩放"
      className="h-[min(48dvh,380px)] min-h-52 w-full overflow-hidden rounded-[12px] bg-[#272727]"
      data-testid="framing-viewport" data-ready={ready} />
    {!ready && <p role="status" className="absolute inset-0 grid place-items-center bg-paper text-[13px]">
      {failed ? "照片编辑器未能载入，请取消后重试。" : "正在载入照片…"}
    </p>}
  </div>;
}
