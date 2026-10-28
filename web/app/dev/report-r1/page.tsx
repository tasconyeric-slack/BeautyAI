import { notFound } from "next/navigation";
import { ReportPreview } from "@/components/report-slice/preview";

export const metadata = { title: "报告交互切片 · S2", robots: { index: false, follow: false } };

/** Same environment gate as PR44: development / PR preview only, never the production report entry. */
export default async function ReportSlicePage({ searchParams }: { searchParams: Promise<{ v?: string; state?: string }> }) {
  if (process.env.NODE_ENV !== "development" && process.env.VERCEL_ENV !== "preview") notFound();
  const { v, state } = await searchParams;
  return <ReportPreview variant={v === "p002" || v === "fixture" ? v : "p001"} state={state} />;
}
