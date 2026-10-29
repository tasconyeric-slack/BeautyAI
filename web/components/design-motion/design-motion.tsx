"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUpRight, Check, Pause, Play, Bookmark, RotateCcw } from "lucide-react";
import { Hero } from "@/components/home/hero";
import { camera, focusBox, type Chapter, type HeroView } from "@/components/home/model";
import { MetricLines } from "@/components/home/overlay";
import { useSize } from "@/components/home/use-size";
import { HoldButton, useHold } from "@/components/ds/HoldButton";
import { SampleReport } from "@/components/report/sample-report";
import heroStyles from "@/components/home/home.module.css";
import s from "./design-motion.module.css";

type View = "home" | "report" | "studio";
const route = (view: View) => `/dev/design-motion${view === "home" ? "" : `?view=${view}`}`;
const image = (key: string) => `/design-motion/p001-b-${key}.png`;
const titles = ["先看轮廓", "再看重心", "找到配色"];
const subscribe = (change: () => void) => {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", change);
  return () => mq.removeEventListener("change", change);
};

/** Shared art direction across the continuous home, the existing R2 report and a Studio interaction study. */
export function DesignMotion({ hero, readings, view, production = false }: { hero: HeroView; readings: Chapter[]; view: View; production?: boolean }) {
  const pageRoute = (target: View) => production ? target === "report" ? "/report/sample?v=p002" : target === "studio" ? "/start" : "/" : route(target);
  const root = useRef<HTMLDivElement>(null);
  const reduced = useSyncExternalStore(subscribe, () => window.matchMedia("(prefers-reduced-motion: reduce)").matches, () => true);
  const [autoplay, setAutoplay] = useState(true);
  const auto = autoplay && !reduced;
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.setAttribute("data-motion-seen", "true"); observer.unobserve(entry.target); }
    }), { threshold: 0.08 });
    el.querySelectorAll("[data-reveal], [data-chapter]").forEach(item => observer.observe(item));
    el.dataset.motionReady = "true";
    const sync = () => { el.dataset.hidden = String(document.hidden); };
    const heroSection = el.querySelector('[aria-labelledby="home-title"]');
    const heroObserver = new IntersectionObserver(([entry]) => { el.dataset.heroVisible = String(entry.isIntersecting); }, { threshold: 0.08 });
    if (heroSection) heroObserver.observe(heroSection);
    sync(); document.addEventListener("visibilitychange", sync);
    return () => { observer.disconnect(); heroObserver.disconnect(); document.removeEventListener("visibilitychange", sync); };
  }, [view]);
  return <div ref={root} className={`${s.root} ${heroStyles.root}`} data-design-motion data-auto={auto} data-view={view}>
    <style>{`body:has([data-design-motion])>header,body:has([data-design-motion])>footer{display:none}`}</style>
    {view === "home" && <Hero v={hero} />}
    <div className={s.content}>
    <header className={s.nav}>
      <Link href={pageRoute("home")} className={s.wordmark}>BeautyAI <span>形象护照</span></Link>
      <nav aria-label="体验页面">
        {([ ["home", "发现"], ["report", "报告"], ["studio", "Studio"] ] as const).map(([key, label]) =>
          <Link key={key} href={pageRoute(key)} aria-current={view === key ? "page" : undefined}>{label}</Link>)}
      </nav>
      <Link href="/start" className={s.navCta}>开始了解自己 <ArrowUpRight size={14} /></Link>
    </header>
    <div>
      {view === "home" ? <>
        <section className={s.manifesto} data-reveal>
          <p className={s.eyebrow}>BEAUTY, IN YOUR OWN TERMS.</p>
          <h2>先了解自己的特点，<br /><em>再决定想成为的样子。</em></h2>
          <div><p>轮廓、比例、色彩，是风格的线索。<br />我们把线索变成看得懂、试得到的选择。</p><a href="#reading" className={s.down}>从一张照片开始 <ArrowDown size={18} /></a></div>
        </section>
        <ReadingStory hero={hero} readings={readings} reportHref={pageRoute("report")} />
        <section className={s.individuals} aria-labelledby="individuals-title">
          <div className={s.editorialHead} data-reveal><p className={s.eyebrow}>02 / INDIVIDUALITY</p><h2 id="individuals-title">风格有很多种。<br /><em>答案，因你而异。</em></h2><p>不同的轮廓、发质和日常习惯，<br />值得各自的选择。</p></div>
          <div className={s.portraitStrip}>{["003", "004", "001", "002", "006", "005"].map((id, i) => <figure key={id} data-reveal style={{ "--delay": `${i * 65}ms` } as CSSProperties}>
            <div><img src={`/demo/portraits/person-${id}-frontal.webp`} alt={`示例人物 P${id}，原有发型、未添加眼镜`} width={960} height={1200} loading="lazy" /></div><figcaption><span>P{id}</span><span>原有造型</span></figcaption>
          </figure>)}</div><p className={s.disclosure}>AI 合成示例人物 · 人物展示使用原图</p>
        </section>
        <section className={s.styleSection} id="possibility">
          <div className={s.styleIntro} data-reveal><p className={s.eyebrow}>03 / POSSIBILITIES</p><h2>改变多少，<br /><em>由你决定。</em></h2><p>先看一个发型方向。<br />在同一张照片里比较，保留喜欢的部分。</p><Link href={pageRoute("studio")} className={s.textLink}>在 Studio 里继续探索 <ArrowUpRight size={18} /></Link></div>
          <Comparison auto={auto} />
          <div className={s.styleCaption} data-reveal><span>发型探索 / P001</span><h3>偏分蓬松中长发</h3><p>试着改变分缝与发尾的走向，<br />看看自己是否喜欢这样的轮廓。</p><span>AI 造型模拟示例</span></div>
        </section>
        <section className={s.studioSection} id="studio-preview">
          <div className={s.studioHead} data-reveal><p className={s.eyebrow}>04 / LOOK STUDIO</p><h2>把想法，<em>放进照片里。</em></h2><p>从一个方向开始，慢慢找到自己的选择。</p></div>
          <Studio auto={auto} compact production={production} />
          <Link href={pageRoute("studio")} className={s.lightLink}>{production ? "上传照片，进入自己的 Studio" : "进入 Studio 交互演示"} <ArrowUpRight size={18} /></Link>
        </section>
        <section className={s.takeaway}>
          <div data-reveal><p className={s.eyebrow}>05 / YOUR AESTHETIC PASSPORT</p><h2>一次了解，<br /><em>留下一份行动的方向。</em></h2><p>把观察、解读和选择收进一份报告。<br />今天尝试一点，下次剪发再进一步。</p><Link href={pageRoute("report")} className={s.button}>翻开完整示例报告 <ArrowUpRight size={17} /></Link></div>
          <Link href={pageRoute("report")} className={s.reportBook} data-reveal aria-label="打开 P002 完整示例报告"><div className={s.bookTop}><b>BeautyAI</b><span>AESTHETIC<br />PASSPORT</span></div><div className={s.bookPortrait}><img src={hero.plate.src} alt="P002 报告封面" width={hero.plate.width} height={hero.plate.height} loading="lazy" /></div><div className={s.bookBottom}><span>属于自己的风格线索</span><b>形象护照 <ArrowUpRight size={21} /></b><span>No. P002 / 完整示例</span></div></Link>
          <div className={s.planLine} data-reveal>{[["01", "看见特点", "从照片到理解"], ["02", "试一个方向", "从理解到选择"], ["03", "带进日常", "从选择到行动"]].map(([n, title, detail]) => <div key={n}><span>{n}</span><h3>{title}</h3><p>{detail}</p></div>)}</div>
        </section>
        <section className={s.closing} data-reveal><p className={s.eyebrow}>MAKE IT YOURS.</p><h2>从了解自己开始。</h2><Link href="/start" className={s.button}>上传照片，开始分析 <ArrowUpRight size={18} /></Link><Link href="/about" className={s.textLink}>了解分析方法与照片隐私 <ArrowUpRight size={14} /></Link></section>
      </> : view === "report" ? <div className={s.reportPage}><div className={s.pageHeading}><p className={s.eyebrow}>YOUR AESTHETIC PASSPORT</p><p>同一套视觉语言，从发现到理解。</p></div><SampleReport variant="p002" /></div>
        : <section className={s.studioPage}><div className={s.pageHeading}><p className={s.eyebrow}>LOOK STUDIO / P001</p><h1>试一种可能，<em>找到自己的选择。</em></h1><p>发型与配色在同一处比较；保存你想继续尝试的方向。</p></div><Studio auto={auto} /></section>}
    </div>
    <footer className={s.footer}><Link href={pageRoute("home")} className={s.wordmark}>BeautyAI <span>形象护照</span></Link><p>看懂特点，保留自己的样子。</p><Link href="/about">分析方法与照片隐私 <ArrowUpRight size={14} /></Link></footer>
    <aside className={s.reviewBar} aria-label="动态播放设置"><span>{production ? "首页示例演示" : "R3.1 / 体验稿"}</span><button type="button" onClick={() => setAutoplay(v => !v)} aria-pressed={auto}>{auto ? <Pause size={13} /> : <Play size={13} />}{reduced ? "已跟随减少动态设置" : auto ? "暂停自动演示" : "播放自动演示"}</button></aside>
    </div>
  </div>;
}

