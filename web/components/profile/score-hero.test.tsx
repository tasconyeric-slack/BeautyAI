import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import female from "@/lib/fixtures/sample_passport.json";
import { aestheticScore, type ScoreView } from "@/lib/adapters";
import type { Passport } from "@/lib/passport";
import { ScoreHero } from "./score-hero";

const view = aestheticScore(female as unknown as Passport) as ScoreView;

describe("ScoreHero", () => {
  it("renders the number, tier, four parts, two strengths, one direction and the workbench link", () => {
    render(<ScoreHero view={view} workbenchHref="/p/x/face" />);
    expect(screen.getByTestId("score-value").textContent).toBe(String(view.score));
    expect(screen.getByText(view.tier as string)).toBeTruthy();
    for (const c of view.components) expect(screen.getByTestId(`score-part-${c.key}`).textContent).toContain(String(c.score));
    expect(screen.getByTestId("score-strengths").querySelectorAll("li")).toHaveLength(2);
    expect(screen.getByTestId("score-improvement").textContent).toBe(view.improvement!.text);
    expect(screen.getByTestId("score-cta").getAttribute("href")).toBe("/p/x/face");
    expect(screen.getByTestId("score-hero").textContent).toContain("不代表全人群");
  });

  it("marks a limited score and lists the photo conditions", () => {
    render(<ScoreHero view={{ ...view, state: "limited", flags: ["嘴部张开或在笑"] }} workbenchHref={null} />);
    expect(screen.getByTestId("score-hero").getAttribute("data-state")).toBe("limited");
    expect(screen.getByText("参考有限")).toBeTruthy();
    expect(screen.getByText(/嘴部张开或在笑/)).toBeTruthy();
  });

  it("shows no number when unavailable, only the retake path", () => {
    const off: ScoreView = { ...view, state: "unavailable", score: null, tier: null, strengths: [], improvement: null,
      components: view.components.map((c, i) => (i === 0 ? { ...c, score: null, detail: "未测量" } : c)) };
    render(<ScoreHero view={off} workbenchHref="/p/x/face" retakeHref="/start" />);
    expect(screen.queryByTestId("score-value")).toBeNull();
    expect(screen.getByText("这张照片暂时给不出总分")).toBeTruthy();
    expect(screen.getByRole("link", { name: "重新拍一张" }).getAttribute("href")).toBe("/start");
    expect(screen.queryByTestId("score-strengths")).toBeNull();
  });
});
