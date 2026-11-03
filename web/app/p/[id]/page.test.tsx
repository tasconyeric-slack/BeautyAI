import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sampleReportResponse } from "@/lib/fixture/backend";

const state = vi.hoisted(() => ({ value: {} as Record<string, unknown>, replace: vi.fn() }));
vi.mock("@/lib/state/passport-store", () => ({ usePassport: () => state.value }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: state.replace }) }));
vi.mock("@/components/report/full-report", () => ({ FullReport: () => <p>完整报告内容</p> }));
vi.mock("@/components/reveal/reveal", () => ({ Reveal: () => <p>分析进度</p> }));
vi.mock("@/components/upload/start-flow", () => ({ landTopicKey: (id: string) => `topic-${id}` }));
import PassportPage from "./page";

beforeEach(() => {
  state.replace.mockReset();
  sessionStorage.clear();
  state.value = { id: "ap_x", data: sampleReportResponse("female"), loading: false };
});
describe("completed analysis lands on the report", () => {
  it("renders the full report directly", () => {
    render(<PassportPage />);
    expect(screen.getByText("完整报告内容")).toBeTruthy();
    expect(screen.queryByText("分析进度")).toBeNull();
  });
  it("retains real analysis progress until ready", () => {
    state.value.data = { ...sampleReportResponse("female"), status: "scanning", passport: null };
    render(<PassportPage />);
    expect(screen.getByText("分析进度")).toBeTruthy();
    expect(screen.queryByText("完整报告内容")).toBeNull();
  });
  it("keeps unlocked users in progress instead of reverting to their free report", () => {
    const data = structuredClone(sampleReportResponse("female"));
    data.status = "free_ready";
    data.stage = "analysis";
    data.passport = null;
    data.entitlement.paid = true;
    data.free_result = {
      score: { kind: "learned", value: 7.2, scale: 10, status: "ok", label: "颜值参考分" },
      rank: { status: "unavailable", percentile: null, label: null },
      metrics: [],
    };
    state.value.data = data;
    render(<PassportPage />);
    expect(screen.getByText("分析进度")).toBeTruthy();
    expect(screen.queryByTestId("free-cv-report")).toBeNull();
  });
  it("retains topic entry without making the profile an extra destination", () => {
    sessionStorage.setItem("topic-ap_x", "hair");
    render(<PassportPage />);
    expect(state.replace).toHaveBeenCalledWith("/p/ap_x/hair");
    expect(sessionStorage.getItem("topic-ap_x")).toBeNull();
  });
});
