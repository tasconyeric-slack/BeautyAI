"use client";
import Link from "next/link";
import { useSize } from "./use-size";
import { Bracket, smoothPath } from "./overlay";
import type { HeroView } from "./model";
import s from "./home.module.css";

/** Portrait-as-environment hero. The page field is the portrait's own backdrop tone; the plate has no frame.
 *  The headline sits on the subject's measured eye line, which continues across the page as a hairline. */
export function Hero({ v }: { v: HeroView }) {
  const { plate } = v;
  const [ref, box] = useSize<HTMLDivElement>();
  const unit = box.h ? box.h / plate.height : 0.8;
  const W = plate.width, H = plate.height;
  // Horizontal face axis: centre of the measured cheek width (falls back to the image centre).
  const axis = v.width ? (v.width.a[0] + v.width.b[0]) / 2 : 0.5;
  const dim = v.width ? { x: Math.min(0.95, Math.max(v.width.a[0], v.width.b[0]) + 0.085) } : null;
  const vars = {
    "--aspect": `${W / H}`,
    "--axis": `${axis}`,
    "--eye": `${v.eyeLine ?? 0.4}`,
    "--eye-x": `${v.eyeOuter ? v.eyeOuter[0] : 0.37}`,
  } as React.CSSProperties;

  return (
    <section className={s.hero} style={vars} aria-labelledby="home-title">
      <div className={s.heroPlate} ref={ref} aria-hidden>
        {/* exact intrinsic size; the overlay shares its box */}
        <img src={plate.src} width={W} height={H} alt="" className={s.heroImg} fetchPriority="high" />
        <svg viewBox={`0 0 ${W} ${H}`} className={s.heroSvg} preserveAspectRatio="none">
          <path d={smoothPath(v.contour, W, H)} pathLength={1} className={`${s.lnContour} ${s.heroContour}`} />
          {v.width && <Bracket a={v.width.a} b={v.width.b} W={W} H={H} unit={unit} className={s.heroWid} />}
          {dim && v.length && (
            // Face length drawn as an offset dimension line (same two heights, moved beside the face).
            <g className={s.heroLen}>
              <line x1={v.length.a[0] * W} y1={v.length.a[1] * H} x2={dim.x * W} y2={v.length.a[1] * H}
                className={s.lnRef} strokeDasharray={`${3 / unit} ${5 / unit}`} />
              <line x1={v.length.b[0] * W} y1={v.length.b[1] * H} x2={dim.x * W} y2={v.length.b[1] * H}
                className={s.lnRef} strokeDasharray={`${3 / unit} ${5 / unit}`} />
              <Bracket a={[dim.x, v.length.a[1]]} b={[dim.x, v.length.b[1]]} W={W} H={H} unit={unit} />
            </g>
          )}
        </svg>
        {dim && v.length && (
          <span className={`${s.tag} ${s.heroTagLen}`}
            style={{ left: `${dim.x * 100}%`, top: `${((v.length.a[1] + v.length.b[1]) / 2) * 100}%` }}>
            面长
          </span>
        )}
        {v.width && (
          <span className={`${s.tag} ${s.heroTagWid}`}
            style={{ left: `${Math.min(v.width.a[0], v.width.b[0]) * 100}%`, top: `${v.width.a[1] * 100}%` }}>
            颧宽
          </span>
        )}
      </div>

      <nav className={s.nav} aria-label="主导航">
        <Link href="/" className={s.brand}>
          <span className={s.brandMark}>BeautyAI</span>
          <span className={s.brandSub}>形象护照</span>
        </Link>
        <div className={s.navLinks}>
          <Link prefetch={false} href={v.reportHref} className={s.navLink}>示例报告</Link>
          <Link href="/about" className={s.navLink}>照片与数据</Link>
          <Link prefetch={false} href="/start" className={s.navCta}>开始分析</Link>
        </div>
      </nav>

      <div className={s.heroAbove}>
        <p className={s.eyebrow}>面部测量 <span aria-hidden>／</span> 风格决策</p>
        <h1 id="home-title" className={s.h1}>
          <span>读懂这张脸，</span>
          <span>再决定风格。</span>
        </h1>
      </div>
      <div className={s.eyeRule} aria-hidden><span className={s.eyeRuleLabel}>眼位线</span></div>
      <div className={s.heroBelow}>
        <p className={s.lead}>
          一张正脸照，读出轮廓、比例与五官间距。每一项观察都附上解读，并落到发型、眉形、眼镜与妆容的具体选择上。
        </p>
        <div className={s.ctaRow}>
          <Link prefetch={false} href="/start" className={s.cta}>
            上传正脸，开始分析
            <svg viewBox="0 0 16 16" aria-hidden className={s.ctaArrow}><path d="M3 8h10M9 4l4 4-4 4" /></svg>
          </Link>
          <Link prefetch={false} href={v.reportHref} className={s.ctaGhost}>先看一份示例报告</Link>
        </div>
      </div>

      <div className={s.heroFoot}>
        <a href="#reading" className={s.scrollCue}>
          <span className={s.scrollLine} aria-hidden />
          观察 → 解读 → 建议
        </a>
        <span className={s.heroNote}>只描述特点，不评判长相</span>
      </div>
    </section>
  );
}
