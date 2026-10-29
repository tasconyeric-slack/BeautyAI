"use client";

import Link from "next/link";
import { useState } from "react";
import type { Chapter, Plate } from "@/components/home/model";
import s from "./v3.module.css";

type HairOption = {
  tier: string;
  status: string;
  rank: number;
  issue: string | null;
};

const NAMES: Record<string, string> = { safe: "稳妥", easy: "省心", bold: "突破" };

/**
 * Public-safe preview state: the registered P001 original + report-backed advice.
 * A true before/after control MUST NOT mount until #39 supplies an approved same-photo
 * pair and a separately verified asset record. No speculative visual transformations.
 */
export function Transformation({
  plate,
  hair,
  options,
}: {
  plate: Plate;
  hair: Chapter | null;
  options: HairOption[];
}) {
  const available = options.filter((o) => o.status === "ok").sort((a, b) => a.rank - b.rank);
  const excluded = options.filter((o) => o.status !== "ok");
  const [tier, setTier] = useState(available[0]?.tier ?? "");
  const chosen = available.find((o) => o.tier === tier) ?? available[0];
  return (
    <section id="transformation" className={s.transformation} aria-labelledby="v3-transform-title">
      <div className={s.sectionIndex}>
        <span><b>01</b> 选择的差别</span>
        <span>同一张脸 <i aria-hidden="true" /> 不同选择</span>
      </div>
      <div className={s.sectionHead}>
        <div>
          <p className={s.eyebrow}>发型与比例</p>
          <h2 id="v3-transform-title" className={s.displayTitle}>
            <span>同一张脸，</span><span>换一种选择。</span>
          </h2>
        </div>
        <p className={s.intro}>发型不会改变五官，但会改变比例被看见的方式。下面的方向来自示例 001 的分析与建议；尚未生成可供比较的合格配对图。</p>
      </div>

      <div className={s.transformGrid}>
        <figure className={s.originalFigure}>
          <div className={s.originalFrame}>
            <img src={plate.src} width={plate.width} height={plate.height}
              loading="lazy" draggable={false} alt="示例 001：AI 合成女性人物的原始正脸照片，尚未应用发型模拟" />
            <span className={s.imageBadge}>原始照片 · AI 合成</span>
            <span className={s.imageFoot}>造型建议 / 尚无获批的对比图</span>
          </div>
          <figcaption className={s.figureFoot}>
            <span>01 / 01　示例人物 001</span>
            <span>原图展示</span>
          </figcaption>
        </figure>

        <div className={s.transformDetail}>
          <p className={s.eyebrow}>报告给出的方向</p>
          <div className={s.tierButtons} aria-label="选择发型方向">
            {available.map((o) => (
              <button type="button" key={o.tier} className={s.tierButton}
                aria-pressed={chosen?.tier === o.tier} onClick={() => setTier(o.tier)}>
                <span>{NAMES[o.tier] ?? o.tier}</span>
                <small>排序 {o.rank}</small>
              </button>
            ))}
          </div>

          {hair && chosen ? (
            <div className={s.hairPanel} aria-live="polite">
              <p className={s.eyebrow}>{NAMES[chosen.tier] ?? chosen.tier} · 方向 {chosen.rank}</p>
              <h3 className={s.hairTitle}>
                {chosen.tier === "safe" ? "7:3 侧分 · 发尾内扣" : "省心造型方向"}
              </h3>
              <dl className={s.decisionList}>
                <div><dt>依据</dt><dd>{hair.metricName} · {hair.value}</dd></div>
                <div><dt>观察</dt><dd>{hair.seen}</dd></div>
                <div><dt>建议</dt><dd>{hair.advice.map((item) => item.text).join("；")}</dd></div>
                {chosen.tier === "safe" && <div><dt>剪发参考</dt><dd>{hair.action}</dd></div>}
                {chosen.tier !== "safe" && <div><dt>说明</dt><dd>该方向在示例报告中通过筛选，具体造型与效果图仍需确认；不把方向名称当作已生成效果。</dd></div>}
              </dl>
            </div>
          ) : (
            <p className={s.unavailable}>这份示例暂时没有可展示的发型方向。</p>
          )}

          {excluded.map((option) => (
            <p className={s.rejected} key={option.tier}>
              {NAMES[option.tier] ?? option.tier}方向未推荐{option.issue ? "：" + option.issue : ""}
            </p>
          ))}
          <div className={s.transformActions}>
            <Link href="/start" prefetch={false} className={s.darkCta}>找到我的风格方向 <span aria-hidden="true">→</span></Link>
            <a href="#reading" className={s.textLink}>为什么是这个方向？ ↓</a>
          </div>
          <p className={s.missingNotice}>此处为造型建议。发型预览待生成。真实的前后对比需要 #39 通过同人配对与授权验收。</p>
        </div>
      </div>
    </section>
  );
}
