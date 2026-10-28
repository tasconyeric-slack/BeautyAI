import { notFound } from "next/navigation";
import { ReportPreview } from "@/components/report-slice/preview";
export const metadata = { title: "完整报告 R2 · S2", robots: { index: false, follow: false } };
export default async function ReportR2Page({ searchParams }: { searchParams: Promise<{ v?: string; state?: string }> }) {
  if (process.env.NODE_ENV !== "development" && process.env.VERCEL_ENV !== "preview") notFound();
  const { v, state } = await searchParams;
  return <ReportPreview full variant={v === "p002" || v === "fixture" ? v : "p001"} state={state} />;
}
