"use client";
/** Hero signature motion: the same person's two original photographs — front and the QC-accepted profile90 — each
 *  carrying its own measured landmarks. A view change moves the photo, its SVG coordinate system and its tags as one
 *  plate (masked directional wipe + short push); there is no synthesized rotation, intermediate angle or morph.
 *
 *  Timeline: the approved front draw → measured profile, played once on load (skipped for reduced motion, paused
 *  when the hero is off screen or the tab is hidden). It then rests; readers switch views, pause or replay. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { arcPath } from "@/components/face/measure-model";
import { useSize } from "./use-size";
import { Bracket, smoothPath } from "./overlay";
import type { HeroView, ProfileMark, ProfileView } from "./model";
import s from "./home.module.css";
import x from "./signature.module.css";

export type View = "front" | "profile";
type Play = "playing" | "paused" | "done" | "off";

/** Milliseconds. The wipe itself is CSS (--wipe in signature.module.css); keep these in step with it. */
export const TIMING = {
  /** Approved front draw finishes at ~3.3 s; hold it briefly before turning. */
  firstTurn: 4600,
  /** Wipe + profile lines (~1.05 s + 2.3 s). */
  profileSettle: 3500,
  /** Wipe back + front lines on replay. */
  frontSettle: 4300,
} as const;

/** A step returning false is retried after HOLD ms, delaying everything after it. */
interface Step { at: number; run: () => boolean | void }
const HOLD = 300;

/** Pausable one-shot timeline: steps fire in order at `at` ms of *playing* time. */
function useTimeline() {
  const steps = useRef<Step[]>([]);
  const elapsed = useRef(0);
  const started = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const running = useRef(false);

  const clear = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  const tick = useCallback(() => {
    clear();
    if (!running.current) return;
    let now = elapsed.current + (performance.now() - started.current);
    while (steps.current.length && steps.current[0].at <= now) {
      if (steps.current[0].run() === false) {
        // Not ready (e.g. photo still decoding): hold the whole remaining timeline and try again shortly.
        elapsed.current -= HOLD;
        now -= HOLD;
        break;
      }
      steps.current.shift();
    }
    if (!steps.current.length) { running.current = false; return; }
    timer.current = setTimeout(tick, Math.max(16, steps.current[0].at - now));
  }, []);
  const start = useCallback((list: Step[]) => {
    clear();
    steps.current = [...list].sort((a, b) => a.at - b.at);
    elapsed.current = 0;
    started.current = performance.now();
    running.current = true;
    tick();
  }, [tick]);
  const pause = useCallback(() => {
    if (!running.current) return;
    elapsed.current += performance.now() - started.current;
    running.current = false;
    clear();
  }, []);
  const resume = useCallback(() => {
    if (running.current || !steps.current.length) return;
    started.current = performance.now();
    running.current = true;
    tick();
  }, [tick]);
  const stop = useCallback(() => { steps.current = []; running.current = false; clear(); }, []);
  useEffect(() => clear, []);
  return useMemo(() => ({ start, pause, resume, stop }), [start, pause, resume, stop]);
}

const reducedMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** View + playback state for the hero. `root` is observed so the entrance only advances while visible. */
export function useSignature(profile: ProfileView | null, root: React.RefObject<HTMLElement | null>) {
  const [view, setView] = useState<View>("front");
  const [play, setPlay] = useState<Play>("off");
  /** Bumped on every entry so that plate's lines redraw; `wiped` = it arrived through a wipe (lines wait for it). */
  const [entry, setEntry] = useState({ front: 0, profile: 0, wiped: false });
  const [announce, setAnnounce] = useState("");
  const [profileReady, setProfileReady] = useState(false);
  const ready = useRef(false);
  ready.current = profileReady;
  const viewRef = useRef<View>("front");
  const userPaused = useRef(false);
  const tl = useTimeline();

  const go = useCallback((next: View) => {
    const wiped = viewRef.current !== next;
    viewRef.current = next;
    setView(next);
    setEntry((e) => ({ ...e, [next]: e[next] + 1, wiped }));
  }, []);

  // Entrance: once per load, only with motion allowed and a decoded side photo.
  const turn = useCallback((): Step[] => [
    // Photo still loading: hold the front a little longer rather than wiping to a blank plate.
    { at: 0, run: () => (ready.current ? void go("profile") : false) },
    { at: TIMING.profileSettle, run: () => void setPlay("done") },
  ], [go]);

  const entered = useRef(false);
  useEffect(() => {
    if (!profile || entered.current || reducedMotion()) return;
    entered.current = true;
    setPlay("playing");
    tl.start(turn().map((st) => ({ ...st, at: st.at + TIMING.firstTurn })));
    return () => { entered.current = false; tl.stop(); };
  }, [profile, tl, turn]);

  // Auto-pause while the hero is off screen or the tab is hidden (does not count as a user pause).
  useEffect(() => {
    const el = root.current;
    if (!profile || !el) return;
    let visible = true, shown = !document.hidden;
    const sync = () => { if (visible && shown && !userPaused.current) tl.resume(); else tl.pause(); };
    const io = typeof IntersectionObserver !== "undefined"
      ? new IntersectionObserver(([e]) => { visible = e.isIntersecting; sync(); }, { threshold: 0.35 }) : null;
    io?.observe(el);
    const onVis = () => { shown = !document.hidden; sync(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { io?.disconnect(); document.removeEventListener("visibilitychange", onVis); };
  }, [profile, root, tl]);

  const choose = useCallback((next: View, label: string) => {
    tl.stop();
    userPaused.current = false;
    setPlay((p) => (p === "off" ? "off" : "done"));
    if (next !== viewRef.current) { go(next); setAnnounce(label); }
  }, [go, tl]);

  const toggle = useCallback(() => {
    if (play === "playing") { userPaused.current = true; tl.pause(); setPlay("paused"); return; }
    if (play === "paused") { userPaused.current = false; tl.resume(); setPlay("playing"); return; }
    // Replay: back to the front (redrawn), then the turn.
    userPaused.current = false;
    setPlay("playing");
    go("front");
    tl.start([...turn().map((st) => ({ ...st, at: st.at + TIMING.frontSettle }))]);
  }, [go, play, tl, turn]);

  return { view, play, entry, announce, choose, toggle, onProfileLoad: () => setProfileReady(true) };
}

/** CSS variables that place the profile plate on the front plate's coordinates (see ProfileView.fit). */
export function profileVars(v: HeroView): React.CSSProperties {
  const p = v.profile;
  if (!p) return {};
  const k = (p.plate.height * p.fit.scale) / v.plate.height; // profile plate height / front plate height
  // Narrow (tablet) layouts: put the profile's measured nose tip exactly where the front's measured cheek edge was,
  // so the turned face never reaches further into the text column than the approved front face.
  const nose = p.marks.find((m) => m.id === "M117")?.overlay.dots[0];
  const axis = v.width ? (v.width.a[0] + v.width.b[0]) / 2 : 0.5;
  const cheek = v.width ? axis - Math.min(v.width.a[0], v.width.b[0]) : null;
  const pwRatio = (v.plate.width / v.plate.height) / (k * (p.plate.width / p.plate.height)); // front pw / profile pw
  const narrow = nose && cheek != null ? nose[0] + cheek * pwRatio : p.fit.pivot;
  return {
    "--pivot-wide": `${p.fit.pivot}`,
    "--pivot-narrow": `${narrow.toFixed(4)}`,
    "--ph2": `calc(var(--ph) * ${k.toFixed(5)})`,
    "--pw2": `calc(var(--ph2) * ${(p.plate.width / p.plate.height).toFixed(5)})`,
    "--pt2": `calc(var(--pt) + ${p.fit.frontNasion[1].toFixed(5)} * var(--ph) - ${p.fit.nasion[1].toFixed(5)} * var(--ph2))`,
    "--pl2": `calc(var(--pl) + var(--axis) * var(--pw) - var(--pivot, ${p.fit.pivot}) * var(--pw2))`,
    "--nasion-x2": `${p.fit.nasion[0]}`,
  } as React.CSSProperties;
}

const pct = (n: number) => `${(n * 100).toFixed(3)}%`;

function FrontMarks({ v, unit }: { v: HeroView; unit: number }) {
  const W = v.plate.width, H = v.plate.height;
  const dim = v.width ? { x: Math.min(0.95, Math.max(v.width.a[0], v.width.b[0]) + 0.085) } : null;
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} className={x.svg} preserveAspectRatio="none">
        <path d={smoothPath(v.contour, W, H)} pathLength={1} className={`${s.lnContour} ${x.fContour}`} />
        {v.width && <Bracket a={v.width.a} b={v.width.b} W={W} H={H} unit={unit} className={x.fWid} />}
        {dim && v.length && (
          // Face length drawn as an offset dimension line (same two heights, moved beside the face).
          <g className={x.fLen}>
            <line x1={v.length.a[0] * W} y1={v.length.a[1] * H} x2={dim.x * W} y2={v.length.a[1] * H}
              className={s.lnRef} strokeDasharray={`${3 / unit} ${5 / unit}`} />
            <line x1={v.length.b[0] * W} y1={v.length.b[1] * H} x2={dim.x * W} y2={v.length.b[1] * H}
              className={s.lnRef} strokeDasharray={`${3 / unit} ${5 / unit}`} />
            <Bracket a={[dim.x, v.length.a[1]]} b={[dim.x, v.length.b[1]]} W={W} H={H} unit={unit} />
          </g>
        )}
      </svg>
      {dim && v.length && (
        <span className={`${s.tag} ${x.fTagLen}`}
          style={{ left: pct(dim.x), top: pct((v.length.a[1] + v.length.b[1]) / 2) }}>
          面长
        </span>
      )}
      {v.width && (
        <span className={`${s.tag} ${x.fTagWid}`}
          style={{ left: pct(Math.min(v.width.a[0], v.width.b[0])), top: pct(v.width.a[1]) }}>
          颧宽
        </span>
      )}
    </>
  );
}

