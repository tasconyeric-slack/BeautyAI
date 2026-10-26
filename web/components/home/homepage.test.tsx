import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { privacy } from "@/lib/copy/zh";
import * as samples from "@/lib/fixtures/demo_cases";
import { HomePage } from "./homepage";

vi.mock("@/lib/landing-event", () => ({ trackLandingView: () => Promise.resolve() }));
beforeAll(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});

describe("production homepage", () => {
  it("keeps the homepage usable when an optional sample's geometry is unavailable", () => {
    const original = samples.demoCaseByKey;
    const female = original("p001")!;
    const lookup = vi.spyOn(samples, "demoCaseByKey").mockImplementation((key) => key === "p001"
      ? { ...female, geometry: { ...female.geometry, width: 1 } } : original(key));
    try {
      render(<HomePage />);
      expect(screen.getByRole("link", { name: /上传正脸/ }).getAttribute("href")).toBe("/start");
      expect(screen.queryByRole("tablist")).toBeNull();
    } finally { lookup.mockRestore(); }
  });
  it("keeps the approved Hero, both report links, upload and privacy disclosure", () => {
    render(<HomePage />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("读懂这张脸，再决定风格。");
    expect(screen.getByRole("link", { name: /上传正脸/ }).getAttribute("href")).toBe("/start");
    expect(screen.getAllByRole("link").some((a) => a.getAttribute("href") === "/report/sample?v=p002")).toBe(true);
    expect(screen.getByRole("link", { name: /查看她的完整报告/ }).getAttribute("href")).toBe("/report/sample?v=p001");
    for (const fact of privacy.facts) expect(screen.getByText(fact)).toBeTruthy();
  });

  it("switches same-person evidence and supported advice by touch/click and keyboard", () => {
    render(<HomePage />);
    const tabs = screen.getByRole("tablist", { name: "选择风格决策" });
    expect(within(tabs).getAllByRole("tab").map((t) => t.textContent)).toEqual(["01发型", "02眉形", "03眼镜"]);
    expect(screen.getByRole("tabpanel").textContent).toContain("上庭约占三庭的 29%");
    const brows = within(tabs).getByRole("tab", { name: /眉形/ });
    fireEvent.click(brows);
    expect(brows.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel").textContent).toContain("两眼之间约为 1.35 个眼宽");
    expect(screen.getByRole("tabpanel").textContent).toContain("眉头可以略向内延伸，让眉眼更集中。");
    fireEvent.keyDown(brows, { key: "ArrowRight" });
    const glasses = within(tabs).getByRole("tab", { name: /眼镜/ });
    expect(document.activeElement).toBe(glasses);
    expect(glasses.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel").textContent).toContain("镜框宽度不超过颧骨，上下略窄的款式更协调。");
    fireEvent.keyDown(glasses, { key: "Home" });
    expect(within(tabs).getByRole("tab", { name: /发型/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText(/发型预览待生成/)).toBeTruthy();
  });

  it("lets readers hide annotations without changing the selected recommendation", () => {
    render(<HomePage />);
    const choices = screen.getByRole("region", { name: /看懂之后/ });
    const toggle = within(choices).getByRole("button", { name: "只看照片" });
    fireEvent.click(toggle);
    expect(within(choices).getByRole("button", { name: "显示标注" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(choices).getByRole("tabpanel").textContent).toContain("适合露额或后梳");
    expect(choices.querySelector("svg[data-marks]")).toBeNull();
  });
});
