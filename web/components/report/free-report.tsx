"use client";

import Link from "next/link";
import { LockKeyhole } from "lucide-react";
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
      <h1 className="font-serif text-[32px] leading-tight text-ink sm:text-[44px]">你的面部分析，已完成第一步。</h1>
      <p className="mt-3 max-w-2xl text-[14px] leading-7 text-ink-soft">
        本页仅包含照片关键点计算结果。详细解释、个性化形象建议及 AI 发型模拟在完整护照中提供。
      </p>
    </header>
    <div className="grid gap-7 py-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
      <div>
        {data.media.front && !data.media.expired
          ? <img className="w-full rounded-[12px] bg-paper-sunk object-cover" src={data.media.front} alt="用于测量的正脸照" />
          : <div className="flex aspect-[4/5] items-center justify-center rounded-[12px] bg-paper-sunk text-[13px] text-muted">照片已到期删除</div>}
      </div>
      <section aria-label="评分与排名" className="flex flex-col gap-5">
        <div className="rounded-[14px] border border-rule bg-paper-raised p-6">
          <p className="text-[13px] text-muted">{score.label}</p>
          <div className="mt-2 font-serif text-[56px] leading-none text-ink" data-testid="free-score">
            {score.value != null ? score.value.toFixed(1) : "—"}
            <span className="ml-2 text-[18px] text-muted">/ {score.scale}</span>
          </div>
          {score.value == null
            ? <p className="mt-4 text-[12px] leading-6 text-muted">Ridge 评分暂不可用。请勿将几何协调分替代为颜值预测；模型及参考样本需在生产环境就绪。</p>
            : <p className="mt-4 text-[12px] leading-6 text-muted">基于面部几何特征的 Ridge 回归预测；结果受照片质量和训练样本影响。</p>}
        </div>
        <div className="rounded-[14px] border border-rule bg-paper-raised p-6">
          <p className="text-[13px] text-muted">参考样本百分位</p>
          <div className="mt-2 font-serif text-[38px] text-ink" data-testid="free-rank">
            {showRank ? String(rank.percentile) + "%" : "校准中"}
          </div>
          <p className="mt-2 text-[12px] leading-6 text-muted">{showRank ? "参考样本：" + (rank.label ?? "已验证对照样本") + "。并非全人群排名。" : "尚未建立可靠的评分尺度与对照样本映射，不提供虚构排名。"}</p>
        </div>
      </section>
    </div>
    <section aria-label="代表性面部测量" className="border-t border-rule pt-8">
      <h2 className="font-serif text-[25px]">六个部位，一项基础测量</h2>
      <p className="mt-2 text-[13px] text-muted">这里只展示各分区的一项指标，其余可信测量、图解与专业解读在完整护照中提供。</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {metrics.map((m, i) => <div key={i} className="rounded-[12px] border border-rule bg-paper-raised p-5" data-testid="free-metric">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[15px] font-medium">{m.chapter}</h3>
            <LockKeyhole className="size-4 text-muted" aria-label="更多测量付费解锁" />
          </div>
          <div className="mt-4 flex items-baseline justify-between gap-3 text-[14px]">
            <span className="text-ink-soft">{m.name ?? "代表性测量"}</span>
            <strong className="font-mono text-[17px]">{formatMetric(m)}</strong>
          </div>
          <p className="mt-3 border-t border-rule pt-3 text-[12px] text-muted">其他测量指标与解读 · 解锁后查看</p>
        </div>)}
      </div>
    </section>
    <section className="mt-10 flex flex-col gap-3 rounded-[16px] border border-rule bg-paper-raised p-6 sm:p-8">
      <h2 className="font-serif text-[25px]">{pending ? "完整护照正在生成" : "解锁完整形象护照"}</h2>
      <p className="max-w-2xl text-[14px] leading-7 text-ink-soft">
        {pending ? "付款已确认。正在生成完整个性化报告，完成后即可访问全部测量、Studio 和 PDF。" :
          "¥139 一次解锁：所有可靠测量与解读、个性化分析、完整形象建议、Studio、3 张 AI 发型效果图与 PDF 下载。"}
      </p>
      <Link href={"/p/" + data.id + "/unlock"} className="inline-flex min-h-11 w-fit items-center rounded-full bg-accent px-6 text-[14px] text-[var(--ap-on-primary)]">
        {pending ? "查看生成状态" : "解锁完整护照 · ¥139"}
      </Link>
      {!pending && <p className="text-[12px] text-muted">免费报告不提供 PDF 下载。照片按告知的保留期限自动删除。</p>}
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
