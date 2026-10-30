import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sampleReportResponse } from "@/lib/fixture/backend";
import { DEMO_CASES } from "@/lib/fixtures/demo_cases";
import { readChoices } from "@/lib/state/choices";
import { FullReportContent } from "./full-report";
import { metricOverlay, metricRole, viewGeometry } from "@/components/face/measure-model";

beforeEach(() => localStorage.clear());
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
const response = () => structuredClone(sampleReportResponse(DEMO_CASES[0].id));

describe("ENG-02 full report critical path", () => {
  it.each(DEMO_CASES)("uses $key data in all seven chapters, with no sample write routes", demo => {
    const data = sampleReportResponse(demo.id);
    const { container } = render(<FullReportContent data={data} geometry={demo.geometry} sample />);
    expect(container.querySelectorAll("[data-chapter]")).toHaveLength(7);
    expect(screen.getByTestId("score-value").textContent).toContain(String(demo.passport.learned_attractiveness?.display_score ?? demo.passport.aesthetic_score!.overall_score));
    expect(container.querySelectorAll('a[href^="/p/"]')).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "加入我的方案" })).toBeNull();
    expect(screen.getByTestId("preview-state").textContent).not.toContain("正在生成");
  });

  it("places the compact export after score/rank, keeps private photos opt-in and disables expired images", () => {
    const data = response();
    const view = render(<FullReportContent data={data} geometry={DEMO_CASES[0].geometry} />);
    const rank = screen.getByTestId("learned-rank"), action = screen.getByTestId("report-pdf");
    expect(rank.compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(action.compareDocumentPosition(screen.getByTestId("report-glance")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByTestId("report-pdf")).toHaveLength(1);
    expect((screen.getByTestId("report-pdf-photos") as HTMLInputElement).checked).toBe(false);
    expect(view.container.textContent).not.toMatch(/总分 =|测量视角、参考来源与署名|查看测量方法与局限/);
    view.rerender(<FullReportContent data={{...data, media:{...data.media,expired:true}}} geometry={null} />);
    expect((screen.getByTestId("report-pdf-photos") as HTMLInputElement).disabled).toBe(true);
  });

  it("switches the current haircut, copies that exact brief and saves it through existing choices", async () => {
    const data = response();
    const analysis = JSON.stringify(data.passport!.analysis);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<FullReportContent data={data} geometry={DEMO_CASES[0].geometry} sample={false} />);
    fireEvent.click(screen.getByRole("radio", { name: /省心/ }));
    const current = screen.getByTestId("current-hair");
    fireEvent.click(within(current).getByRole("button", { name: "复制当前剪发话术" }));
    await act(async () => {});
    expect(writeText.mock.calls[0][0]).toContain("齐颌直发低维护");
    expect(writeText.mock.calls[0][0]).not.toMatch(/32mm|C卷|锁骨/);
    fireEvent.click(within(current).getByRole("button", { name: "加入我的方案" }));
    expect(readChoices(data.id).hair?.tier).toBe("easy");
    expect(screen.getByTestId("report-current-plan").textContent).toContain("齐颌直发低维护");
    expect(JSON.stringify(data.passport!.analysis)).toBe(analysis);
  });

  it("removes every media image and overlay at the deadline while retaining numbers and recovery", () => {
    vi.useFakeTimers();
    const data = response();
    data.media.expires_at = new Date(Date.now() + 1000).toISOString();
    const { container } = render(<FullReportContent data={data} geometry={DEMO_CASES[0].geometry} sample={false} />);
    expect(container.querySelectorAll("img").length).toBeGreaterThan(1);
    act(() => vi.advanceTimersByTime(1100));
    expect(container.querySelectorAll("img, [data-measure-overlay]")).toHaveLength(0);
    expect(screen.getByTestId("score-value").textContent).toContain(String(data.passport!.learned_attractiveness!.display_score));
    expect(screen.getAllByRole("link", { name: /重新上传/ }).length).toBeGreaterThan(0);
  });

  it("uses the selected side metric's photo and native geometry, with no front-coordinate fallback", () => {
    const data = response();
    const demo = DEMO_CASES[0];
    const metric = data.passport!.measurement_profile!.metrics.find(m => metricRole(m) === "profile90" && m.availability === "measured")!;
    const { container, rerender } = render(<FullReportContent data={data} geometry={demo.geometry} sample />);
    fireEvent.click(container.querySelector(`[data-metric-row="${metric.id}"] button`)!);
    const figure = container.querySelector('[data-photo-role="profile90"]')!;
    expect(figure.querySelector("img")!.getAttribute("src")).toBe(demo.photos.profile90);
    const overlay = metricOverlay(metric, demo.geometry)!;
    const native = viewGeometry(demo.geometry, "profile90")!;
    if (overlay.segments.length) expect(figure.querySelector("line")!.getAttribute("x1")).toBe(String(overlay.segments[0].a[0] * native.width));
    rerender(<FullReportContent data={data} geometry={null} sample />);
    expect(container.querySelectorAll("[data-measure-overlay]")).toHaveLength(0);
    expect(container.querySelector('[data-photo-role="profile90"] img')).toBeTruthy();
  });

  it("keeps the whole photo and native overlay canvas fixed when switching measured rows", () => {
    const data = response(), demo = DEMO_CASES[0];
    const { container } = render(<FullReportContent data={data} geometry={demo.geometry} sample />);
    const section = container.querySelector('[data-testid="region-rows-eyes"]')!.parentElement!.parentElement!;
    const canvas = section.querySelector<HTMLElement>('[data-testid="region-figure"]')!;
    const image = canvas.querySelector("img")!;
    const before = { style: canvas.getAttribute("style"), src: image.getAttribute("src"), viewBox: canvas.querySelector("svg")!.getAttribute("viewBox") };
    const buttons = section.querySelectorAll<HTMLButtonElement>('[data-metric-row] button');
    fireEvent.click(buttons[1]);
    expect(canvas.getAttribute("style")).toBe(before.style);
    expect(canvas.style.aspectRatio).toBe("4 / 5");
    expect(image.getAttribute("src")).toBe(before.src);
    expect(image.getAttribute("style")).toBeNull();
    expect(canvas.querySelector("svg")!.getAttribute("viewBox")).toBe(before.viewBox);
    expect(canvas.querySelector("svg")!.getAttribute("preserveAspectRatio")).toBe("xMidYMid meet");
    expect(canvas.querySelectorAll("circle").length).toBeGreaterThan(0);
    expect(container.textContent).not.toContain("比例参考：");
    expect(container.querySelector('[data-testid^="region-reading-"]')).toBeNull();
  });

  it.each(["limited", "unavailable"] as const)("preserves an honest %s score and unverified comparison", status => {
    const data = response();
    data.passport!.learned_attractiveness = undefined;
    data.passport!.learned_reference_rank = undefined;
    data.passport!.aesthetic_score!.status = status;
    data.passport!.aesthetic_score!.overall_score = null;
    render(<FullReportContent data={data} geometry={DEMO_CASES[0].geometry} sample />);
    expect(screen.queryByTestId("score-value")).toBeNull();
    expect(screen.getByTestId("rank-state").textContent).not.toMatch(/前\s*\d+%/);
    expect(screen.queryByTestId("region-reading-proportions")).toBeNull();
  });
});