function ReadingStory({ hero, readings, reportHref }: { hero: HeroView; readings: Chapter[]; reportHref: string }) {
  const story = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  useEffect(() => {
    const el = story.current;
    if (!el) return;
    const steps = Array.from(el.querySelectorAll<HTMLElement>("[data-reading-step]"));
    let frame = 0;
    const update = () => {
      frame = 0;
      const pinnedBottom = el.querySelector<HTMLElement>(`.${s.pinnedPortrait}`)?.getBoundingClientRect().bottom ?? 0;
      const line = innerWidth < 768 ? Math.min(innerHeight * 0.85, pinnedBottom + (innerHeight - pinnedBottom) * 0.45) : innerHeight * 0.56;
      let next = 0;
      steps.forEach((step, i) => { if (step.getBoundingClientRect().top < line) next = i; });
      setActive(next);
      const r = el.getBoundingClientRect();
      el.style.setProperty("--reading-progress", String(Math.max(0, Math.min(1, (innerHeight * 0.3 - r.top) / Math.max(1, r.height - innerHeight * 0.6)))));
    };
    const queue = () => { if (!frame) frame = requestAnimationFrame(update); };
    update(); addEventListener("scroll", queue, { passive: true }); addEventListener("resize", queue);
    return () => { cancelAnimationFrame(frame); removeEventListener("scroll", queue); removeEventListener("resize", queue); };
  }, []);
  return <section className={s.readingSection} id="reading">
    <div className={s.editorialHead} data-reveal><p className={s.eyebrow}>01 / UNDERSTANDING YOU</p><h2>一张脸，<br /><em>慢慢读懂。</em></h2><p>沿着照片里的线索，<br />从看见特点，到理解自己的选择。</p></div>
    <div className={s.readingStory} ref={story}>
      <div className={s.pinnedPortrait}><MeasuredPortrait hero={hero} chapter={readings[active]} /><div className={s.readingProgress}><span style={{ transform: `scaleX(${(active + 1) / readings.length})` }} /></div><p className={s.photoFoot}><span>P002 / 对应照片测量</span><span>{String(active + 1).padStart(2, "0")} — 03</span></p></div>
      <div className={s.readingSteps}>{readings.map((ch, i) => <article key={ch.metricId} data-reading-step data-active={active === i}>
        <p className={s.eyebrow}>{String(i + 1).padStart(2, "0")} / {titles[i]}</p><h3>{ch.title}</h3><p className={s.readingValue}><span>{ch.metricName}</span><b>{ch.value}</b></p><p>{ch.seen}</p><div className={s.interpretation}><span>对风格的启发</span><p>{ch.means}</p></div>
        {ch.swatches && <div className={s.swatches}>{ch.swatches.map(color => <span key={color.name}><i style={{ background: color.hex }} />{color.name}</span>)}</div>}
      </article>)}</div>
    </div><Link href={reportHref} className={s.textLink}>把线索串起来，读完整报告 <ArrowUpRight size={17} /></Link>
  </section>;
}

