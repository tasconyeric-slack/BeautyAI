import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { harmonyRadar } from "@/lib/adapters";
import type { Passport } from "@/lib/passport";
import sample from "@/lib/fixtures/sample_passport.json";
import { densityPaths, type Density } from "./score-chart-geometry";
import { HarmonyRadar, ReferenceDensity } from "./score-charts";

afterEach(cleanup);
const curve: Density = { method: "gaussian_kde_scott_v1", n: 1000, bounds: [1, 10], mean: 5.2,
  points: [[1, 0.01], [3, 0.1], [5, 0.3], [7, 0.1], [10, 0.01]] };

it("positions the vertical line on the score scale and shades the measured curve's right tail", () => {
  const d = densityPaths(curve, 7);
  expect(d.markerX).toBeCloseTo(12 + (6 / 9) * 296);
  expect(d.meanX).toBeCloseTo(12 + (4.2 / 9) * 296);
  render(<ReferenceDensity curve={curve} score={7} />);
  const line = screen.getByTestId("reference-score-marker");
  expect(line.getAttribute("x1")).toBe(line.getAttribute("x2"));
  expect(Number(line.getAttribute("y2"))).toBeGreaterThan(Number(line.getAttribute("y1")));
  expect(screen.getByTestId("reference-density-tail").getAttribute("d")).toBe(d.rightArea);
  expect(screen.getByText("均值 5.2")).toBeTruthy();
});

it("expands existing D36 values to eight axes and does not turn missing measurements into zeros", () => {
  const p = structuredClone(sample) as Passport;
  const axes = harmonyRadar(p)!;
  expect(axes).toHaveLength(8);
  const measured = p.aesthetic_score!.components.find(c => c.key === "symmetry")!.measured as { features: Record<string, number> };
  expect(axes.find(a => a.id === "eyes")!.value).toBe(measured.features.eyes);
  expect(axes.find(a => a.id === "thirds")!.value).toBe(p.aesthetic_score!.component_scores.thirds);
  const { container, rerender } = render(<HarmonyRadar axes={axes} />);
  expect(screen.getByTestId("harmony-polygon")).toBeTruthy();
  expect(container.querySelectorAll("[data-axis]")).toHaveLength(8);
  rerender(<HarmonyRadar axes={axes.map(a => a.id === "eyes" ? { ...a, value: null } : a)} />);
  expect(screen.queryByTestId("harmony-polygon")).toBeNull();
  expect(container.querySelector('[data-axis="eyes"] circle')).toBeNull();
  expect(screen.getByText("—")).toBeTruthy();
});
