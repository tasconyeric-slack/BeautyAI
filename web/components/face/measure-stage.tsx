"use client";

import * as React from "react";
import { HoldButton, Stage, useHold } from "@/components/ds";
import { Portrait } from "@/components/passport/portrait";
import { arcPath, type MetricOverlay } from "./measure-model";

const W = 1000;

/** The front photo with the selected metric's own geometry: measured segments solid amber, reference segments dashed,
 *  angle arcs at their vertex, sampled points as dots. One "按住看原图" control hides the lines (D31). */
export function MeasureStage({ src, overlay, tag, title, expired }: {
  src: string | null;
  overlay: MetricOverlay | null;
  tag: string | null;
  title: string | null;
  expired: boolean;
}) {
  const hold = useHold();
  const canDraw = Boolean(src && !expired && overlay);
  if (!canDraw || !overlay) {
    return (
      <div>
        {src && !expired ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="你的正脸照片" className="mx-auto block max-w-sm rounded-[14px]" />
        ) : (
          <Portrait className="mx-auto max-w-sm" />
        )}
        <p className="mx-auto mt-2 max-w-sm text-[12.5px] leading-6 text-muted" data-testid="stage-note">
          {expired ? "照片已按承诺删除，测量线不再显示；下面的测量数字仍然保留。"
            : src ? "这一项没有可画在照片上的测量线。" : "测量线准备中，下面的测量数字已经可以查看。"}
        </p>
      </div>
    );
  }
  const H = W / overlay.aspect;
  const X = (x: number) => x * W;
  const Y = (y: number) => y * H;
  return (
    <div>
      <Stage className="relative mx-auto max-w-sm overflow-hidden rounded-[14px]" style={{ aspectRatio: `${overlay.aspect}` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src!} alt="你的正脸照片，叠加所选项目的测量线" className="absolute inset-0 block size-full object-cover" />
        {!hold.holding && (
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="pointer-events-none absolute inset-0 size-full"
            aria-hidden data-measure-overlay={title ?? ""}>
            <g key={title ?? ""} className="ap-rise" style={{ filter: "drop-shadow(0 0 1.5px rgba(0,0,0,.55))" }}>
              {overlay.outline && (
                <polygon points={overlay.outline.map(([x, y]) => `${X(x)},${Y(y)}`).join(" ")} fill="none"
                  stroke="rgba(255,255,255,.55)" strokeWidth={1} strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />
              )}
              {overlay.segments.map((s, i) => (
                <line key={i} x1={X(s.a[0])} y1={Y(s.a[1])} x2={X(s.b[0])} y2={Y(s.b[1])} data-role={s.role}
                  stroke={s.role === "measure" ? "var(--ap-amber)" : "rgba(255,255,255,.8)"}
                  strokeWidth={s.role === "measure" ? 2 : 1.2} strokeDasharray={s.role === "measure" ? undefined : "6 5"}
                  strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              ))}
              {overlay.arcs.map((a, i) => (
                <path key={i} d={arcPath(a, W, H)} fill="none" stroke="var(--ap-amber)" strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
              ))}
              {[...overlay.segments.flatMap((s) => (s.role === "measure" ? [s.a, s.b] : [])), ...overlay.dots].map(([x, y], i) => (
                <circle key={i} cx={X(x)} cy={Y(y)} r={5.5} fill="var(--ap-amber)" stroke="#fff" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
              ))}
            </g>
          </svg>
        )}
        {!hold.holding && tag && overlay.tag && (
          <span className="tnum pointer-events-none absolute -translate-x-1/2 -translate-y-[140%] whitespace-nowrap rounded-[4px] bg-black/70 px-1.5 py-px text-[11px] leading-4 text-white"
            style={{ left: `${Math.min(92, Math.max(8, overlay.tag[0] * 100))}%`, top: `${Math.min(96, Math.max(6, overlay.tag[1] * 100))}%` }}>
            {tag}
          </span>
        )}
      </Stage>
      <div className="mx-auto mt-2 flex max-w-sm items-center justify-between gap-3">
        <p className="min-w-0 text-[12.5px] leading-5 text-muted" aria-live="polite">
          {title ? <>正在显示：<span className="text-ink">{title}</span></> : null}
        </p>
        <HoldButton {...hold} />
      </div>
    </div>
  );
}