function MeasuredPortrait({ hero, chapter }: { hero: HeroView; chapter: Chapter }) {
  const [ref, box] = useSize<HTMLDivElement>();
  const aspect = box.w && box.h ? box.w / box.h : 0.85;
  const cam = box.w ? camera(focusBox(chapter.overlay, aspect, 0.18), box.w, box.h, hero.plate.width, hero.plate.height, 1.38) : { tx: 0, ty: 0, s: 0.3 };
  return <div className={s.measuredPortrait} ref={ref}>
    <div className={s.camera} style={{ width: hero.plate.width, height: hero.plate.height, transform: `translate(${cam.tx}px,${cam.ty}px) scale(${cam.s})` }}>
      <img src={hero.plate.src} width={hero.plate.width} height={hero.plate.height} alt="P002 原图，照片聚焦随阅读位置变化" loading="lazy" />
      <svg viewBox={`0 0 ${hero.plate.width} ${hero.plate.height}`} aria-hidden><MetricLines key={chapter.metricId} ov={chapter.overlay} unit={cam.s} /></svg>
    </div>
    <span className={s.metricTag} key={chapter.metricId}>{chapter.metricName}<b>{chapter.value}</b></span><span className={s.photoKicker}>FACIAL STUDY / 002</span>
  </div>;
}

