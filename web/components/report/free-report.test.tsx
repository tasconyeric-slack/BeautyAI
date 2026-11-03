import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { sampleReportResponse } from "@/lib/fixture/backend";
import { FreeReport } from "./free-report";
afterEach(cleanup);
it("uses the server tail probability and labels estimates", () => {
  const data = sampleReportResponse("female");
  data.free_result = { score: { kind: "learned", value: 9, scale: 10, status: "ok", label: "颜值参考分" }, rank: { status: "available", percentile: 99.992, top_percent: .008, estimated: true, label: "测试样本" }, metrics: [] };
  render(<FreeReport data={data} />);
  expect(screen.getByTestId("free-rank").textContent).toBe("Top 0.008%");
  expect(screen.getByText(/模型估计/)).toBeTruthy();
});
it("explains model mismatch without calling it calibration", () => {
  const data = sampleReportResponse("female");
  data.free_result = { score: { kind: "learned", value: 7.2, scale: 10, status: "ok", label: "颜值参考分" }, rank: { status: "unavailable", percentile: null, label: null, unavailable_reason: "model_reference_mismatch" }, metrics: [] };
  render(<FreeReport data={data} />);
  expect(screen.getByText(/版本不匹配/)).toBeTruthy();
  expect(screen.queryByText("校准中")).toBeNull();
});
it.each([[65, "Top 35%"], [95, "Top 5%"], [0, "Top 100%"]])("shows the upper reference tail for percentile %s", (percentile, label) => {
  const data = sampleReportResponse("female");
  data.free_result = { score: { kind: "learned", value: 5.5, scale: 10, status: "ok", label: "颜值参考分" }, rank: { status: "available", percentile, label: "SCUT held-out Ridge17 photo convenience sample" }, metrics: [] };
  render(<FreeReport data={data} />);
  expect(screen.getByTestId("free-rank").textContent).toBe(label);
  expect(screen.getByTestId("rank-position").getAttribute("data-percentile")).toBe(String(percentile));
  expect(screen.queryByTestId("reference-density")).toBeNull();
  expect(screen.getByText(/SCUT held-out/).textContent).toContain("主体与年龄未核验");
});

it("shows real reference density and independent geometric radar when provided", () => {
  const data = sampleReportResponse("female");
  data.free_result = {
    score: { kind: "learned", value: 5.3, scale: 10, status: "ok", label: "颜值参考分" },
    rank: { status: "available", percentile: 45, label: "测试照片样本",
      distribution: { method: "gaussian_kde_scott_v1", n: 100, bounds: [1, 10], mean: 5.2,
        points: [[1, 0.01], [3, 0.05], [5, 0.2], [7, 0.08], [10, 0.01]] } },
    harmony: [
      { id: "eyes", label: "眼部对称", value: 60 },
      { id: "brows", label: "眉部对称", value: 70 },
      { id: "nose", label: "鼻部对称", value: 80 },
      { id: "mouth", label: "口部对称", value: 90 },
      { id: "jaw", label: "轮廓对称", value: 50 },
      { id: "thirds", label: "三庭均衡", value: 65 },
      { id: "fifths", label: "五眼均衡", value: 75 },
      { id: "golden_ratio", label: "长宽协调", value: 85 },
    ],
    metrics: [],
  };
  render(<FreeReport data={data} />);
  expect(screen.getByTestId("free-rank").textContent).toBe("Top 55%");
  expect(screen.getByTestId("reference-density")).toBeTruthy();
  expect(screen.getByTestId("harmony-radar")).toBeTruthy();
  expect(screen.queryByTestId("rank-position")).toBeNull();
});
