import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Passport, PassportResponse } from "@/lib/api";
import sample from "@/lib/fixtures/sample_passport.json";
import sampleMale from "@/lib/fixtures/sample_passport_male.json";
import geometryJson from "@/lib/fixtures/sample_geometry.json";
import type { FaceGeometry } from "@/lib/tint";
import { StaticPassportProvider } from "@/lib/state/passport-store";
import { ATLAS, atlasCrop, atlasView } from "./atlas-model";
import { FacePage } from "./face-page";
import { measureView } from "./measure-model";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

const ID = "ap_sample_0001";
const geometry = geometryJson as unknown as FaceGeometry;
const full = () => structuredClone(sample) as unknown as Passport;

/** The same passport as if only a front photo had been uploaded: side metrics need a photo, no side geometry. */
function frontOnly(): { p: Passport; g: FaceGeometry } {
  const p = full();
  const mp = p.measurement_profile!;
  for (const m of mp.metrics) {
    if (m.view !== "side") continue;
    Object.assign(m, { value: null, components: null, confidence: null, availability: "needs_photo", missing_reason: "needs_side_photo" });
  }
  mp.views = mp.views?.map((v) => (v.role === "profile90" ? { ...v, status: "not_provided", reason: "needs_side_photo", measured: 0 } : v));
  const side = new Set(mp.metrics.filter((m) => m.view === "side").map((m) => m.id));
  const mi = p.derived.measurement_insights!;
  mi.items = mi.items.filter((i) => !side.has(i.metric_id));
  mi.assessments = (mi.assessments ?? []).filter((a) => !side.has(a.metric_id));
  const g = structuredClone(geometryJson) as unknown as { views?: unknown };
  delete g.views;
  return { p, g: g as unknown as FaceGeometry };
}

function response(p: Passport, opts: { profile?: boolean; expired?: boolean; locked?: string[] } = {}): PassportResponse {
  return {
    id: ID, status: "full_ready", stage: "done",
    partial: { input_quality: p.input_quality, anchors: p.anchors, quick: null, analysis: "ready", previews: [] },
    passport: p,
    entitlement: { paid: false, unlock_scope: "free", share_token: null, free_previews_left: 1, price_cny: 39, locked: opts.locked ?? [] },
    media: {
      front: opts.expired ? null : "/sample/portrait.svg", thumb: null, expires_at: null, expired: Boolean(opts.expired),
      photos: opts.expired ? undefined : { front: "/sample/portrait.svg", ...(opts.profile ? { profile90: "/sample/profile.svg" } : {}) },
    },
    error: null, created_at: "2026-10-22T09:00:00Z",
  };
}

function renderFace(p: Passport, g: FaceGeometry | null, opts: { profile?: boolean; expired?: boolean; locked?: string[] } = {}) {
  return render(
    <StaticPassportProvider value={{ data: response(p, opts) }}>
      <FacePage geometry={opts.expired ? null : g} />
    </StaticPassportProvider>,
  );
}

const atlasEl = () => screen.getByTestId("atlas");
const tab = (key: string) => atlasEl().querySelector<HTMLButtonElement>(`[data-atlas-tab="${key}"]`)!;
const panel = () => atlasEl().querySelector<HTMLElement>("[data-atlas-region]")!;

