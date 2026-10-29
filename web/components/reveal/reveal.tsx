"use client";

import { Check } from "lucide-react";
import * as React from "react";
import { Stage } from "@/components/ds";
import Link from "next/link";
import { journey } from "@/lib/copy/journey";
import { api, backendFor, type PassportResponse } from "@/lib/api";
import { reveal as copy } from "@/lib/copy/zh";
import type { FaceGeometry } from "@/lib/tint";
import { usePassport } from "@/lib/state/passport-store";
import s from "@/components/journey/journey.module.css";
import { cn } from "@/lib/utils";

export const localPhotoKey = (id: string) => `ap_local_photo:${id}`;

/** The photo the user just picked (kept in this tab only) — shown while the server keeps it out of reach. */
function useLocalPhoto(id: string): string | null {
  const [src, setSrc] = React.useState<string | null>(null);
  React.useEffect(() => {
    try {
      setSrc(sessionStorage.getItem(localPhotoKey(id)));
    } catch {
      setSrc(null);
    }
  }, [id]);
  return src;
}

function useGeometry(id: string, ready: boolean): FaceGeometry | null {
  const [g, setG] = React.useState<FaceGeometry | null>(null);
  React.useEffect(() => {
    if (!ready || g) return;
    let live = true;
    backendFor(id).geometry(id).then((x) => live && setG(x)).catch(() => {});
    return () => { live = false; };
  }, [id, ready, g]);
  return g;
}

/** Which of the four stages is running (0–3), straight from the backend's stage/status (D29). No timers, no padding.
 *  pipeline stages: qc → anchors → color → quick → analysis → rules → assemble. */
export function revealStage(r: PassportResponse | null): number {
  if (!r) return 0;
  if (r.status === "full_ready") return 4;
  const anchors = Boolean(r.partial.anchors || r.partial.input_quality);
  const s = r.stage ?? "";
  if (s === "rules" || s === "assemble" || s === "done" || r.partial.analysis === "ready") return 3;
  if (s === "analysis" || r.partial.quick) return 2;
  if (anchors || s === "color" || s === "quick") return 1;
  return 0;
}

/** Only trace measured geometry. Older geometry without named points keeps its actual polygon bounds. */
function MeasureOverlay({ g }: { g: FaceGeometry }) {
  const ys = (pts: readonly (readonly [number, number])[]) => pts.map((p) => p[1]);
  const xs = (pts: readonly (readonly [number, number])[]) => pts.map((p) => p[0]);
  const brow = Math.min(...ys(g.brow_l), ...ys(g.brow_r));
  const lower = g.points?.subnasale?.[1] ?? Math.max(...ys(g.eye_l), ...ys(g.eye_r));
  const chin = Math.max(...ys(g.jaw));
  const top = Math.min(...ys(g.jaw));
  const eyeX = [Math.min(...xs(g.eye_l)), Math.max(...xs(g.eye_l)), Math.min(...xs(g.eye_r)), Math.max(...xs(g.eye_r))];
  const faceL = Math.min(...xs(g.jaw));
  const faceR = Math.max(...xs(g.jaw));
  const outline = g.jaw.map((p) => `${p[0] * 100},${p[1] * 125}`).join(" ");
  const dots = [...g.eye_l, ...g.eye_r, ...g.brow_l, ...g.brow_r, ...g.lip_outer].filter((_, i) => i % 2 === 0);
  return (
    <svg viewBox="0 0 100 125" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 size-full" aria-hidden>
      <g stroke="var(--ap-amber)" strokeWidth="0.35" fill="none" vectorEffect="non-scaling-stroke">
        <polygon points={outline} pathLength={1} className="ap-draw" opacity="0.9" />
        {[top, brow, ...(g.points?.subnasale ? [lower] : []), chin].map((y, i) => (
          <line key={i} x1={faceL * 100 - 4} x2={faceR * 100 + 4} y1={y * 125} y2={y * 125} pathLength={1} className="ap-draw"
            style={{ animationDelay: `${0.15 * i}s` }} strokeDasharray="1.5 1" />
        ))}
        {[faceL, ...eyeX, faceR].map((x, i) => (
          <line key={`v${i}`} x1={x * 100} x2={x * 100} y1={brow * 125 - 3} y2={lower * 125} pathLength={1} className="ap-draw"
            style={{ animationDelay: `${0.5 + 0.08 * i}s` }} opacity="0.7" />
        ))}
      </g>
      <g fill="var(--ap-amber)">
        {dots.map((p, i) => (
          <circle key={i} cx={p[0] * 100} cy={p[1] * 125} r="0.45" className="ap-rise" style={{ animationDelay: `${0.9 + i * 0.01}s` }} />
        ))}
      </g>
    </svg>
  );
}

