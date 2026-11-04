import type { Metadata } from "next";
import { SampleReport } from "@/components/report/sample-report";

export const metadata: Metadata = {
  title: "完整报告示例 · 形象护照",
  description: "查看完整形象分析报告示例：颜值评分、面部特点、发型、配色和形象改善建议。",
};

/** One published example: person-001, including its real Ridge research snapshot. */
export default function SampleReportPage() {
  return <SampleReport variant="p001" />;
}
