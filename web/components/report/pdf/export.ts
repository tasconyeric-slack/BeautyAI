/** One-click PDF export (Issue #33, Phase 2). Browser-only; the PDF engine, fonts and document are loaded on the
 *  first click, so the report page itself stays light. The file is generated locally and saved as a download —
 *  no print dialog, no server round trip, nothing uploaded. */
import type { PassportResponse } from "@/lib/api";
import type { FaceGeometry } from "@/lib/tint";
import { photosGone } from "../report-model";

export const FONT_BASE = "/fonts/report";

export type ExportStage = "loading" | "images" | "rendering";

export interface ExportOptions {
  data: PassportResponse;
  sample: boolean;
  /** Simulated content (fixture backend / fake providers) outside the public sample. */
  demo: import("./document").DemoKind;
  /** The viewer explicitly asked for their photos in the PDF. */
  includePhotos: boolean;
  geometry: FaceGeometry | null;
  onStage?: (s: ExportStage) => void;
}

/** Builds the PDF and starts the download. Resolves with what was exported (photos may have expired meanwhile). */
export async function exportReportPdf({ data, sample, demo, includePhotos, geometry, onStage }: ExportOptions) {
  onStage?.("loading");
  const [{ pdf }, doc] = await Promise.all([import("@react-pdf/renderer"), import("./document")]);
  doc.registerReportFonts(FONT_BASE);

  const gone = photosGone(data.media);
  let images = null;
  let photoMode: import("./document").PhotoMode = gone ? "expired" : "omitted";
  if (includePhotos && !gone) {
    onStage?.("images");
    const { collectImages } = await import("./images");
    ({ images, photoMode } = await collectImages(data, geometry, sample));
  }

  onStage?.("rendering");
  const meta = doc.reportPdfMeta(data, sample, demo);
  let blob: Blob;
  try {
    blob = await pdf(doc.ReportDocument({ data, sample, demo, images, photoMode })).toBlob();
  } catch (e) {
    doc.resetReportFonts();
    throw e;
  }
  download(blob, meta.filename);
  return { filename: meta.filename, photoMode, bytes: blob.size };
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
