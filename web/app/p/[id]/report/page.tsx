"use client";

import { LoadingState } from "@/components/passport/states";
import { NotReady } from "@/components/passport/ui";
import { FullReport } from "@/components/report/full-report";
import { usePassport } from "@/lib/state/passport-store";
import { Reveal } from "@/components/reveal/reveal";

/** /p/[id]/report: the continuous facial assessment report of this passport (Issue #33). */
export default function ReportPage() {
  const { data, passport, loading } = usePassport();
  // first response still on its way: a skeleton, not "still generating" (that would claim something we do not know)
  if (loading) return <LoadingState label="正在读取报告…" />;
  if (data && ["scanning", "quick_ready", "analysis_failed"].includes(data.status)) return <Reveal />;
  if (data?.status === "qc_failed") return <div className="mx-auto max-w-md px-4 py-14"><h1 className="font-serif text-[22px]">这张照片需要重拍</h1><ul className="mt-4 text-[14px] leading-7">{data.partial.input_quality?.retake_guidance.map(g => <li key={g}>{g}</li>)}</ul><a className="mt-4 inline-flex min-h-11 items-center text-accent" href="/start">换一张照片</a></div>;
  if (data?.status !== "full_ready" || !passport) return <NotReady />;
  return <FullReport />;
}
