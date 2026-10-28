import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import type { PassportResponse } from "@/lib/api";
import { sampleReportResponse } from "@/lib/fixture/backend";
import { DEMO_CASES } from "@/lib/fixtures/demo_cases";
import { choicesKey, readChoices } from "@/lib/state/choices";
import { ReportSlice } from "./report-slice";

const demo = DEMO_CASES[0];
const response = () => structuredClone(sampleReportResponse(demo.id));
const show = (data = response(), sample = true, geometry = demo.geometry) =>
  render(<ReportSlice data={data} geometry={geometry} sample={sample} />);

beforeEach(() => localStorage.clear());
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("S2 report slice critical path", () => {
  it("switches the metric, native overlay and explanation together", () => {
    const { container } = show();
    expect(screen.getByTestId("selected-measurement").textContent).toContain("1.21");
    for (const [name, value] of [["上庭占比", "29%"], ["中庭 / 下庭", "1.08"], ["面长宽比", "1.21"]]) {
      fireEvent.click(screen.getByRole("button", { name: new RegExp(name) }));
      expect(screen.getByTestId("selected-measurement").textContent).toContain(value);
      expect(container.querySelector("[data-measure-overlay]")?.getAttribute("data-measure-overlay")).toBe(name);
    }
  });

  it("restores the measurement overlay on Escape and pointer leave", () => {
    const { container } = show();
    const hold = screen.getByRole("button", { name: "按住看原图" });
    fireEvent.keyDown(hold, { key: " " });
    expect(container.querySelector("[data-measure-overlay]")).toBeNull();
    fireEvent.keyDown(hold, { key: "Escape" });
    expect(container.querySelector("[data-measure-overlay]")).not.toBeNull();
    fireEvent(hold, new MouseEvent("pointerdown", { button: 0, bubbles: true }));
    expect(container.querySelector("[data-measure-overlay]")).toBeNull();
    fireEvent.pointerLeave(hold);
    expect(container.querySelector("[data-measure-overlay]")).not.toBeNull();
    for (const end of [() => fireEvent.pointerUp(hold), () => fireEvent.pointerCancel(hold), () => fireEvent.blur(window)]) {
      fireEvent(hold, new MouseEvent("pointerdown", { button: 0, bubbles: true }));
      expect(container.querySelector("[data-measure-overlay]")).toBeNull();
      end();
      expect(container.querySelector("[data-measure-overlay]")).not.toBeNull();
    }
  });

  it("copies only the chosen tier's actual instructions, keeping generic advice separate", async () => {
    let copied = "";
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => { copied = text; } } });
    const data = response();
    const before = JSON.stringify(data.passport!.analysis);
    show(data);
    fireEvent.click(screen.getByRole("radio", { name: /省心.*齐颌直发低维护/ }));
    const current = screen.getByTestId("current-hair");
    expect(current.textContent).toContain("剪到下颌线附近，保持直发");
    expect(current.textContent).not.toMatch(/32mm|C卷|C 卷|锁骨/);
    fireEvent.click(screen.getByRole("button", { name: "复制当前剪发话术" }));
    await act(async () => {});
    expect(copied).toContain("【发型沟通】齐颌直发低维护\n1. 剪到下颌线附近，保持直发");
    expect(copied).not.toMatch(/32mm|C卷|C 卷|锁骨/);
    expect(JSON.stringify(data.passport!.analysis)).toBe(before);
    expect(screen.getByRole("radio", { name: /突破/ }).hasAttribute("disabled")).toBe(true);
  });

  it("does not save or promise a queued preview for a public sample", () => {
    const data = response();
    data.partial.previews = [{ kind: "hair", target_id: "safe", status: "pending", image_model: null, before_url: data.media.front, after_url: null, error: null, ai_label: "AI 试看" }];
    const { container } = show(data);
    expect(container.textContent).toContain("本示例未生成试看图");
    expect(screen.queryByRole("button", { name: "加入我的方案" })).toBeNull();
    expect(container.textContent).not.toContain("正在生成");
    expect(localStorage.getItem(choicesKey(data.id))).toBeNull();
    expect(screen.getAllByRole("link", { name: "开始我的分析" })[0].getAttribute("href")).toBe("/start");
  });

  it("saves the selected direction and source recommendation through existing choices", () => {
    const data = response();
    show(data, false);
    fireEvent.click(screen.getByRole("radio", { name: /省心.*齐颌直发低维护/ }));
    fireEvent.click(screen.getByRole("button", { name: "加入我的方案" }));
    expect(readChoices(data.id).hair?.tier).toBe("easy");
    expect(readChoices(data.id).plan.r1?.saved).toBe(true);
    expect(screen.getByRole("link", { name: "查看我的行动方案" }).getAttribute("href")).toBe(`/p/${data.id}/plan`);
  });

  it("reuses P002 data rather than retaining P001 names or numbers", () => {
    const d = DEMO_CASES[1];
    show(sampleReportResponse(d.id), true, d.geometry);
    expect(screen.getByTestId("current-hair").textContent).toContain("利落侧分短发");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("收紧两侧发量，走干净利落的专业路线。");
    expect(screen.queryByText("齐颌直发低维护")).toBeNull();
  });

  it("reports clipboard rejection without a false success", async () => {
    const failed = vi.spyOn(toast, "error");
    const success = vi.spyOn(toast, "success");
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
    show();
    fireEvent.click(screen.getByRole("button", { name: "复制当前剪发话术" }));
    await vi.waitFor(() => expect(failed).toHaveBeenCalledWith("复制失败，请长按文字手动复制"));
    expect(success).not.toHaveBeenCalled();
  });

  it("replaces a stale selected tier if new constraints exclude it", () => {
    const data = response();
    const { rerender } = show(data);
    fireEvent.click(screen.getByRole("radio", { name: /省心/ }));
    const updated = structuredClone(data);
    updated.passport!.derived.hair_option_checks.find(c => c.tier === "easy")!.status = "excluded";
    rerender(<ReportSlice data={updated} geometry={demo.geometry} sample />);
    expect(screen.getByTestId("current-hair").textContent).toContain("侧分内扣中长发");
    expect(screen.getByRole("radio", { name: /省心/ }).hasAttribute("disabled")).toBe(true);
  });
});