function useVisible<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    let inView = false;
    const sync = () => setVisible(inView && !document.hidden);
    const observer = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; sync(); }, { threshold: 0.35 });
    observer.observe(ref.current);
    document.addEventListener("visibilitychange", sync);
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", sync); };
  }, []);
  return [ref, visible] as const;
}

function Comparison({ auto }: { auto: boolean }) {
  const [ref, visible] = useVisible<HTMLDivElement>();
  const [cut, setCut] = useState(50);
  const [touched, setTouched] = useState(false);
  return <div className={s.comparison} ref={ref} data-play={auto && visible && !touched} style={{ "--cut": `${cut}%` } as CSSProperties}>
    <img src={image("orig")} alt="P001 原有发型" width={672} height={900} loading="lazy" />
    <img className={s.after} src={image("safe")} alt="P001 偏分蓬松中长发 AI 造型模拟" width={672} height={900} loading="lazy" />
    <span className={s.beforeLabel}>原有发型</span><span className={s.afterLabel}>发型探索 / AI 模拟</span><div className={s.divider} aria-hidden><span>‹ ›</span></div>
    <input type="range" min={0} max={100} value={cut} onPointerDown={() => setTouched(true)} onFocus={() => setTouched(true)} onChange={e => { setTouched(true); setCut(Number(e.target.value)); }} aria-label="拖动比较原图与发型模拟" />
    <span className={s.compareHint}>拖动，看看变化 <ArrowRight size={15} /></span>
  </div>;
}

