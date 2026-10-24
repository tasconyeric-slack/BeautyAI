import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Passport, PassportResponse } from "@/lib/api";
import sample from "@/lib/fixtures/sample_passport.json";
import { StaticPassportProvider } from "@/lib/state/passport-store";
import { HairPage } from "./hair-page";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

const p = structuredClone(sample) as unknown as Passport;
const data: PassportResponse = {
  id: "ap_sample_0001", status: "full_ready", stage: "done",
  partial: { input_quality: p.input_quality, anchors: p.anchors, quick: null, analysis: "ready", previews: [] },
  passport: p,
  entitlement: { paid: false, unlock_scope: "free", share_token: null, free_previews_left: 0, price_cny: 39, locked: [] },
  media: { front: "/sample/portrait.svg", thumb: null, expires_at: null, expired: false },
  error: null, created_at: "2026-10-23T09:00:00Z",
};

function renderHair(sendFeedback = vi.fn(async () => {})) {
  return render(<StaticPassportProvider value={{ data, sendFeedback }}><HairPage /></StaticPassportProvider>);
}

describe("HairPage (V2.1 §5.1–5.3)", () => {
  it("renders three full-width recommendation cards in one vertical list, with no image editor", () => {
    renderHair();
    const list = screen.getByRole("list", { name: "三个发型方向" });
    const cards = within(list).getAllByRole("article");
    expect(cards).toHaveLength(3);
    expect(list.className).toMatch(/flex-col/);
    expect(list.className).not.toMatch(/grid-cols/);
    for (const c of cards) {
      expect(within(c).getByText("为什么适合你")).toBeTruthy();
      expect(within(c).getByText("打理与代价")).toBeTruthy();
      expect(within(c).getByRole("link", { name: /试试这个发型/ }).getAttribute("href")).toMatch(/\/studio\?hair=(safe|bold|easy)$/);
    }
    expect(screen.queryByRole("slider")).toBeNull();
    expect(screen.queryByText("拖动对比")).toBeNull();
  });

  it("就选这个 opens a concise hairstylist brief with copy and save", async () => {
    const sendFeedback = vi.fn(async () => {});
    renderHair(sendFeedback);
    fireEvent.click(screen.getAllByRole("button", { name: /就选这个/ })[0]);
    const dialog = await screen.findByRole("dialog");
    const opt = p.analysis.hair_options.find((o) => dialog.textContent?.includes(o.name_zh))!;
    for (const s of opt.barber_script) expect(within(dialog).getByText(s)).toBeTruthy();
    expect(within(dialog).getByText("请避免")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "复制给发型师" })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "保存到我的方案" }));
    expect(sendFeedback).toHaveBeenCalledWith(expect.objectContaining({ target_type: "hair_option", reaction: "like" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("不喜欢 reveals whole-word reason chips", () => {
    renderHair();
    const card = screen.getAllByRole("article")[0];
    fireEvent.click(within(card).getByRole("button", { name: "不喜欢" }));
    const reasons = within(card).getByRole("group", { name: /哪里不合适/ });
    const chips = within(reasons).getAllByRole("button");
    expect(chips.length).toBeGreaterThan(3);
    for (const c of chips) expect(c.className).toContain("ap-chip");
  });
});
