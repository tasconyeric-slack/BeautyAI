import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Passport, PassportResponse } from "@/lib/api";
import sample from "@/lib/fixtures/sample_passport.json";
import { reveal as copy } from "@/lib/copy/zh";
import { StaticPassportProvider } from "@/lib/state/passport-store";
import { Reveal, revealStage } from "./reveal";

const p = structuredClone(sample) as unknown as Passport;
const ID = "fx_reveal";

type Over = Omit<Partial<PassportResponse>, "partial"> & { partial?: Partial<PassportResponse["partial"]> };
function resp(over: Over): PassportResponse {
  return {
    id: ID, status: "scanning", stage: "qc", passport: null, error: null, created_at: "2026-10-23T09:00:00Z",
    entitlement: { paid: false, unlock_scope: "free", share_token: null, free_previews_left: 0, price_cny: 139, locked: [] },
    media: { front: "/sample/portrait.svg", thumb: null, expires_at: null, expired: false },
    ...over,
    partial: { input_quality: null, anchors: null, quick: null, analysis: "pending", previews: [], ...over.partial },
  } as PassportResponse;
}

const quick = { summary_zh: "柔和的椭圆轮廓，五官比例均衡", feature_signature: p.analysis.feature_signature, observations: [] };

describe("revealStage (D29: labels follow real backend states)", () => {
  it("maps pipeline stages in order", () => {
    expect(revealStage(resp({ stage: "qc" }))).toBe(0);
    expect(revealStage(resp({ stage: "quick", partial: { anchors: p.anchors } }))).toBe(1);
    expect(revealStage(resp({ stage: "analysis", status: "quick_ready", partial: { anchors: p.anchors, quick } }))).toBe(2);
    expect(revealStage(resp({ stage: "rules", status: "quick_ready", partial: { anchors: p.anchors } }))).toBe(3);
    expect(revealStage(resp({ status: "full_ready", stage: "done" }))).toBe(4);
  });
});

describe("Reveal screen", () => {
  it("shows the stage list but no measurements, numbers or quick conclusions", () => {
    const { container } = render(
      <StaticPassportProvider value={{ data: resp({ stage: "analysis", status: "quick_ready", partial: { anchors: p.anchors, quick } }) }}>
        <Reveal />
      </StaticPassportProvider>,
    );
    for (const s of copy.stages) expect(screen.getAllByText(s).length).toBeGreaterThan(0);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/\d\.\d|%|三庭|长宽比|眼距/);
    expect(text).not.toContain(quick.summary_zh);
    for (const f of p.analysis.feature_signature) expect(text).not.toContain(f.title);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(copy.stages[2]);
  });

  it("offers a real restart instead of reading the same failed job again", () => {
    render(
      <StaticPassportProvider value={{ data: resp({ status: "analysis_failed", stage: "analysis", partial: { anchors: p.anchors } }) }}>
        <Reveal />
      </StaticPassportProvider>,
    );
    expect(screen.getByRole("link", { name: "重新开始分析" }).getAttribute("href")).toBe("/start");
    expect(screen.queryByRole("button", { name: "重试一次" })).toBeNull();
  });
});
