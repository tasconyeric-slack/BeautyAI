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
  it("retains topic entry without making the profile an extra destination", () => {
    sessionStorage.setItem("topic-ap_x", "hair");
    render(<PassportPage />);
    expect(state.replace).toHaveBeenCalledWith("/p/ap_x/hair");
    expect(sessionStorage.getItem("topic-ap_x")).toBeNull();
  });
});
