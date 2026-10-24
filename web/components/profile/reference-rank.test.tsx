import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReferenceRails } from "@/components/face/reference-rails";
import female from "@/lib/fixtures/sample_passport.json";
import { aestheticScore, referenceRank, referenceRatios, type ScoreView } from "@/lib/adapters";
import type { Passport } from "@/lib/passport";
import { ScoreHero } from "./score-hero";

const F = female as unknown as Passport;
const view = aestheticScore(F) as ScoreView;
const rp = F.reference_percentiles!;

/** The same passport with the scale registered server-side (what a calibrated scoring_version produces). */
const ranked: Passport = {
  ...F,
  reference_percentiles: {
    ...rp,
    rank: {
      ...rp.rank, status: "ok", reason: undefined, reason_zh: undefined, mapping_mode: "direct", score: 80,
      reference_score: 80, percentile_estimate: 70, top_percent_estimate: 30, precision: "interpolated", approximate: true,
      label_zh: "参考扫描人群中约前 30%", higher_than_zh: "约高于 70% 的参考扫描", method: "piecewise_linear_published_anchors",
      note_zh: "对照人群：The Face Report 公开的 15,429 份扫描（2026-08-19）。",
      cohort: { kind: "self_selected_scans", n: 15429, source_date: "2026-08-19", publisher: "The Face Report (Known by One, LLC)",
        source_url: "https://thefacereport.com/guides/face-analysis-study", population_representative: false },
    },
  },
};

describe("reference rank (#41)", () => {
  it("the shipped sample shows the calibration gap, never a number", () => {
    const r = referenceRank(F)!;
    expect(r.state).toBe("unavailable");
    expect(r.label).toBeNull();
    expect(r.reason).toContain("校准");
    render(<ScoreHero view={view} rank={r} workbenchHref="/p/x/face" />);
    const box = screen.getByTestId("score-rank");
    expect(box.getAttribute("data-state")).toBe("unavailable");
    expect(box.textContent).not.toMatch(/前\s*\d+%/);
  });

  it("a registered scale shows the approximate position with cohort, N and date", () => {
    const r = referenceRank(ranked)!;
    render(<ScoreHero view={view} rank={r} workbenchHref="/p/x/face" />);
    expect(screen.getByTestId("score-rank").textContent).toContain("参考扫描人群中约前 30%");
    expect(screen.getByTestId("score-rank").textContent).toContain("近似");
    const hero = screen.getByTestId("score-hero").textContent!;
    expect(hero).toContain("15,429 份自愿扫描");
    expect(hero).toContain("2026-08-19");
    expect(hero).not.toMatch(/全人类|全球人口/);
  });

  it("no rank box without a score, and null for passports older than 0.7", () => {
    expect(referenceRank({ ...F, reference_percentiles: undefined })).toBeNull();
    render(<ScoreHero view={{ ...view, state: "unavailable", score: null }} rank={referenceRank(F)} workbenchHref={null} />);
    expect(screen.queryByTestId("score-rank")).toBeNull();
  });

  it("rails: only verified, measured ratios are drawn; the rest are one note; no 'better' end", () => {
    const v = referenceRatios(F)!;
    expect(v.rails.map((r) => r.id)).toEqual(["midface_length", "lower_face_length"]);
    expect(v.rails[0].value).toMatch(/^\d+%$/);
    expect(v.rails[0].p50).toBe("44%");
    render(<ReferenceRails v={v} />);
    expect(screen.getAllByTestId(/^rail-/)).toHaveLength(2);
    expect(screen.getByTestId("reference-unverified")).toBeTruthy();
    expect(screen.getByTestId("rail-midface_length").textContent).toContain("不代表好坏");
    expect(screen.getByRole("link", { name: /CC BY 4.0/ }).getAttribute("href")).toBe(
      "https://thefacereport.com/guides/facial-measurement-norms");
  });
});
