import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { HomePage } from "./homepage";
vi.mock("@/lib/landing-event", () => ({ trackLandingView: () => Promise.resolve() }));
beforeAll(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
  globalThis.IntersectionObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof IntersectionObserver;
  window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener() {}, removeEventListener() {} });
});
describe("production homepage", () => {
  it("keeps approved Hero and hands off to real report and personal upload without developer routes or simulated saves", () => {
    render(<HomePage />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("读懂这张脸，再决定风格。");
    const links = screen.getAllByRole("link");
    expect(links.some(a => a.getAttribute("href") === "/report/sample?v=p002")).toBe(true);
    expect(links.every(a => !a.getAttribute("href")?.startsWith("/dev/"))).toBe(true);
    expect(screen.getByRole("link", { name: "用自己的照片试试" }).getAttribute("href")).toBe("/start");
    expect(screen.queryByRole("button", { name: "保存这个方向" })).toBeNull();
    expect(screen.getByText(/AI 模拟示例 · 上传自己的照片后/)).toBeTruthy();
  });
});
