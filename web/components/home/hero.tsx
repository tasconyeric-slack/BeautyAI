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
export function Hero({ v, uploadHref = "/start", headline, subtitle }: { v: HeroView; uploadHref?: string; headline?: string; subtitle?: string }) {
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
          <Link prefetch={false} href={uploadHref} className={s.navCta}>开始分析</Link>
        </div>
      </nav>

      <div className={s.heroAbove}>
        <p className={s.eyebrow}>BEAUTYAI · PERSONAL BEAUTY ANALYSIS</p>
        <h1 id="home-title" className={s.h1} style={headline ? { maxWidth: "8em" } : undefined}>
          {headline ?? <><span>知道自己哪里好看，</span><span>也知道怎样更好看。</span></>}
        </h1>
      </div>
      <div className={s.eyeRule} aria-hidden><span className={s.eyeRuleLabel}>眼位线</span></div>
      <div className={s.heroBelow}>
        <p className={s.lead}>
          {subtitle ?? <>每个人都有独特的美，也有更适合自己的风格。<span className={s.leadDetail}>从面部比例、五官特征到整体协调度，发现你的形象优势，找到值得改善的细节，让变美不再只是凭感觉。</span></>}
        </p>
        <p className={s.valueLine}>颜值评分 · 五官解析 · 个性化形象建议</p>
        <div className={s.ctaRow}>
          <Link prefetch={false} href={uploadHref} className={s.cta}>
            上传照片，免费测评
            <svg viewBox="0 0 16 16" aria-hidden className={s.ctaArrow}><path d="M3 8h10M9 4l4 4-4 4" /></svg>
          </Link>
          <Link prefetch={false} href={v.reportHref} className={s.ctaGhost}>查看示例报告</Link>
        </div>
      </div>

      <div className={s.heroFoot}>
        <a href="#reading" className={s.scrollCue}>
          <span className={s.scrollLine} aria-hidden />
          发现你的面部特点
        </a>

      </div>

      {v.profile && (
        <ViewControls p={v.profile} view={sig.view} play={sig.play} announce={sig.announce}
          choose={sig.choose} toggle={sig.toggle} />
      )}
    </section>
  );
}