/** Where each side tag sits: next to a measured point of its own overlay, on the side with free space. */
function tagAnchor(mk: ProfileMark): { at: readonly [number, number]; side: "left" | "right" } | null {
  const seg = mk.overlay.segments[0];
  if (!seg) return mk.overlay.tag ? { at: mk.overlay.tag, side: "right" } : null;
  // M117: in front of the columella (open studio backdrop). Others: beside their upper end (glabella).
  return mk.id === "M117" ? { at: seg.b, side: "left" } : { at: seg.a, side: "right" };
}

function ProfileMarks({ p, unit }: { p: ProfileView; unit: number }) {
  const W = p.plate.width, H = p.plate.height;
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} className={x.svg} preserveAspectRatio="none">
        <path d={smoothPath(p.silhouette, W, H, false)} pathLength={1} className={`${s.lnContour} ${x.pSil}`} />
        {p.marks.map((mk, i) => (
          <g key={mk.id} className={x.pMark} style={{ "--m": i } as React.CSSProperties}>
            {mk.overlay.segments.map((seg, j) => (
              <Bracket key={j} a={seg.a} b={seg.b} W={W} H={H} unit={unit} dashed={seg.role !== "measure"}
                className={x.pSeg} style={{ "--j": j } as React.CSSProperties} />
            ))}
            {mk.overlay.arcs.map((arc, j) => (
              <path key={`a${j}`} d={arcPath(arc, W, H, (mk.id === "M117" ? 26 : 13) / unit)} pathLength={1}
                className={`${s.lnMeasure} ${x.pArc}`} />
            ))}
            {mk.overlay.dots.map((d, j) => (
              <circle key={`d${j}`} cx={d[0] * W} cy={d[1] * H} r={2.6 / unit} className={`${s.dot} ${x.pDot}`} />
            ))}
          </g>
        ))}
      </svg>
      {p.marks.map((mk, i) => {
        const a = tagAnchor(mk);
        if (!a) return null;
        return (
          <span key={mk.id} className={`${s.tag} ${x.pTag}`} data-side={a.side}
            style={{ left: pct(a.at[0]), top: pct(a.at[1]), "--m": i } as React.CSSProperties}>
            {mk.name}<b>{mk.value}</b>
          </span>
        );
      })}
    </>
  );
}

