import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sampleReportResponse } from "@/lib/fixture/backend";
import { httpBackend } from "@/lib/api";
import { StaticPassportProvider } from "@/lib/state/passport-store";
import { readChoices } from "@/lib/state/choices";
import { toast } from "sonner";
import { NO_MAKEUP } from "@/lib/tint/makeup";
import { useStudioCanvas } from "./use-studio-canvas";
import { LookStudio } from "./look-studio";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("hair=easy"), usePathname: () => "/p/ap_journey/studio" }));
vi.mock("./use-studio-canvas", () => ({ useStudioCanvas: vi.fn() }));
beforeEach(() => {
  localStorage.clear();
  vi.mocked(useStudioCanvas).mockReturnValue({ canvas: { current: null }, status: "ready", hairState: "ready", maskState: "error", approximate: false,
    makeup: NO_MAKEUP, eyewearReason: null, eyewearControlsReason: null });
  vi.spyOn(httpBackend, "geometry").mockResolvedValue(null);
});
afterEach(() => vi.restoreAllMocks());
function response() { const data = structuredClone(sampleReportResponse("female")); data.id = "ap_journey"; data.entitlement.paid = true; data.partial.previews = []; return data; }
function studio(data = response(), requestPreviews = vi.fn().mockResolvedValue(undefined)) {
  return render(<StaticPassportProvider value={{ data, requestPreviews }}><LookStudio /></StaticPassportProvider>);
}
describe("ENG-03 Studio journey", () => {
  it("saving an easy look also selects it for the report and plan", async () => {
    studio();
    fireEvent.click(screen.getByRole("button", { name: "保存这个造型" }));
    const choices = readChoices("ap_journey");
    expect(choices.looks[0].hair).toBe("easy");
    expect(choices.hair?.tier).toBe("easy");
  });
  it("does not claim a durable save or select a hairstyle when device storage rejects the write", () => {
    const failure = vi.spyOn(toast, "error");
    const success = vi.spyOn(toast, "success");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("storage blocked"); });
    studio();
    fireEvent.click(screen.getByRole("button", { name: "保存这个造型" }));
    expect(failure).toHaveBeenCalledWith("浏览器未能保存造型，请允许本地存储后重试");
    expect(success).not.toHaveBeenCalled();
    expect(readChoices("ap_journey").hair).toBeNull();
  });
  it("a request for easy does not invent a pending task for safe after switching", async () => {
    let finish!: () => void;
    const request = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    studio(response(), request);
    fireEvent.click(screen.getByRole("button", { name: "生成这个造型" }));
    expect(request).toHaveBeenCalledWith("hair", ["easy"]);
    fireEvent.click(screen.getByRole("radio", { name: /稳妥/ }));
    expect(screen.queryByText(/正在生成这个发型/)).toBeNull();
    expect(screen.getByRole("button", { name: "生成这个造型" })).toBeTruthy();
    await act(async () => finish());
  });
  it("a broken succeeded image is not called an applied success and can be reloaded", () => {
    vi.mocked(useStudioCanvas).mockReturnValue({ canvas: { current: null }, status: "ready", hairState: "error", maskState: "error", approximate: false,
      makeup: NO_MAKEUP, eyewearReason: null, eyewearControlsReason: null });
    const data = response();
    data.partial.previews = [{ target_id: "easy", kind: "hair", status: "succeeded", before_url: "/front.jpg", after_url: "/broken.jpg", ai_label: "AI 试看", image_model: "fake", error: null }];
    studio(data);
    expect(screen.getByRole("button", { name: "重新载入结果" })).toBeTruthy();
    expect(screen.queryByText("AI 发型模拟已叠加")).toBeNull();
  });
  it("expired media has a working restart link and no generate action", async () => {
    const data = response(); data.media.expired = true;
    studio(data);
    expect(screen.getByRole("link", { name: "重新上传照片" }).getAttribute("href")).toBe("/start");
    const generate = screen.queryByRole("button", { name: "生成这个造型" }) as HTMLButtonElement | null;
    expect(!generate || generate.disabled).toBe(true);
    await waitFor(() => expect(screen.queryByText("AI 发型模拟已叠加")).toBeNull());
  });
});