describe("atlas model", () => {
  it("covers twelve regions, every observable one with a trait and a styling implication, both fixtures", () => {
    for (const fx of [sample, sampleMale]) {
      const p = structuredClone(fx) as unknown as Passport;
      const v = measureView(p, ID)!;
      const a = atlasView(p, v, ID);
      expect(a.regions.map((r) => r.key)).toEqual(ATLAS.regions.map((r) => r.key));
      expect(a.regions).toHaveLength(12);
      for (const r of a.regions.filter((x) => x.state === "observed")) {
        expect(r.traits.length, `${r.key} traits`).toBeGreaterThan(0);
        expect(r.implications.length, `${r.key} implications`).toBeGreaterThan(0);
        for (const m of r.implications) expect(m.href.startsWith(`/p/${ID}/`)).toBe(true);
      }
      // every measured fact is a real, visible passport value — nothing computed in the browser
      for (const r of a.regions) for (const f of r.facts) expect(v.byId[f.metricId].value).not.toBeNull();
    }
  });

  it("never invents a region the photos do not show", () => {
    const p = full();
    p.analysis.observations = p.analysis.observations.filter((o) => o.region !== "neck");
    p.analysis.feature_characteristics = p.analysis.feature_characteristics.filter((f) => f.feature !== "neck");
    const a = atlasView(p, measureView(p, ID)!, ID);
    const neck = a.regions.find((r) => r.key === "ears_neck")!;
    expect(neck.state).toBe("unavailable");
    expect(neck.traits).toEqual([]);
    expect(neck.implications).toEqual([]);
    expect(neck.concepts.find((c) => c.zh === "耳部形态")?.state).toBe("unsupported");
  });

  it("keeps free-view withheld values out of the atlas", () => {
    const p = full();
    for (const m of p.measurement_profile!.metrics) {
      if (m.tier === "free") continue;
      Object.assign(m, { value: null, confidence: null, locked: true, overlay: { segments: [], angles: [], points: [], outline: false, silhouette: false } });
    }
    const v = measureView(p, ID, ["measurement_profile.full"])!;
    const a = atlasView(p, v, ID);
    const ids = new Set(a.regions.flatMap((r) => r.facts.map((f) => f.metricId)));
    for (const m of p.measurement_profile!.metrics) if (m.locked) expect(ids.has(m.id)).toBe(false);
    expect(a.regions.reduce((n, r) => n + r.locked, 0)).toBeGreaterThan(0);
  });

  it("crops each region from its own photo and draws only the shown metric's measured lines", () => {
    const p = full();
    const a = atlasView(p, measureView(p, ID)!, ID);
    const brows = a.regions.find((r) => r.key === "brows")!;
    const c = atlasCrop(brows, geometry, brows.focus[0])!;
    expect(c.role).toBe("front");
    const [x0, y0, x1, y1] = c.box;
    for (const s of c.overlay!.segments) for (const q of [s.a, s.b]) {
      expect(q[0]).toBeGreaterThanOrEqual(x0); expect(q[0]).toBeLessThanOrEqual(x1);
      expect(q[1]).toBeGreaterThanOrEqual(y0); expect(q[1]).toBeLessThanOrEqual(y1);
    }
    const profile = a.regions.find((r) => r.key === "profile")!;
    const side = atlasCrop(profile, geometry, profile.focus[0])!;
    expect(side.role).toBe("profile90");
    expect(side.silhouette?.length).toBeGreaterThan(10);
    // a side metric is never drawn on the front crop
    const nose = a.regions.find((r) => r.key === "nose")!;
    const nl = nose.facts.find((f) => f.role === "profile90")!;
    expect(atlasCrop(nose, geometry, measureView(p, ID)!.byId[nl.metricId])!.overlay).toBeNull();
    expect(atlasCrop(brows, null, null)).toBeNull();
  });
});