/** A short visible-only sequence introduces the working controls, then leaves the choice to the visitor. */
function Studio({ auto, compact = false, production = false }: { auto: boolean; compact?: boolean; production?: boolean }) {
  const [ref, visible] = useVisible<HTMLDivElement>();
  const [hair, setHair] = useState("orig");
  const [tab, setTab] = useState("hair");
  const [scene, setScene] = useState(0);
  const [touched, setTouched] = useState(false);
  const [saved, setSaved] = useState(false);
  const [color, setColor] = useState(0);
  const hold = useHold();
  useEffect(() => {
    if (!auto || !visible || touched || scene >= 2) return;
    const timer = setTimeout(() => { setScene(v => v + 1); setHair("safe"); }, 3300);
    return () => clearTimeout(timer);
  }, [auto, visible, touched, scene]);
  const choose = (key: string) => { setTouched(true); setHair(key); setSaved(false); };
  const compare = scene === 2 && !touched;
  const hairName = hair === "safe" ? "偏分蓬松中长发" : hair === "easy" ? "耳下短直发" : "保留原有发型";
  const colors = [ ["米白", "#e8e2d7"], ["玫瑰", "#b97a78"], ["深青蓝", "#2f4858"] ];
  return <div className={s.studio} ref={ref} data-compact={compact} onPointerDown={() => setTouched(true)} onFocusCapture={() => setTouched(true)}>
    <div className={s.studioCanvas} style={{ "--palette-color": colors[color][1] } as CSSProperties}>
      <div className={s.studioMat} />
      <div className={s.studioPhoto} data-compare={compare}>
        <img src={image("orig")} alt="P001 原有造型" width={672} height={900} loading="lazy" />
        <img src={image(hair)} alt={hair === "orig" ? "P001 原图" : `P001 ${hairName} AI 造型模拟`} width={672} height={900} loading="lazy" style={{ opacity: hold.holding ? 0 : 1 }} />
        <span className={s.studioPhotoLabel}>{hold.holding || hair === "orig" ? "原有造型" : "AI 造型模拟"}</span>
        {compare && <span className={s.studioCompareLine} aria-hidden />}
      </div>
      <div className={s.studioCanvasTop}><span>LOOK STUDIO / 001</span><span>无眼镜</span></div>
      <div className={s.studioCanvasBottom}><span>{compare ? "左侧原图 / 右侧发型探索" : "同一张照片，探索不同方向"}</span><HoldButton holding={hold.holding} props={hold.props} disabled={hair === "orig"} /></div>
    </div>
    <div className={s.studioPanel}>
      <p className={s.eyebrow}>YOUR STYLE, YOUR CHOICE.</p><h3>留住自己，<br /><em>试一点不同。</em></h3>
      <div className={s.studioTabs} role="tablist" aria-label="造型选项">{[["hair", "发型"], ["color", "配色"], ["optional", "按需选镜"]].map(([key, label]) => <button key={key} type="button" role="tab" id={`${compact ? "mini" : "full"}-${key}`} aria-controls={`${compact ? "mini" : "full"}-panel`} aria-selected={tab === key} onClick={() => { setTab(key); setTouched(true); }}>{label}</button>)}</div>
      <div className={s.studioOptions} role="tabpanel" id={`${compact ? "mini" : "full"}-panel`} aria-labelledby={`${compact ? "mini" : "full"}-${tab}`}>
        {tab === "hair" ? <><p className={s.optionIntro}>选择一个方向，照片会在原位切换。</p>{[["orig", "现在", "保留原有发型"], ["safe", "稳妥", "偏分蓬松中长发"], ["easy", "省心", "耳下短直发"]].map(([key, label, name]) => <button type="button" key={key} className={s.hairOption} aria-pressed={hair === key} onClick={() => choose(key)}><span>{label}</span><b>{name}</b><i>{hair === key && <Check size={13} />}</i></button>)}<p className={s.optionDescription}>{hair === "orig" ? "保持原有发型也可以。先看看其他方向，再决定是否改变。" : hair === "safe" ? "用偏分和发尾的弧线调整轮廓。先试着看一看，再和发型师讨论。" : "更短、更轻的一个方向。把日常打理的习惯，也放进选择里。"}</p></>
          : tab === "color" ? <div className={s.colorStudy}><p>把颜色放在照片旁边，观察不同的搭配氛围。</p><div>{colors.map(([name, hex], i) => <button key={name} type="button" aria-pressed={color === i} onClick={() => { setColor(i); setSaved(false); }}><i style={{ background: hex }} />{name}</button>)}</div><p className={s.optionDescription}>此处演示近脸配色的版式与切换；照片保留原色。</p></div>
          : <div className={s.optionalGlasses}><span>可选探索</span><h4>平时戴眼镜，<br />再来选适合的镜框。</h4><p>人物默认不添加眼镜。选镜作为独立选项继续细化，先把关注点留给自己的轮廓与风格。</p></div>}
      </div>
      <div className={s.studioSave}><span>{saved ? "已保存到本次演示" : hairName}</span>{production ? <Link href="/start" className={s.button}>用自己的照片试试 <ArrowUpRight size={16} /></Link> : <button type="button" className={s.button} onClick={() => setSaved(true)}>{saved ? <Check size={16} /> : <Bookmark size={16} />}{saved ? "已保存这个方向" : "保存这个方向"}</button>}{saved && <p role="status" className={s.savedNote}>已保留「{hairName}」。<button type="button" onClick={() => { setSaved(false); setHair("orig"); }}>再试一个方向 <RotateCcw size={12} /></button></p>}</div>
      <div className={s.studioSteps} aria-label="探索过程">{["选择", "比较", "保存"].map((label, i) => <span key={label} data-active={(saved ? 2 : compare || hold.holding ? 1 : 0) === i}><i>0{i + 1}</i>{label}</span>)}</div>
      <p className={s.demoNote}>{production ? "AI 模拟示例 · 上传自己的照片后，可生成并保存个人造型选项" : "交互演示 · 使用已有示例图，保存仅在本页生效"}</p>
    </div>
    {compact && <div className={s.studioMobileSummary}><span>{scene === 0 ? "01 / 选择一个方向" : scene === 1 ? "02 / 看看发型变化" : "03 / 比较，再决定"}</span><p>{scene === 0 ? "保留原有造型，也是一个选项。" : scene === 1 ? "偏分蓬松中长发 · AI 造型模拟" : "同一张照片，原有造型与发型探索。"}</p></div>}
  </div>;
}
