import { act, fireEvent, render, screen, within } from "@testing-library/react";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import female from "@/lib/fixtures/sample_passport.json";
import male from "@/lib/fixtures/sample_passport_male.json";
import type { FeedbackEvent, Passport, PassportResponse } from "@/lib/api";
import { StaticPassportProvider, type PassportStore } from "@/lib/state/passport-store";
import { StylePage } from "./style-page";
import { lineWord, moveWords, styleView, weightWord } from "./view";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

const F = female as unknown as Passport;
const M = male as unknown as Passport;
const EIGHT = ["少女型", "少年型", "优雅型", "浪漫型", "自然型", "古典型", "戏剧型", "前卫型"];

function response(p: Passport): PassportResponse {
  return {
    id: p.passport_id, status: "full_ready", stage: null,
    partial: { input_quality: p.input_quality, anchors: p.anchors, quick: null, analysis: "ready", previews: [] },
    passport: p,
    entitlement: { paid: true, unlock_scope: "full", share_token: null, free_previews_left: 0, price_cny: 39, locked: [] },
    media: { front: null, thumb: null, expires_at: null, expired: true },
    error: null, created_at: "2026-01-01T00:00:00Z",
  };
}

function renderPage(p: Passport, extra: Omit<Partial<PassportStore>, "data"> = {}) {
  return render(<StaticPassportProvider value={{ ...extra, data: response(p) }}><StylePage /></StaticPassportProvider>);
}

/** A tiny stand-in for feedback + rerank: applies the style event to preference_overlay like the rules layer. */
function Live({ initial, onSend }: { initial: Passport; onSend: (ev: Omit<FeedbackEvent, "client_event_id">) => void }) {
  const [p, setP] = React.useState(initial);
  const sendFeedback = async (ev: Omit<FeedbackEvent, "client_event_id">) => {
    onSend(ev);
    const next = structuredClone(p);
    const o = next.derived.style_profile.preference_overlay;
    const key = ev.target_id as typeof o.target;
    if (ev.reaction === "target") o.target = key;
    if (ev.reaction === "like" && key) o.liked = [...o.liked, key];
    next.derived.feedback_applied = { event_count: 1, changes: [], note_zh: `已按你的 1 条反馈调整：穿搭与发型向${next.derived.style_profile.names_zh[ev.target_id]}靠拢` };
    setP(next);
  };
  return <StaticPassportProvider value={{ data: response(p), sendFeedback }}><StylePage /></StaticPassportProvider>;
}

const mePoint = (c: HTMLElement) => {
  const me = c.querySelector(".ap-plane__me")!;
  return [me.getAttribute("cx"), me.getAttribute("cy")];
};

