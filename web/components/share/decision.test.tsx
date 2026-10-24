/** Issue #4: the "help me choose A or B" card never exposes a photo or private data without a fresh, specific opt-in. */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import female from "@/lib/fixtures/sample_passport.json";
import type { Passport } from "@/lib/api";
import { buildDirections } from "@/components/looks";
import type { LayerNote } from "@/components/looks";
import { CAPTION_FORBIDDEN, DecisionShare, decisionCaption, decisionContent, decisionExportMeta, decisionPhotos, safeDataImage, DECISION_CONSENT_LABEL } from "./index";

const P = female as unknown as Passport;
const exported = vi.hoisted(() => ({ meta: [] as unknown[], downloads: [] as string[] }));
vi.mock("@/components/cards", async (orig) => ({
  ...(await orig<typeof import("@/components/cards")>()),
  exportPng: async (_node: HTMLElement, meta: unknown) => { exported.meta.push(meta); return new Blob(["png"], { type: "image/png" }); },
}));
vi.mock("./use-card-export", async (orig) => ({
  ...(await orig<typeof import("./use-card-export")>()),
  downloadBlob: (_b: Blob, name: string) => { exported.downloads.push(name); },
}));

const PHOTO = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
const [dA, dB] = buildDirections(P);
const notes: LayerNote[] = [{ key: "lip", label: "唇色", state: "local" }, { key: "hair", label: "发型", state: "unavailable", detail: "还没有生成" }];

beforeAll(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});
beforeEach(() => { exported.meta.length = 0; exported.downloads.length = 0; });

const mount = (snap: string | null = PHOTO, b = dB.look) =>
  render(<DecisionShare passportId={P.passport_id} passport={P}
    a={{ look: dA.look, notes, snapshot: () => snap }} b={{ look: b, notes, snapshot: () => snap }} />);
const card = () => document.querySelector<HTMLElement>('[data-card="decision"]')!;
const exportBtn = () => screen.getByTestId("export-decision") as HTMLButtonElement;
const radio = (name: string) => screen.getByRole("radio", { name });

describe("decision card content", () => {
  const c = decisionContent(P, dA.look, dB.look, notes, notes);
  it("carries only the two looks and their difference: no passport id, score, measurement or questionnaire", () => {
    const text = JSON.stringify(c);
    expect(text).not.toContain(P.passport_id);
    expect(text).not.toContain(P.derived.display_labels.face_shape.label_zh);
    expect(text).not.toContain(String(P.user_context.constraints.other || "\u0000"));
    expect(text).not.toMatch(/参考分|aesthetic|percentile|landmark|cm\b|mm\b/i);
    expect(c.a.lines.join()).toContain("唇色");
    expect(c.a.swatches.length).toBeGreaterThan(0);
    expect(c.a.undrawn).toEqual(["发型"]);
    expect(c.a.method).toBe("本地模拟 · 1 项未画出");
  });
  it("has a caption with no link and no scoring words, saying whether a photo is inside", () => {
    for (const withPhoto of [false, true]) {
      const t = decisionCaption(c, withPhoto);
      expect(t).not.toMatch(/https?:|\/s\/|ap_/);
      for (const w of CAPTION_FORBIDDEN) expect(t).not.toContain(w);
    }
    expect(decisionCaption(c, false)).toContain("不含照片");
    expect(decisionCaption(c, true)).toContain("自己的照片");
  });
  it("hides a model-written name that carries a scoring or medical word", () => {
    const p = JSON.parse(JSON.stringify(P)) as Passport;
    p.analysis.hair_options[0].name_zh = "变美颜值发型";
    const d = buildDirections(p).find((x) => x.look.hair === p.analysis.hair_options[0].tier);
    const out = decisionContent(p, d!.look, dB.look);
    expect(JSON.stringify(out)).not.toMatch(/变美|颜值/);
  });
  it("export metadata is labelled generated content but names neither the passport nor a photo", () => {
    const m = decisionExportMeta(() => "r4nd");
    expect(m.ContentProducer).toBeTruthy();
    expect(m.ProduceID).toMatch(/^decision:/);
    expect(JSON.stringify(m)).not.toContain(P.passport_id);
  });
  it("photos exist only for photo mode with consent, and only as in-memory images", () => {
    const snaps = { a: PHOTO, b: PHOTO };
    expect(decisionPhotos("swatches", true, snaps)).toEqual({ a: null, b: null });
    expect(decisionPhotos("photo", false, snaps)).toEqual({ a: null, b: null });
    expect(decisionPhotos("photo", true, snaps)).toEqual(snaps);
    for (const bad of ["https://x/a.jpg", "/api/media/ap_1/front", "blob:http://x/1", "data:image/svg+xml;base64,AAAA", "javascript:alert(1)", "", null]) expect(safeDataImage(bad)).toBeNull();
    expect(decisionPhotos("photo", true, { a: "https://x/a.jpg", b: PHOTO })).toEqual({ a: null, b: PHOTO });
  });
});

