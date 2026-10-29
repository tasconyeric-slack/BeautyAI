"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { camera, focusBox, type Chapter, type Plate } from "@/components/home/model";
import { MetricLines } from "@/components/home/overlay";
import { useSize } from "@/components/home/use-size";
import s from "./v3.module.css";

type CaseView = { plate: Plate; chapters: Chapter[]; reportHref: string };

export function Intelligence({ p001, p002 }: { p001: CaseView; p002: CaseView }) {
  const [person, setPerson] = useState<"p001" | "p002">("p001");
  const [active, setActive] = useState(0);
  const [marks, setMarks] = useState(true);
  const [frameRef, size] = useSize<HTMLDivElement>();
  const uid = useId();
  const current = person === "p001" ? p001 : p002;
  const aspect = size.w > 0 && size.h > 0 ? size.w / size.h : 0.82;
  const chapters = useMemo(
    () => current.chapters.map((ch) => ({ ...ch, focus: focusBox(ch.overlay, aspect, 0.16) })),
    [current.chapters, aspect],
  );
  const selectedIndex = Math.min(active, Math.max(0, chapters.length - 1));
  const selected = chapters[selectedIndex];
  const ready = size.w > 0 && size.h > 0;
  const W = current.plate.width;
  const H = current.plate.height;
  const cam = selected && ready ? camera(selected.focus, size.w, size.h, W, H, 1.35) : { s: 1, tx: 0, ty: 0 };
  const tag = selected?.overlay.tag;
  const tagX = tag ? tag[0] * W * cam.s + cam.tx : 0;
  const tagY = tag ? tag[1] * H * cam.s + cam.ty : 0;
  const n = (i: number) => String(i + 1).padStart(2, "0");

  return (
    <section id="reading" className={s.intelligence} aria-labelledby="v3-reading-title">
      <div className={s.sectionIndex}>
        <span><b>02</b> 读懂比例</span>
        <span>观察 <i aria-hidden="true" /> 解读 <i aria-hidden="true" /> 建议</span>
      </div>
      <div className={s.sectionHead}>
        <div>
          <p className={s.eyebrow}>面部解读</p>
          <h2 className={s.displayTitle} id="v3-reading-title">
            <span>比例之间，</span><span>看见风格的线索。</span>
          </h2>
        </div>
        <div>
          <p className={s.intro}>脸型、额头与五官比例，各自影响着不同的选择。沿着对应照片上的标注，理解一个特点，再找到适合自己的方向。</p>
          <div className={s.personControls} role="group" aria-label="选择分析示例">
            <button type="button" aria-pressed={person === "p001"} onClick={() => { setPerson("p001"); setActive(0); }}>示例 001</button>
            <button type="button" aria-pressed={person === "p002"} onClick={() => { setPerson("p002"); setActive(0); }}>示例 002</button>
          </div>
        </div>
      </div>

      {selected ? (
        <div className={s.intelligenceGrid}>
          <figure className={s.intelligenceFigure}>
            <div className={s.intelligenceFrame} ref={frameRef}>
              <span className={s.measurementHeading}>面部结构 <span>/ {selected.kicker}</span></span>
              <div className={s.measurementPlate} style={{
                width: W, height: H,
                opacity: ready ? 1 : 0,
                transform: "translate(" + cam.tx + "px," + cam.ty + "px) scale(" + cam.s + ")",
              }}>
                <img src={current.plate.src} width={W} height={H} loading="lazy"
                  alt={"AI 合成示例 " + (person === "p001" ? "001" : "002") + " 的原始正脸照片，标注与该照片配准"}
                  draggable={false} />
                <svg className={s.measurementSvg} viewBox={"0 0 " + W + " " + H}
                  aria-hidden="true" data-visible={marks}>
                  {marks && <MetricLines key={person + selected.metricId} ov={selected.overlay} unit={cam.s} />}
                </svg>
              </div>
              {ready && marks && tag && <span className={s.measurementTag} style={{ left: tagX, top: tagY }}>
                {selected.metricName} <strong>{selected.value}</strong>
              </span>}
            </div>
            <figcaption className={s.figureFoot}>
              <span>{n(selectedIndex)} / {n(chapters.length)}　{selected.kicker} · {selected.metricName}</span>
              <button type="button" className={s.showMarks} aria-pressed={!marks} onClick={() => setMarks(!marks)}>
                {marks ? "只看照片" : "显示标注"}
              </button>
            </figcaption>
          </figure>
          <div className={s.readingChapters}>
            {chapters.map((ch, i) => {
              const open = selectedIndex === i;
              const panelId = uid + "-chapter-" + i;
              return (
                <div key={person + ch.metricId} className={s.readingChapter} data-open={open}>
                  <button type="button" className={s.readingChapterButton}
                    aria-expanded={open} aria-controls={panelId} onClick={() => setActive(i)}>
                    <span className={s.chapterNo}>{n(i)}</span>
                    <span className={s.chapterKicker}>{ch.kicker}</span>
                    <span className={s.chapterTitle}>{ch.title}</span>
                    <span className={s.chapterValue}>{ch.value} <span aria-hidden="true">{open ? "−" : "+"}</span></span>
                  </button>
                  <div id={panelId} hidden={!open} role="region" aria-label={ch.title} className={s.chapterPanel}>
                    <dl className={s.analysisList}>
                      <div><dt>观察</dt><dd>{ch.seen}<small>{ch.metricName} · {ch.value}{ch.confidence ? " · " + ch.confidence : ""}</small></dd></div>
                      <div><dt>解读</dt><dd>{ch.means}</dd></div>
                      <div><dt>建议</dt><dd>{ch.advice.length ? ch.advice.map((a) => a.text).join("；") : ch.action}</dd></div>
                    </dl>
                    {ch.advice.length > 0 && <details className={s.reportDetail}><summary>详细建议</summary><p>{ch.action}</p></details>}
                    {ch.swatches && <div className={s.swatches} aria-label="报告近脸色">{ch.swatches.map((c) => <span key={c.name}><i style={{ backgroundColor: c.hex }} />{c.name}</span>)}</div>}
                    {ch.note && <p className={s.caveat}>{ch.note}</p>}
                    {person === "p001" && ch.kicker === "发型" && <a className={s.textLink} href="#transformation">在上方看发型方向 ↑</a>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <p className={s.unavailable}>当前示例没有可展示的测量章节。</p>
      )}

      <div className={s.intelligenceFoot}>
        <p>示例人物由 AI 合成，标注仅绘制在配准的分析照片上。拍摄角度与光线会影响判断。 <Link href="/about">方法与隐私</Link></p>
        <Link href={current.reportHref} prefetch={false}>打开示例 {person === "p001" ? "001" : "002"} 的完整报告 →</Link>
      </div>
    </section>
  );
}
