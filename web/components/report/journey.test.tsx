/** Issue #2: the report as a skimmable, navigable document — the summary strip, the contents list that follows the
 *  reader, the links between findings and recommendations (both ways), and what the report ends on. */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { measureView } from "@/components/face/measure-model";
import type { Passport } from "@/lib/api";
import { sampleReportResponse } from "@/lib/fixture/backend";
import { StaticPassportProvider } from "@/lib/state/passport-store";
import { FullReport } from "./full-report";
import { CHAPTER_KEYS, evidenceLinks, pickActive, REGIONS, regionOfObservation, regionViews } from "./report-model";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/p/ap_sample_0001/report", useRouter: () => ({ push: () => {} }) }));

const data = sampleReportResponse("female");
const passport = data.passport as Passport;
const regions = regionViews(passport, measureView(passport, data.id, [])!);

const renderReport = (sample: boolean) =>
  render(<StaticPassportProvider value={{ data }}><FullReport sample={sample} /></StaticPassportProvider>);

afterEach(() => vi.restoreAllMocks());

describe("evidence ↔ recommendation links (pure)", () => {
  const links = evidenceLinks(passport, regions);
  const shown = passport.derived.ranked_recommendations.slice(0, 5).map((r) => r.rec_id);

  it("only links recommendations the report shows, to regions the report has", () => {
    const keys = new Set(REGIONS.map((r) => r.key));
    expect(Object.keys(links.byRec).length).toBeGreaterThan(0);
    for (const [recId, e] of Object.entries(links.byRec)) {
      expect(shown, recId).toContain(recId);
      expect(e.regions.length).toBeGreaterThan(0);
      for (const g of e.regions) expect(keys.has(g.key), g.key).toBe(true);
    }
  });

  it("is two-way: a region lists exactly the recommendations that list it, best-ranked first", () => {
    for (const [key, refs] of Object.entries(links.byRegion)) {
      for (const r of refs) expect(links.byRec[r.recId].regions.map((g) => g.key)).toContain(key);
      expect(refs.map((r) => r.rank)).toEqual([...refs.map((r) => r.rank)].sort((a, b) => a - b));
    }
    for (const [recId, e] of Object.entries(links.byRec)) {
      for (const g of e.regions) expect(links.byRegion[g.key].map((r) => r.recId)).toContain(recId);
    }
  });

  it("takes a recommendation's regions from the observations it cites", () => {
    const rec = passport.analysis.recommendations.find((r) => shown.includes(r.id) && r.evidence.length)!;
    const cited = rec.evidence
      .map((id) => passport.analysis.observations.find((o) => o.id === id))
      .map((o) => (o ? regionOfObservation(o.region) : null))
      .filter((k): k is string => Boolean(k));
    for (const k of cited) expect(links.byRec[rec.id].regions.map((g) => g.key)).toContain(k);
  });

  it("does not invent evidence for a recommendation that cites nothing the report covers", () => {
    const bare = { ...passport, analysis: { ...passport.analysis, recommendations: passport.analysis.recommendations.map((r) => ({ ...r, evidence: [] })) } };
    const none = evidenceLinks(bare as Passport, regions.map((r) => ({ ...r, insights: [] })));
    expect(none.byRec).toEqual({});
    expect(none.byRegion).toEqual({});
  });
});

describe("reading position", () => {
  it("is the last chapter whose top has reached the reading line", () => {
    expect(pickActive([-900, -300, 60, 700, 1500], 140)).toBe(2);
    expect(pickActive([300, 800, 1200], 140)).toBe(0); // above the first chapter
    expect(pickActive([-3000, -2000, -10], 140)).toBe(2);
  });
  it("without any layout it is the first chapter", () => {
    expect(pickActive([0, 0, 0], 140)).toBe(0);
    expect(pickActive([], 140)).toBe(0);
  });
});

