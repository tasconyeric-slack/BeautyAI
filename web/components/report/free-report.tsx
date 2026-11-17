"use client";

import Link from "next/link";
import { formatTopPercent, rankScopeNote, rankUnavailable } from "@/lib/rank-format";
import { RankPosition } from "@/components/profile/score-hero";
import { HarmonyRadar, ReferenceDensity } from "@/components/profile/score-charts";
import type { PassportResponse } from "@/lib/api";

/** Production free report: an allowlisted CV result, never a redacted generative Passport. */
export function FreeReport({ data }: { data: PassportResponse }) {
  const result = data.free_result;
  if (!result) return <p role="status" className="mx-auto max-w-4xl px-6 py-12">基础测量尚未完成。</p>;
  const { score, rank, metrics } = result;
  const pending = data.entitlement.paid && !data.passport;
  const showRank = rank.status === "available" && rank.percentile != null;
  return <main className="mx-auto max-w-5xl px-5 pb-20 pt-10 sm:px-8" data-testid="free-cv-report">
    <header className="border-b border-rule pb-8">
      <p className="mb-2 text-[12px] tracking-[.2em] text-muted">BEAUTYAI / {pending ? "完整报告生成中" : "免费测评结果"}</p>
      <h1 className="font-serif text-[32px] leading-tight text-ink sm:text-[44px]">你的免费测评结果</h1>
      <p className="mt-3 max-w-2xl text-[14px] leading-7 text-ink-soft">
        先看颜值评分与面部比例，发现自己的特点。
      </p>
    </header>
    <div className="grid gap-7 py-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
      <div className="order-2 mx-auto w-32 md:order-1 md:w-full">
        {data.media.front && !data.media.expired
          ? <img className="w-full rounded-[12px] bg-paper-sunk object-cover" src={data.media.front} alt="用于测量的正脸照" />
          : <div className="flex aspect-[4/5] items-center justify-center rounded-[12px] bg-paper-sunk text-[13px] text-muted">照片已到期删除</div>}
      </div>
      <section aria-label="评分与排名" className="order-1 flex flex-col gap-5 md:order-2">
        <div className="rounded-[14px] border border-rule bg-paper-raised p-6">
          <p className="text-[13px] text-muted">{score.label}</p>
          <div className="mt-2 font-serif text-[56px] leading-none text-ink" data-testid="free-score">
            {score.value != null ? score.value.toFixed(1) : "—"}
            <span className="ml-2 text-[18px] text-muted">/ {score.scale}</span>
          </div>
          {score.value == null
            ? <p className="mt-4 text-[12px] leading-6 text-muted">颜值评分暂时不可用，请稍后重试。</p>
            : !showRank ? <p className="mt-4 text-[12px] leading-6 text-muted">颜值分为模型估计，仅供参考。</p> : null}
        </div>
        <div className="rounded-[14px] border border-rule bg-paper-raised p-6">
          <p className="text-[13px] text-muted">参考排名</p>
          <div className="mt-2 font-serif text-[38px] text-ink" data-testid="free-rank">
            {showRank ? "Top " + formatTopPercent(rank.top_percent ?? (100 - rank.percentile!)) + "%" : "暂不可用"}
          </div>
          {showRank && rank.estimated && <p className="text-[12px] text-muted">模型估计</p>}
          {showRank && rank.distribution && score.value != null
            ? <div className="mt-6"><ReferenceDensity curve={rank.distribution} score={score.value} /></div>
            : showRank ? <RankPosition percentile={rank.percentile!} /> : null}
          <p className="mt-2 text-[12px] leading-6 text-muted" data-testid="free-rank-scope">{showRank ? rankScopeNote(rank.label) : rankUnavailable(rank.unavailable_reason)}</p>
        </div>
      </section>
    </div>
    <section aria-label="代表性面部测量" className="border-t border-rule pt-8">
      <h2 className="font-serif text-[25px]">你的面部特点</h2>
      <p className="mt-2 text-[13px] text-muted">从各部位的一项基础测量，了解你的五官与面部比例。</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {metrics.map((m, i) => <div key={i} className="rounded-[12px] border border-rule bg-paper-raised p-5" data-testid="free-metric">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[15px] font-medium">{m.chapter}</h3>
          </div>
          <div className="mt-4 flex items-baseline justify-between gap-3 text-[14px]">
            <span className="text-ink-soft">{m.name ?? "代表性测量"}</span>
            <strong className="font-mono text-[17px]">{formatMetric(m)}</strong>
          </div>
        </div>)}
      </div>
    </section>
    {result.harmony && <details aria-label="面部几何协调度" className="border-t border-rule py-8">
      <summary className="min-h-11 cursor-pointer font-serif text-[20px]">查看面部几何协调度</summary>
      <p className="mt-2 text-[12px] leading-6 text-muted">这些比例数据用于了解面部结构，不参与上方颜值分和参考排名的计算。</p>
      <div className="mt-5 max-w-[330px]"><HarmonyRadar axes={result.harmony} /></div>
    </details>}
    <section className="mt-10 flex flex-col gap-3 rounded-[16px] border border-rule bg-paper-raised p-6 sm:p-8">
      <h2 className="font-serif text-[25px]">{pending ? "完整护照正在生成" : "找到更适合你的改变"}</h2>
      <p className="max-w-2xl text-[14px] leading-7 text-ink-soft">
        {pending ? "付款已确认。正在生成完整个性化报告，完成后即可访问全部测量、Studio 和 PDF。" :
          "了解自己的优势、找到适合的造型，知道下一步怎么做。完整报告提供详细面部解读与个性化形象建议。"}
      </p>
      {!pending && <p className="max-w-2xl text-[12px] leading-6 text-muted">免费版含评分、参考排名与各部位一项基础测量；¥139 一次解锁全部可靠测量与解读、完整形象建议、Studio、3 张 AI 发型效果图与 PDF 下载。</p>}
      <div className="flex flex-wrap items-center gap-5"><Link href={"/p/" + data.id + "/unlock"} className="inline-flex min-h-11 w-fit items-center rounded-full bg-accent px-6 text-[14px] text-[var(--ap-on-primary)]">
        {pending ? "查看生成状态" : "解锁完整护照 · ¥139"}
      </Link><Link href="/report/sample" className="inline-flex min-h-11 items-center text-[14px] text-accent">查看完整示例报告</Link></div>
    </section>
  </main>;
}

function formatMetric(m: NonNullable<PassportResponse["free_result"]>["metrics"][number]): string {
  if (m.value == null || m.decimals == null) return "暂不可用";
  const decimals = Math.max(0, Math.min(3, m.decimals));
  if (m.unit === "fraction" || m.unit === "pct_face") return (m.value * 100).toFixed(decimals) + "%";
  if (m.unit === "deg") return m.value.toFixed(decimals) + "°";
  if (m.unit === "px") return m.value.toFixed(decimals) + " px";
  return m.value.toFixed(decimals);
}
