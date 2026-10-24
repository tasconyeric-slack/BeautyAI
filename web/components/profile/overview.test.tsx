/** Issue #2: the results overview — score as a model reference, strengths with their evidence, one obvious action,
 *  honest availability, and the way on. Everything asserted is the passport's own data. */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ATLAS } from "@/components/face/atlas-model";
import { JOURNEY, journeyHref } from "@/components/passport/journey";
import { aestheticScore, firstThing, type ScoreView } from "@/lib/adapters";
import type { Passport, PassportResponse } from "@/lib/api";
import { freeView } from "@/lib/fixture/free-view";
import { sampleReportResponse } from "@/lib/fixture/backend";
import { StaticPassportProvider } from "@/lib/state/passport-store";
import { Profile } from "./profile";
import { availability, atlasKeyFor } from "./overview-model";
import { REFERENCE_NOTE, ScoreGlance } from "./score-glance";
import { measureView } from "@/components/face/measure-model";

vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("@/lib/api")>()), api: { track: vi.fn(() => Promise.resolve()) } }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/p/ap_sample_0001", useRouter: () => ({ push: () => {} }) }));

const FORBIDDEN = /颜值|打分|评分|标准脸|完美|缺陷|缺点|整容|医美|手术|治疗/;
const full = sampleReportResponse("female");
const p = full.passport as Passport;

function freeResponse(): PassportResponse {
  const [passport, locked] = freeView(p);
  return { ...full, passport, entitlement: { ...full.entitlement, paid: false, unlock_scope: "free", locked } };
}
const renderProfile = (data: PassportResponse) => render(<StaticPassportProvider value={{ data }}><Profile /></StaticPassportProvider>);

describe("overview hierarchy", () => {
  it("leads with the one-line result, then the score framed as a model reference, then the strengths", () => {
    renderProfile(full);
    const h1 = screen.getByRole("heading", { level: 1 });
    const glance = screen.getByTestId("score-glance");
    const strengths = screen.getByTestId("overview-strengths");
    const action = screen.getByTestId("first-action");
    // reading order in the document
    const before = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(before(h1, glance)).toBe(true);
    expect(before(glance, strengths)).toBe(true);
    expect(before(strengths, action)).toBe(true);
    expect(h1.textContent).toBe(p.analysis.profile_summary.one_liner);
  });

  it("shows the scorer's own number, says it is a model reference and not a verdict or a rank, and names the sample", () => {
    renderProfile(full);
    const glance = screen.getByTestId("score-glance");
    expect(screen.getByTestId("glance-value").textContent).toBe(String(Math.round(p.aesthetic_score!.overall_score!)));
    expect(glance.textContent).toContain("模型参考");
    expect(glance.textContent).toContain(REFERENCE_NOTE);
    expect(REFERENCE_NOTE).toMatch(/不评价长相/);
    expect(REFERENCE_NOTE).toMatch(/不是人群排名/);
    expect(glance.textContent).toContain("合成平均人脸"); // fixture passport: a drawn face, labeled as such
    // the detail it points to is on the same page
    const target = glance.querySelector("a")!.getAttribute("href")!;
    expect(document.querySelector(target)?.querySelector('[data-testid="score-hero"]')).not.toBeNull();
  });

  it("gives every strength its styling meaning and a link to the atlas region that backs it", () => {
    renderProfile(full);
    const items = within(screen.getByTestId("overview-strengths")).getAllByRole("listitem");
    expect(items).toHaveLength(p.analysis.feature_signature.length);
    const keys = new Set(ATLAS.regions.map((r) => r.key));
    p.analysis.feature_signature.forEach((f, i) => {
      expect(items[i].textContent).toContain(f.title);
      expect(items[i].textContent).toContain(f.styling_implication);
      const key = atlasKeyFor(f.region);
      if (key) {
        expect(keys.has(key)).toBe(true);
        expect(within(items[i]).getByRole("link", { name: "看依据" }).getAttribute("href")).toBe(`/p/${full.id}/face#atlas-${key}`);
      }
    });
    expect(p.analysis.feature_signature.some((f) => atlasKeyFor(f.region))).toBe(true);
  });

  it("has exactly one primary action: the top recommendation, with why, how to check and a way into the plan", () => {
    renderProfile(full);
    const first = firstThing(p)!;
    const card = screen.getByTestId("first-action");
    expect(card.textContent).toContain(first.action);
    expect(card.textContent).toContain(first.successCheck);
    expect(within(card).getByRole("link", { name: /查看做法/ }).getAttribute("href")).toBe(`/p/${full.id}/${first.page}`);
    expect(within(card).getByRole("link", { name: "加入行动方案" }).getAttribute("href")).toBe(`/p/${full.id}/plan`);
    expect(screen.getAllByTestId("first-action")).toHaveLength(1);
  });

  it("uses no verdict language anywhere on the page", () => {
    const { container } = renderProfile(full);
    expect(container.textContent).not.toMatch(FORBIDDEN);
  });
});

