import { describe, expect, it } from "vitest";
import {
  captureRecord, clampFraming, cropSize, cssTransform, defaultFraming, isIdentity, outputSize, outputToSource,
  suggestFaceFraming, framingFromSelection, imageMatrix, selectionForFraming, scaleFraming,
} from "./framing";

describe("source-coordinate freeform framing", () => {
  const W = 3000, H = 4000;
  it("keeps the whole original by default and only downscales", () => {
    const f = defaultFraming(W, H);
    expect(isIdentity(W, H, f)).toBe(true);
    expect(cropSize(W, H, f)).toEqual({ cw: W, ch: H });
    expect(outputSize(W, H)).toEqual({ ow: 1200, oh: 1600, s: 0.4 });
    expect(captureRecord(W, H, f).edited).toBe(false);
  });

  // Fixed image transform; expected source boundaries are hand-derived, independent of the adapters.
  it.each([
    ["left", { x: 40, y: 30, width: 160, height: 240 }, [400, 300, 1600, 2400]],
    ["top", { x: 20, y: 60, width: 180, height: 210 }, [200, 600, 1800, 2100]],
    ["right", { x: 20, y: 30, width: 150, height: 240 }, [200, 300, 1500, 2400]],
    ["bottom", { x: 20, y: 30, width: 180, height: 200 }, [200, 300, 1800, 2000]],
    ["corner", { x: 40, y: 60, width: 160, height: 210 }, [400, 600, 1600, 2100]],
  ])("%s-only resizing preserves the other boundaries", (_side, selection, want) => {
    const f = framingFromSelection(W, H, selection, [0.1, 0, 0, 0.1, -1350, -1800]);
    expect(captureRecord(W, H, f).crop).toEqual(want);
  });

  it.each([
    { x: 40, y: 20, width: 220, height: 320 },
    { x: 20, y: 40, width: 240, height: 300 },
    { x: 20, y: 20, width: 220, height: 320 },
    { x: 20, y: 20, width: 240, height: 300 },
  ])("can trim one edge of the rotated full image without shifting the other edges: %j", (proposal) => {
    const original = { ...defaultFraming(1200, 1600), rotate: 6 };
    const matrix = imageMatrix(1200, 1600, original, { x: 20, y: 20, width: 240, height: 320 });
    const f = framingFromSelection(1200, 1600, proposal, matrix);
    const restored = selectionForFraming(1200, 1600, f, matrix);
    for (const key of ["x", "y", "width", "height"] as const) expect(restored[key]).toBeCloseTo(proposal[key], 6);
  });

  it("keeps independent dimensions through bounds clamping and capture", () => {
    const f = clampFraming(W, H, { width: 800, height: 1900, rotate: 0, cx: -50, cy: 99999 });
    expect(f).toEqual({ width: 800, height: 1900, rotate: 0, cx: 400, cy: 3050 });
    expect(captureRecord(W, H, f)).toEqual({ crop: [0, 2100, 800, 1900], rotate_deg: 0,
      source_w: 3000, source_h: 4000, output_w: 674, output_h: 1600, edited: true });
  });

  it("enforces a native minimum per dimension without upscaling small sources", () => {
    const f = clampFraming(400, 500, { ...defaultFraming(400, 500), width: 1, height: 300 });
    expect(cropSize(400, 500, f)).toEqual({ cw: 128, ch: 300 });
    expect(outputSize(128, 300)).toEqual({ ow: 128, oh: 300, s: 1 });
    expect(clampFraming(80, 90, { ...defaultFraming(80, 90), width: 1, height: 1 })).toEqual(defaultFraming(80, 90));
  });

  it("scales the freeform rectangle uniformly within both source dimensions", () => {
    const f = { width: 600, height: 1500, rotate: 0, cx: 1500, cy: 2000 };
    expect(scaleFraming(W, H, f, 2)).toEqual({ ...f, width: 300, height: 750 });
    expect(scaleFraming(W, H, f, 0.1)).toEqual({ ...f, width: 1600, height: 4000 });
  });

  it("limits rotation while preserving full-frame headroom", () => {
    expect(clampFraming(W, H, { ...defaultFraming(W, H), rotate: 90 }))
      .toEqual({ ...defaultFraming(W, H), rotate: 15 });
  });

  it("maps output and CSS preview to the same original-source centre and rotation", () => {
    const f = { width: 1500, height: 1900, rotate: -3, cx: 1500, cy: 1800 };
    const { ow, oh } = outputSize(f.width, f.height);
    expect(outputToSource(ow / 2, oh / 2, W, H, f)).toEqual([1500, 1800]);
    const [x, y] = outputToSource(ow / 2 + 100, oh / 2, W, H, f);
    expect(Math.atan2(y - 1800, x - 1500) * 180 / Math.PI).toBeCloseTo(3, 6);
    expect(cssTransform(W, H, f, 300)).toBe("translate(150px, 190px) scale(0.2) rotate(-3deg) translate(-1500px, -1800px)");
  });

  it("restores the freeform rectangle through Cropper transforms at any rotation", () => {
    const f = { width: 1400, height: 1700, rotate: 12, cx: 1700, cy: 1800 };
    const selection = { x: 30, y: 20, width: 280, height: 340 };
    const matrix = imageMatrix(W, H, f, selection);
    const restored = framingFromSelection(W, H, selection, matrix);
    for (const key of ["width", "height", "rotate", "cx", "cy"] as const) expect(restored[key]).toBeCloseTo(f[key], 6);
    const rect = selectionForFraming(W, H, f, matrix);
    for (const key of ["x", "y", "width", "height"] as const) expect(rect[key]).toBeCloseTo(selection[key], 6);
  });

  it("suggests generous headroom and keeps close or ambiguous faces untouched", () => {
    const face = { x: 1100, y: 1200, width: 700, height: 900 };
    const f = suggestFaceFraming(W, H, [face])!;
    expect(f.cx - f.width / 2).toBeLessThan(820);
    expect(f.cy - f.height / 2).toBeLessThan(660);
    expect(f.cy + f.height / 2).toBeGreaterThan(2325);
    expect(suggestFaceFraming(W, H, [])).toBeNull();
    expect(suggestFaceFraming(W, H, [face, face])).toBeNull();
    expect(suggestFaceFraming(W, H, [{ ...face, width: 40, height: 50 }])).toBeNull();
    expect(suggestFaceFraming(W, H, [{ ...face, y: 0 }])).toBeNull();
    expect(suggestFaceFraming(800, 1000, [{ x: 100, y: 140, width: 600, height: 720 }])).toBeNull();
    expect(suggestFaceFraming(W, H, [{ ...face, width: NaN }])).toBeNull();
  });
});
