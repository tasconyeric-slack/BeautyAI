"use client";

import { Focus, Minus, Plus, RotateCcw } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import type { PhotoRole } from "@/lib/api";
import { photos as copy } from "@/lib/copy/zh";
import {
  MIN_CROP_SIDE, ROTATE_MAX, scaleFraming, clampFraming, cropSize, cssTransform, defaultFraming, outputSize, type Framing,
} from "@/lib/framing";
import { cn } from "@/lib/utils";
import { CropperStage } from "./cropper-stage";

export function FramingEditor({ role, src, width: w, height: h, initial, suggestion, onCancel, onConfirm }: {
  role: PhotoRole; src: string; width: number; height: number; initial: Framing; suggestion?: Framing | null;
  onCancel: () => void; onConfirm: (f: Framing) => void | Promise<void>;
}) {
  const [f, setF] = React.useState<Framing>(() => clampFraming(w, h, initial));
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const dialog = React.useRef<HTMLDivElement>(null);
  const update = (next: Framing) => setF(clampFraming(w, h, next));
  const { cw, ch } = cropSize(w, h, f);
  const { ow, oh } = outputSize(cw, ch);
  const previewWidth = Math.min(112, 150 * cw / ch), previewHeight = previewWidth * ch / cw;

  React.useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.focus();
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, []);

  const onKey = (event: React.KeyboardEvent) => {
    if (event.key === "Escape" && !saving) { event.preventDefault(); onCancel(); return; }
    if (event.key === "Tab") {
      const items = [...dialog.current!.querySelectorAll<HTMLElement>('button:not(:disabled), input, summary, [tabindex="0"]')];
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first?.focus();
      }
    }
    if (event.target !== event.currentTarget) return;
    const step = cw * (event.shiftKey ? 0.05 : 0.01);
    const delta: Record<string, Partial<Framing>> = {
      ArrowLeft: { cx: f.cx - step }, ArrowRight: { cx: f.cx + step },
      ArrowUp: { cy: f.cy - step }, ArrowDown: { cy: f.cy + step },
    };
    if (["+", "=", "-"].includes(event.key)) {
      event.preventDefault(); setF(scaleFraming(w, h, f, event.key === "-" ? 1 / 1.1 : 1.1)); return;
    }
    if (delta[event.key]) { event.preventDefault(); update({ ...f, ...delta[event.key] }); }
  };

  const confirm = async () => {
    setSaving(true);
    setError(null);
    try { await onConfirm(f); }
    catch { setError("未能保存构图，请重试。"); setSaving(false); }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={`${copy.editor.title} · ${copy.roles[role].title}`}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" data-testid="framing-editor">
      <div ref={dialog} tabIndex={0} onKeyDown={onKey}
        className="max-h-[100dvh] w-full max-w-2xl overflow-y-auto rounded-t-[18px] bg-paper p-4 outline-none sm:rounded-[18px]">
        <h2 className="font-serif text-[18px] font-semibold">裁剪与构图 · {copy.roles[role].title}</h2>
        <p className="mb-3 mt-1 text-[12.5px] leading-5 text-ink-soft">拖动照片调整位置，拖动边角改变裁剪范围。滚轮或双指缩放，保留头发、额头、双耳和下巴。</p>
        <div className={cn(saving && "pointer-events-none opacity-60")}>
          <CropperStage src={src} width={w} height={h} framing={f} onChange={setF} />
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant="outline" aria-label="缩小" disabled={saving || (cw >= w || ch >= h)}
                onClick={() => setF(scaleFraming(w, h, f, 1 / 1.15))}><Minus /></Button>
              <Button size="sm" variant="outline" aria-label="放大" disabled={saving || (cw <= Math.min(w, MIN_CROP_SIDE) || ch <= Math.min(h, MIN_CROP_SIDE))}
                onClick={() => setF(scaleFraming(w, h, f, 1.15))}><Plus /></Button>
              <Button size="sm" variant="outline" disabled={saving}
                onClick={() => setF(defaultFraming(w, h))}><RotateCcw />保留原图</Button>
              {suggestion && <Button size="sm" variant="outline" disabled={saving} onClick={() => setF(suggestion)}><Focus />人脸居中</Button>}
            </div>
            <p className="text-[12px] leading-5 text-muted">{suggestion ? "已找到可用的人脸构图建议，可随时调整或保留原图。" : "已保留原图；可直接拖动边角裁剪。"}</p>
            <p className="tnum text-[12px] text-muted" data-testid="framing-output">{copy.editor.output} {ow}×{oh}px</p>
            {Math.min(ow, oh) < 600 && <p className="text-[12px] text-amber">{copy.editor.zoomNote}</p>}
          </div>
          <figure className="shrink-0">
            <div className="relative overflow-hidden rounded-[8px] bg-[#e6e3de]" data-testid="framing-result"
              style={{ width: previewWidth, height: previewHeight }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="将用于分析的裁剪预览" draggable={false} className="absolute left-0 top-0 max-w-none"
                style={{ width: w, height: h, transformOrigin: "0 0", transform: cssTransform(w, h, f, previewWidth) }} />
            </div>
            <figcaption className="mt-1 text-center text-[11px] text-muted">最终画面</figcaption>
          </figure>
        </div>
        <details className="mt-3 text-[12px] text-muted">
          <summary className="cursor-pointer py-1">旋转与精细调整</summary>
          <div className="mt-2 grid gap-3">
            <label className="flex items-center gap-2">{copy.editor.rotate}
              <input type="range" min={-ROTATE_MAX} max={ROTATE_MAX} step={0.5} value={f.rotate} disabled={saving} aria-label={copy.editor.rotate}
                onChange={(e) => update({ ...f, rotate: Number(e.target.value) })} className="min-w-0 flex-1" />
              <span className="tnum">{f.rotate.toFixed(1)}°</span>
            </label>
            <p>键盘：点击编辑器背景后用方向键移动，+ / − 缩放。Esc 取消。</p>
          </div>
        </details>
        {error && <p role="alert" className="mt-2 text-[13px] text-amber">{error}</p>}
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="outline" disabled={saving} onClick={onCancel}>{copy.editor.cancel}</Button>
          <Button variant="accent" disabled={saving} onClick={confirm} data-testid="framing-confirm">{saving ? "保存中…" : "确认构图并检查"}</Button>
        </div>
      </div>
    </div>
  );
}
