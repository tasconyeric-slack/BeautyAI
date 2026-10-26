import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const track = vi.fn((..._args: unknown[]) => Promise.resolve());
const flagState = { useFixture: true };

vi.mock("@/lib/landing-event", () => ({ trackLandingView: (...args: unknown[]) => track(...args) }));
vi.mock("@/lib/flags", async (orig) => {
  const real = await orig<typeof import("@/lib/flags")>();
  return { ...real, flags: new Proxy({}, { get: (_t, k: string) => flagState[k as keyof typeof flagState] }) };
});
vi.mock("sonner", () => ({ toast: vi.fn() }));

import { landing, privacy } from "@/lib/copy/zh";
import { Landing } from "./landing";
import { cleanRef, startHref } from "./cases";

beforeAll(() => {
  // jsdom has no ResizeObserver (Scaled uses it).
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});
beforeEach(() => {
  track.mockClear();
});

const ctas = () => screen.getAllByRole("link", { name: landing.primaryAction });
const topicLinks = () => screen.getAllByRole("link").filter((a) => /^\/t\/[a-z]+$/.test(a.getAttribute("href") ?? ""));
const FORBIDDEN = ["作品", "颜值", "打分", "完美", "变美", "逆袭", "显瘦", "显胖"];

describe("Landing", () => {
  it("shows the primary CTA to /start", () => {
    render(<Landing />);
    expect(ctas().length).toBeGreaterThan(0);
    for (const a of ctas()) expect(a.getAttribute("href")).toBe("/start");
  });

  it("passes topic and ref through on topic pages", () => {
    render(<Landing topic="hair" refCode="xhs01" />);
    for (const a of ctas()) expect(a.getAttribute("href")).toBe("/start?topic=hair&ref=xhs01");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("找到下一次想剪的发型");
  });

  it("has exactly five topic links", () => {
    render(<Landing />);
    expect(topicLinks().map((a) => a.getAttribute("href"))).toEqual(["/t/face", "/t/hair", "/t/style", "/t/color", "/t/outfit"]);
  });

  it("contains no 作品 or banned wording", () => {
    const { container } = render(<Landing topic="color" />);
    for (const w of FORBIDDEN) expect(container.textContent).not.toContain(w);
  });

  it("labels the cases as illustrations", () => {
    render(<Landing />);
    expect(screen.getAllByText(/插画示意/).length).toBeGreaterThan(0);
  });

  it("tracks landing_view with topic and ref", () => {
    render(<Landing topic="style" refCode="dy7" />);
    expect(track).toHaveBeenCalledWith("style", "dy7");
  });

  it("shows the sample passport's computed score with four parts, strengths and a direction — no teaser", () => {
    render(<Landing />);
    const female = JSON.parse(readFileSync(path.resolve(__dirname, "../../lib/fixtures/sample_passport.json"), "utf8"));
    const hero = screen.getByTestId("score-hero");
    expect(screen.getByTestId("score-value").textContent).toBe(String(Math.round(female.aesthetic_score.overall_score)));
    for (const k of ["symmetry", "thirds", "fifths", "golden_ratio"]) expect(screen.getByTestId(`score-part-${k}`)).toBeTruthy();
    expect(screen.getByTestId("score-strengths").querySelectorAll("li")).toHaveLength(2);
    expect(screen.getByTestId("score-improvement").textContent).toBeTruthy();
    expect(hero.textContent).toContain("合成人脸");
    expect(screen.getByTestId("score-cta").getAttribute("href")).toBe("/p/ap_sample_0001");
    expect(screen.queryByText("颜值评分 · 即将上线")).toBeNull();
  });
});

describe("case data", () => {
  it("the bundled case matches examples/cases (source of truth)", () => {
    const read = (p: string) => JSON.parse(readFileSync(path.resolve(__dirname, p), "utf8"));
    expect(read("./case_illustrated.json")).toEqual(read("../../../examples/cases/case_illustrated.json"));
  });
});

describe("helpers", () => {
  it("builds start links and cleans ref", () => {
    expect(startHref()).toBe("/start");
    expect(startHref("outfit", null)).toBe("/start?topic=outfit");
    expect(cleanRef("xhs<01>?")).toBe("xhs01");
    expect(cleanRef(["a", "b"])).toBe("a");
    expect(cleanRef(undefined)).toBeNull();
  });
});

describe("first screen (Issue #2)", () => {
  const female = () => JSON.parse(readFileSync(path.resolve(__dirname, "../../lib/fixtures/sample_passport.json"), "utf8"));

  it("offers a free start first and a look at the deliverable second", () => {
    render(<Landing />);
    const sample = screen.getByTestId("landing-hero-sample");
    expect(sample.getAttribute("href")).toBe("/report/sample");
    expect(sample.textContent).toContain(landing.secondaryAction);
    // the free start comes first in reading order and keeps its wording (the critical path clicks it by name)
    const primary = ctas()[0];
    expect(primary.getAttribute("data-cta")).toBe("primary");
    expect(Boolean(primary.compareDocumentPosition(sample) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });

  it("shows the deliverable as a synthetic example with the sample's own score — never as a live result", () => {
    render(<Landing />);
    const card = screen.getByTestId("hero-sample");
    expect(card.textContent).toContain("示例 · 合成人脸，非真人");
    expect(card.textContent).toContain("不是实时分析结果");
    expect(card.textContent).toContain("不代表任何真人");
    expect(card.querySelector("img")!.getAttribute("alt")).toMatch(/非真人/);
    expect(screen.getByTestId("hero-score").textContent).toContain(String(Math.round(female().aesthetic_score.overall_score)));
    const f = female();
    const top = f.analysis.recommendations.find((r: { id: string }) => r.id === f.derived.top5[0]);
    expect(card.textContent).toContain(top.action.replace(/\s*\[[^\]]*\]/g, ""));
    // opens the sample passport, not a made-up page
    expect(screen.getByTestId("hero-sample-open").getAttribute("href")).toBe("/p/ap_sample_0001");
  });

  it("keeps the topic entry's example and link on the sample card", () => {
    render(<Landing topic="hair" />);
    expect(screen.getByTestId("hero-sample-open").getAttribute("href")).toBe("/p/ap_sample_0001/hair");
    expect(screen.getByTestId("hero-sample").textContent).toContain("稳妥");
  });

  it("states the privacy cues from the one source of truth, next to the call to action", () => {
    render(<Landing />);
    const cues = screen.getByTestId("hero-privacy");
    expect(cues.querySelectorAll("li")).toHaveLength(privacy.facts.length);
    for (const f of privacy.facts) expect(cues.textContent).toContain(f);
  });

  it("says what the visit is for — understand, try, decide — without promising what only the full passport has", () => {
    render(<Landing />);
    const steps = screen.getByTestId("hero-journey");
    expect([...steps.querySelectorAll("li")].map((li) => li.querySelector("span.font-serif")!.textContent)).toEqual(["看懂", "试试", "决定"]);
    expect(steps.textContent).not.toMatch(/照片级|AI 发型试看|生成|免费送/);
  });
});
