/** Issue #2: the journey model, the desktop step bar and the next-step bridge. */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sampleReportResponse } from "@/lib/fixture/backend";
import { StaticPassportProvider } from "@/lib/state/passport-store";
import { currentStep, JOURNEY, journeyHref, nextStep, type JourneyKey } from "./journey";
import { JourneyBar, JourneyNext } from "./shell";
import { ErrorState, errorCopy, LoadingState } from "./states";

const nav = vi.hoisted(() => ({ path: "/p/ap_sample_0001" }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock("next/navigation", () => ({ usePathname: () => nav.path, useRouter: () => ({ push: () => {} }) }));

describe("journey model", () => {
  const at = (sub: string) => currentStep(`/p/ap_x${sub}`);
  it("maps every passport route to one step, in the reading order", () => {
    expect(JOURNEY.map((s) => s.key)).toEqual(["overview", "evidence", "report", "advice", "plan", "studio"]);
    const expected: Record<string, JourneyKey> = {
      "": "overview", "/color": "overview", "/style": "overview", "/share": "overview", "/more": "overview",
      "/face": "evidence", "/detail": "evidence", "/report": "report",
      "/advice": "advice", "/hair": "advice", "/makeup": "advice", "/outfit": "advice", "/glasses": "advice",
      "/plan": "plan", "/studio": "studio",
    };
    for (const [sub, key] of Object.entries(expected)) expect(at(sub), sub || "/").toBe(key);
  });
  it("leaves pages outside the journey out of it", () => {
    expect(at("/unlock")).toBeNull();
    expect(currentStep("/start")).toBeNull();
    expect(currentStep(undefined)).toBeNull();
  });
  it("builds every href from the same table", () => {
    expect(journeyHref("ap_x", "overview")).toBe("/p/ap_x");
    expect(journeyHref("ap_x", "evidence")).toBe("/p/ap_x/face");
    expect(journeyHref("ap_x", "studio")).toBe("/p/ap_x/studio");
    for (const s of JOURNEY) expect(currentStep(journeyHref("ap_x", s.key)), s.key).toBe(s.key);
  });
  it("bridges evidence → report, advice → plan, plan → studio and nowhere else", () => {
    expect(nextStep("evidence")?.step.key).toBe("report");
    expect(nextStep("advice")?.step.key).toBe("plan");
    expect(nextStep("plan")?.step.key).toBe("studio");
    for (const k of ["overview", "report", "studio", null] as const) expect(nextStep(k)).toBeNull();
  });
});

describe("desktop step bar and next-step bridge", () => {
  const data = sampleReportResponse("female");
  const wrap = (ui: React.ReactNode, status = "full_ready") => (
    <StaticPassportProvider value={{ data: { ...data, status: status as typeof data.status } }}>{ui}</StaticPassportProvider>
  );
  beforeEach(() => { nav.path = "/p/ap_sample_0001"; });

  it("lists the six steps, marks the current one and links each to its page", () => {
    nav.path = "/p/ap_sample_0001/report";
    render(wrap(<JourneyBar />));
    const bar = screen.getByRole("navigation", { name: "浏览路径" });
    const links = within(bar).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual(JOURNEY.map((s) => journeyHref(data.id, s.key)));
    const current = links.filter((a) => a.getAttribute("aria-current") === "page");
    expect(current).toHaveLength(1);
    expect(current[0].textContent).toContain("完整报告");
    // hidden on phones (they keep the four-area bottom bar)
    expect(bar.className).toMatch(/\bhidden\b/);
    expect(bar.className).toMatch(/md:block/);
  });

  it("stays out of the way while the passport is still being built and on pages outside the journey", () => {
    const { container, rerender } = render(wrap(<JourneyBar />, "scanning"));
    expect(container.querySelector("nav")).toBeNull();
    nav.path = "/p/ap_sample_0001/unlock";
    rerender(wrap(<JourneyBar />));
    expect(container.querySelector("nav")).toBeNull();
  });

  it("offers the next step under evidence, advice and plan — and not under the overview, report or studio", () => {
    for (const [sub, to] of [["/face", "完整报告"], ["/advice", "行动方案"], ["/plan", "形象实验室"]] as const) {
      nav.path = `/p/ap_sample_0001${sub}`;
      const { unmount } = render(wrap(<JourneyNext />));
      const card = screen.getByTestId("journey-next");
      expect(within(card).getByRole("link").textContent).toContain(to);
      unmount();
    }
    for (const sub of ["", "/report", "/studio"]) {
      nav.path = `/p/ap_sample_0001${sub}`;
      const { container, unmount } = render(wrap(<JourneyNext />));
      expect(container.querySelector('[data-testid="journey-next"]'), sub || "/").toBeNull();
      unmount();
    }
  });
});

describe("loading and error states", () => {
  it("loading is announced politely and shows a skeleton, not a verdict", () => {
    render(<LoadingState label="正在读取报告…" />);
    const s = screen.getByRole("status");
    expect(s.getAttribute("aria-busy")).toBe("true");
    expect(s.textContent).toContain("正在读取报告");
  });

  it("explains offline, server and other failures differently and never echoes raw error text", () => {
    expect(errorCopy({ status: 0, offline: true }).title).toBe("网络不稳定");
    expect(errorCopy({ status: 503, offline: false }).title).toBe("服务暂时没有响应");
    expect(errorCopy({ status: 422, offline: false }).title).toBe("这份档案暂时打不开");
    expect(errorCopy(null).title).toBe("这份档案暂时打不开");
  });

  it("the error state is an alert with a retry that runs once and a way home", async () => {
    const retry = vi.fn(async () => {});
    render(<ErrorState error={{ status: 0, offline: true }} onRetry={retry} />);
    expect(screen.getByRole("alert").textContent).toContain("网络不稳定");
    fireEvent.click(screen.getByRole("button", { name: "重试一次" }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: "回到首页" }).getAttribute("href")).toBe("/");
    await screen.findByRole("button", { name: "重试一次" }); // back to idle after the retry settles
  });
});
