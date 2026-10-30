/** Issue #33 critical path: one passport → one continuous report, for the public full sample and for a free view.
 *  Every number on the page must be the passport's own; free content must be presented as free, paid as paid. */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { sampleReportPreview } from "@/components/landing/cases";
import type { Passport, PassportResponse } from "@/lib/api";
import { entitlements, paywall } from "@/lib/copy/zh";
import { freeView } from "@/lib/fixture/free-view";
import { sampleReportResponse } from "@/lib/fixture/backend";
import geometryJson from "@/lib/fixtures/sample_geometry.json";
import { StaticPassportProvider } from "@/lib/state/passport-store";
import type { FaceGeometry } from "@/lib/tint";
import { measureView } from "@/components/face/measure-model";
import { FullReport } from "./full-report";
import { CHAPTER_KEYS, previewNote, regionCrop, regionViews } from "./report-model";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/p/ap_sample_0001/report", useRouter: () => ({ push: () => {} }) }));

const FORBIDDEN = /颜值|打分|评分|标准脸|完美|缺陷|缺点|整容|医美|手术|治疗/;

function freeResponse(): PassportResponse {
  const full = sampleReportResponse("female");
  const [passport, locked] = freeView(full.passport as Passport);
  return {
    ...full, passport,
    partial: { ...full.partial, previews: [] },
    entitlement: { ...full.entitlement, paid: false, unlock_scope: "free", locked },
  };
}

const renderReport = (data: PassportResponse, sample = false) =>
  render(<StaticPassportProvider value={{ data }}><FullReport sample={sample} /></StaticPassportProvider>);

describe("full report — public synthetic sample (full entitlement)", () => {
  it("reads as one narrative with the passport's own numbers in every chapter", async () => {
    const data = sampleReportResponse("female");
    const p = data.passport as Passport;
    const { container } = renderReport(data, true);
    const report = screen.getByTestId("full-report");
    expect(report.dataset.paid).toBe("1");

    // chapters in the narrative order
    const chapters = [...container.querySelectorAll("[data-chapter]")].map((e) => e.getAttribute("data-chapter"));
    expect(chapters).toEqual(CHAPTER_KEYS);

    // overall: the scoring layer's number, labeled as a synthetic sample
    expect(screen.getByTestId("score-value").textContent).toBe(String(p.aesthetic_score!.overall_score));
    expect(report.textContent).not.toContain("合成人脸");

    // findings: six region chapters with measured values straight from measurement_profile
    expect(container.querySelectorAll("[data-region]").length).toBe(6);
    const m001 = p.measurement_profile!.metrics.find((m) => m.id === "M001")!;
    const row = container.querySelector('[data-metric-row="M001"]') as HTMLElement;
    expect(within(row).getByTestId("metric-value").textContent).toBe(m001.value!.toFixed(m001.decimals));
    // photo-led: tight crops of the sample portrait with the measured lines, once the geometry arrives
    expect((await screen.findAllByTestId("region-figure")).length).toBeGreaterThanOrEqual(4);

    // improvements, options and plan come from the rules layer / analysis, nothing invented
    expect(within(screen.getByTestId("report-improvements")).getAllByRole("listitem").length).toBeGreaterThanOrEqual(5);
    const hair = container.querySelectorAll("[data-hair]");
    expect(hair.length).toBe(3);
    // Public examples do not present illustrative previews as a generated photo edit.
    for (const h of hair) expect(h.getAttribute("data-preview")).toBe("not_yet");
    expect(screen.getByTestId("report-plan-full")).toBeTruthy();
    expect(screen.queryByTestId("report-free-scope")).toBeNull();
    expect(screen.queryAllByTestId("locked-line")).toHaveLength(0);
    expect(within(screen.getByTestId("report-limitations")).getAllByRole("listitem")).toHaveLength(p.analysis.limitations.length);

    expect(report.textContent).not.toMatch(FORBIDDEN);
  });
});

describe("full report — free view of a real passport", () => {
  it("shows what is free, marks what the full passport adds, and never offers a free AI try-on", () => {
    const data = freeResponse();
    const { container } = renderReport(data);
    expect(screen.getByTestId("full-report").dataset.paid).toBe("0");
    expect(screen.getByTestId("report-free-scope").textContent).toContain(paywall.freeScope);

    // detailed measurements withheld by the server are counted, not shown
    expect(container.querySelectorAll('[data-testid^="region-locked-"]').length).toBeGreaterThan(0);
    // all three hair directions are free as text; the photorealistic try-on is paid only (free_previews: 0)
    const hair = [...container.querySelectorAll("[data-hair]")];
    expect(hair).toHaveLength(3);
    for (const h of hair) expect(h.getAttribute("data-preview")).toBe("locked");
    // the time-based plan is locked; the top 3 stay free
    expect(screen.queryByTestId("report-plan-full")).toBeNull();
    expect(within(screen.getByTestId("report-plan-top")).getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getAllByTestId("locked-line").length).toBeGreaterThan(0);
    expect(container.textContent).not.toMatch(FORBIDDEN);
  });

  it("paywall copy matches free_previews: 0", () => {
    expect(paywall.freeScope).not.toMatch(/稳妥发型试看/);
    expect(paywall.freeScope).toMatch(/没有免费次数/);
    expect(entitlements.rows.find((r) => r.area === "发型")!.full).toMatch(/AI 发型试看/);
    expect(entitlements.rows.find((r) => r.area === "发型")!.free).not.toMatch(/试看/);
  });
});

describe("report model", () => {
  const p = sampleReportResponse("female").passport as Passport;
  const geometry = geometryJson as unknown as FaceGeometry;

  it("crops each region around its own measurement points, inside the photo", () => {
    const v = measureView(p, p.passport_id)!;
    const regions = regionViews(p, v);
    const eyes = regions.find((r) => r.key === "eyes")!;
    const crop = regionCrop(eyes.drawable, geometry)!;
    const [x0, y0, x1, y1] = crop.box;
    expect(x0).toBeGreaterThanOrEqual(0);
    expect(y0).toBeGreaterThanOrEqual(0);
    expect(x1).toBeLessThanOrEqual(1);
    expect(y1).toBeLessThanOrEqual(1);
    expect(x1 - x0).toBeLessThan(1);
    expect(crop.overlays.length).toBeGreaterThan(0);
    expect(regionCrop(eyes.drawable, null)).toBeNull();
  });

  it("never presents a missing image as a result", () => {
    expect(previewNote({ status: null, imageModel: null, paid: false, expired: false })).toBe("locked");
    expect(previewNote({ status: null, imageModel: null, paid: true, expired: false })).toBe("not_yet");
    expect(previewNote({ status: null, imageModel: null, paid: true, expired: true })).toBe("expired");
    expect(previewNote({ status: "fallback", imageModel: null, paid: true, expired: false })).toBe("failed");
    expect(previewNote({ status: "succeeded", imageModel: "qwen-image-edit", paid: true, expired: false })).toBe("ai");
    expect(previewNote({ status: "succeeded", imageModel: "fixture-illustration", paid: true, expired: false })).toBe("illustration");
  });

  it("the landing preview quotes the sample passport, not hard-coded numbers", () => {
    const r = sampleReportPreview(p);
    expect(r.overview).toContain(String(Math.round(p.aesthetic_score!.overall_score!)));
    expect(r.findings).toContain(String(p.measurement_profile!.coverage.total_measured));
  });
});