describe("style page (A7 · F8)", () => {
  it.each([["female", F], ["male", M]])("renders the unified eight labels for the %s sample", (_, p) => {
    renderPage(p);
    const picker = screen.getByRole("list", { name: "八种风格方向" });
    for (const name of EIGHT) {
      expect(within(picker).getByRole("button", { name: new RegExp(name) })).toBeTruthy();
      expect(within(screen.getByTestId("style-plane")).getByText(name)).toBeTruthy();
    }
  });

  it("shows the four layers separately with their own words", () => {
    renderPage(F);
    for (const [id, title] of [["layer-features", "你的特征"], ["layer-looks", "看起来像"], ["layer-likes", "你喜欢"], ["layer-wants", "你想去"]]) {
      expect(within(screen.getByTestId(id)).getByRole("heading", { name: title })).toBeTruthy();
    }
    // ① cites observations (ids + text) behind visual_weight / angular_rounded
    const features = screen.getByTestId("layer-features");
    expect(within(features).getAllByText("o1").length).toBeGreaterThan(0);
    expect(within(features).getAllByText(F.analysis.observations[0].text).length).toBeGreaterThan(0);
    expect(screen.getByText(/行业/)).toBeTruthy();
    expect(screen.getByText(/不是诊断结果/)).toBeTruthy();
  });

  it("shows 介于 A 与 B 之间 for the female sample (between) and not for the male one", () => {
    renderPage(F);
    expect(screen.getAllByText("介于优雅型与古典型之间").length).toBeGreaterThan(0);
  });

  it("does not show a between caption when the rules layer says it is not between", () => {
    renderPage(M);
    expect(screen.queryByText(/介于/)).toBeNull();
    expect(within(screen.getByTestId("layer-looks")).getByText("自然型")).toBeTruthy();
  });

  it("picking a target sends style feedback with reaction 'target'", () => {
    const sendFeedback = vi.fn(async () => {});
    renderPage(F, { sendFeedback });
    fireEvent.click(screen.getByRole("radio", { name: "我想去" }));
    fireEvent.click(within(screen.getByRole("list", { name: "八种风格方向" })).getByRole("button", { name: /戏剧型/ }));
    expect(sendFeedback).toHaveBeenCalledWith({ target_type: "style", target_id: "dramatic", reaction: "target" });
  });

  it("picking a liked style sends reaction 'like'", () => {
    const sendFeedback = vi.fn(async () => {});
    renderPage(M, { sendFeedback });
    fireEvent.click(within(screen.getByRole("list", { name: "八种风格方向" })).getByRole("button", { name: /古典型/ }));
    expect(sendFeedback).toHaveBeenCalledWith({ target_type: "style", target_id: "classic", reaction: "like" });
  });

  it("after rerank: face_only point stays, target point appears, change note shows", async () => {
    const sent: unknown[] = [];
    const { container } = render(<Live initial={F} onSend={(e) => sent.push(e)} />);
    const before = mePoint(container);
    expect(container.querySelector(".ap-plane__target")).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "我想去" }));
    await act(async () => {
      fireEvent.click(within(screen.getByRole("list", { name: "八种风格方向" })).getByRole("button", { name: /戏剧型/ }));
    });
    expect(sent).toHaveLength(1);
    expect(mePoint(container)).toEqual(before);
    expect(container.querySelector(".ap-plane__target")).not.toBeNull();
    expect(screen.getByTestId("style-change-note").textContent).toContain("向戏剧型靠拢");
    expect(within(screen.getByTestId("layer-wants")).getByText("戏剧型")).toBeTruthy();
    // ① and ② are untouched by preferences
    expect(within(screen.getByTestId("layer-looks")).getByText("优雅型")).toBeTruthy();
  });

  it("liked styles show as the preference point", async () => {
    const { container } = render(<Live initial={F} onSend={() => {}} />);
    await act(async () => {
      fireEvent.click(within(screen.getByRole("list", { name: "八种风格方向" })).getByRole("button", { name: /自然型/ }));
    });
    expect(container.querySelector(".ap-plane__preference")).not.toBeNull();
    expect(within(screen.getByTestId("layer-likes")).getByText("自然型")).toBeTruthy();
  });

  it("low dimension confidence shows a region instead of a type", () => {
    const p = structuredClone(F);
    p.analysis.style_dimensions.visual_weight.confidence = 0.3;
    renderPage(p);
    const looks = screen.getByTestId("layer-looks");
    expect(within(looks).queryByText("优雅型")).toBeNull();
    expect(within(looks).getByText(styleView(p).looks.region)).toBeTruthy();
    expect(screen.queryByText(/介于/)).toBeNull();
  });

  it("overall direction is described only when a body frame is self-selected", () => {
    const p = structuredClone(F);
    p.user_context.body = { frame: "straight", height_cm: null };
    p.derived.style_profile.overall = { x: 3.15, y: 0.4 };
    renderPage(p);
    expect(screen.getByText(/加入你自选的身形（直线型）后，整体方向量感加大一些、多一点直线与利落感/)).toBeTruthy();
  });

  it("view helpers", () => {
    expect(weightWord(2.9)).toBe("量感中等");
    expect(lineWord(-1.0)).toBe("线条偏直");
    expect(moveWords({ x: 2.9, y: 0.7 }, { x: 4.2, y: -1.3 })).toEqual(["量感加大一些", "多一点直线与利落感"]);
    expect(styleView(M).names.map((n) => n.name).sort()).toEqual([...EIGHT].sort());
  });
});