describe("decision share block", () => {
  it("defaults to a card without any photo, exportable at once, naming nothing private", () => {
    mount();
    expect(card().querySelectorAll("img")).toHaveLength(0);
    expect(screen.getByTestId("decision-preview").dataset.photo).toBe("no");
    expect(exportBtn().disabled).toBe(false);
    expect(card().textContent).toContain("不含照片和任何测量数据");
    expect(card().textContent).not.toContain(P.passport_id);
    expect(card().querySelector("[data-short-link]")!.textContent).not.toMatch(/\/s\/|ap_sample/);
    expect(document.getElementById("consent-decision")).toBeNull();
  });

  it("puts photos on the card only after a specific tick, and withdrawing it removes them", () => {
    mount();
    fireEvent.click(radio("含我的照片"));
    const tick = document.getElementById("consent-decision") as HTMLInputElement;
    expect(tick.checked).toBe(false);
    expect(document.body.textContent).toContain(DECISION_CONSENT_LABEL);
    expect(DECISION_CONSENT_LABEL).toMatch(/正脸照片.*造型 A、B.*发给我选择的人/);
    expect(exportBtn().disabled).toBe(true);
    expect(card().querySelectorAll("img")).toHaveLength(0); // choosing the mode alone shows no face
    fireEvent.click(tick);
    expect(card().querySelectorAll("img")).toHaveLength(2);
    expect(card().querySelector("img")!.getAttribute("src")).toBe(PHOTO);
    expect(screen.getByTestId("decision-preview").dataset.photo).toBe("yes");
    expect(exportBtn().disabled).toBe(false);
    fireEvent.click(tick);
    expect(card().querySelectorAll("img")).toHaveLength(0);
    expect(exportBtn().disabled).toBe(true);
  });

  it("drops the consent when the mode or the compared pair changes", () => {
    const { rerender } = mount();
    fireEvent.click(radio("含我的照片"));
    fireEvent.click(document.getElementById("consent-decision")!);
    expect(card().querySelectorAll("img")).toHaveLength(2);
    rerender(<DecisionShare passportId={P.passport_id} passport={P} a={{ look: dA.look, notes, snapshot: () => PHOTO }}
      b={{ look: buildDirections(P)[2].look, notes, snapshot: () => PHOTO }} />);
    expect((document.getElementById("consent-decision") as HTMLInputElement).checked).toBe(false);
    expect(card().querySelectorAll("img")).toHaveLength(0);
    fireEvent.click(document.getElementById("consent-decision")!);
    fireEvent.click(radio("不含照片（默认）"));
    fireEvent.click(radio("含我的照片"));
    expect((document.getElementById("consent-decision") as HTMLInputElement).checked).toBe(false);
  });

  it("cannot put a photo on the card when the pixels are unreadable or expired, even if ticked", () => {
    mount(null);
    fireEvent.click(radio("含我的照片"));
    fireEvent.click(document.getElementById("consent-decision")!);
    expect(card().querySelectorAll("img")).toHaveLength(0);
    expect(exportBtn().disabled).toBe(true);
    expect(document.body.textContent).toContain("不能放进卡片");
  });

  it("exports a labelled PNG whose metadata has no passport id, then asks for consent again", async () => {
    mount();
    fireEvent.click(radio("含我的照片"));
    fireEvent.click(document.getElementById("consent-decision")!);
    fireEvent.click(exportBtn());
    await waitFor(() => expect(exported.downloads).toEqual(["aesthetic-passport-help-me-choose.png"]));
    expect(JSON.stringify(exported.meta)).not.toContain(P.passport_id);
    expect((exported.meta[0] as { ProduceID: string }).ProduceID).toMatch(/^decision:/);
    await waitFor(() => expect((document.getElementById("consent-decision") as HTMLInputElement).checked).toBe(false));
    expect(card().querySelectorAll("img")).toHaveLength(0);
  });

  it("works without any account: saving needs no sign-in, and the system share sheet is optional", () => {
    mount();
    expect(within(screen.getByTestId("decision-share")).queryByText(/登录|注册账号/)).toBeNull();
    expect(screen.getByText(/对方不需要注册/)).toBeTruthy();
    expect((screen.getByTestId("share-decision") as HTMLButtonElement).disabled).toBe(true); // jsdom has no navigator.share
  });
});
