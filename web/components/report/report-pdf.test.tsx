// @vitest-environment node
/** Issue #33, Phase 2 smoke test: the downloadable report is a real, text-based Chinese PDF with the passport's own
 *  numbers in all seven chapters, and a free view never carries what the server withheld.
 *  PDF_OUT=<dir> also writes the generated files there for visual inspection (pdftoppm). */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { pdf } from "@react-pdf/renderer";
import { extractText, getDocumentProxy, getMeta } from "unpdf";
import { describe, expect, it } from "vitest";
import type { Passport, PassportResponse } from "@/lib/api";
import { report as copy } from "@/lib/copy/zh";

const copyPdf = copy.pdf;
import { sampleReportResponse } from "@/lib/fixture/backend";
import { freeView } from "@/lib/fixture/free-view";
import { ReportDocument, registerReportFonts, reportPdfMeta, type ReportPdfInput } from "./pdf/document";
import { CHAPTER_KEYS, photosGone } from "./report-model";

registerReportFonts(path.resolve(__dirname, "../../public/fonts/report"));

function freeResponse(): PassportResponse {
  const full = sampleReportResponse("female");
  const [passport, locked] = freeView(full.passport as Passport);
  return { ...full, id: "ap_sample_0001", passport, partial: { ...full.partial, previews: [] },
    entitlement: { ...full.entitlement, paid: false, unlock_scope: "free", locked } };
}

async function build(input: ReportPdfInput, name: string) {
  const blob = await pdf(<ReportDocument {...input} now={new Date("2026-10-24T08:00:00Z")} />).toBlob();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (process.env.PDF_OUT) writeFileSync(path.join(process.env.PDF_OUT, name), bytes);
  const doc = await getDocumentProxy(bytes.slice());
  const { info } = await getMeta(doc);
  const { totalPages, text } = await extractText(doc, { mergePages: false });
  // pdf.js keeps the no-break spaces the line breaker uses; readers search them as spaces
  const pages = (text as string[]).map((t) => t.replace(/ /g, " "));
  return { bytes, info: info as Record<string, string>, totalPages, pages, all: pages.join("\n") };
}

const squash = (t: string) => t.replace(/\s+/g, "");

