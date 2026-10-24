import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Passport, PassportResponse } from "@/lib/api";
import sample from "@/lib/fixtures/sample_passport.json";
import geometryJson from "@/lib/fixtures/sample_geometry.json";
import type { FaceGeometry } from "@/lib/tint";
import { StaticPassportProvider } from "@/lib/state/passport-store";
import { faceOverlay, measurements, spanAt } from "./face-model";
import { FacePage } from "./face-page";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

const geometry = geometryJson as unknown as FaceGeometry;
/** A workbench photo-view tab (the face atlas below has its own region tabs). */
const viewTab = (name: RegExp) => within(screen.getByRole("tablist", { name: "照片视图" })).getByRole("tab", { name });
const ID = "ap_sample_0001";

function response(p: Passport, expired = false): PassportResponse {
  return {
    id: ID, status: "full_ready", stage: "done",
    partial: { input_quality: p.input_quality, anchors: p.anchors, quick: null, analysis: "ready", previews: [] },
    passport: p,
    entitlement: { paid: false, unlock_scope: "free", share_token: null, free_previews_left: 1, price_cny: 39, locked: [] },
    media: { front: expired ? null : "/sample/portrait.svg", thumb: null, expires_at: null, expired,
      photos: expired ? undefined : { front: "/sample/portrait.svg", profile90: "/sample/profile.svg" } },
    error: null, created_at: "2026-10-22T09:00:00Z",
  };
}

const full = () => structuredClone(sample) as unknown as Passport;
/** A pre-0.4 passport (no measurement profile) keeps the anchors view. */
const base = () => {
  const p = full();
  delete (p as { measurement_profile?: unknown }).measurement_profile;
  delete (p.derived as { measurement_insights?: unknown }).measurement_insights;
  return p;
};

function renderFace(p: Passport, opts: { expired?: boolean; locked?: string[] } = {}) {
  const data = response(p, opts.expired);
  if (opts.locked) data.entitlement.locked = opts.locked;
  return render(
    <StaticPassportProvider value={{ data }}>
      <FacePage geometry={opts.expired ? null : geometry} />
    </StaticPassportProvider>,
  );
}

describe("FacePage (pre-0.4 passports)", () => {
  it("renders proportions, traits and 所以 links with no score anywhere", () => {
    const { container } = renderFace(base());
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/\d\s*分/);
    expect(text).not.toMatch(/\/\s*10/);
    expect(text).not.toMatch(/颜值|打分|评分|标准脸|完美|缺陷/);
    expect(screen.getByText("36%")).toBeTruthy(); // 中庭
    expect(text).toContain("不代表好坏");
    expect(container.querySelectorAll('[data-trait]').length).toBeGreaterThanOrEqual(3);
    const so = screen.getAllByText("所以 →");
    expect(so.length).toBeGreaterThanOrEqual(3);
    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toContain(`/p/${ID}/hair`);
    expect(hrefs).toContain(`/p/${ID}/makeup`);
  });

  it("switches overlay layers with accessible toggle buttons", () => {
    const { container } = renderFace(base());
    const btn = (name: string) => screen.getByRole("button", { name });
    expect(btn("三庭").getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector('svg[data-layer="thirds"]')).toBeTruthy();
    fireEvent.click(btn("五眼"));
    expect(btn("五眼").getAttribute("aria-pressed")).toBe("true");
    expect(btn("三庭").getAttribute("aria-pressed")).toBe("false");
    expect(container.querySelector('svg[data-layer="fifths"]')).toBeTruthy();
    fireEvent.click(btn("轮廓"));
    expect(container.querySelector('svg[data-layer="contour"] polygon')).toBeTruthy();
    fireEvent.click(btn("原图"));
    expect(container.querySelector("svg[data-layer]")).toBeNull();
  });

  it("shows 上庭未测量 when the forehead is covered", () => {
    const p = base();
    p.anchors!.thirds = { upper: null, middle: 0.52, lower: 0.48, upper_occluded: true };
    const { container } = renderFace(p);
    expect(screen.getAllByText("上庭未测量").length).toBeGreaterThanOrEqual(1);
    expect(container.textContent).toContain("上庭暂未测量");
    expect(container.textContent).not.toMatch(/\d\s*分/);
  });

  it("no longer renders the retired score teaser", () => {
    const { container } = renderFace(base());
    expect(screen.queryByTestId("score-teaser")).toBeNull();
    expect(container.textContent).not.toContain("即将上线");
  });

  it("falls back to the portrait without overlays once the photo expired", () => {
    const { container } = renderFace(base(), { expired: true });
    expect(container.querySelector("svg[data-layer]")).toBeNull();
    expect(container.textContent).toContain("照片已删除");
  });
});

