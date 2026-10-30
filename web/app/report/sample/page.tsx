import type { Metadata } from "next";
import { SampleReport } from "@/components/report/sample-report";

export const metadata: Metadata = {
  title: "完整报告示例 · 形象护照",
  description: "AI 生成的虚构人物，经真实分析流程生成的完整面部评估报告示例，与真实报告使用相同的组件。",
};

/** One published example: person-001, including its real Ridge research snapshot. */
export default async function SampleReportPage({ searchParams }: { searchParams: Promise<{ v?: string }> }) {
  await searchParams;
  return <SampleReport variant="p001" />;
}
