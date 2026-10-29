"use client";
import * as React from "react";
import s from "@/components/journey/journey.module.css";

const GUIDES = [
  { id: "ready", tab: "合格", title: "先拍好一张正脸", text: "单人平视镜头，五官完整。面向窗户，保留清晰原图，日常自然发型就好。" },
  { id: "blur", tab: "清晰", title: "让五官细节看得清", text: "擦净镜头并对焦，避免晃动。不要用截图、压缩图或放大小图代替原图。" },
  { id: "angle", tab: "角度", title: "正脸平视，侧脸选填", text: "拍正脸时面向镜头，下巴放平。补充侧脸时，使用接近 90° 的真侧面。" },
  { id: "dark", tab: "光线", title: "面向柔和、均匀的光", text: "白天面向窗户，避免背光、直射阳光和强闪光。尽量关掉美颜与滤镜。" },
  { id: "covered", tab: "遮挡", title: "把眉眼露出来", text: "撩开遮眼头发、摘下墨镜。日常眼镜照片可以放在选填的参考位置。" },
] as const;
export function PhotoGuide() {
  const [selected, setSelected] = React.useState(0);
  const [touched, setTouched] = React.useState(false);
  const root = React.useRef<HTMLElement>(null);
  React.useEffect(() => {
    if (!window.matchMedia || typeof IntersectionObserver === "undefined" || touched || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let visible = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let step = 0;
    const schedule = () => {
      clearTimeout(timer);
      if (!visible || document.hidden || step >= 2) return;
      timer = setTimeout(() => { step += 1; setSelected(step === 1 ? 3 : 0); schedule(); }, 5000);
    };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; schedule(); }, { threshold: 0.5 });
    if (root.current) observer.observe(root.current);
    document.addEventListener("visibilitychange", schedule);
    return () => { clearTimeout(timer); observer.disconnect(); document.removeEventListener("visibilitychange", schedule); };
  }, [touched]);
  const current = GUIDES[selected];
  return <aside ref={root} onPointerDown={() => setTouched(true)} onFocusCapture={() => setTouched(true)} className={s.guide} aria-label="拍照指引">
    <img key={current.id} src={`/guides/qc/${current.id}.svg`} alt={`${current.title}，拍照示意图`} width={320} height={280} />
    <div className={s.guideContent}><div><h2>{current.title}</h2><p>{current.text}</p></div>
      <div className={s.guideChoices} aria-label="切换拍照提示">{GUIDES.map((g, i) => <button key={g.id} type="button" aria-pressed={i === selected} onClick={() => setSelected(i)}>{g.tab}</button>)}</div>
    </div>
  </aside>;
}
