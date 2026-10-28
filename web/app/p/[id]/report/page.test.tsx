import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { sampleReportResponse } from "@/lib/fixture/backend";
import { StaticPassportProvider } from "@/lib/state/passport-store";
import ReportPage from "./page";
vi.mock("@/components/report/full-report", () => ({ FullReport: () => <div>R2 报告</div> }));
describe("report route follows the current job", () => {
  it.each(["scanning", "quick_ready", "analysis_failed"] as const)("renders the real %s state before a passport exists", status => {
    const data = structuredClone(sampleReportResponse("female")); data.id = "ap_route"; data.status = status; data.stage = "analysis"; data.passport = null;
    render(<StaticPassportProvider value={{ data }}><ReportPage /></StaticPassportProvider>);
    expect(screen.queryByText("R2 报告")).toBeNull();
    if (status === "analysis_failed") expect(screen.getByRole("link", { name: "重新开始分析" })).toBeTruthy();
    else expect(screen.getByRole("list", { name: "分析进度" })).toBeTruthy();
  });
  it("completed jobs show R2", () => {
    const data = sampleReportResponse("female");
    render(<StaticPassportProvider value={{ data }}><ReportPage /></StaticPassportProvider>);
    expect(screen.getByText("R2 报告")).toBeTruthy();
  });
});