function Plate({ side, active, wiped, n, plate, className, children, onLoad, priority }: {
  side: View; active: boolean; wiped: boolean; n: number; plate: { src: string; width: number; height: number };
  className: string; children: (unit: number) => React.ReactNode; onLoad?: () => void; priority?: boolean;
}) {
  const [ref, box] = useSize<HTMLDivElement>();
  const unit = box.h ? box.h / plate.height : 0.8;
  return (
    <div ref={ref} className={`${x.plate} ${className}`} data-side={side} data-state={active ? "in" : "out"}
      style={{ "--t0": wiped && active ? "var(--wipe)" : "0s" } as React.CSSProperties}>
      <div className={x.layer}>
        {/* exact intrinsic size; the overlay shares its box, so photo and landmarks cannot drift apart */}
        <img src={plate.src} width={plate.width} height={plate.height} alt="" className={x.img}
          fetchPriority={priority ? "high" : "low"} decoding="async" onLoad={onLoad}
          ref={(el) => { if (el?.complete && el.naturalWidth) onLoad?.(); }} />
        {/* keyed per entry: the lines redraw every time this view arrives */}
        <div key={n} className={x.marks}>{children(unit)}</div>
      </div>
      {active && wiped && <span key={`scan${n}`} className={x.scan} aria-hidden />}
    </div>
  );
}

export function PortraitStage({ v, view, entry, onProfileLoad }: {
  v: HeroView; view: View; entry: { front: number; profile: number; wiped: boolean }; onProfileLoad: () => void;
}) {
  const p = v.profile;
  const label = view === "profile" && p
    ? `示例人物的侧脸原图，标注${p.marks.map((m) => `${m.name} ${m.value}`).join("、")}。`
    : "示例人物的正脸原图，标注面部轮廓、面长与颧宽。";
  return (
    <div className={x.stage} role="img" aria-label={label}>
      <Plate side="front" active={view === "front"} wiped={entry.wiped} n={entry.front} plate={v.plate}
        className={x.front} priority>
        {(unit) => <FrontMarks v={v} unit={unit} />}
      </Plate>
      {p && (
        <Plate side="profile" active={view === "profile"} wiped={entry.wiped} n={entry.profile} plate={p.plate}
          className={x.profile} onLoad={onProfileLoad}>
          {(unit) => <ProfileMarks p={p} unit={unit} />}
        </Plate>
      )}
    </div>
  );
}

const ICON: Record<Exclude<Play, "off">, { d: string; label: string }> = {
  playing: { d: "M5 3.5v9M11 3.5v9", label: "暂停动画" },
  paused: { d: "M5 3l8 5-8 5z", label: "继续播放" },
  done: { d: "M12.6 9.2A4.8 4.8 0 1 1 11.2 4.4M11.6 1.8l-.3 2.8-2.8-.2", label: "重播动画" },
};

export function ViewControls({ p, view, play, announce, choose, toggle }: {
  p: ProfileView; view: View; play: Play; announce: string;
  choose: (v: View, label: string) => void; toggle: () => void;
}) {
  const btns = useRef<Record<View, HTMLButtonElement | null>>({ front: null, profile: null });
  const options: { key: View; name: string; said: string }[] = [
    { key: "front", name: "正脸", said: "已切换到正脸原图：面部轮廓、面长与颧宽。" },
    { key: "profile", name: "侧脸", said: `已切换到侧脸原图：${p.marks.map((m) => `${m.name} ${m.value}`).join("，")}。` },
  ];
  const onKey = (e: React.KeyboardEvent) => {
    const to: View | null = e.key === "ArrowLeft" || e.key === "Home" ? "front"
      : e.key === "ArrowRight" || e.key === "End" ? "profile" : null;
    if (!to) return;
    e.preventDefault();
    choose(to, options.find((o) => o.key === to)!.said);
    btns.current[to]?.focus();
  };
  const icon = play === "off" ? null : ICON[play];
  return (
    <div className={x.controls}>
      <div className={x.pill}>
        <div role="group" aria-label="示例照片视角" className={x.seg} onKeyDown={onKey}>
          {options.map((o) => (
            <button key={o.key} type="button" ref={(el) => { btns.current[o.key] = el; }}
              className={x.segBtn} aria-pressed={view === o.key} onClick={() => choose(o.key, o.said)}>
              {o.name}
            </button>
          ))}
          <span className={x.segThumb} data-view={view} aria-hidden />
        </div>
        {icon && (
          <button type="button" className={x.playBtn} onClick={toggle} aria-label={icon.label} title={icon.label}>
            <svg viewBox="0 0 16 16" aria-hidden><path d={icon.d} /></svg>
          </button>
        )}
      </div>
      <p className={x.sr} aria-live="polite">{announce}</p>
    </div>
  );
}
