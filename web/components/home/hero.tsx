"use client";
import Link from "next/link";
import { useRef } from "react";
import { PortraitStage, ViewControls, profileVars, useSignature } from "./signature";
import type { HeroView } from "./model";
import s from "./home.module.css";
import x from "./signature.module.css";

/** Portrait-as-environment hero. The page field is the portrait's own backdrop tone; the plate has no frame.
 *  The headline sits on the subject's measured eye line, which continues across the page as a hairline.
 *  Signature motion (signature.tsx): the same person's front and measured profile photos, each with its own landmarks. */
export function Hero({ v }: { v: HeroView }) {
  const { plate } = v;
  const root = useRef<HTMLElement>(null);
  const sig = useSignature(v.profile, root);
  const W = plate.width, H = plate.height;
  // Horizontal face axis: centre of the measured cheek width (falls back to the image centre).
  const axis = v.width ? (v.width.a[0] + v.width.b[0]) / 2 : 0.5;
  const vars = {
    "--aspect": `${W / H}`,
    "--axis": `${axis}`,
    "--eye": `${v.eyeLine ?? 0.4}`,
    "--eye-x": `${v.eyeOuter ? v.eyeOuter[0] : 0.37}`,
    ...profileVars(v),
  } as React.CSSProperties;

  return (
    <section ref={root} className={`${s.hero} ${x.signature} ${sig.play === "paused" ? x.paused : ""}`} style={vars}
      data-view={sig.view} aria-labelledby="home-title">
      <PortraitStage v={v} view={sig.view} entry={sig.entry} onProfileLoad={sig.onProfileLoad} />

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

      {v.profile && (
        <ViewControls p={v.profile} view={sig.view} play={sig.play} announce={sig.announce}
          choose={sig.choose} toggle={sig.toggle} />
      )}
    </section>
  );
}
