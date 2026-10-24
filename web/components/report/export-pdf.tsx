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
export function ReportPdfExport({ data, sample, demo, geometry, className }: {
  data: PassportResponse; sample: boolean; demo: DemoKind; geometry: FaceGeometry | null; className?: string;
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

  return (
    <div className={cn("no-print rounded-[16px] border border-rule bg-paper-raised p-4 sm:flex sm:items-center sm:justify-between sm:gap-6", className)} data-testid="report-pdf">
      <div className="min-w-0 text-[13px] leading-6">
        <label className={cn("flex items-start gap-2", expired && "text-muted")}>
          <input type="checkbox" className="mt-1.5 size-4 accent-[var(--ap-primary)]" checked={photos && !expired} disabled={expired || busy}
            onChange={(e) => setPhotos(e.target.checked)} data-testid="report-pdf-photos" />
          <span>{sample ? copy.pdf.includeSample : copy.pdf.includePhotos}</span>
        </label>
        <p className="mt-0.5 pl-6 text-[12px] leading-5 text-muted">
          {expired ? copy.pdf.photosExpired : sample ? copy.pdf.sampleNote : copy.pdf.photosDefault}
          {!data.entitlement.paid && <span className="block">{copy.pdf.free}</span>}
        </p>
      </div>
      <div className="mt-3 flex shrink-0 flex-col items-stretch gap-1.5 sm:mt-0 sm:items-end">
        <button type="button" onClick={run} disabled={busy} aria-busy={busy} data-testid="report-pdf-download"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-ink px-5 text-[14px] font-medium text-paper disabled:opacity-70">
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Download className="size-4" aria-hidden />}
          {sample ? copy.pdf.sampleButton : copy.pdf.button}
        </button>
        <p role="status" aria-live="polite" className="min-h-5 text-[12px] text-muted sm:text-right" data-testid="report-pdf-status" data-state={state.kind}>
          {state.kind === "busy" ? copy.pdf.stages[state.stage] : state.kind === "done" ? state.text : ""}
        </p>
        {state.kind === "error" && (
          <p role="alert" className="text-[12px] text-[#b4442f] sm:text-right" data-testid="report-pdf-error">
            {copy.pdf.failed}
            <button type="button" onClick={run} className="ml-2 font-medium underline underline-offset-2">{copy.pdf.retry}</button>
          </p>
        )}
      </div>
    </div>
  );
}
