"use client";
import Link from "next/link";
import { useId, useMemo, useState } from "react";
import type { DemoCase } from "@/lib/fixtures/demo_cases";
import { camera, chapters as buildChapters } from "./model";
import { MetricLines } from "./overlay";
import { useSize } from "./use-size";
import s from "./home.module.css";

/** One face, read four ways. The portrait "camera" frames whatever feature the open chapter measures; the chapter
 *  discloses observation → interpretation → guidance, all verbatim from the same sample report. */
export function Analysis({ c, reportHref }: { c: DemoCase; reportHref: string }) {
  const [frameRef, box] = useSize<HTMLDivElement>();
  const aspect = box.w && box.h ? box.w / box.h : 0.82;
  const list = useMemo(() => buildChapters(c, aspect), [c, aspect]);
  const [active, setActive] = useState(0);
  const [marks, setMarks] = useState(true);
  const uid = useId();
  if (!list.length) return null;
  const ch = list[Math.min(active, list.length - 1)];
  const W = ch.overlay.width, H = ch.overlay.height;
  const ready = box.w > 0 && box.h > 0;
  const cam = ready ? camera(ch.focus, box.w, box.h, W, H) : { s: 0.5, tx: 0, ty: 0 };
  const tag = ch.overlay.tag;
  const tagX = tag ? tag[0] * W * cam.s + cam.tx : 0;
  const tagY = tag ? tag[1] * H * cam.s + cam.ty : 0;
  const n = (i: number) => String(i + 1).padStart(2, "0");

  return (
    <section id="reading" className={s.reading} aria-labelledby="reading-title">
      <header className={s.readingHead}>
        <div>
          <p className={s.eyebrowDark}>示例分析</p>
          <h2 id="reading-title" className={s.h2}>
            <span>每一条建议，</span>
            <span>都追溯到一处测量。</span>
          </h2>
        </div>
        <p className={s.readingIntro}>
          线条画在算法定位的面部关键点上；读数、解读与建议取自同一份示例报告。选择一项，看它如何从观察走到选择。
        </p>
      </header>

      <div className={s.readingBody}>
        <figure className={s.stage}>
          <div className={s.frame} ref={frameRef} data-ready={ready || undefined}>
            <div className={s.cam} style={{ width: W, height: H, transform: `translate(${cam.tx}px, ${cam.ty}px) scale(${cam.s})` }}>
              {/* overlay shares this exact intrinsic box */}
              <img src={c.photos.front} width={W} height={H} alt="示例人物正脸照片，叠加了当前测量项的标注线" className={s.camImg} />
              <svg viewBox={`0 0 ${W} ${H}`} className={s.camSvg} data-marks={marks || undefined} aria-hidden>
                <MetricLines key={ch.metricId} ov={ch.overlay} unit={cam.s} />
              </svg>
            </div>
            {tag && marks && ready && (
              <span key={ch.metricId} className={`${s.tag} ${s.camTag}`} style={{ left: tagX, top: tagY }}>
                {ch.metricName}<b>{ch.value}</b>
              </span>
            )}
          </div>
          <figcaption className={s.frameBar}>
            <span className={s.frameCaption}><b>{n(active)} / {n(list.length - 1)}</b>{ch.kicker} · {ch.metricName}</span>
            <button type="button" className={s.marksBtn} aria-pressed={!marks} onClick={() => setMarks((m) => !m)}>
              {marks ? "只看照片" : "显示标注"}
            </button>
          </figcaption>
        </figure>

        <ol className={s.chapters}>
          {list.map((x, i) => {
            const open = i === active;
            const pid = `${uid}-p${i}`;
            return (
              <li key={x.metricId} className={s.chapter} data-open={open || undefined}>
                <button type="button" className={s.chapterHead} aria-expanded={open} aria-controls={pid}
                  onClick={(e) => {
                    setActive(i);
                    // Mobile: the portrait is sticky, so bring the opened chapter up just beneath it.
                    const li = e.currentTarget.closest("li");
                    if (li && window.matchMedia("(max-width: 760px)").matches) {
                      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
                      requestAnimationFrame(() => li.scrollIntoView({ block: "start", behavior: still ? "auto" : "smooth" }));
                    }
                  }}>
                  <span className={s.chIndex}>{n(i)}</span>
                  <span className={s.chKicker}>{x.kicker}</span>
                  <span className={s.chTitle}>{x.title}</span>
                  <span className={s.chValue}>{x.value}</span>
                </button>
                <div id={pid} className={s.chBody} role="region" aria-label={`${x.kicker}：${x.title}`} hidden={!open}>
                  <div className={s.chInner}>
                    <ol className={s.tiers}>
                      <li className={s.tier}>
                        <span className={s.tierLabel}>观察</span>
                        <div>
                          <p className={s.tierText}>{x.seen}</p>
                          <p className={s.tierMeta}>{x.metricName} = {x.value}{x.confidence ? ` · ${x.confidence}` : ""}</p>
                        </div>
                      </li>
                      <li className={s.tier}>
                        <span className={s.tierLabel}>解读</span>
                        <p className={s.tierText}>{x.means}</p>
                      </li>
                      {x.advice.length > 0 && (
                        <li className={`${s.tier} ${s.tierAdvice}`}>
                          <span className={s.tierLabel}>建议</span>
                          <ul className={s.adviceList}>
                            {x.advice.map((a) => (
                              <li key={a.area + a.text}><span className={s.adviceArea}>{a.area}</span>{a.text}</li>
                            ))}
                          </ul>
                        </li>
                      )}
                    </ol>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      <footer className={s.readingFoot}>
        <p>示例人物由 AI 合成，并非真实个人。比例是线索，不是审美标准；同一张照片的光线和角度也会影响读数。</p>
        <Link href={reportHref} className={s.footLink}>打开这份完整示例报告 <span aria-hidden>→</span></Link>
      </footer>
    </section>
  );
}
