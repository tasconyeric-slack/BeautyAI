import Link from "next/link";
import { Stage, SwatchRow } from "@/components/ds";
import { CHAPTER_KEYS, chapterNo } from "@/components/report/report-model";
import { PhotoGuide } from "@/components/upload/photo-guide";
import { colorGroups } from "@/lib/adapters";
import { consent, report } from "@/lib/copy/zh";
import type { DemoCase } from "@/lib/fixtures/demo_cases";
import s from "./product-journey.module.css";

/** Product handoff only: existing report, Studio palette and upload guide; no new analysis or preview engine. */
export function ProductJourney({ sample }: { sample: DemoCase }) {
  const sampleHref = `/report/sample?v=${sample.key}`;
  const colors = colorGroups(sample.passport).find(g => g.key === "favor")?.colors ?? [];
  return <div className={s.root}>
    <section id="passport" className={s.section} aria-labelledby="passport-title">
      <div className={s.reportGrid}>
        <header className={s.intro}>
          <h2 id="passport-title">把线索，整理成<br />一份形象护照。</h2>
          <p>从照片里的发现，到下一次剪发前的准备。七章报告把依据、建议和行动放在一起，可以随时回看。</p>
          <p className={s.note}>从面部特点到造型选择，完整读懂一份形象护照。</p>
          <Link prefetch={false} href={sampleHref} className={s.primary}>阅读完整示例报告</Link>
        </header>
        <ol className={s.contents} aria-label="示例报告七章目录">
          {CHAPTER_KEYS.map(key => <li key={key}><Link prefetch={false} href={`${sampleHref}#${key}`}>
            <span className={s.number}>{chapterNo(key)}</span><span><strong>{report.chapters[key].title}</strong><small>{report.chapters[key].sub}</small></span><span aria-hidden>↗</span>
          </Link></li>)}
        </ol>
      </div>
    </section>
    <section id="studio" className={`${s.section} ${s.studio}`} aria-labelledby="studio-title">
      <div className={s.studioGrid}>
        <div className={s.palette}>
          <Stage className={s.portrait}><img src={sample.photos.front} alt="造型探索原图" width={960} height={1200} loading="lazy" /></Stage>
          <div className={s.paletteText}><p>她的报告推荐近脸色</p><SwatchRow colors={colors} /><p className={s.note}>原始分析照与推荐色卡，未作试色或发型编辑。</p></div>
        </div>
        <div className={s.intro}>
          <h2 id="studio-title">先理解方向，<br />再到 Studio 试一试。</h2>
          <p>创建自己的报告后，把建议放回照片上比较。四个工作区沿用同一张肖像，逐项调整自己的选择。</p>
          <dl className={s.capabilities}>
            <div><dt>发型与发色</dt><dd>比较发型方向、本地试发色。AI 发型生成需要完整护照，成功后才显示效果。</dd></div>
            <div><dt>妆容与配色</dt><dd>按可用定位试唇色、腮红、眉眼与近脸色；遮挡或定位不足时会说明。</dd></div>
            <div><dt>眼镜</dt><dd>比较镜框轮廓并调整贴合，仅作外观模拟。</dd></div>
            <div><dt>我的造型</dt><dd>保存选好的参数，回到行动计划；实际试色效果受光线与底色影响。</dd></div>
          </dl>
          <Link prefetch={false} href="/start" className={s.primary}>上传照片，开始自己的造型</Link>
          <p className={s.note}>公开示例只供浏览。个人报告中可保存造型选项，带到行动计划中；未生成的发型不会变成预览图。</p>
          <Link prefetch={false} href={`${sampleHref}#options`} className={s.textLink}>先看示例中的形象方案</Link>
        </div>
      </div>
    </section>
    <section id="how-it-works" className={s.section} aria-labelledby="how-title">
      <header className={s.intro}><h2 id="how-title">从一张清楚的正脸开始。</h2><p>先把照片拍好，再让分析帮你做选择。</p></header>
      <ol className={s.steps}>
        <li><b>上传与质检</b><p>阅读照片说明并同意后上传。先检查清晰度、光线和角度；不合适时按提示重拍。</p></li>
        <li><b>读懂报告</b><p>查看已有测量、解读和建议。缺少照片或测量依据的部分，会明确说明。</p></li>
        <li><b>试造型，带走计划</b><p>在 Studio 比较可用选项，把自己选好的方向保存到行动计划。</p></li>
      </ol>
      <PhotoGuide />
    </section>
    <section id="start-analysis" className={`${s.section} ${s.closing}`} aria-labelledby="start-title">
      <div className={s.intro}><h2 id="start-title">下一次改变，<br />从了解自己开始。</h2><p>先看懂，再决定。把建议当作选择的参考，保留自己的偏好。</p><Link prefetch={false} href="/start" className={s.primary}>开始我的分析</Link><Link href="/about" className={s.textLink}>了解分析方法与照片隐私</Link></div>
      <div className={s.faq}>
        <details><summary>照片会保存多久？</summary><p>{consent.retention}{consent.deleteInstruction}裁剪编辑器中最初选择的原文件不会离开浏览器。</p></details>
        <details><summary>参考分能说明什么？</summary><p>AI 面部美学参考分来自照片中的几何比例，只提供有限的测量参考，不是吸引力定论。光线、角度和测量可用性都会影响结果。</p></details>
        <details><summary>哪些功能需要完整护照？</summary><p>免费与完整护照的范围可在报告中查看。AI 发型生成需要完整护照，且可能失败；即时试色和外观模拟不等同于真实染发、化妆或配镜效果。</p></details>
      </div>
    </section>
  </div>;
}
