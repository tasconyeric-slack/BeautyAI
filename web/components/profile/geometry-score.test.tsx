import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import type { Passport } from "@/lib/passport";
import fixture from "@/lib/fixtures/sample_passport.json";
import { geometryScore } from "@/lib/adapters";
import { GeometryScoreHero } from "./geometry-score";

test("geometry remains available independently of a missing learned score or rank", () => {
  const p = structuredClone(fixture) as Passport;
  p.learned_attractiveness = null;
  p.geometry_reference_rank = null;
  const view = geometryScore(p);
  expect(view.score).toBe(p.aesthetic_score!.overall_score! / 10);
  render(<GeometryScoreHero view={view} />);
  expect(screen.getByTestId("geometry-score-value").textContent).toContain(`${view.score}`);
  expect(screen.getByTestId("geometry-rank").textContent).not.toMatch(/前\s*\d/);
});

test("limited geometry never displays a stale rank", () => {
  const p = structuredClone(fixture) as Passport;
  p.aesthetic_score!.status = "limited";
  p.geometry_reference_rank = { status: "available", top_percent: 10 } as Passport["geometry_reference_rank"];
  expect(geometryScore(p).rank).toBeNull();
});
