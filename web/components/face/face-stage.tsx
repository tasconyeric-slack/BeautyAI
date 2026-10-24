"use client";

import * as React from "react";
import { Stage } from "@/components/ds";
import { Portrait } from "@/components/passport/portrait";
import { cn } from "@/lib/utils";
import { LAYERS, type FaceOverlay, type Label, type LayerKey } from "./face-model";

const STROKE = { stroke: "var(--ap-amber)", strokeWidth: 1.5, fill: "none", vectorEffect: "non-scaling-stroke" as const };

function Lines({ o, layer }: { o: FaceOverlay; layer: LayerKey }) {
  const W = 1000;
  const H = W / o.aspect;
  const X = (x: number) => x * W;
  const Y = (y: number) => y * H;
  const poly = (pts: readonly (readonly [number, number])[]) => pts.map(([x, y]) => `${X(x)},${Y(y)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="pointer-events-none absolute inset-0 size-full" aria-hidden
      data-layer={layer}>
      <g {...STROKE} key={layer} className="ap-rise" style={{ filter: "drop-shadow(0 0 1.5px rgba(255,255,255,.55))" }}>
        {layer === "thirds" && o.thirds?.lines.map((l, i) => (
          <line key={i} x1={X(l.x1)} x2={X(l.x2)} y1={Y(l.y)} y2={Y(l.y)} />
        ))}
        {layer === "fifths" && o.fifths && (
          <>
            {o.fifths.lines.map((l, i) => <line key={i} x1={X(l.x)} x2={X(l.x)} y1={Y(l.y1)} y2={Y(l.y2)} />)}
            <line x1={X(o.fifths.base.x1)} x2={X(o.fifths.base.x2)} y1={Y(o.fifths.base.y)} y2={Y(o.fifths.base.y)} strokeDasharray="4 4" opacity={0.8} />
          </>
        )}
        {layer === "contour" && (
          <>
            <polygon points={poly(o.contour.outline)} />
            {o.contour.widths.map((l, i) => (
              <line key={i} x1={X(l.x1)} x2={X(l.x2)} y1={Y(l.y)} y2={Y(l.y)} strokeDasharray={i === 1 ? undefined : "6 4"} />
            ))}
          </>
        )}
        {layer === "features" && o.features.map((pts, i) => <polygon key={i} points={poly(pts)} />)}
      </g>
    </svg>
  );
}

function Tags({ labels, center }: { labels: Label[]; center?: boolean }) {
  return (
    <>
      {labels.map((l) => (
        <span key={`${l.text}-${l.x}-${l.y}`}
          className={cn("tnum pointer-events-none absolute -translate-y-1/2 whitespace-nowrap rounded-[3px] bg-black/60 px-1.5 py-px text-[10.5px] leading-4 text-white/95",
            center && "-translate-x-1/2")}
          style={{ left: `${l.x * 100}%`, top: `${l.y * 100}%` }}>
          {l.text}
        </span>
      ))}
    </>
  );
}

/** The front photo on the dark stage with one amber measurement layer at a time (D4: 每层只画一类信息). */
export function FaceStage({ src, overlay, expired }: { src: string | null; overlay: FaceOverlay | null; expired: boolean }) {
  const available = LAYERS.filter((l) => {
    if (l.key === "none") return true;
    if (!overlay) return false;
    if (l.key === "thirds") return Boolean(overlay.thirds);
    if (l.key === "fifths") return Boolean(overlay.fifths);
    return true;
  });
  const [layer, setLayer] = React.useState<LayerKey>("thirds");
  const active = available.some((l) => l.key === layer) ? layer : available[0].key;
  const caption = LAYERS.find((l) => l.key === active)?.caption;
  const canDraw = Boolean(src && overlay && !expired);

  return (
    <div>
      {canDraw && overlay ? (
        <Stage className="relative mx-auto max-w-sm overflow-hidden rounded-[14px]" style={{ aspectRatio: `${overlay.aspect}` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src!} alt="你的正脸照片，叠加比例线" className="absolute inset-0 block size-full object-cover" />
          {active !== "none" && <Lines o={overlay} layer={active} />}
          {active === "thirds" && overlay.thirds && <Tags labels={overlay.thirds.labels} />}
          {active === "fifths" && overlay.fifths && <Tags labels={overlay.fifths.labels} center />}
          {active === "contour" && <Tags labels={overlay.contour.labels} />}
        </Stage>
      ) : (
        <Portrait className="mx-auto max-w-sm" />
      )}

      {canDraw ? (
        <>
          <div role="group" aria-label="照片上的标注图层" className="mx-auto mt-3 flex max-w-sm gap-1 rounded-[10px] border border-rule bg-paper-raised p-1">
            {available.map((l) => (
              <button key={l.key} type="button" aria-pressed={active === l.key} onClick={() => setLayer(l.key)}
                className={cn("min-h-11 flex-1 rounded-[7px] px-1 text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--ap-primary)]",
                  active === l.key ? "bg-stage font-medium text-stage-ink" : "text-ink-soft hover:bg-paper-sunk")}>
                {l.label}
              </button>
            ))}
          </div>
          <p className="mx-auto mt-2 max-w-sm text-[12.5px] leading-6 text-muted" aria-live="polite">{caption}</p>
        </>
      ) : (
        <p className="mx-auto mt-2 max-w-sm text-[12.5px] leading-6 text-muted">
          {expired ? "照片已删除，比例线不再显示；下面的测量数字仍然保留。" : "比例线准备中，下面的测量数字已经可以查看。"}
        </p>
      )}
    </div>
  );
}
