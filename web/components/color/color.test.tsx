import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import sample from "@/lib/fixtures/sample_passport.json";
import { guidance } from "@/lib/copy/zh";
import type { Passport, PassportResponse } from "@/lib/passport";
import { StaticPassportProvider } from "@/lib/state/passport-store";
import { ColorPage } from "./color-page";
import geometry from "@/lib/fixtures/sample_geometry.json";
import { drape, type FaceGeometry } from "@/lib/tint";
import { blendCloth, clothWeights, colorSearchPhrase, colorTargetId, familyName, polygonBox, toChips } from "./helpers";

function response(expired: boolean, passport = sample as unknown as Passport): PassportResponse {
  return {
    id: "ap_sample_0001", status: "full_ready", stage: null,
    partial: { input_quality: null, anchors: passport.anchors, quick: null, analysis: "ready", previews: [] },
    passport,
    entitlement: { paid: false, unlock_scope: "free", share_token: null, free_previews_left: 1, price_cny: 39, locked: [] },
    media: { front: expired ? null : "/sample/portrait.svg", thumb: null, expires_at: null, expired },
    error: null, created_at: "2026-10-22T00:00:00Z",
  };
}

const renderPage = (data: PassportResponse) =>
  render(<StaticPassportProvider value={{ data }}><ColorPage /></StaticPassportProvider>);

describe("ColorPage", () => {
  it("renders the three groups with colour names", () => {
    renderPage(response(false));
    for (const title of ["近脸色", "衣橱底色", "慎用"]) expect(screen.getByRole("heading", { name: title })).toBeTruthy();
    const favor = screen.getByRole("group", { name: "近脸色色卡" });
    expect(within(favor).getByRole("button", { name: /雾霾蓝 · 浅/ })).toBeTruthy();
    expect(within(favor).getByRole("button", { name: /珍珠白/ })).toBeTruthy();
    expect(within(screen.getByRole("group", { name: "衣橱底色色卡" })).getByRole("button", { name: /灰褐/ })).toBeTruthy();
    expect(within(screen.getByRole("group", { name: "慎用色卡" })).getByRole("button", { name: /芥末黄/ })).toBeTruthy();
  });

  it("selecting a swatch shows its search phrase", () => {
    renderPage(response(false));
    fireEvent.click(within(screen.getByRole("group", { name: "慎用色卡" })).getByRole("button", { name: /芥末黄/ }));
    expect(screen.getByText(/搜索词「芥末黄 运动鞋」/)).toBeTruthy();
    const chosen = within(screen.getByRole("group", { name: "慎用色卡" })).getByRole("button", { name: /芥末黄/ });
    expect(chosen.getAttribute("aria-pressed")).toBe("true");
    const hex = sample.analysis.color_profile.caution_families.find(f => f.name === "芥末黄")!.hex_examples[0];
    expect(screen.getByRole("link", { name: /在实验室里试芥末黄/ }).getAttribute("href")).toBe(`/p/ap_sample_0001/studio?drape=${hex.slice(1)}`);
    expect(screen.getByText("已选：芥末黄")).toBeTruthy();
    expect(screen.getByRole("link", { name: "把这个颜色带到实验室" }).getAttribute("href")).toBe(`/p/ap_sample_0001/studio?drape=${hex.slice(1)}`);
  });

  it("keeps colour guidance here and photo exploration in Studio", () => {
    const { container } = renderPage(response(false));
    expect(container.querySelector("canvas")).toBeNull();
    expect(screen.queryByRole("group", { name: "披布视图" })).toBeNull();
    expect(screen.getByRole("heading", { name: "你的对比度" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "搭配公式" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "发色方向" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "口红色族" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /在实验室里试/ }).getAttribute("href")).toMatch(/studio\?drape=[A-Fa-f0-9]{6}$/);
  });

  it("expired photo: colour cards only, no canvas, says why", () => {
    const { container } = renderPage(response(true));
    expect(container.querySelector("canvas")).toBeNull();
    expect(screen.getByText(guidance.photoExpired)).toBeTruthy();
    expect(screen.getByRole("group", { name: "近脸色色卡" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: guidance.holdOriginal })).toBeNull();
  });

  it("low confidence shows the caution and the calibration note", () => {
    const p = structuredClone(sample) as unknown as Passport;
    p.derived.display_labels.color.confidence = 0.3;
    renderPage(response(true, p));
    expect(screen.getByText(/白纸校准即将提供/)).toBeTruthy();
    expect(screen.getByText(new RegExp(guidance.colorCaution))).toBeTruthy();
  });
});

describe("colour helpers", () => {
  it("builds search phrases from the family name and the group's item", () => {
    expect(familyName("雾霾蓝2")).toBe("雾霾蓝");
    expect(colorSearchPhrase({ family: "雾霾蓝", group: "favor" })).toBe("雾霾蓝 针织衫");
    expect(colorSearchPhrase({ family: "灰褐", group: "neutral" })).toBe("灰褐 外套");
  });

  it("labels several examples of one family by lightness", () => {
    const chips = toChips([{ hex: "#7A8FA6", name_zh: "雾霾蓝1" }, { hex: "#94A7BA", name_zh: "雾霾蓝2" }, { hex: "#F2EFEA", name_zh: "珍珠白" }], "favor");
    expect(chips.map((c) => c.label)).toEqual(["雾霾蓝 · 深", "雾霾蓝 · 浅", "珍珠白"]);
  });

  it("feedback target ids are lowercase hex without #", () => {
    expect(colorTargetId("#7A8FA6")).toBe("7a8fa6");
    expect(colorTargetId("#7A8FA6")).toMatch(/^[a-z0-9_]{1,48}$/);
  });

  it("fast cloth repaint equals K5 drape within one level", () => {
    if (typeof globalThis.ImageData === "undefined") {
      // jsdom without node-canvas has no ImageData; same narrow shim as lib/tint tests.
      (globalThis as { ImageData?: unknown }).ImageData = class {
        data: Uint8ClampedArray; width: number; height: number; colorSpace = "srgb";
        constructor(a: Uint8ClampedArray | number, b: number, c?: number) {
          if (typeof a === "number") { this.width = a; this.height = b; this.data = new Uint8ClampedArray(a * b * 4); }
          else { this.data = a; this.width = b; this.height = c ?? a.length / 4 / b; }
        }
      };
    }
    const g = geometry as unknown as FaceGeometry;
    const w = 120, h = 150;
    const px = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) px.set([(i * 37) % 256, (i * 91) % 256, (i * 13) % 256, 255], i * 4);
    const src = new ImageData(px, w, h);
    const white = new ImageData(new Uint8ClampedArray(w * h * 4).fill(255), w, h);
    const weights = clothWeights(drape(white, g, "#000000").data);
    expect(weights.some((x) => x > 0.9)).toBe(true);
    for (const hex of ["#7A8FA6", "#FF6A13", "#F2EFEA"]) {
      const ref = drape(src, g, hex).data;
      const fast = blendCloth(src.data, weights, hex);
      let max = 0;
      for (let i = 0; i < ref.length; i++) max = Math.max(max, Math.abs(ref[i] - fast[i]));
      expect(max).toBeLessThanOrEqual(1);
    }
  });

  it("neck box is clamped to the image", () => {
    expect(polygonBox([[0, 0.74], [1, 0.74], [1, 1], [0, 1]], 600, 750)).toEqual({ x: 0, y: 553, w: 600, h: 197 });
    expect(polygonBox([], 10, 10)).toBeNull();
  });
});
