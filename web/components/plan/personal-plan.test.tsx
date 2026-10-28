import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import sample from "@/lib/fixtures/sample_passport.json";
import type { Passport } from "@/lib/api";
import { choicesKey, clearChoices, readChoices } from "@/lib/state/choices";
import { PersonalPlan } from "./personal-plan";

beforeEach(() => localStorage.clear());
describe("plan decision key path", () => {
  it("reads the hairstyle saved by the full report before applying goal defaults", () => {
    localStorage.setItem(choicesKey("report-handoff"), JSON.stringify({ hair: { tier: "easy", at: "2026-10-28" }, plan: { r1: { saved: true } }, looks: [] }));
    render(<PersonalPlan id="report-handoff" passport={sample as unknown as Passport} />);
    const card = screen.getByTestId("intervention-hair-easy");
    expect(card.textContent).toContain("层次长发");
    expect(within(card).getByRole("link", { name: /实验室/ }).getAttribute("href")).toBe("/p/report-handoff/studio?hair=easy");
    expect(screen.queryByTestId("intervention-hair-safe")).toBeNull();
  });
  it("changes candidates, opens the selected Studio action, and restores saved progress", () => {
    const passport = sample as unknown as Passport;
    const view = render(<PersonalPlan id="ap_sample_0001" passport={passport} />);
    fireEvent.click(screen.getByRole("radio", { name: "鲜明表达" }));
    const card = screen.getByTestId("intervention-lip-statement");
    const link = within(card).getByRole("link", { name: /实验室/ });
    expect(link.getAttribute("href")).toBe("/p/ap_sample_0001/studio?lip=A3263F");
    expect(card.textContent).toContain("o6");
    expect(card.textContent).toContain("替代");
    fireEvent.click(within(card).getByRole("button", { name: "加入我的方案" }));
    fireEvent.click(within(card).getByRole("button", { name: "标记完成" }));
    expect(readChoices("ap_sample_0001").plan["protocol-v1:bold:lip-statement:lip=A3263F"]).toEqual({ saved: true, done: true });
    fireEvent.click(screen.getByRole("radio", { name: "柔和亲近" }));
    expect(screen.queryByTestId("intervention-lip-statement")).toBeNull();
    expect(screen.getByTestId("intervention-lip-soft")).toBeTruthy();
    view.unmount();
    render(<PersonalPlan id="ap_sample_0001" passport={passport} />);
    expect((screen.getByRole("radio", { name: "柔和亲近" }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: "鲜明表达" }));
    expect(within(screen.getByTestId("intervention-lip-statement")).getByRole("button", { name: "已完成" }).getAttribute("aria-pressed")).toBe("true");
    // The existing passport deletion flow owns both keys; neither contains photos or observations.
    expect(localStorage.getItem("ap_plan:ap_sample_0001")).not.toContain("o6");
    clearChoices("ap_sample_0001"); localStorage.removeItem("ap_plan:ap_sample_0001");
    expect(readChoices("ap_sample_0001").plan).toEqual({});
  });

  it("does not carry saved completion to a different shade after unlock", () => {
    const full = structuredClone(sample) as unknown as Passport;
    const free = structuredClone(full); free.analysis.color_profile.lip_families = free.analysis.color_profile.lip_families.slice(0, 2);
    const view = render(<PersonalPlan id="unlock-test" passport={free} />);
    fireEvent.click(screen.getByRole("radio", { name: "鲜明表达" }));
    let card = screen.getByTestId("intervention-lip-statement");
    expect(within(card).getByRole("link").getAttribute("href")).toContain("lip=A85C6A");
    fireEvent.click(within(card).getByRole("button", { name: "标记完成" }));
    view.rerender(<PersonalPlan id="unlock-test" passport={full} />);
    card = screen.getByTestId("intervention-lip-statement");
    expect(within(card).getByRole("link").getAttribute("href")).toContain("lip=A3263F");
    expect(within(card).getByRole("button", { name: "标记完成" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("ignores invalid stored preferences and explains an empty feasible plan", () => {
    localStorage.setItem("ap_plan:empty", JSON.stringify({ goal: "invented", minutes: -8, budget: "none" }));
    const p = structuredClone(sample) as unknown as Passport; p.analysis.observations = [];
    render(<PersonalPlan id="empty" passport={p} />);
    expect(screen.getByText(/没有需要强行改变的项目/)).toBeTruthy();
    expect(screen.getAllByRole("radio").some(r => (r as HTMLInputElement).checked)).toBe(true);
  });

  it("keeps the plan under a free-text restriction, unlocks on confirmation, and shows alternatives for skipped cards", () => {
    const p = structuredClone(sample) as unknown as Passport; p.user_context.constraints.other = "不能改变发型";
    render(<PersonalPlan id="free-text" passport={p} />);
    fireEvent.click(screen.getByRole("radio", { name: "鲜明表达" }));
    let card = screen.getByTestId("intervention-lip-statement");
    expect((within(card).getByRole("button", { name: "加入我的方案" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: /已核对/ }));
    card = screen.getByTestId("intervention-lip-statement");
    expect((within(card).getByRole("button", { name: "加入我的方案" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(within(card).getByRole("button", { name: "不适合我" }));
    expect(screen.queryByTestId("intervention-lip-statement")).toBeNull();
    expect(screen.getByTestId("replacement-lip-statement").textContent).toMatch(/替代|没有其他/);
    fireEvent.click(within(screen.getByTestId("replacement-lip-statement")).getByRole("button", { name: "恢复" }));
    expect(screen.getByTestId("intervention-lip-statement")).toBeTruthy();
  });
});
