"use client";
import Link from "next/link";
import { useId, useState } from "react";
import { camera, focusBox, type Chapter, type Plate } from "./model";
import { MetricLines } from "./overlay";
import { useSize } from "./use-size";
import s from "./home.module.css";

/** One original portrait, three evidence-backed decisions. No generated/after imagery. */
export function Choices({ plate, decisions, reportHref }: { plate: Plate; decisions: Chapter[]; reportHref: string }) {
  const [active, setActive] = useState(0);
  const [marks, setMarks] = useState(true);
  const [frameRef, box] = useSize<HTMLDivElement>();
  const uid = useId();
  if (!decisions.length) return null;
  const ch = decisions[Math.min(active, decisions.length - 1)];
  const W = plate.width, H = plate.height;
  const ready = box.w > 0 && box.h > 0;
  const focus = focusBox(ch.overlay, ready ? box.w / box.h : 0.85, 0.15);
  const cam = ready ? camera(focus, box.w, box.h, W, H, 1.45) : { s: 0.5, tx: 0, ty: 0 };

  return (
    <section id="choices" className={s.choices} aria-labelledby="choices-title">
      <header className={s.choiceHead}>
        <div>
          <p className={s.eyebrow}>从分析到选择</p>
          <h2 id="choices-title" className={s.h2}><span>看懂之后，</span><span>让选择有依据。</span></h2>
        </div>
        <p className={s.choiceIntro}>同一张脸，三个相连的决定。<br />从比例出发，把建议带进下一次修眉、配镜与剪发。</p>
      </header>
      <div className={s.choiceLayout}>
        <figure className={s.choicePortrait}>
          <div className={s.choiceFrame} ref={frameRef} data-ready={ready || undefined}>
            <div className={s.cam} style={{ width: W, height: H, transform: `translate(${cam.tx}px, ${cam.ty}px) scale(${cam.s})` }}>
              <img src={plate.src} width={W} height={H} alt="Person-001 的 AI 合成示例正脸，展示原有发型" className={s.camImg} loading="lazy" />
              <svg viewBox={`0 0 ${W} ${H}`} className={s.camSvg} data-marks={marks || undefined} aria-hidden>
                <MetricLines key={ch.metricId} ov={ch.overlay} unit={cam.s} />
              </svg>
            </div>
            <span className={s.choicePlateLabel}>原始示例照片 · 测量标注</span>
          </div>
          <figcaption className={s.choiceCaption}>
            <span>{ch.metricName} <b>{ch.value}</b></span>
            <button type="button" className={s.marksBtn} aria-pressed={!marks} onClick={() => setMarks((m) => !m)}>{marks ? "只看照片" : "显示标注"}</button>
          </figcaption>
        </figure>
        <div className={s.choiceContent}>
          <div className={s.choiceTabs} role="tablist" aria-label="选择风格决策">
            {decisions.map((item, i) => (
              <button type="button" key={item.metricId} id={`${uid}-t${i}`} role="tab"
                aria-selected={active === i} aria-controls={`${uid}-p${i}`} tabIndex={active === i ? 0 : -1}
                onClick={() => setActive(i)}
                onKeyDown={(e) => {
                  const next = e.key === "Home" ? 0 : e.key === "End" ? decisions.length - 1
                    : e.key === "ArrowRight" ? (i + 1) % decisions.length
                    : e.key === "ArrowLeft" ? (i - 1 + decisions.length) % decisions.length : null;
                  if (next == null) return;
                  e.preventDefault();
                  setActive(next);
                  document.getElementById(`${uid}-t${next}`)?.focus();
                }}>
                <span>{String(i + 1).padStart(2, "0")}</span>{item.kicker}
              </button>
            ))}
          </div>
          {decisions.map((item, i) => (
            <div key={item.metricId} role="tabpanel" id={`${uid}-p${i}`} aria-labelledby={`${uid}-t${i}`}
              tabIndex={0} hidden={active !== i} className={s.choicePanel}>
              <p className={s.choiceFinding}>{item.title}<span>{item.value}</span></p>
              <p className={s.choiceSeen}>{item.seen}</p>
              <p className={s.choiceMeans}>{item.means}</p>
              <div className={s.choiceAdvice}>
                <p className={s.choiceLabel}>所以，选什么</p>
                {item.advice.map((a) => <h3 key={a.text}>{a.text}</h3>)}
              </div>
              <div className={s.choiceAction}>
                <p className={s.choiceLabel}>带去{item.kicker === "发型" ? "剪发" : item.kicker === "眉形" ? "修眉" : "配镜"}时参考</p>
                <p>{item.action}</p>
              </div>
              <p className={s.choiceConfidence}>{item.confidence} · 来自同一份示例报告</p>
            </div>
          ))}
          <div className={s.choiceLinks}>
            <Link prefetch={false} href={reportHref} className={s.choiceReport}>查看她的完整报告 <span aria-hidden>↗</span></Link>
            <Link prefetch={false} href="/start" className={s.cta}>找到我的风格方向 <span aria-hidden>→</span></Link>
          </div>
          <p className={s.previewNote}>发型预览待生成；此处展示原始照片与建议，未展示试戴或改造效果。</p>
        </div>
      </div>
      <p className={s.choiceDisclosure}>示例人物由 AI 合成，并非真实个人。测量与分析来自实际流程；比例是线索，不是审美标准。</p>
    </section>
  );
}
