"use client";

import { NotReady } from "@/components/passport/ui";
import { FullReport } from "@/components/report/full-report";
import { usePassport } from "@/lib/state/passport-store";

/** /p/[id]/report: the continuous facial assessment report of this passport (Issue #33). */
export default function ReportPage() {
  const { data, passport } = usePassport();
  if (data?.status !== "full_ready" || !passport) return <NotReady />;
  return <FullReport />;
}