describe("face-model", () => {
  it("places the thirds lines from the measured fractions", () => {
    const p = base();
    const o = faceOverlay(geometry, p.anchors);
    const ys = o.thirds!.lines.map((l) => l.y);
    expect(ys).toHaveLength(4);
    const span = ys[3] - ys[0];
    expect((ys[2] - ys[1]) / span).toBeCloseTo(0.36, 2);
    expect(o.fifths!.lines).toHaveLength(6);
  });

  it("finds polygon spans and flags a missing upper third", () => {
    expect(spanAt([[0, 0], [1, 0], [1, 1], [0, 1]], 0.5)).toEqual([0, 1]);
    const p = base();
    p.anchors!.thirds = { upper: null, middle: 0.5, lower: 0.5, upper_occluded: true };
    const m = measurements(p.anchors);
    expect(m.upperMissing).toBe(true);
    expect(m.thirds[0].display).toBe("上庭未测量");
  });
});

// --- V3A measurement assessment (D34) -------------------------------------------------------------------------
import { within } from "@testing-library/react";
import { formatValue, measureView, metricOverlay } from "./measure-model";

const SCORE = /\d\s*分(?!钟)|\/\s*10|颜值|打分|评分|标准脸|完美|缺陷|百分位|排名/;

describe("FacePage (measurement workbench, V3B)", () => {
  const W = geometry.width, H = geometry.height;
  const overlay = (c: HTMLElement) => c.querySelector("svg[data-measure-overlay]");
  const row = (c: HTMLElement, id: string) => c.querySelector(`[data-metric="${id}"]`) as HTMLButtonElement;

  it("renders the workbench first, with counts, groups, insights and no score", () => {
    const { container } = renderFace(full());
    // #41: the reference-ratio rails are the one place a percentile appears — a size position, labelled as not a judgement
    const rails = container.querySelector('[data-testid="reference-ratios"]');
    expect(rails?.textContent).toContain("不代表好坏");
    const rest = container.cloneNode(true) as HTMLElement;
    rest.querySelector('[data-testid="reference-ratios"]')?.remove();
    const text = rest.textContent ?? "";
    expect(text.match(SCORE)).toBeNull();
    expect(screen.getByTestId("workbench")).toBeTruthy();
    expect(screen.getByRole("tablist", { name: "照片视图" })).toBeTruthy();
    expect(screen.getByRole("tablist", { name: "测量分组" })).toBeTruthy();
    expect(screen.getByTestId("coverage").textContent).toMatch(/本次实际测得 \d+ 项（共定义 \d+ 项）/);
    expect(container.querySelectorAll('[data-testid="metric-list"] [data-metric]').length).toBeGreaterThanOrEqual(90);
    expect(screen.getByTestId("catalog").textContent).toContain("候选池 176 项");
    expect(container.querySelectorAll("[data-pillar]")).toHaveLength(4);
    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs.some((h) => /\/p\/ap_sample_0001\/(hair|makeup|glasses|color|outfit|plan)$/.test(h ?? ""))).toBe(true);
    expect(overlay(container)).toBeTruthy();
  });

  it("hover previews a row's own geometry, leaving restores the pinned one, click pins", () => {
    const { container } = renderFace(full());
    fireEvent.click(row(container, "M001"));
    expect(row(container, "M001").getAttribute("aria-pressed")).toBe("true");
    expect(overlay(container)!.getAttribute("data-measure-overlay")).toBe("面长宽比");
    fireEvent.pointerEnter(row(container, "M044"), { pointerType: "mouse" });
    const svg = overlay(container)!;
    expect(svg.getAttribute("data-measure-overlay")).toBe("外眼角倾斜");
    const m = full().measurement_profile!.metrics.find((x) => x.id === "M044")!;
    expect(svg.querySelectorAll('line[data-role="measure"]')).toHaveLength(m.overlay.segments.filter((s) => s.role === "measure").length);
    expect(svg.querySelectorAll('path[data-role="arc"]')).toHaveLength(m.overlay.angles.length);
    // the viewBox is the photo's native pixel grid; line ends sit exactly on the computed points
    expect(svg.getAttribute("viewBox")).toBe(`0 0 ${W} ${H}`);
    const line = svg.querySelector('line[data-role="measure"]')!;
    const seg = m.overlay.segments.find((s) => s.role === "measure")!;
    expect(Number(line.getAttribute("x1"))).toBeCloseTo(geometry.points![seg.from][0] * W, 3);
    expect(Number(line.getAttribute("y1"))).toBeCloseTo(geometry.points![seg.from][1] * H, 3);
    fireEvent.pointerLeave(row(container, "M044"), { pointerType: "mouse" });
    expect(overlay(container)!.getAttribute("data-measure-overlay")).toBe("面长宽比");
  });

  it("keyboard focus previews and Enter / Space pin (button semantics)", () => {
    const { container } = renderFace(full());
    fireEvent.focus(row(container, "M062"));
    expect(overlay(container)!.getAttribute("data-measure-overlay")).toBe("鼻翼宽 / 颧宽");
    fireEvent.click(row(container, "M062"));                     // what Enter / Space dispatch on a <button>
    fireEvent.blur(row(container, "M062"));
    expect(row(container, "M062").getAttribute("aria-pressed")).toBe("true");
    expect(overlay(container)!.getAttribute("data-measure-overlay")).toBe("鼻翼宽 / 颧宽");
    expect(container.querySelector('[data-detail="M062"]')).toBeTruthy();
  });

  it("switching to the side view swaps photo, list, geometry and selection together", () => {
    const { container } = renderFace(full());
    fireEvent.click(row(container, "M001"));
    fireEvent.click(viewTab(/侧脸/));
    expect(screen.getByTestId("workbench").getAttribute("data-view")).toBe("profile90");
    expect((screen.getByTestId("stage-photo") as HTMLImageElement).getAttribute("src")).toBe("/sample/profile.svg");
    const ids = [...container.querySelectorAll('[data-testid="metric-list"] [data-metric]')].map((e) => e.getAttribute("data-metric"));
    expect(ids).toContain("M117");
    expect(ids).not.toContain("M001");
    fireEvent.click(row(container, "M125"));
    const svg = overlay(container)!;
    const side = geometry.views!.profile90;
    expect(svg.getAttribute("viewBox")).toBe(`0 0 ${side.width} ${side.height}`);
    expect(svg.querySelector('polyline[data-role="silhouette"]')).toBeTruthy();
    const line = svg.querySelector('line[data-role="measure"]')!;
    expect(Number(line.getAttribute("x1"))).toBeCloseTo(side.points.p_labrale_sup[0] * side.width, 3);
    fireEvent.click(viewTab(/正脸/));
    expect(overlay(container)!.getAttribute("data-measure-overlay")).toBe("面长宽比");   // each view keeps its pin
  });

  it("front-only: the side view explains what a side photo adds instead of inventing numbers", () => {
    const p = full();
    for (const m of p.measurement_profile!.metrics.filter((x) => x.view === "side")) {
      Object.assign(m, { value: null, components: null, availability: "needs_photo", missing_reason: "needs_side_photo", confidence: null, source_photo: null });
    }
    p.measurement_profile!.views = p.measurement_profile!.views!.map((v) => v.role === "profile90"
      ? { ...v, status: "not_provided" as const, reason: "needs_side_photo" as const, measured: 0 } : v);
    const { container } = renderFace(p);
    fireEvent.click(viewTab(/侧脸/));
    expect(screen.getByTestId("side-empty").textContent).toContain("不会用正脸推算");
    const rows = container.querySelectorAll('[data-testid="metric-list"] [data-metric]');
    expect(rows.length).toBeGreaterThanOrEqual(8);
    rows.forEach((r) => expect(r.textContent).toContain("需补充照片"));
    expect(overlay(container)).toBeNull();
  });

  it("shows an occluded upper third as not measured, never a renormalized 100%", () => {
    const p = full();
    for (const m of p.measurement_profile!.metrics) {
      if (["M017", "M018", "M019", "M024"].includes(m.id)) {
        Object.assign(m, { value: null, components: null, availability: "not_measured", missing_reason: "upper_third_occluded", confidence: null });
      }
    }
    p.measurement_profile!.missing_reasons_zh = { ...p.measurement_profile!.missing_reasons_zh, upper_third_occluded: "额头被刘海或头发遮住，上庭不测量（不会用其他两段凑成 100%）。" };
    const { container } = renderFace(p);
    fireEvent.click(row(container, "M017"));
    expect(row(container, "M017").textContent).toContain("未测量");
    expect(container.querySelector('[data-missing="upper_third_occluded"]')).toBeTruthy();
    expect(container.querySelector('svg[data-measure-overlay="上庭占比"]')).toBeNull();
    expect(row(container, "M025").textContent).toMatch(/\d\.\d{2}/);
  });

  it("free entitlement: locked rows stay visible with no value, overlay or assessment", () => {
    const p = full();
    for (const m of p.measurement_profile!.metrics) {
      if (m.tier === "full") Object.assign(m, { value: null, components: null, confidence: null, locked: true,
        overlay: { segments: [], angles: [], points: [], outline: false, silhouette: false } });
    }
    const { container } = renderFace(p, { locked: ["measurement_profile.full"] });
    const locked = p.measurement_profile!.metrics.filter((m) => m.locked && m.view === "front");
    const r = row(container, locked[0].id);
    expect(r.textContent).toContain("完整护照可见");
    fireEvent.click(r);
    expect(container.querySelector(`[data-detail="${locked[0].id}"]`)!.textContent).toContain("解锁完整护照");
    expect(overlay(container)).toBeNull();
    expect(screen.getByTestId("coverage").textContent).toMatch(/项明细在完整护照/);
  });

  it("keeps the numbers once the photo has expired", () => {
    const { container } = renderFace(full(), { expired: true });
    expect(overlay(container)).toBeNull();
    expect(container.textContent).toContain("照片已按承诺删除");
    expect(container.querySelectorAll("[data-metric]").length).toBeGreaterThan(3);
  });

  it("pre-0.4 passports get a respectful re-upload notice, not a silent legacy view", () => {
    renderFace(base());
    expect(screen.getByTestId("legacy-notice").textContent).toContain("重新上传");
  });
});

