"use client";

import Link from "next/link";
import { ArrowUpRight, ArrowRight } from "lucide-react";
import { HoldButton, useHold } from "@/components/ds/HoldButton";
import { contourPath, type HeroInsight } from "./model";
import s from "./preview.module.css";

function StartAction() {
  return <Link href="/start" className={s.start}>开始分析 <ArrowUpRight size={18} strokeWidth={1.4} aria-hidden /></Link>;
}

export function HeroPreview({ subject, insight }: { subject: { key: string; label: string; photo: string; width: number; height: number }; insight: HeroInsight }) {
  const hold = useHold();
  const reportHref = `/report/sample?v=${subject.key}`;
  const W = subject.width, H = subject.height;
  const X = (x: number) => x * W, Y = (y: number) => y * H;
  return (
    <div className={s.preview} data-ap-theme="light" data-beauty-hero-preview>
      <header className={s.header}>
        <Link href="/" className={s.brand} aria-label="BeautyAI 首页">BeautyAI<span>个人形象顾问</span></Link>
        <nav aria-label="主导航">
          <Link href={reportHref}>示例报告</Link>
          <Link href="/about" className={s.desktopNav}>照片与数据</Link>
          <Link href="/start" className={s.desktopNav}>开始分析 <ArrowUpRight size={15} aria-hidden /></Link>
        </nav>
      </header>
      <section className={s.hero} aria-labelledby="hero-title">
        <div className={s.intro}>
          <p className={s.eyebrow}>BEAUTY, ON YOUR TERMS</p>
          <h1 id="hero-title">看懂自己，<br />风格由你。</h1>
          <p className={s.lead}>从一张正脸，理解轮廓与比例。<br />让发型、眼镜和风格选择，更有依据。</p>
          <div className={s.desktopActions}><StartAction /><Link href={reportHref} className={s.textLink}>查看示例报告 <ArrowRight size={15} aria-hidden /></Link></div>
          <p className={s.introNote}>理解特点，而非定义好坏。</p>
        </div>
        <figure className={s.figure} aria-label={`${subject.label}，同人物真实流水线分析示例`}>
          <div className={s.photo}>
            {/* Photo and SVG use the same intrinsic coordinate system and centered cover crop. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={subject.photo} width={W} height={H} alt={`${subject.label}的正脸原图，未经本预览修饰`} fetchPriority="high" />
            {insight && <svg className={s.overlay} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true" data-hidden={hold.holding} data-metric={insight.metricId}>
              <g className={s.geometry}>
                <path d={contourPath(insight.overlay.contour, W, H)} className={s.contour} />
                {insight.overlay.segments.map((line, i) => <g key={i}>
                  <line x1={X(line.a[0])} y1={Y(line.a[1])} x2={X(line.b[0])} y2={Y(line.b[1])} strokeDasharray={line.role === "reference" ? "5 6" : undefined} />
                  {[line.a, line.b].map(([x, y], j) => <path key={j} d={`M${X(x)},${Y(y) - 9}V${Y(y) + 9}`} />)}
                </g>)}
              </g>
              {insight.overlay.segments.map((line, i) => <text key={i} x={X(Math.max(line.a[0], line.b[0]) + .028)} y={Y((line.a[1] + line.b[1]) / 2) + 5} className={s.svgLabel}>{line.role === "reference" ? "颧宽" : "下颌宽"}</text>)}
            </svg>}
            <span className={s.photoIndex}>02 / PORTRAIT STUDY</span>
          </div>
          <figcaption className={s.caption}><span>{subject.label} · 分析示例</span>{insight && <HoldButton {...hold} label="按住看原图" />}</figcaption>
        </figure>
        <aside className={s.insight} aria-label="来自这张照片的分析洞察">
          <p className={s.eyebrow}>从特点，到选择</p>
          {insight ? <>
            <div className={s.metricBlock}><span className={s.metricName}>{insight.name}</span><p className={s.number}>{insight.value}<span> / 1</span></p></div>
            <p className={s.seen}>{insight.seen}</p>
            <p className={s.meaning}>{insight.meaning}</p>
            {insight.advice && <div className={s.advice}><p>对发型选择的启发</p><blockquote>{insight.advice}</blockquote></div>}
            <Link href={reportHref} className={s.textLink}>查看此人的完整报告 <ArrowUpRight size={15} aria-hidden /></Link>
            <p className={s.caveat}>比例是线索，不是审美标准。</p>
          </> : <p className={s.meaning}>此示例的测量暂不可用。<Link href={reportHref}>查看示例报告</Link></p>}
        </aside>
        <div className={s.mobileActions}><StartAction /><span>一张正脸，开始了解自己</span></div>
      </section>
      <footer className={s.footer}><span>理解，不是评判。</span><span>INSIGHT IN SERVICE OF CHOICE</span></footer>
    </div>
  );
}