describe("face atlas · front-photo critical path", () => {
  it("navigates the twelve regions with personalised traits, implications, evidence and provenance", () => {
    const { p, g } = frontOnly();
    const { container } = renderFace(p, g);
    expect(atlasEl().querySelectorAll('[role="tab"][data-atlas-tab]')).toHaveLength(12);
    expect(screen.getByTestId("atlas-summary").textContent).toMatch(/共 12 个区域中有 \d+ 个/);
    expect(screen.getByTestId("atlas-legend").textContent).toContain("AI 观察");

    // overview: rules highlights and the top recommendations tied to regions
    const ov = screen.getByTestId("atlas-overview");
    expect(within(ov).getAllByText("规则").length).toBeGreaterThan(0);
    expect(within(screen.getByTestId("atlas-opportunities")).getAllByRole("link").length).toBeGreaterThan(0);

    // brows: a specific measured trait, an actionable implication linked to its page, and the evidence behind it
    fireEvent.click(tab("brows"));
    expect(tab("brows").getAttribute("aria-selected")).toBe("true");
    const traits = within(panel()).getByTestId("atlas-traits").textContent ?? "";
    expect(traits).toContain("眉尾偏低");
    const impl = within(panel()).getByTestId("atlas-implications");
    expect([...impl.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toContain(`/p/${ID}/makeup`);
    expect(within(panel()).getByTestId("atlas-crop")).toBeTruthy();
    expect(panel().querySelector("[data-atlas-overlay] line")).toBeTruthy();
    expect(within(panel()).getByTestId("atlas-observations").textContent).toContain("自然弧形眉");

    // hover previews another metric's lines on the crop, click pins it
    const arch = panel().querySelector<HTMLButtonElement>('[data-atlas-metric="M058"]')!;
    fireEvent.pointerEnter(arch, { pointerType: "mouse" });
    expect(panel().querySelector("[data-atlas-overlay]")?.getAttribute("data-atlas-overlay")).toBe("眉弧高度");
    fireEvent.click(arch);
    fireEvent.pointerLeave(arch, { pointerType: "mouse" });
    expect(arch.getAttribute("aria-pressed")).toBe("true");
    expect(panel().querySelector("[data-atlas-overlay]")?.getAttribute("data-atlas-overlay")).toBe("眉弧高度");

    // keyboard navigation between regions
    fireEvent.keyDown(tab("brows"), { key: "ArrowDown" });
    expect(tab("eyes").getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tab("eyes"));

    // general: the user's own choice is shown as entered, not inferred
    fireEvent.click(tab("general"));
    const entered = within(panel()).getByTestId("atlas-entered").textContent ?? "";
    expect(entered).toContain("女性化");
    expect(panel().textContent).toContain("不会从照片推断");

    // profile without a side photo: an honest needs-photo state with the upload action, no numbers
    fireEvent.click(tab("profile"));
    expect(panel().getAttribute("data-state")).toBe("needs_photo");
    expect(within(panel()).getByTestId("atlas-needs-photo").textContent).toContain("侧脸");
    expect(within(panel()).queryByTestId("atlas-facts")).toBeNull();
    expect(within(panel()).getByRole("button", { name: "补充一张侧脸照" })).toBeTruthy();

    // neck: the model's observation, a plain crop with no measurement lines; ears are unsupported
    fireEvent.click(tab("ears_neck"));
    expect(within(panel()).getByTestId("atlas-observations").textContent).toContain("颈部线条修长");
    expect(panel().querySelector("[data-atlas-overlay]")).toBeNull();
    expect(panel().querySelector('[data-concept-state="unsupported"]')?.textContent).toContain("耳部形态");

    // skin: appearance only — condition concepts are declared out of scope
    fireEvent.click(tab("skin"));
    const unsupported = [...panel().querySelectorAll('[data-concept-state="unsupported"]')].map((x) => x.textContent ?? "");
    expect(unsupported.some((t) => t.includes("泛红"))).toBe(true);

    const text = container.textContent ?? "";
    expect(text).not.toMatch(/颜值|打分|标准脸|完美|缺陷|缺点|整容|医美|年龄|种族/);
  });

  it("keeps working after the photos expired: no crops, text and numbers remain", () => {
    renderFace(full(), null, { expired: true });
    fireEvent.click(tab("eyes"));
    expect(within(panel()).getByTestId("atlas-crop-empty").textContent).toContain("照片已按承诺删除");
    expect(within(panel()).getByTestId("atlas-facts")).toBeTruthy();
    expect(within(panel()).getByTestId("atlas-implications")).toBeTruthy();
  });
});

/** A glasses wearer who added a glasses-free photo: eye metrics were measured on it (source_photo noglasses, D35). */
function withNoglasses(): { p: Passport; g: FaceGeometry } {
  const p = full();
  const mp = p.measurement_profile!;
  for (const m of mp.metrics) if (m.group === "eyes" && m.view === "front") m.source_photo = "noglasses";
  mp.views = [...(mp.views ?? []), { role: "noglasses", label_zh: "无眼镜", status: "measured", reason: null, measured: 18, total: 18 }];
  const front = geometryJson as unknown as FaceGeometry;
  // the glasses-free photo has its own coordinates (shifted here so a mix-up is visible)
  const points = Object.fromEntries(Object.entries(front.points!).map(([k, [x, y]]) => [k, [x + 0.03, y + 0.02]]));
  const g = { ...front, views: { ...front.views, noglasses: { width: 640, height: 800, points } } } as unknown as FaceGeometry;
  return { p, g };
}

describe("face atlas · glasses-free measurement photo", () => {
  it.each([true, false])("keeps region navigation usable with reduced motion %s", (reduced) => {
    const scroll = vi.fn();
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: reduced }));
    const previous = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scroll;
    try {
      renderFace(full(), geometry);
      fireEvent.click(within(screen.getByTestId("atlas-overview")).getAllByRole("button")[0]);
      expect(atlasEl().querySelector('[role="tab"][aria-selected="true"]')).toBeTruthy();
      expect(scroll).toHaveBeenLastCalledWith({ behavior: reduced ? "auto" : "smooth", block: "start" });
    } finally {
      Element.prototype.scrollIntoView = previous;
      vi.unstubAllGlobals();
    }
  });

  it("draws glasses-free metrics only on the glasses-free photo and opens them in its workbench tab", async () => {
    const { p, g } = withNoglasses();
    const v = measureView(p, ID)!;
    const eyes = atlasView(p, v, ID).regions.find((r) => r.key === "eyes")!;
    const tilt = eyes.facts.find((f) => f.metricId === "M044")!;
    expect(tilt.role).toBe("noglasses");
    const c = atlasCrop(eyes, g, v.byId.M044)!;
    expect(c.role).toBe("noglasses");
    expect(c.width).toBe(640);
    const outer = (g.views!.noglasses.points as Record<string, [number, number]>)[v.byId.M044.overlay.segments[0].from];
    expect(c.overlay!.segments[0].a).toEqual(outer);
    // without the glasses-free geometry the lines are never moved onto the portrait
    const plain = atlasCrop(eyes, geometry, v.byId.M044)!;
    expect(plain.role).toBe("front");
    expect(plain.overlay).toBeNull();

    const data = response(p, { profile: true });
    data.media.photos = { ...data.media.photos, noglasses: "/sample/portrait-safe.svg" };
    render(<StaticPassportProvider value={{ data }}><FacePage geometry={g} /></StaticPassportProvider>);
    fireEvent.click(tab("eyes"));
    const crop = within(panel()).getByTestId("atlas-crop");
    expect(crop.getAttribute("data-crop-role")).toBe("noglasses");
    expect(crop.querySelector("img")?.getAttribute("src")).toBe("/sample/portrait-safe.svg");
    expect(within(panel()).getByTestId("atlas-crop-caption").textContent).toContain("无眼镜正脸照局部");
    const row = [...within(panel()).getByTestId("atlas-facts").querySelectorAll("li")].find((li) => li.querySelector('[data-atlas-metric="M044"]'))!;
    expect(row.textContent).toContain("无眼镜照");
    await act(async () => {
      fireEvent.click(within(row).getByRole("button", { name: /在测量工作台中查看/ }));
      await new Promise((r) => setTimeout(r, 40));
    });
    expect(screen.getByTestId("workbench").getAttribute("data-view")).toBe("noglasses");
    expect(screen.getByTestId("workbench").querySelector('[data-metric="M044"]')?.getAttribute("aria-pressed")).toBe("true");
  });
});

