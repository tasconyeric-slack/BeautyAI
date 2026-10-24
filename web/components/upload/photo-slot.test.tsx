import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Backend, PhotoQC } from "@/lib/api";
import { defaultFraming } from "@/lib/framing";
import { usePhotoSlots } from "./photo-slot";

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
    await act(async () => result.current.reframe("front", { ...defaultFraming(1200, 1600), zoom: 2 }));
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
