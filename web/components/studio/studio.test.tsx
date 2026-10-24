import { describe, expect, it } from "vitest";
import geometryJson from "@/lib/fixtures/sample_geometry.json";
import sample from "@/lib/fixtures/sample_passport.json";
import { fixturePreviewArt } from "@/lib/fixture/backend";
import type { Passport } from "@/lib/api";
import type { FaceGeometry } from "@/lib/tint";
import { composeLayers, cropRect, describeLook, hairTargetId } from "./compose";

const g = geometryJson as unknown as FaceGeometry;

// jsdom has no ImageData; the same narrow shim as lib/tint/tests.
if (typeof globalThis.ImageData === "undefined") {
  (globalThis as unknown as { ImageData: unknown }).ImageData = class {
    colorSpace = "srgb";
    constructor(public data: Uint8ClampedArray, public width: number, public height: number) {}
  };
}

function photo(w = 120, h = 150): ImageData {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < d.length; i += 4) { d[i] = 200; d[i + 1] = 170; d[i + 2] = 150; d[i + 3] = 255; }
  return new ImageData(d, w, h);
}
const diff = (a: ImageData, b: ImageData) => a.data.reduce((n, v, i) => n + (v !== b.data[i] ? 1 : 0), 0);

describe("Look Studio composition (D30)", () => {
  it("hair colour never changes the generation target", () => {
    expect(hairTargetId(null, null)).toBeNull();
    expect(hairTargetId("bold", null)).toBe("bold");
    expect(hairTargetId("bold", 1)).toBe("bold");
    expect(hairTargetId(null, 2)).toBeNull();
  });

  it("local layers compose onto the same image, deterministically, without touching the input", () => {
    const base = photo();
    const copy = new Uint8ClampedArray(base.data);
    expect(composeLayers(base, g, { drape: null, blush: null, lip: null })).toBe(base);
    const lip = composeLayers(base, g, { drape: null, blush: null, lip: "#A85C6A" });
    const all = composeLayers(base, g, { drape: "#1F4E5F", blush: { hex: "#D9A3AA", placement: "horizontal" }, lip: "#A85C6A" });
    expect(diff(base, lip)).toBeGreaterThan(0);
    expect(diff(lip, all)).toBeGreaterThan(0);                 // drape + blush added on top of the lip layer
    expect(diff(all, composeLayers(base, g, { drape: "#1F4E5F", blush: { hex: "#D9A3AA", placement: "horizontal" }, lip: "#A85C6A" }))).toBe(0);
    expect(base.data).toEqual(copy);
  });

  it("maps a normalised crop box to canvas pixels", () => {
    expect(cropRect([0.1, 0.2, 0.9, 0.8], 600, 750)).toEqual({ x: 60, y: 150, w: 480, h: 450 });
  });

  it("describes the look in plain words", () => {
    expect(describeLook({})).toBe("原图");
    expect(describeLook({ hairName: "突破 · 法式卷", hairColorName: "冷棕", lipName: "豆沙粉", drapeName: "墨青" }))
      .toBe("突破 · 法式卷 + 冷棕 + 豆沙粉唇色 + 墨青近脸色");
  });

  it("fixture previews are illustration art only, never a photo edit", () => {
    const p = structuredClone(sample) as unknown as Passport;
    expect(fixturePreviewArt(p, "bold")).toBe("/sample/portrait-bold.svg");
    expect(fixturePreviewArt(p, "bold_hc1")).toMatch(/^\/demo-art\/portrait-bold_[0-9a-f]{6}\.svg$/);
    expect(fixturePreviewArt(p, "current")).toBeNull();
    expect(fixturePreviewArt(p, "current_hc9")).toBeNull();
  });
});
