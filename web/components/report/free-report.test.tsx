import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { sampleReportResponse } from "@/lib/fixture/backend";
import { FreeReport } from "./free-report";
afterEach(cleanup);
it.each([[65, "Top 35%"], [95, "Top 5%"], [0, "Top 100%"]])("shows the upper reference tail for percentile %s", (percentile, label) => {
  const data = sampleReportResponse("female");
  data.free_result = { score: { kind: "learned", value: 5.5, scale: 10, status: "ok", label: "颜值参考分" }, rank: { status: "available", percentile, label: "SCUT held-out Ridge17 photo convenience sample" }, metrics: [] };
  render(<FreeReport data={data} />);
  expect(screen.getByTestId("free-rank").textContent).toBe(label);
  expect(screen.getByTestId("rank-position").getAttribute("data-percentile")).toBe(String(percentile));
  expect(screen.queryByTestId("reference-density")).toBeNull();
  expect(screen.getByText(/SCUT held-out/).textContent).toContain("主体与年龄未核验");
});
