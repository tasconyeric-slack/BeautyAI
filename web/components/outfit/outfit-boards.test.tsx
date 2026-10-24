/** Issue #23: the board → compare → "I'll wear this" → checklist flow and the capsule, on the fixture passport. */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import female from "@/lib/fixtures/sample_passport.json";
import type { Passport } from "@/lib/api";
import { freeView } from "@/lib/fixture/free-view";
import { OutfitBoards } from "./outfit-boards";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const F = female as unknown as Passport;
const ui = (p: Passport = F, locked: string[] = []) => <OutfitBoards id="t1" passport={p} disliked={new Set()} locked={locked} />;

beforeEach(() => {
  localStorage.clear();
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});

describe("OutfitBoards", () => {
  it("shows 2–3 boards with slots, near-face palette and a why-note", () => {
    render(ui());
    const boards = screen.getAllByRole("article");
    expect(boards.length).toBe(3);
    const commute = within(screen.getByTestId("board-commute"));
    expect(commute.getByTestId("piece-tie_neck_silk_blouse:#7a8fa6").textContent).toContain("雾霾蓝系带领真丝衬衫");
    expect(commute.getByText("近脸色板")).toBeTruthy();
    expect(commute.getByText(/为什么适合你/)).toBeTruthy();
    // suggestions are labelled as suggestions until ticked as owned
    expect(commute.getAllByText("建议").length).toBeGreaterThan(0);
  });

  it("compares two boards, chooses one and copies a checklist; the choice and owned ticks survive a refresh", async () => {
    const { unmount } = render(ui());
    const cmp = within(screen.getByTestId("outfit-compare"));
    fireEvent.change(cmp.getByLabelText("对比 B"), { target: { value: "formal" } });
    expect(cmp.getByLabelText("对比 B")).toHaveProperty("value", "formal");
    expect(within(screen.getByTestId("compare-summary")).getByText(/共用单品/)).toBeTruthy();
    fireEvent.click(cmp.getByTestId("compare-pick-b"));
    const decision = within(screen.getByTestId("outfit-decision"));
    expect(decision.getByRole("heading").textContent).toBe("正式场合");

    // mark the first catalog piece as owned
    const own = within(screen.getByTestId("board-formal")).getAllByLabelText("我已有")[0]!;
    fireEvent.click(own);
    expect(screen.getByTestId("decision-text").textContent).toContain("[已有]");

    fireEvent.click(decision.getByTestId("decision-copy"));
    await Promise.resolve();
    expect((navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toContain("穿搭清单");

    unmount();                                   // refresh
    render(ui());
    expect(screen.getByTestId("outfit-decision")).toBeTruthy();
    expect(screen.getByTestId("choose-formal").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("decision-text").textContent).toContain("[已有]");
    expect((screen.getByLabelText("对比 B") as HTMLSelectElement).value).toBe("formal");
  });

  it("capsule: owned/need toggle and budget persist and change the first-buy list", () => {
    const { unmount } = render(ui());
    const cap = () => within(screen.getByTestId("outfit-capsule"));
    const before = cap().getByTestId("capsule-summary").textContent;
    fireEvent.click(cap().getByTestId("budget-low"));
    const firstBuy = cap().getAllByLabelText("我已有")[0]!;
    fireEvent.click(firstBuy);
    expect(cap().getByTestId("capsule-summary").textContent).not.toBe(before);
    unmount();
    render(ui());
    expect(cap().getByTestId("budget-low").getAttribute("aria-checked")).toBe("true");
    expect(cap().getByTestId("capsule-summary").textContent).toMatch(/已有 1 件/);
    fireEvent.click(cap().getByTestId("capsule-copy"));
  });

  it("free view: boards come from the formulas, a note says why", () => {
    const [free, locked] = freeView(F);
    render(ui(free, locked));
    expect(screen.getAllByRole("article").length).toBe(2);
    expect(screen.getByTestId("boards-from-formulas")).toBeTruthy();
  });

  it("explicit fallback when no board can be built", () => {
    const none = JSON.parse(JSON.stringify(F)) as Passport;
    (none.analysis.outfit_direction as { occasions: unknown[] }).occasions = [];
    (none.analysis.outfit_direction as { formulas: unknown[] }).formulas = [];
    render(ui(none));
    expect(screen.getByTestId("boards-empty").textContent).toMatch(/没有足够/);
    expect(screen.queryByTestId("outfit-compare")).toBeNull();
    expect(screen.queryByTestId("outfit-capsule")).toBeNull();
  });
});
