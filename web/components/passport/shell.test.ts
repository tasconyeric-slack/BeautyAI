import { describe, expect, it } from "vitest";
import { isMockPassport } from "./shell";

describe("demo banner rule", () => {
  const p = (analysis: string, previews: (string | null)[] = []) =>
    ({ meta: { analysis_model: analysis }, previews: previews.map((m) => ({ image_model: m })) });
  it("fixture data is always a demo", () => expect(isMockPassport("fixture", null)).toBe(true));
  it("live API with a fake model is flagged", () => {
    expect(isMockPassport("http", p("fake-fixture"))).toBe(true);
    expect(isMockPassport("http", p("deepseek-flash", ["fake-image-edit"]))).toBe(true);
  });
  it("real models are not flagged", () => expect(isMockPassport("http", p("deepseek-flash", ["qwen-image-edit-plus", null]))).toBe(false));
});
