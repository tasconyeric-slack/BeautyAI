"use client";

import { LoadingState } from "@/components/passport/states";
import { NotReady } from "@/components/passport/ui";
import { FullReport } from "@/components/report/full-report";
import { usePassport } from "@/lib/state/passport-store";

/** /p/[id]/report: the continuous facial assessment report of this passport (Issue #33). */
export default function ReportPage() {
  const { data, passport, loading } = usePassport();
  // first response still on its way: a skeleton, not "still generating" (that would claim something we do not know)
  if (loading) return <LoadingState label="正在读取报告…" />;
  if (data?.status !== "full_ready" || !passport) return <NotReady />;
  return <FullReport />;
}
