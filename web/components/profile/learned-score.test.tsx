import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { learnedScore } from "@/lib/adapters";
import type { Passport } from "@/lib/passport";
import sample from "@/lib/fixtures/sample_passport.json";
import { PredictedScoreHero } from "./score-hero";

afterEach(cleanup);
const old = sample as Passport;
const score: NonNullable<Passport["learned_attractiveness"]> = {
  contract_version: "learned-attractiveness-1", status: "research_only", model_id: "test-only-ridge",
  checkpoint_id: "sha256:test", preprocessing_version: "test", crop_version: "test", native_scale_id: "test",
  calibration_version: null, raw_score: 3, display_score: 5.5, native_label_range: [1, 5], display_range: [1, 10],
  display_transform: "test-linear", qc_status: "passed", inference_ms: 0.1, research_only: true,
  production_authorized: false, provenance: "cv_geometry_ridge_regression", quality_flags: [],
  unavailable_reason: null, limitations: [],
};

it("keeps old passports compatible and never synthesizes a learned score", () => {
  expect(learnedScore({ ...old, learned_attractiveness: undefined })).toBeNull();
});
it("shows only the ten-point score and computed reference rank", () => {
  const p: Passport = { ...old, learned_attractiveness: score, learned_reference_rank: {
    status: "available", percentile: 65, top_percent: 35, cohort_label: "Test-only sample",
    cohort_id: "test", distribution_version: "test", n_reference: 2128, n_unique_subjects: null,
    method: "empirical_cdf_midrank_v1", limitations: [], unavailable_reason: null,
    percentile_interval: [60, 70], display_step_percent: 5, reference_unit: "image", research_only: true,
    tier: { id: "top_35", label_zh: "参考样本前 35% 区间", min_percentile: 65 },
  } };
  render(<PredictedScoreHero view={learnedScore(p)!} />);
  expect(screen.getByTestId("learned-score").textContent).toContain("5.5");
  expect(screen.getByTestId("score-value").textContent).toMatch(/5.5\s*\/\s*10/);
  expect(screen.getByTestId("learned-rank").textContent).toBe("前 35%");
  expect(screen.getByTestId("learned-score").textContent).not.toMatch(/SCUT|原生|照片质量|同模型|研究预览|校准|示意|常见区间|评分与样本说明|test-only-ridge/);
  expect(screen.getByTestId("learned-score").querySelector("details")).toBeNull();
});
it("missing model never falls back to a geometric or fake predicted number", () => {
  render(<PredictedScoreHero view={learnedScore({ ...old, learned_attractiveness: {
    ...score, status: "unavailable", raw_score: null, display_score: null, unavailable_reason: "model_missing",
  } })!} />);
  expect(screen.queryByTestId("score-value")).toBeNull();
  expect(screen.queryByTestId("learned-rank")).toBeNull();
  expect(screen.getByText("暂不可用")).toBeTruthy();
  expect(screen.getByText("暂无排名")).toBeTruthy();
});

it("withholds a missing percentile while keeping the real score", () => {
  render(<PredictedScoreHero view={learnedScore({ ...old, learned_attractiveness: score,
    learned_reference_rank: null })!} />);
  expect(screen.getByTestId("score-value").textContent).toContain("5.5");
  expect(screen.queryByTestId("learned-rank")).toBeNull();
  expect(screen.getByText("暂无排名")).toBeTruthy();
});
