import type { Metadata } from "next";
import { SampleReport, type SampleVariant } from "@/components/report/sample-report";
import { demoCaseByKey } from "@/lib/fixtures/demo_cases";

export const metadata: Metadata = {
  title: "完整报告示例 · 形象护照",
  description: "AI 生成的虚构人物，经真实分析流程生成的完整面部评估报告示例，与真实报告使用相同的组件。",
};

/** /report/sample: the public, full sample report (Issue #33), readable before any upload or purchase.
 *  Default and ?v=p00N: pipeline-backed AI-generated fictional people (Issue #14); ?v=female|male: illustrated samples. */
export default async function SampleReportPage({ searchParams }: { searchParams: Promise<{ v?: string }> }) {
  const { v } = await searchParams;
  const variant: SampleVariant = v === "male" || v === "female" ? v : demoCaseByKey(v)?.key ?? "p001";
  return <SampleReport variant={variant} />;
}