describe("evidence, availability and the way on", () => {
  it("states which photo views were measured and how much, from the measurement profile", () => {
    renderProfile(full);
    const basis = screen.getByTestId("overview-basis");
    const mv = measureView(p, full.id, [])!;
    const rows = [...basis.querySelectorAll("[data-availability]")];
    expect(rows).toHaveLength(mv.views.length);
    mv.views.forEach((v, i) => {
      expect(rows[i].textContent).toContain(v.name);
      expect(rows[i].textContent).toContain(v.status === "measured" ? `已测 ${v.measured} / ${v.total} 项` : "未提供");
    });
  });

  it("says what a missing photo costs and where to add it", () => {
    const a = availability({
      ...measureView(p, full.id, [])!,
      views: [{ role: "front", name: "正脸", status: "measured", reason: null, measured: 99, total: 100, metrics: [] },
        { role: "profile90", name: "侧脸", status: "not_provided", reason: "needs_side_photo", measured: 0, total: 13, metrics: [] }],
      totalMeasured: 99, totalDefined: 117, lockedCount: 0,
    })!;
    expect(a.rows.map((r) => r.text)).toEqual(["已测 99 / 100 项", "未提供，补充后可多测 13 项"]);
    expect(a.rows.map((r) => r.state)).toEqual(["measured", "missing"]);
    expect(a.locked).toBeNull();
    expect(a.summary).toBe("共已测 99 / 117 项");
  });

  it("a free view names what the full passport adds instead of hiding it", () => {
    renderProfile(freeResponse());
    expect(screen.getByTestId("overview-basis").textContent).toMatch(/\d+ 项测量明细包含在完整护照中/);
    expect(screen.getByTestId("open-report").textContent).toContain("免费版标明了完整护照增加的内容");
  });

  it("continues through the same five steps as the desktop step bar, in order, each with a fact about this passport", () => {
    renderProfile(full);
    const list = screen.getByTestId("overview-journey");
    expect(within(list).getByRole("heading", { name: "接下来" })).toBeTruthy();
    const links = within(list).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual(JOURNEY.filter((s) => s.key !== "overview").map((s) => journeyHref(full.id, s.key)));
    expect(links[0].textContent).toContain("面部证据");
    expect(links[0].textContent).toMatch(/共已测 \d+ \/ \d+ 项/);
    expect(screen.getByTestId("open-report").getAttribute("href")).toBe(`/p/${full.id}/report`);
  });

  it("a passport from before the score existed still has the strengths, the action and the way on — and no number", () => {
    const legacy = { ...full, passport: { ...p, aesthetic_score: null, reference_percentiles: null } } as unknown as PassportResponse;
    renderProfile(legacy);
    expect(screen.queryByTestId("score-glance")).toBeNull();
    expect(screen.queryByTestId("score-hero")).toBeNull();
    expect(screen.getByTestId("first-action")).toBeTruthy();
    expect(screen.getByTestId("overview-journey")).toBeTruthy();
  });
});

describe("ScoreGlance states", () => {
  const view = aestheticScore(p) as ScoreView;
  it("marks a limited score and keeps the reference framing", () => {
    render(<ScoreGlance view={{ ...view, state: "limited" }} />);
    expect(screen.getByText("参考有限")).toBeTruthy();
    expect(screen.getByTestId("score-glance").textContent).toContain(REFERENCE_NOTE);
  });
  it("shows no number when unavailable, only the retake path", () => {
    render(<ScoreGlance view={{ ...view, state: "unavailable", score: null, tier: null }} retakeHref="/start" />);
    expect(screen.queryByTestId("glance-value")).toBeNull();
    expect(screen.getByText("这张照片暂时给不出总分")).toBeTruthy();
    expect(screen.getByRole("link", { name: "重新拍一张" }).getAttribute("href")).toBe("/start");
    expect(screen.queryByText(REFERENCE_NOTE)).toBeNull();
  });
});