describe("S2 honest unavailable states", () => {
  it("removes all media exactly when the retention deadline passes, retaining measurements", () => {
    vi.useFakeTimers();
    const data = response();
    data.media.expires_at = new Date(Date.now() + 1000).toISOString();
    const { container } = show(data);
    expect(container.querySelectorAll("img").length).toBeGreaterThan(0);
    act(() => { vi.advanceTimersByTime(1001); });
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("[data-measure-overlay]")).toBeNull();
    expect(screen.queryByRole("button", { name: "按住看原图" })).toBeNull();
    expect(screen.getByTestId("selected-measurement").textContent).toContain("1.21");
    expect(screen.getAllByRole("link", { name: "重新上传正脸" })[0].getAttribute("href")).toBe("/start");
  });

  it("does not draw invented lines when the registered geometry is missing", () => {
    const { container } = render(<ReportSlice data={response()} geometry={null} sample />);
    expect(container.querySelector("[data-measure-overlay]")).toBeNull();
    expect(screen.getByTestId("selected-measurement").textContent).toContain("1.21");
    expect(container.textContent).toContain("没有可画在照片上的测量线");
  });

  it("shows needs-photo rather than a stale value or overlay", () => {
    const data = response();
    const m = data.passport!.measurement_profile!.metrics.find(m => m.id === "M017")!;
    m.availability = "needs_photo"; m.value = null; m.missing_reason = "upper_third_occluded";
    const { container } = show(data);
    fireEvent.click(screen.getByRole("button", { name: /上庭占比/ }));
    expect(screen.getByTestId("selected-measurement").textContent).not.toContain("29%");
    expect(container.querySelector("[data-measure-overlay]")).toBeNull();
    expect(screen.getByRole("link", { name: "重新上传正脸" }).getAttribute("href")).toBe("/start");
  });

  it.each(["limited", "unavailable"] as const)("does not show a full score or invent an overall rank when %s", status => {
    const data = response();
    data.passport!.aesthetic_score!.status = status;
    data.passport!.aesthetic_score!.overall_score = null;
    show(data);
    expect(screen.queryByTestId("score-value")).toBeNull();
    expect(screen.getByTestId("rank-state").textContent).not.toMatch(/前\s*\d+%/);
  });

  it("keeps an unverified metric's comparison separate from overall rank", () => {
    const data = response();
    data.passport!.reference_percentiles!.rank.status = "ok";
    data.passport!.reference_percentiles!.rank.label_zh = "约位于参考样本中部";
    show(data);
    expect(screen.getByTestId("selected-measurement").textContent).toContain("此项暂无可比对照");
    expect(screen.getByTestId("rank-state").textContent).toContain("约位于参考样本中部");
  });

  it("keeps unavailable photos and all-excluded hair choices truthful", () => {
    const data = response();
    data.media.front = null;
    data.passport!.derived.hair_option_checks.forEach(c => { c.status = "excluded"; });
    const { container } = show(data, false);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("[data-measure-overlay]")).toBeNull();
    expect(container.textContent).toContain("这张测量照片暂不可用");
    expect(container.textContent).not.toContain("原图已超过保存期限");
    expect(screen.queryByRole("button", { name: "复制当前剪发话术" })).toBeNull();
    expect(screen.queryByRole("button", { name: "加入我的方案" })).toBeNull();
  });

  it("removes an unusable generated image rather than presenting it as a comparison", () => {
    const data = response();
    data.partial.previews = [{ kind: "hair", target_id: "safe", status: "succeeded", before_url: data.media.front, after_url: "/test-result.png", image_model: "test", error: null, ai_label: "AI 试看" }];
    show(data, false);
    const preview = screen.getByTestId("preview-state");
    const image = preview.querySelector("img")!;
    expect(image).not.toBeNull();
    fireEvent.error(image);
    expect(preview.querySelector("img")).toBeNull();
    expect(preview.textContent).toContain("试看图暂不可用");
  });

  it.each(["pending", "failed"] as const)("only describes the selected direction's real %s task", status => {
    const data = response();
    data.partial.previews = [{ kind: "hair", target_id: "safe", status, image_model: null, before_url: data.media.front, after_url: null, error: null, ai_label: "AI 试看" }];
    show(data, false);
    expect(screen.getByTestId("preview-state").textContent).toContain(status === "pending" ? "正在生成" : "生成失败");
    fireEvent.click(screen.getByRole("radio", { name: /省心/ }));
    expect(screen.getByTestId("preview-state").textContent).toContain("尚未生成");
    expect(screen.getByTestId("preview-state").textContent).not.toContain("正在生成");
  });
});
