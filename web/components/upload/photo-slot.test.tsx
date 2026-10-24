import { act, cleanup, render, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Backend, PhotoQC, PhotoRole } from "@/lib/api";
import { defaultFraming } from "@/lib/framing";
import { PhotoSlot, usePhotoSlots, type SlotState } from "./photo-slot";

const rendered = new Blob(["confirmed pixels"], { type: "image/jpeg" });
vi.mock("@/lib/framing", async (original) => ({ ...await original<typeof import("@/lib/framing")>(), renderFraming: vi.fn(async () => rendered) }));
vi.mock("@/lib/photo", () => ({ preparePhoto: vi.fn(async (file: File) => ({ blob: file, url: "blob:prepared" })) }));
const verdict: PhotoQC = { photo_id: "front", status: "ok", issues: [], messages: [], face_count: 1, yaw: 0, mode: "real" };
const file = () => new File(["original"], "photo.png", { type: "image/png" });
function setup() {
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 1200, height: 1600, close: vi.fn() })));
  vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:preview"), revokeObjectURL: vi.fn() });
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("confirmed photo handoff", () => {
  it("QC checks the exact confirmed blob once, and original pixels remain available for re-edit", async () => {
    setup();
    const qc = vi.fn(async () => verdict);
    const { result, unmount } = renderHook(() => usePhotoSlots({ qc } as unknown as Backend));
    await act(async () => result.current.choose("front", file()));
    const original = result.current.slots.front!.bitmap;
    await act(async () => result.current.reframe("front", { ...defaultFraming(1200, 1600), width: 600, height: 800 }));
    expect(result.current.slots.front!.blob).toBe(rendered);
    expect(qc.mock.calls.filter((call: unknown[]) => call[1] === rendered)).toHaveLength(1);
    expect(result.current.slots.front!.bitmap).toBe(original);
    await waitFor(() => expect(result.current.slots.front!.checking).toBe(false));
    unmount();
    expect(original!.close).toHaveBeenCalledOnce();
  });

  it("an old QC error cannot overwrite a replacement photo", async () => {
    setup();
    let fail: (e: Error) => void = () => {};
    const qc = vi.fn().mockImplementationOnce(() => new Promise((_, reject) => { fail = reject; }))
      .mockResolvedValue(verdict);
    const { result } = renderHook(() => usePhotoSlots({ qc } as unknown as Backend));
    await act(async () => result.current.choose("front", file()));
    await act(async () => result.current.choose("front", file()));
    await act(async () => fail(new Error("late failure")));
    expect(result.current.slots.front!.error).toBeNull();
  });
});

const exactProfileError = "侧面轮廓不清晰，这张选填照片没有通过检查，请直接移除或按以下提示重拍：请在明亮的纯色背景前拍，撩开挡住额头、鼻子或下巴的头发，手不要挡脸。";
function renderVerdict(role: PhotoRole, qc: PhotoQC) {
  const state: SlotState = { file: file(), srcUrl: null, bitmap: null, w: 1200, h: 1600,
    framing: defaultFraming(1200, 1600), suggestion: null, blob: rendered, url: null,
    capture: null, qc, checking: false, error: null };
  return render(<PhotoSlot role={role} state={state} onChoose={() => {}} onReframe={() => {}} onRemove={() => {}} />);
}
describe("role-specific QC messages", () => {
  it("shows exactly the requested profile rejection once without a heading or disclaimer", () => {
    const view = renderVerdict("profile90", { ...verdict, status: "reject", issues: ["profile_unclear"], messages: ["old server text"] });
    const panel = view.container.querySelector('[data-qc="reject"]')!;
    expect(panel.textContent).toBe(exactProfileError);
    expect(panel.querySelectorAll("p")).toHaveLength(1);
    expect(panel.className).toContain("text-[#682719]");
    expect(panel.className).toContain("bg-[#f6e5e1]");
  });
  it.each(["front", "profile45", "noglasses", "smile", "hair"] as const)("preserves %s warning and server reason", (role) => {
    const view = renderVerdict(role, { ...verdict, status: "warn", issues: ["face_too_small"], messages: ["这个角度的脸部偏小，请靠近一些。"] });
    expect(view.container.querySelector('[data-qc="warn"]')!.textContent).toContain("这个角度的脸部偏小，请靠近一些。");
    expect(view.queryByText(exactProfileError)).toBeNull();
  });
  it("preserves other profile rejection reasons and differentiated server messages", () => {
    const view = renderVerdict("profile90", { ...verdict, status: "reject", issues: ["wrong_angle_for_role"], messages: ["这是 45° 半侧面，请换成真正的侧脸。"] });
    expect(view.container.textContent).toContain("这是 45° 半侧面，请换成真正的侧脸。");
    expect(view.queryByText(exactProfileError)).toBeNull();
  });
});
