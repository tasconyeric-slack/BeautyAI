import { render, screen, within } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { HomePage } from "./homepage";
import { TOPIC_KEYS, startHref } from "@/components/landing/cases";
import { topics } from "@/lib/copy/zh";
import { demoCaseByKey } from "@/lib/fixtures/demo_cases";
import { learnedScore } from "@/lib/adapters";
import { formatTopPercent } from "@/lib/rank-format";
const trackLandingView = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock("@/lib/landing-event", () => ({ trackLandingView }));
beforeAll(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
  globalThis.IntersectionObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof IntersectionObserver;
  window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener() {}, removeEventListener() {} });
});
describe("production homepage", () => {
  it.each(TOPIC_KEYS)("keeps the %s topic copy and attribution through every start action", (topic) => {
    render(<HomePage topic={topic} refCode="note-42" />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(topics[topic].title);
    expect(screen.getByText(topics[topic].subtitle)).toBeTruthy();
    const starts = screen.getAllByRole("link").filter(a => a.getAttribute("href")?.startsWith("/start"));
    expect(starts.length).toBeGreaterThan(3);
    expect(starts.every(a => a.getAttribute("href") === startHref(topic, "note-42"))).toBe(true);
    expect(trackLandingView).toHaveBeenCalledWith(topic, "note-42");
    expect(screen.getByRole("link", { name: /查看完整示例报告/ }).getAttribute("href")).toBe("/report/sample");
  });
  it("shows approved value flow and real report/start destinations without a Studio showcase", () => {
    render(<HomePage />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("知道自己哪里好看，也知道怎样更好看。");
    const links = screen.getAllByRole("link");
    expect(screen.getByRole("link", { name: "上传照片，免费测评" }).getAttribute("href")).toBe("/start");
    expect(screen.getByRole("link", { name: "查看示例报告" }).getAttribute("href")).toBe("/report/sample");
    expect(screen.getByRole("link", { name: /开始我的形象分析/ }).getAttribute("href")).toBe("/start");
    expect(links.every(a => !a.getAttribute("href")?.startsWith("/dev/"))).toBe(true);
    expect(screen.getByRole("link", { name: "形象实验室" }).getAttribute("href")).toBe("/start");
    const headings = screen.getAllByRole("heading", { level: 2 }).map(h => h.textContent);
    expect(headings).toEqual(expect.arrayContaining([
      "比一个分数更重要的，是了解分数背后的自己。",
      "不是套用流行公式，而是找到适合你的答案。",
      "一份报告，找到属于你的变美方向。",
      "更好的形象，从更了解自己开始。",
    ]));
    expect(screen.queryByRole("slider")).toBeNull();
    expect(screen.queryByRole("tablist", { name: "造型选项" })).toBeNull();
    expect(screen.queryByRole("heading", { name: /不同的脸|先了解自己的特点/ })).toBeNull();
  });
  it("keeps measured P002 insights/advice separate from the published P001 score and report", () => {
    render(<HomePage />);
    const measured = document.querySelector("#reading")!;
    const choices = screen.getByRole("region", { name: "个性化建议示例" });
    const report = screen.getByRole("region", { name: "完整报告示例" });
    const p002 = demoCaseByKey("p002")!, p001 = demoCaseByKey("p001")!;
    expect(measured.querySelector("img")!.getAttribute("src")).toBe(p002.photos.front);
    expect(measured.textContent).toContain("1.19");
    expect(within(measured as HTMLElement).queryByTestId("score-value")).toBeNull();
    for (const category of ["hairstyle", "glasses", "color_palette"]) {
      const rec = p002.passport.analysis.recommendations.find(r => r.category === category)!;
      expect(choices.textContent).toContain(rec.action);
      expect(choices.textContent).toContain(rec.why);
      expect(choices.textContent).toContain(rec.how_to[0]);
    }
    expect(report.querySelector("img")!.getAttribute("src")).toBe(p001.photos.front);
    const score = learnedScore(p001.passport)!;
    expect(within(report).getByTestId("score-value").textContent).toBe(`${score.score}/10`);
    expect(within(report).getByTestId("learned-rank").textContent).toBe(`Top ${formatTopPercent(score.rank!.top)}%`);
    expect(report.textContent).toContain("AI 合成示例");
    expect(report.textContent).toContain(p001.passport.analysis.works[0].text);
  });
});
