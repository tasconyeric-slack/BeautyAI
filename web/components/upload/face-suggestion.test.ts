import { afterEach, describe, expect, it, vi } from "vitest";
import { detectFaceSuggestion } from "./face-suggestion";
const bitmap = { width: 3000, height: 4000 } as ImageBitmap;
const face = { boundingBox: { x: 1100, y: 1200, width: 700, height: 900 }, landmarks: [
  { type: "eye", locations: [{ x: 1290, y: 1500 }] },
  { type: "eye", locations: [{ x: 1610, y: 1500 }] },
  { type: "mouth", locations: [{ x: 1450, y: 1840 }] },
] };
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
const detector = (detect: () => Promise<unknown>) => vi.stubGlobal("FaceDetector", class { detect = detect; });
describe("local face suggestions", () => {
  it("suggests only a single approximately frontal face and skips side/hair roles", async () => {
    const detect = vi.fn(async () => [face]); detector(detect);
    expect(await detectFaceSuggestion(bitmap, "front")).not.toBeNull();
    expect(await detectFaceSuggestion(bitmap, "hair")).toBeNull();
    expect(await detectFaceSuggestion(bitmap, "profile90")).toBeNull();
    expect(detect).toHaveBeenCalledTimes(1);
    detector(async () => [{ ...face, landmarks: face.landmarks.slice(0, 1) }]);
    expect(await detectFaceSuggestion(bitmap, "front")).toBeNull();
    detector(async () => [face, face]);
    expect(await detectFaceSuggestion(bitmap, "front")).toBeNull();
  });
  it("preserves original when unsupported, rejected or slow", async () => {
    vi.stubGlobal("FaceDetector", undefined);
    expect(await detectFaceSuggestion(bitmap, "front")).toBeNull();
    detector(async () => { throw new Error("unsupported"); });
    expect(await detectFaceSuggestion(bitmap, "front")).toBeNull();
    vi.useFakeTimers(); detector(() => new Promise(() => {}));
    const result = detectFaceSuggestion(bitmap, "front");
    await vi.advanceTimersByTimeAsync(700);
    expect(await result).toBeNull();
  });
});
