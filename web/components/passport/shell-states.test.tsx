/** Issue #2: a passport page whose data cannot be loaded says so and can retry; it is never a blank page.
 *  Runs the real provider and shell against a backend that fails, then recovers. */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sampleReportResponse } from "@/lib/fixture/backend";
import { settings } from "@/lib/copy/zh";

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

describe("passport settings use the shared sheet interaction", () => {
  it("moves focus inside, contains keyboard navigation and returns focus on Escape", async () => {
    get.mockResolvedValue(sampleReportResponse("female"));
    page();
    await screen.findByText("PAGE CONTENT");
    const opener = screen.getByRole("button", { name: `${settings.title} · 删除数据` });
    opener.focus();
    const previousOverflow = document.body.style.overflow;
    fireEvent.click(opener);
    const dialog = screen.getByRole("dialog", { name: settings.title });
    const close = within(dialog).getByRole("button", { name: "关闭" });
    const last = within(dialog).getByRole("button", { name: "删除我的照片与报告" });
    await waitFor(() => expect(document.activeElement).toBe(close));
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(last, { key: "Tab" });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(document.body.style.overflow).toBe(previousOverflow);
  });

  it("keeps the deletion confirmation reversible without deleting the passport", async () => {
    get.mockResolvedValue(sampleReportResponse("female"));
    page();
    await screen.findByText("PAGE CONTENT");
    fireEvent.click(screen.getByRole("button", { name: `${settings.title} · 删除数据` }));
    const dialog = screen.getByRole("dialog", { name: settings.title });
    fireEvent.click(within(dialog).getByRole("button", { name: "删除我的照片与报告" }));
    expect(within(dialog).getByRole("button", { name: "确认删除" })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "保留护照" }));
    expect(within(dialog).queryByRole("button", { name: "确认删除" })).toBeNull();
    expect(screen.getByText("PAGE CONTENT")).toBeTruthy();
  });
});
