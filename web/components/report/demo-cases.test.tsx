/** Issue #14 critical path: the pipeline-backed sample reports of AI-generated fictional people render through the
 *  existing report with their own measured numbers, a visible AI-generated disclosure, honest provenance and no
 *  invented previews or learned scores. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { sampleReportPreview } from "@/components/landing/cases";
import type { Passport } from "@/lib/api";
import { fixtureBackend } from "@/lib/fixture/backend";
import { DEMO_CASES } from "@/lib/fixtures/demo_cases";
import SampleReportPage from "@/app/report/sample/page";
import { SampleReport } from "./sample-report";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/report/sample", useRouter: () => ({ push: () => {} }) }));

const FORBIDDEN = /颜值|打分|评分|标准脸|完美|缺陷|缺点|整容|医美|手术|治疗/;
const ROOT = path.resolve(__dirname, "../../..");

describe("pipeline-backed demo cases (Issue #14)", () => {
  it("ships two cases whose web copies are byte-identical to the versioned snapshots", () => {
    expect(DEMO_CASES.map((c) => c.provenance.person_id)).toEqual(["person-001", "person-002"]);
    for (const c of DEMO_CASES) {
      for (const f of ["passport", "geometry", "provenance"]) {
        const src = readFileSync(path.join(ROOT, "examples/demo_cases", c.provenance.person_id, `${f}.json`), "utf8");
        const web = readFileSync(path.join(ROOT, "web/lib/fixtures/demo_cases", `${c.provenance.person_id}.${f}.json`), "utf8");
        expect(web).toBe(src);
      }
    }
  });

  it("records real-provider provenance that matches the passport, with no learned score and no previews", () => {
    for (const c of DEMO_CASES) {
      const p = c.passport;
      const L = c.provenance.layers;
      expect(c.id).toBe(c.provenance.sample_id);
      expect(L.analysis.provider).toBe("deepseek");
      expect(L.analysis.model).toBe(p.meta.analysis_model);
      expect(p.meta.analysis_model).not.toMatch(/fixture|fake|sample/);
      expect(L.scoring.scoring_version).toBe(p.aesthetic_score?.scoring_version);
      expect(L.learned_attractiveness.status).toBe("not_included");
      // the assembler's pending placeholder only: no preview image was ever generated
      for (const pv of p.previews ?? []) expect([pv.status, pv.image_model, pv.after_ref]).toEqual(["pending", null, null]);
      expect(L.previews.status).toBe("unavailable");
      // a side photo is published only when real QC accepted it and its measurements exist
      const side = p.measurement_profile!.views!.find((v) => v.role === "profile90");
      expect(Boolean(c.photos.profile90)).toBe(L.cv.side_view.qc_accepted);
      expect(side?.status === "measured").toBe(L.cv.side_view.qc_accepted);
      for (const url of Object.values(c.photos)) expect(url).toMatch(/^\/sample\/demo\/person-00\d\/(front|profile90)\.jpg$/);
    }
  });

  it.each(DEMO_CASES.map((c) => [c.key, c] as const))("renders %s through the existing report with its own numbers", async (key, c) => {
    const { container } = render(<SampleReport variant={key} />);
    const p = c.passport as Passport;

    // prominent AI-generated disclosure + selector with both people
    const note = screen.getByTestId("demo-disclosure");
    expect(note.textContent).toContain("AI 生成的虚构人物");
    expect(note.textContent).toContain(c.provenance.layers.analysis.model);
    const selector = screen.getByTestId("sample-person-selector");
    expect(selector.querySelectorAll("a")).toHaveLength(2);
    expect(selector.querySelector('[aria-current="page"]')?.textContent).toBe(c.label);

    // the scoring layer's real number and the real measurements
    const report = screen.getByTestId("full-report");
    expect(screen.getByTestId("score-value").textContent).toBe(String(Math.round(p.aesthetic_score!.overall_score!)));
    const m001 = p.measurement_profile!.metrics.find((m) => m.id === "M001")!;
    expect(container.querySelector('[data-metric-row="M001"] [data-testid="metric-value"]')?.textContent)
      .toBe(m001.value!.toFixed(m001.decimals));
    // the measured lines are drawn on the published synthetic portrait (pipeline geometry)
    const figures = await screen.findAllByTestId("region-figure");
    expect(figures.length).toBeGreaterThanOrEqual(4);
    expect(container.querySelector(`img[src="${c.photos.front}"]`)).toBeTruthy();

    // the model's own analysis, and no preview image claimed
    expect(report.textContent).toContain(p.analysis.limitations[0]);
    for (const h of container.querySelectorAll("[data-hair]")) expect(h.getAttribute("data-preview")).toBe("not_yet");
    expect(report.textContent).not.toMatch(FORBIDDEN);
  });

  it("serves the pipeline geometry and real photos through the sample backend", async () => {
    const c = DEMO_CASES[1];
    expect(await fixtureBackend.geometry(c.id)).toBe(c.geometry);
    const r = await fixtureBackend.get(c.id);
    expect(r.media.photos).toEqual(c.photos);
    expect(r.media.expired).toBe(false);
  });

  it("defaults /report/sample to person 001 and keeps the illustrated samples reachable", async () => {
    render(await SampleReportPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByTestId("demo-disclosure")).toBeTruthy();
    expect(screen.getByTestId("sample-person-selector").querySelector('[aria-current="page"]')?.textContent).toBe(DEMO_CASES[0].label);
  });

  it("keeps ?v=male rendering the older illustrated sample without the demo disclosure", async () => {
    render(await SampleReportPage({ searchParams: Promise.resolve({ v: "male" }) }));
    expect(screen.queryByTestId("demo-disclosure")).toBeNull();
    expect(screen.getByTestId("full-report")).toBeTruthy();
  });

  it("the landing report preview summarises the first real sample", () => {
    const r = sampleReportPreview();
    expect(r.overview).toContain(String(DEMO_CASES[0].passport.aesthetic_score!.overall_score!).split(".")[0]);
  });
});