describe("face atlas · front + profile critical path", () => {
  it("shows the side region on the side photo and opens side evidence in the workbench", async () => {
    renderFace(full(), geometry, { profile: true });
    fireEvent.click(tab("profile"));
    expect(panel().getAttribute("data-state")).toBe("observed");
    const crop = within(panel()).getByTestId("atlas-crop");
    expect(crop.getAttribute("data-crop-role")).toBe("profile90");
    expect(crop.querySelector("img")?.getAttribute("src")).toBe("/sample/profile.svg");
    expect(crop.querySelector("polyline")).toBeTruthy();
    expect(within(panel()).getByTestId("atlas-crop-caption").textContent).toContain("侧脸照局部");
    expect(within(panel()).getByTestId("atlas-traits").querySelector('[data-provenance="rules"]')).toBeTruthy();
    expect(within(panel()).getByTestId("atlas-facts").textContent).toContain("E 线 · 上唇");
    expect(within(panel()).getByTestId("atlas-implications").querySelectorAll("li").length).toBeGreaterThan(0);

    // nose: side evidence sits next to the front measurements, tagged with its photo
    fireEvent.click(tab("nose"));
    const facts = within(panel()).getByTestId("atlas-facts");
    expect(facts.textContent).toContain("侧脸照");
    const sideRow = [...facts.querySelectorAll("li")].find((li) => li.textContent?.includes("侧脸照"))!;
    const metricId = sideRow.querySelector("[data-atlas-metric]")!.getAttribute("data-atlas-metric")!;
    // a side metric has no lines on the front crop, so it cannot be pinned there
    expect(sideRow.querySelector<HTMLButtonElement>("[data-atlas-metric]")!.disabled).toBe(true);
    expect(screen.getByTestId("workbench").getAttribute("data-view")).toBe("front");
    await act(async () => {
      fireEvent.click(within(sideRow).getByRole("button", { name: /在测量工作台中查看/ }));
      await new Promise((r) => setTimeout(r, 40));
    });
    expect(screen.getByTestId("workbench").getAttribute("data-view")).toBe("profile90");
    expect(screen.getByTestId("workbench").querySelector(`[data-metric="${metricId}"]`)?.getAttribute("aria-pressed")).toBe("true");
  });
});
