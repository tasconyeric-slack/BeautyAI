/** Issue #2: a passport page whose data cannot be loaded says so and can retry; it is never a blank page.
 *  Runs the real provider and shell against a backend that fails, then recovers. */
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sampleReportResponse } from "@/lib/fixture/backend";

const get = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", async (orig) => {
  const real = await orig<typeof import("@/lib/api")>();
  return { ...real, backendFor: () => ({ kind: "http", get, feedback: vi.fn(), rerank: vi.fn() }), api: { track: vi.fn(() => Promise.resolve()) } };
});
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/p/ap_x/report", useRouter: () => ({ push: () => {} }) }));

import { ApiError } from "@/lib/api";
import { PassportShell } from "./shell";

const page = () => render(<PassportShell id="ap_x"><p>PAGE CONTENT</p></PassportShell>);

// a block body: a function returned from beforeEach is run by Vitest as teardown (and `mockReset()` returns the mock)
beforeEach(() => { get.mockReset(); });

describe("passport shell when the passport cannot be loaded", () => {
  it("offline: explains it, offers a retry, and shows the page once the retry succeeds", async () => {
    get.mockRejectedValue(new ApiError(0, { code: "offline", detail: "TypeError: Failed to fetch https://internal.example/x" }));
    page();
    const alert = await screen.findByTestId("passport-error");
    expect(alert.textContent).toContain("网络不稳定");
    expect(alert.textContent).not.toContain("internal.example"); // raw error text never reaches the page
    expect(screen.queryByText("PAGE CONTENT")).toBeNull();

    get.mockResolvedValue(sampleReportResponse("female"));
    fireEvent.click(screen.getByRole("button", { name: "重试一次" }));
    expect(await screen.findByText("PAGE CONTENT")).toBeTruthy();
    expect(screen.queryByTestId("passport-error")).toBeNull();
  });

  it("a server error is named as the service's, not the visitor's photo", async () => {
    get.mockRejectedValue(new ApiError(503, { code: "unavailable", detail: "upstream" }));
    page();
    expect((await screen.findByTestId("passport-error")).textContent).toContain("服务暂时没有响应");
  });

  it("a missing report explains the server-side failure and recovers on retry", async () => {
    get.mockRejectedValue(new ApiError(404, { code: "not_found", detail: "no such passport" }));
    page();
    expect(await screen.findByText("服务器暂时找不到这份报告")).toBeTruthy();
    expect((await screen.findByRole("alert")).textContent).toContain("这不一定是链接过期或你主动删除了报告");
    expect(screen.queryByText("PAGE CONTENT")).toBeNull();

    get.mockResolvedValue(sampleReportResponse("female"));
    fireEvent.click(screen.getByRole("button", { name: "重试一次" }));
    expect(await screen.findByText("PAGE CONTENT")).toBeTruthy();
    expect(screen.queryByTestId("passport-error")).toBeNull();
  });

  it("data already on screen is not replaced by an error when a later refresh fails", async () => {
    get.mockResolvedValueOnce(sampleReportResponse("female")).mockRejectedValue(new ApiError(0, { code: "offline", detail: "x" }));
    page();
    expect(await screen.findByText("PAGE CONTENT")).toBeTruthy();
    expect(screen.queryByTestId("passport-error")).toBeNull();
  });
});