export function Reveal() {
  const { id, data } = usePassport();
  const local = useLocalPhoto(id);
  const anchorsReady = Boolean(data?.partial.anchors || data?.partial.input_quality);
  const geometry = useGeometry(id, anchorsReady);
  const tracked = React.useRef(false);
  React.useEffect(() => {
    if (data?.partial.quick && !tracked.current) {
      tracked.current = true;
      api.track("quick_ready", { passport_id: id });
    }
  }, [data?.partial.quick, id]);
  const photo = data?.media.front ?? local;
  const failed = data?.status === "analysis_failed";
  const current = revealStage(data);
  const title = failed ? copy.failed : copy.stages[Math.min(current, copy.stages.length - 1)];
  return (
    <div className={`${s.surface} ${s.revealSurface}`}><div className={s.revealLayout}>
      <Stage className="relative mx-auto w-full max-w-[min(100%,calc(44dvh*0.8))] overflow-hidden rounded-[14px] md:max-w-none">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="你上传的正脸照片" className="block aspect-[4/5] w-full object-cover" />
        ) : <div className="aspect-[4/5] w-full" />}
        {geometry ? <MeasureOverlay g={geometry} /> : !failed && (
          <span aria-hidden className={s.waitingLight} />
        )}
      </Stage>
      <div className="mt-6 md:mt-2">
        <p className="text-[11px] tracking-[0.18em] text-muted">{copy.kicker}</p>
        <h1 aria-live="polite" className="mb-5 mt-1 font-serif text-[22px] font-semibold leading-snug sm:text-[24px]">{title}</h1>
        <ol className="space-y-0 border-t border-rule" aria-label="分析进度">
          {copy.stages.map((label, i) => {
            const state = failed && i === current ? "failed" : i < current ? "done" : i === current ? "active" : "pending";
            return (
              <li key={label} aria-current={state === "active" ? "step" : undefined}
                className={cn("flex items-center gap-3 border-b border-rule py-3.5 text-[14px]",
                  state === "pending" && "text-muted", state === "active" && "font-medium")}>
                <span aria-hidden className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border",
                  state === "done" ? "border-accent bg-accent text-[var(--ap-on-primary)]" : state === "active" ? "border-amber" : state === "failed" ? "border-[#b4442f]" : "border-rule-strong")}>
                  {state === "done" ? <Check className="size-3" /> : state === "active" ? <span className="ap-pulse size-2 rounded-full bg-amber" /> : null}
                </span>
                <span>{label}</span>
                <span className="sr-only">{state === "done" ? "（已完成）" : state === "active" ? "（进行中）" : state === "failed" ? "（中断）" : ""}</span>
              </li>
            );
          })}
        </ol>
        {failed ? (
          <div className="mt-5"><p className="text-[13px] leading-6">{journey.failedAnalysis}</p><Link className="mt-3 inline-flex min-h-11 items-center rounded-full border border-rule-strong px-5 text-[14px]" href="/start">{journey.restartAnalysis}</Link></div>
        ) : (
          <p className="mt-5 text-[13px] leading-6 text-ink-soft">{copy.readyNote}</p>
        )}
        <p className="mt-2 text-[12px] leading-6 text-muted">{copy.privacyNote}</p>
        {!failed && <p className={s.waitingNote}>{geometry ? "正在沿照片中的真实关键区域建立解读。" : "照片准备好后，测量会从可识别的区域开始。"}</p>}
      </div>
    </div></div>
  );
}