describe("the full report as a document", () => {
  it("opens with source facts and direct links to their methods and measurements", () => {
    const { container } = renderReport(true);
    const strip = screen.getByTestId("report-glance");
    const items = within(strip).getAllByRole("link");
    expect(items.map((a) => a.getAttribute("href"))).toEqual(["#findings", "#options", "#rec-r1"]);
    for (const a of items) expect(container.querySelector(a.getAttribute("href")!), a.getAttribute("href")!).not.toBeNull();
    expect(screen.getByTestId("score-value").textContent).toContain(String(passport.aesthetic_score!.overall_score));
    expect(screen.getByTestId("full-report").dataset.sample).toBe("1");
  });

  it("every in-page link — contents, region jumps, evidence and recommendation chips — lands on an element that exists", () => {
    const { container } = renderReport(true);
    const hrefs = [...container.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')].map((a) => a.getAttribute("href")!);
    expect(hrefs.length).toBeGreaterThan(30);
    for (const h of new Set(hrefs)) expect(container.querySelector(h), h).not.toBeNull();
  });

  it("each recommendation names the regions it rests on, each region the recommendations it supports", () => {
    const { container } = renderReport(true);
    expect(container.querySelectorAll('[data-testid^="rec-evidence-"]').length).toBeGreaterThanOrEqual(3);
    const chips = container.querySelectorAll('[data-testid^="region-recs-"] a');
    expect(chips.length).toBeGreaterThanOrEqual(3);
    for (const c of chips) expect(container.querySelector(c.getAttribute("href")!)).not.toBeNull();
  });

  it("keeps the how-to, caveats and quoted evidence one click away rather than in the way", () => {
    const { container } = renderReport(true);
    const first = container.querySelector("#rec-" + passport.derived.ranked_recommendations[0].rec_id)!;
    const details = first.querySelector<HTMLDetailsElement>("details[data-rec-howto]")!;
    expect(details.open).toBe(false);
    expect(within(first as HTMLElement).getByText(/为什么/)).toBeTruthy(); // the reason stays visible
    expect(details.textContent).toContain("怎么做");
  });

  it("the contents list marks the chapter being read, and a click moves focus to its heading", async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const { container } = renderReport(true);
    // pretend the reader is inside chapter 04: 01–03 are above the reading line, 05–07 below it
    const top = (k: string) => { const i = CHAPTER_KEYS.indexOf(k as never); return i <= 3 ? -400 + i * 120 : 600 + i * 300; };
    for (const k of CHAPTER_KEYS) {
      container.querySelector(`#${k}`)!.getBoundingClientRect = () => ({ top: top(k) }) as DOMRect;
    }
    fireEvent.scroll(window);
    const nav = screen.getByRole("navigation", { name: "目录" });
    await waitFor(() => expect(within(nav).getByRole("link", { current: "location" }).getAttribute("data-toc")).toBe("improvements"));
    expect(within(nav).getAllByRole("link", { current: "location" })).toHaveLength(1);

    fireEvent.click(within(nav).getByRole("link", { name: /关于这份报告/ }));
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(document.activeElement?.id).toBe("methods-title");
  });

  it("real passports end on the next actions; the public sample does not (its page has its own call to action)", () => {
    const real = renderReport(false);
    const next = screen.getByTestId("report-next");
    const hrefs = within(next).getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual([`/p/${data.id}/plan`, `/p/${data.id}/studio`, `/p/${data.id}/advice`]);
    real.unmount();
    renderReport(true);
    expect(screen.queryByTestId("report-next")).toBeNull();
  });

  it("offers the region jumps only inside the Findings entry of the contents", () => {
    renderReport(true);
    const nav = screen.getByRole("navigation", { name: "目录" });
    const jump = within(nav).getByRole("list", { name: "按部位跳转", hidden: true });
    expect(within(jump).getAllByRole("link", { hidden: true }).map((a) => a.getAttribute("href"))).toEqual(regions.map((r) => `#area-${r.key}`));
  });
});
