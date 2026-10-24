import { describe, expect, it } from "vitest";
import {
  captureRecord, changeAspect, clampFraming, cropSize, cssTransform, defaultFraming, isIdentity, outputSize, outputToSource,
  suggestFaceFraming, framingFromSelection, imageMatrix, selectionForFraming,
} from "./framing";

describe("framing (V3B, D35)", () => {
  const W = 3000, H = 4000;

  it("the default framing is the untouched photo, downscaled only", () => {
    const f = defaultFraming(W, H);
    expect(isIdentity(W, H, f)).toBe(true);
    const { cw, ch } = cropSize(W, H, f);
    expect([cw, ch]).toEqual([W, H]);
    const { ow, oh, s } = outputSize(cw, ch);
    expect(Math.max(ow, oh)).toBe(1600);
    expect(s).toBeLessThanOrEqual(1);
    expect(captureRecord(W, H, f).edited).toBe(false);
  });

  it("zooming crops native pixels and never upscales", () => {
    const small = clampFraming(400, 500, { ...defaultFraming(400, 500), zoom: 2 });
    const { cw, ch } = cropSize(400, 500, small);
    const { ow, oh, s } = outputSize(cw, ch);
    expect([ow, oh, s]).toEqual([200, 250, 1]);
  });

  it("output pixels map back onto the source through the same transform (crop + rotation)", () => {
    const f = clampFraming(W, H, { zoom: 1.6, rotate: 7, cx: 1400, cy: 1900, aspect: "4:5" });
    const { cw, ch } = cropSize(W, H, f);
    const { ow, oh } = outputSize(cw, ch);
    expect(outputToSource(ow / 2, oh / 2, W, H, f)).toEqual([f.cx, f.cy].map((v) => expect.closeTo(v, 6)));
    // a horizontal step in the output is a rotated step in the source
    const [x0, y0] = outputToSource(ow / 2, oh / 2, W, H, f);
    const [x1, y1] = outputToSource(ow / 2 + 100, oh / 2, W, H, f);
    expect((Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI).toBeCloseTo(-7, 6);
    expect(cw / ch).toBeCloseTo(4 / 5, 6);
    const rec = captureRecord(W, H, f);
    expect(rec.edited).toBe(true);
    expect(rec.rotate_deg).toBe(7);
    expect(rec.crop[2]).toBeCloseTo(cw, 0);
  });

  it("the CSS preview uses the same centre, scale and rotation", () => {
    const f = clampFraming(W, H, { zoom: 2, rotate: -3, cx: 1500, cy: 1800, aspect: "1:1" });
    const t = cssTransform(W, H, f, 300);
    const { cw } = cropSize(W, H, f);
    expect(t).toBe(`translate(150px, 150px) scale(${300 / cw}) rotate(-3deg) translate(-1500px, -1800px)`);
  });

  it("clamps zoom, rotation and keeps the crop inside the photo", () => {
    const f = clampFraming(W, H, { zoom: 99, rotate: 90, cx: -50, cy: 99999, aspect: "source" });
    expect(f.zoom).toBe(4);
    expect(f.rotate).toBe(15);
    const { cw, ch } = cropSize(W, H, f);
    expect(f.cx).toBeCloseTo(cw / 2);
    expect(f.cy).toBeCloseTo(H - ch / 2);
  });

  it("changes ratio around the edited centre without resetting crop scale", () => {
    const f = { ...defaultFraming(W, H), zoom: 2, cx: 1600, cy: 2000 };
    const square = changeAspect(W, H, f, "1:1");
    expect(square.cx).toBe(f.cx);
    expect(square.cy).toBe(f.cy);
    expect(cropSize(W, H, square).ch).toBe(cropSize(W, H, f).ch);
    const restored = changeAspect(W, H, square, "source");
    expect(cropSize(W, H, restored)).toEqual(cropSize(W, H, f));
    expect(restored.cx).toBe(f.cx);
  });

  it("fits a new ratio around an off-centre crop instead of shifting the selected face", () => {
    const f = { ...defaultFraming(W, H), zoom: 2, cx: 750, cy: 1200 };
    const square = changeAspect(W, H, f, "1:1");
    expect(square.cx).toBe(f.cx);
    expect(square.cy).toBe(f.cy);
    expect(cropSize(W, H, square)).toEqual({ cw: 1500, ch: 1500 });
  });

  it("suggests a generous portrait around one reliable face, preserving hair and ears", () => {
    const f = suggestFaceFraming(W, H, [{ x: 1100, y: 1200, width: 700, height: 900 }]);
    expect(f).not.toBeNull();
    const { cw, ch } = cropSize(W, H, f!);
    expect(cw / ch).toBeCloseTo(3 / 4);
    expect(f!.cx - cw / 2).toBeLessThan(1100 - 700 * 0.4);
    expect(f!.cy - ch / 2).toBeLessThan(1200 - 900 * 0.6);
    expect(f!.cy + ch / 2).toBeGreaterThan(2100 + 900 * 0.25);
  });

  it("keeps the original for ambiguous, tiny, edge-clipped or already close faces", () => {
    const face = { x: 1100, y: 1200, width: 700, height: 900 };
    expect(suggestFaceFraming(W, H, [])).toBeNull();
    expect(suggestFaceFraming(W, H, [face, face])).toBeNull();
    expect(suggestFaceFraming(W, H, [{ ...face, width: 40, height: 50 }])).toBeNull();
    expect(suggestFaceFraming(W, H, [{ ...face, y: 0 }])).toBeNull();
    expect(suggestFaceFraming(800, 1000, [{ x: 100, y: 140, width: 600, height: 720 }])).toBeNull();
    expect(suggestFaceFraming(W, H, [{ ...face, width: NaN }])).toBeNull();
  });

  it("maps Cropper image movement and selection resizing to the same source crop at any rotation", () => {
    const f = { zoom: 1.8, rotate: 12, cx: 1700, cy: 1800, aspect: "4:5" as const };
    const selection = { x: 30, y: 20, width: 240, height: 300 };
    const matrix = imageMatrix(W, H, f, selection);
    const restored = framingFromSelection(W, H, f.aspect, selection, matrix);
    for (const key of ["zoom", "rotate", "cx", "cy"] as const) expect(restored[key]).toBeCloseTo(f[key], 6);
    const rect = selectionForFraming(W, H, f, matrix);
    for (const key of ["x", "y", "width", "height"] as const) expect(rect[key]).toBeCloseTo(selection[key], 6);
    const moved = framingFromSelection(W, H, f.aspect, { ...selection, x: 60 }, matrix);
    expect(moved.cx).toBeGreaterThan(f.cx);
    expect(moved.cy).toBeLessThan(f.cy);
  });
});
