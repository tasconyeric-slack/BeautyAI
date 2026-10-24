/** Issue #4: save two looks → compare → choose, on the passport page. (Pixel drawing needs a real canvas: see e2e/compare.mjs.) */
import { act, fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sampleReportResponse } from "@/lib/fixture/backend";
import { StaticPassportProvider } from "@/lib/state/passport-store";
import { choicesKey, readChoices, useChoices, type Choices } from "@/lib/state/choices";
import type { PassportResponse } from "@/lib/api";
import { buildDirections } from "./directions";
import { LookCompare } from "./look-compare";

const nav = vi.hoisted(() => ({ query: "" }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(nav.query), usePathname: () => "/p/ap_sample_0001/compare", useRouter: () => ({ push: () => {} }) }));

const base = sampleReportResponse("female");
const P = base.passport!;
const key = choicesKey(base.id);
const [d1, d2] = buildDirections(P);

beforeAll(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});
beforeEach(() => { localStorage.clear(); nav.query = ""; });

const seed = (looks: Choices["looks"]) => localStorage.setItem(key, JSON.stringify({ hair: null, looks, plan: {} }));
const saved = (d: typeof d1, id: string) => ({ ...d.look, id, savedAt: "2026-10-24T00:00:00Z" });
const mount = (data: PassportResponse = base) => render(<StaticPassportProvider value={{ data }}><LookCompare /></StaticPassportProvider>);

describe("compare page", () => {
  it("shows three personalized directions with their reasons, goal first", () => {
    mount();
    const dirs = within(screen.getByTestId("directions"));
    expect(dirs.getAllByRole("heading", { level: 3 })).toHaveLength(3);
    expect(screen.getByTestId(`direction-${buildDirections(P)[0].key}`).textContent).toContain("贴近你的目标");
    expect(screen.getByTestId("directions").textContent).toContain("来自你的个人色卡");
    expect(screen.getByTestId("directions").textContent).toContain("发型是 AI 生成");
    expect(screen.getByTestId("need-two")).toBeTruthy();
    expect(screen.queryByTestId("diff-table")).toBeNull();
  });

  it("puts a direction into A and B (saving each once), then compares them against the original", () => {
    mount();
    fireEvent.click(screen.getByTestId(`pick-${d1.key}-a`));
    fireEvent.click(screen.getByTestId(`pick-${d2.key}-b`));
    expect(readChoices(base.id).looks.map((l) => l.name).sort()).toEqual([d1.look.name, d2.look.name].sort());
    expect(screen.queryByTestId("need-two")).toBeNull();
    for (const slot of ["原图", "A", "B"]) expect(screen.getByTestId(`pane-${slot}`)).toBeTruthy();
    expect(screen.getByTestId("select-a")).toHaveProperty("value", readChoices(base.id).looks.find((l) => l.name === d1.look.name)!.id);
    const table = within(screen.getByTestId("diff-table"));
    expect(table.getByText("唇色")).toBeTruthy();
    expect(screen.getByTestId("diff-summary").textContent).toContain("差别在");
    // re-picking an already saved direction reuses it
    fireEvent.click(screen.getByTestId(`pick-${d1.key}-b`));
    expect(readChoices(base.id).looks).toHaveLength(2);
  });

  it("discloses what was generated, simulated or not drawn, and never claims a render it did not make", () => {
    seed([saved(d1, "look_a"), saved(d2, "look_b")]);
    mount({ ...base, partial: { ...base.partial, previews: [] } });
    const notes = screen.getByTestId("notes-A").textContent!;
    expect(notes).toMatch(/发型 · 未画出：.*还没有生成/);
    expect(notes).toContain("唇色");
    expect(screen.getByTestId("label-原图").textContent).toBe("没有任何修改");
    expect(screen.getByTestId("label-A").textContent).not.toContain("AI 生成发型");
    expect(document.body.textContent).toContain("“AI 生成”只指发型");
  });

  it("does not call a hair preview generated until its picture has actually loaded", () => {
    seed([saved(d1, "look_a"), saved(d2, "look_b")]);
    mount(); // the sample has succeeded previews, but jsdom never loads an image
    expect(screen.getByTestId("notes-A").textContent).toMatch(/发型 · 未画出：生成图还在载入/);
    expect(screen.getByTestId("label-A").textContent).not.toContain("AI 生成发型");
  });

  it("with an expired photo it says so and still compares the settings", () => {
    seed([saved(d1, "look_a"), saved(d2, "look_b")]);
    mount({ ...base, media: { ...base.media, front: null, thumb: null, expired: true } });
    expect(document.body.textContent).toContain("照片已按隐私规则在 24 小时后删除");
    expect(screen.getByTestId("pane-A").querySelector("canvas")).toBeNull();
    expect(screen.getByTestId("pane-A").querySelector("img")).toBeNull();
    expect(screen.getByTestId("notes-A").textContent).toContain("24 小时");
    expect(screen.getByTestId("diff-table")).toBeTruthy();
  });

  it("records the preferred look on this device, and can undo it", () => {
    seed([saved(d1, "look_a"), saved(d2, "look_b")]);
    nav.query = "a=look_a&b=look_b";
    mount();
    fireEvent.click(screen.getByTestId("choose-B"));
    expect(readChoices(base.id).preferred?.lookId).toBe("look_b");
    expect(screen.getByTestId("chosen").textContent).toContain(d2.look.name);
    expect(screen.getByTestId("pane-B").dataset.selected).toBe("yes");
    fireEvent.click(screen.getByTestId("choose-B"));
    expect(readChoices(base.id).preferred).toBeNull();
  });

  it("warns when the two looks are identical instead of inventing a difference", () => {
    seed([saved(d1, "look_a"), { ...saved(d1, "look_b"), name: "副本" }]);
    mount();
    expect(screen.getByTestId("diff-summary").textContent).toContain("完全相同");
  });

  it("offers the decision card block once two looks are chosen", () => {
    seed([saved(d1, "look_a"), saved(d2, "look_b")]);
    mount();
    expect(screen.getByTestId("decision-share")).toBeTruthy();
    expect(screen.getByTestId("export-decision")).toBeTruthy();
  });
});

describe("saved look state", () => {
  it("saveLook returns the new id (unique even within one millisecond) and deleting the preferred look clears the preference", () => {
    const { result } = renderHook(() => useChoices(base.id));
    let a = "", b = "";
    act(() => { a = result.current.saveLook({ ...d1.look }); b = result.current.saveLook({ ...d2.look }); });
    expect(a).not.toBe(b);
    expect(readChoices(base.id).looks.map((l) => l.id)).toEqual([b, a]);
    act(() => result.current.choosePreferred(a));
    expect(readChoices(base.id).preferred?.lookId).toBe(a);
    act(() => result.current.removeLook(b));
    expect(readChoices(base.id).preferred?.lookId).toBe(a);
    act(() => result.current.removeLook(a));
    expect(readChoices(base.id).preferred).toBeNull();
  });
  it("reads choices saved before the comparison existed", () => {
    localStorage.setItem(key, JSON.stringify({ hair: null, looks: [], plan: {} }));
    expect(readChoices(base.id).preferred ?? null).toBeNull();
  });
});