describe("measure-model", () => {
  it("formats with the registry precision and never inflates it", () => {
    expect(formatValue(0.3546, "fraction", 0)).toBe("35%");
    expect(formatValue(1.0198, "ratio", 2)).toBe("1.02");
    expect(formatValue(1.77, "deg", 0)).toBe("2°");
    expect(formatValue(71.5, "lab_l", 0)).toBe("L* 72");
    expect(formatValue(-0.1189, "pct_face", 1)).toBe("-11.9%");
    expect(formatValue(null, "ratio", 2)).toBe("—");
  });

  it("draws nothing when a point is missing or the metric was not measured", () => {
    const p = full();
    const m = p.measurement_profile!.metrics.find((x) => x.id === "M033")!;
    expect(metricOverlay(m, geometry)).not.toBeNull();
    const pts = { ...geometry.points! } as Record<string, readonly [number, number]>;
    delete pts.eye_l_inner;
    expect(metricOverlay(m, { ...geometry, points: pts })).toBeNull();
    expect(metricOverlay({ ...m, availability: "not_measured", value: null }, geometry)).toBeNull();
    expect(metricOverlay(m, null)).toBeNull();
  });

  it("every measured metric with an overlay spec resolves on its own photo's geometry", () => {
    const v = measureView(full(), ID)!;
    const measured = v.profile.metrics.filter((m) => m.availability === "measured");
    expect(measured.length).toBeGreaterThanOrEqual(100);
    const drawn = measured.filter((m) => m.overlay.segments.length || m.overlay.angles.length || m.overlay.points.length);
    expect(drawn.filter((m) => metricOverlay(m, geometry)).map((m) => m.id)).toEqual(drawn.map((m) => m.id));
    expect(measured.filter((m) => m.view === "side").length).toBeGreaterThanOrEqual(8);
    expect(v.highlights.length).toBe(3);
    expect(v.pillars.map((x) => x.key)).toEqual(["harmony", "architecture", "expression", "skin"]);
  });
});
