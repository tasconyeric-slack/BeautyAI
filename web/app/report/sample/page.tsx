import type { Metadata } from "next";
import { SampleReport } from "@/components/report/sample-report";

export const metadata: Metadata = {
  title: "完整报告示例 · 形象护照",
  description: "用合成人脸生成的完整面部评估报告示例，与真实报告使用相同的组件。",
};

/** /report/sample: the public, full synthetic sample report (Issue #33) — readable before any upload or purchase. */
export default async function SampleReportPage({ searchParams }: { searchParams: Promise<{ v?: string }> }) {
  const { v } = await searchParams;
  return <SampleReport variant={v === "male" ? "male" : "female"} />;
}
