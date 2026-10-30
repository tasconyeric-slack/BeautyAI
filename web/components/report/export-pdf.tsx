"use client";

import { Download, Loader2 } from "lucide-react";
import * as React from "react";
import type { PassportResponse } from "@/lib/api";
import { report as copy } from "@/lib/copy/zh";
import type { FaceGeometry } from "@/lib/tint";
import { cn } from "@/lib/utils";
import type { DemoKind } from "./pdf/document";
import type { ExportStage } from "./pdf/export";
import { photosGone } from "./report-model";

type State = { kind: "idle" } | { kind: "busy"; stage: ExportStage } | { kind: "done"; text: string } | { kind: "error" };

/** 下载 PDF 报告 (Issue #33, Phase 2): one click → a real PDF download of exactly this (entitled) report.
 *  Photos are opt-in for a real passport and unavailable after the 24 h TTL; the sample uses its drawn illustrations. */
export function ReportPdfExport({ data, sample, demo, geometry, className, compact = false }: {
  data: PassportResponse; sample: boolean; demo: DemoKind; geometry: FaceGeometry | null; className?: string; compact?: boolean;
}) {
  const expired = photosGone(data.media);
  const [photos, setPhotos] = React.useState(sample && !expired);
  const [state, setState] = React.useState<State>({ kind: "idle" });
  const busy = state.kind === "busy";

  const run = async () => {
    setState({ kind: "busy", stage: "loading" });
    try {
      const { exportReportPdf } = await import("./pdf/export");
      const r = await exportReportPdf({
        data, sample, demo, geometry, includePhotos: photos && !expired,
        onStage: (stage) => setState({ kind: "busy", stage }),
      });
      setState({ kind: "done", text: photos && r.photoMode === "expired" ? copy.pdf.doneExpired : `${copy.pdf.done}：${r.filename}` });
    } catch (e) {
      console.error("pdf export failed", e instanceof Error ? e.message : e);
      setState({ kind: "error" });
    }
  };

  const options = <div className="min-w-0 text-[12px] leading-6">
    <label className={cn("flex items-start gap-2", expired && "text-muted")}>
      <input type="checkbox" className="mt-1.5 size-4 accent-[var(--ap-primary)]" checked={photos && !expired} disabled={expired || busy}
        onChange={e => setPhotos(e.target.checked)} data-testid="report-pdf-photos" />
      <span>{sample ? copy.pdf.includeSample : copy.pdf.includePhotos}</span>
    </label>
    <p className="mt-1 text-[11px] text-muted">{expired ? copy.pdf.photosExpired : sample ? "包含当前报告的照片与图表。" : "默认不含照片。"}{!data.entitlement.paid && <span className="block">{copy.pdf.free}</span>}</p>
  </div>;
  return <div className={cn(compact ? "no-print relative mt-4" : "no-print rounded-[4px] border border-rule bg-paper-raised p-4", className)} data-testid="report-pdf" id="report-download">
    <div className="flex flex-wrap items-center gap-4">
      <button type="button" onClick={run} disabled={busy} aria-busy={busy} data-testid="report-pdf-download"
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-current px-4 text-[12px] disabled:opacity-60">
        {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Download className="size-3.5" aria-hidden />}
        {compact ? "下载 PDF" : sample ? copy.pdf.sampleButton : copy.pdf.button}
      </button>
      {compact && <details className="relative text-[12px]"><summary className="cursor-pointer py-2">导出选项</summary><div className="absolute right-0 top-full z-30 w-64 border border-rule bg-paper-raised p-4 text-ink shadow-sm">{options}</div></details>}
    </div>
    {!compact && <div className="mt-3">{options}</div>}
    <p role="status" aria-live="polite" className={cn("text-[12px] text-muted", state.kind !== "idle" && "mt-2")} data-testid="report-pdf-status" data-state={state.kind}>
      {state.kind === "busy" ? copy.pdf.stages[state.stage] : state.kind === "done" ? state.text : ""}
    </p>
    {state.kind === "error" && <p role="alert" className="mt-2 text-[12px] text-[#b4442f]" data-testid="report-pdf-error">{copy.pdf.failed}<button type="button" onClick={run} className="ml-2 underline">{copy.pdf.retry}</button></p>}
  </div>;
}