describe("PDF report export", () => {
  it("learned cover contains just the ten-point score and reference top-percent", async () => {
    const data = structuredClone(sampleReportResponse("female"));
    data.passport!.learned_attractiveness = {
      contract_version: "learned-attractiveness-1", status: "research_only", model_id: "test-model",
      checkpoint_id: "sha256:test", preprocessing_version: "test", crop_version: "test", native_scale_id: "test",
      calibration_version: null, raw_score: 3, display_score: 5.5, native_label_range: [1, 5], display_range: [1, 10],
      display_transform: "test-linear", qc_status: "passed", inference_ms: 0.1, research_only: true,
      production_authorized: false, provenance: "cv_geometry_ridge_regression", quality_flags: [],
      unavailable_reason: null, limitations: [],
    };
    data.passport!.learned_reference_rank = {
      status: "available", percentile: 65, top_percent: 35, cohort_label: "test-only sample", cohort_id: "test",
      distribution_version: "test", n_reference: 1000, n_unique_subjects: null, reference_unit: "image",
      method: "empirical_cdf_midrank_v1", limitations: [], unavailable_reason: null,
      percentile_interval: [60, 70], display_step_percent: 5, research_only: true, tier: null,
      distribution: { method: "gaussian_kde_scott_v1", n: 1000, bounds: [1, 10], mean: 5.2, points: [[1, 0.01], [5, 0.3], [10, 0.01]] },
    };
    const r = await build({ data, sample: false, images: null, photoMode: "omitted" }, "learned-summary.pdf");
    const cover = squash(r.pages[0]);
    expect(cover).toContain("颜值分5.5/10");
    expect(cover).toContain("参考排名前35%");
    expect(cover).not.toContain("均值");
    expect(cover).toContain("几何协调度");
    expect(r.all).not.toContain("比例参考：");
    expect(cover).not.toMatch(/SCUT|原生|照片质量|研究预览|校准|评分与样本说明|test-model|AI面部美学参考分/);
  }, 60_000);

  it("sample (full): seven chapters, real numbers, selectable Chinese text, metadata, page numbers", async () => {
    const data = sampleReportResponse("female");
    const p = data.passport as Passport;
    const r = await build({ data, sample: true, images: null, photoMode: "omitted" }, "sample-female.pdf");

    expect(new TextDecoder().decode(r.bytes.slice(0, 5))).toBe("%PDF-");
    expect(r.info.Title).toBe(reportPdfMeta(data, true).title);
    expect(r.info.Author).toContain("形象护照");
    expect(r.totalPages).toBeGreaterThanOrEqual(8);
    // every chapter starts on its own page and none is empty
    for (const k of CHAPTER_KEYS) {
      const at = r.pages.findIndex((t, i) => i > 0 && squash(t).includes(squash(copy.chapters[k].title)));
      expect(at, k).toBeGreaterThan(0);
      expect(squash(r.pages[at]).length, k).toBeGreaterThan(k === "methods" ? 60 : 200);
    }
    expect(r.all).not.toMatch(/总分 =|测量视角、参考来源与署名|测量依据、适用范围与照片管理/);
    // the scoring layer's number and the four parts, measurement values straight from measurement_profile
    const all = squash(r.all);
    expect(all).toContain(String(Math.round(p.aesthetic_score!.overall_score!)));
    for (const c of p.aesthetic_score!.components) expect(all).toContain(squash(c.name_zh));
    const m001 = p.measurement_profile!.metrics.find((m) => m.id === "M001")!;
    expect(all).toContain(m001.value!.toFixed(m001.decimals));
    expect(all).toContain(squash(copy.planFull));
    expect(all).toContain(squash(p.derived.plan.invest[0].action).slice(0, 12));
    // marked as a sample on every page after the cover, and paginated
    for (const t of r.pages.slice(1)) expect(squash(t)).toContain(squash(copy.sampleKicker));
    expect(squash(r.pages.at(-1)!)).toContain(`第${r.totalPages}/${r.totalPages}页`);
  }, 60_000);

  it("free view: shows what is free, marks what the full passport adds, never prints withheld content", async () => {
    const full = sampleReportResponse("female").passport as Passport;
    const data = freeResponse();
    const r = await build({ data, sample: false, images: null, photoMode: "omitted" }, "free-female.pdf");
    const all = squash(r.all);

    expect(r.info.Title).toContain("No.");
    expect(all).toContain("免费版");
    expect(all).toContain("[完整护照]");
    // the paid plan, the withheld lip colours and frame sizes are absent
    expect(all).not.toContain(squash(copy.planFull));
    const freeLips = new Set((data.passport as Passport).analysis.color_profile.lip_families.map((l) => l.name));
    for (const l of full.analysis.color_profile.lip_families.filter((x) => !freeLips.has(x.name))) expect(all).not.toContain(squash(l.name));
    expect(all).not.toContain("毫米·镜片");
    // withheld measurement rows keep no value in the PDF either
    const lockedIds = (data.passport as Passport).measurement_profile!.metrics.filter((m) => m.locked).map((m) => m.id);
    expect(lockedIds.length).toBeGreaterThan(0);
    for (const id of lockedIds) {
      const m = full.measurement_profile!.metrics.find((x) => x.id === id)!;
      if (m.value != null && m.availability === "measured") expect(all).not.toContain(squash(`${m.name_zh}`) + m.value.toFixed(m.decimals));
    }
    // try-on is described as paid, never shown
    expect(all).toContain(squash(copy.previewLocked));
  }, 60_000);

  it("demo passport (fixture / fake providers): labeled simulated on the cover, by the score and on every page", async () => {
    const data = freeResponse();
    const r = await build({ data, sample: false, demo: "fixture", images: null, photoMode: "omitted" }, "demo-free.pdf");
    expect(r.info.Title).toContain("演示");
    expect(squash(r.pages[0])).toContain(squash(copyPdf.demo.fixture));
    expect(squash(r.pages[0])).toContain(squash(copyPdf.demoScore));
    for (const t of r.pages.slice(1)) expect(squash(t)).toContain(squash(copyPdf.demoBand.fixture));
    // simulated, but never claims the viewer's own photo is a synthetic face
    expect(r.all).not.toContain("合成人脸");
  }, 60_000);

  it.each(["limited", "unavailable"] as const)("keeps %s score quality visible on the cover", async status => {
    const data = structuredClone(sampleReportResponse("female"));
    const score = data.passport!.aesthetic_score!;
    score.status = status;
    score.quality_flags = ["pose_off_axis"];
    score.copy_zh.status = "当前照片姿态影响参考";
    score.copy_zh.flags.pose_off_axis = "头部转动或俯仰过大";
    if (status === "unavailable") score.overall_score = null;
    const result = await build({ data, sample: true, images: null, photoMode: "omitted" }, `quality-${status}.pdf`);
    expect(squash(result.pages[0])).toContain("头部转动或俯仰过大");
    expect(squash(result.pages[0])).toContain(status === "limited" ? "参考有限" : "这张照片暂时给不出总分");
    if (status === "unavailable") expect(squash(result.pages[0])).toContain("换一张正脸、平视、自然表情的照片");
  }, 60_000);

  it("treats photos as gone once the TTL has passed, even if the page still holds expired: false", () => {
    const now = Date.parse("2026-10-24T12:00:00Z");
    const media = { expired: false, front: "/api/media/ap_x/front.jpg" };
    expect(photosGone({ ...media, expires_at: "2026-10-24T13:00:00Z" }, now)).toBe(false);
    expect(photosGone({ ...media, expires_at: "2026-10-24T11:59:59Z" }, now)).toBe(true); // stale response, TTL passed
    expect(photosGone({ ...media, expires_at: null }, now)).toBe(false); // the sample never expires
    expect(photosGone({ ...media, expired: true }, now)).toBe(true);
    expect(photosGone({ expired: false, front: null }, now)).toBe(true);
  });
});
