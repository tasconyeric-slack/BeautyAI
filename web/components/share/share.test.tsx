import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import female from "@/lib/fixtures/sample_passport.json";
import type { Passport, PassportResponse } from "@/lib/passport";
import { StaticPassportProvider } from "@/lib/state/passport-store";
import { CAPTION_FORBIDDEN, EXPIRED_TEXT, ShareStudio, SharedView, buildCaption } from "./index";

const P = female as unknown as Passport;

beforeAll(() => {
  // jsdom has no ResizeObserver (used by <Scaled>).
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

function response(media: Partial<PassportResponse["media"]> = {}, previews: PassportResponse["partial"]["previews"] = []): PassportResponse {
  return {
    id: P.passport_id, status: "full_ready", stage: "done",
    partial: { input_quality: P.input_quality, anchors: P.anchors, quick: null, analysis: "ready", previews },
    passport: P,
    entitlement: { paid: false, unlock_scope: "free", share_token: null, free_previews_left: 0, price_cny: 39, locked: [] },
    media: { front: "/sample/portrait.svg", thumb: "/sample/portrait.svg", expires_at: "2026-10-23T09:00:00Z", expired: false, ...media },
    error: null, created_at: "2026-10-22T09:00:00Z",
  } as unknown as PassportResponse;
}

const renderStudio = (data: PassportResponse) =>
  render(<StaticPassportProvider value={{ data }}><ShareStudio /></StaticPassportProvider>);

const radio = (mode: string) => document.querySelector<HTMLButtonElement>(`[role="radio"][data-mode="${mode}"]`)!;

describe("share page", () => {
  it("disables portrait mode when the photo is unavailable", () => {
    renderStudio(response({ front: null, thumb: null, expired: true }));
    expect(radio("portrait").disabled).toBe(true);
    expect(radio("avatar").disabled).toBe(false);
    expect(radio("avatar").getAttribute("aria-checked")).toBe("true");
    expect(document.querySelector("img")).toBeNull();
  });

  it("portrait export stays disabled until the per-export consent is ticked", () => {
    renderStudio(response());
    const exportBtn = screen.getByTestId("export-profile") as HTMLButtonElement;
    expect(exportBtn.disabled).toBe(false); // illustration needs no consent
    fireEvent.click(radio("portrait"));
    expect(radio("portrait").getAttribute("aria-checked")).toBe("true");
    expect(exportBtn.disabled).toBe(true);
    const consent = document.getElementById("consent-profile") as HTMLInputElement;
    expect(consent.checked).toBe(false);
    fireEvent.click(consent);
    expect(exportBtn.disabled).toBe(false);
    fireEvent.click(radio("palette")); // switching away drops the consent
    fireEvent.click(radio("portrait"));
    expect((document.getElementById("consent-profile") as HTMLInputElement).checked).toBe(false);
    expect(exportBtn.disabled).toBe(true);
  });

  it("caption is filled and contains no forbidden words", () => {
    renderStudio(response());
    const text = screen.getByTestId("caption").textContent ?? "";
    expect(text).not.toMatch(/\{(风格|色彩|行动|链接)\}/);
    expect(text).toContain(P.analysis.profile_summary.best_direction);
    for (const t of CAPTION_FORBIDDEN) expect(text).not.toContain(t);
    const poisoned = buildCaption({ styleName: "完美逆袭型", colorNames: ["变美色"], action: "整容级变美", link: "https://x/s/t" });
    for (const t of CAPTION_FORBIDDEN) expect(poisoned.text).not.toContain(t);
    expect(poisoned.text).toContain("https://x/s/t");
  });

  it("offers the before/after card only when a hair preview succeeded, with its own consent", () => {
    const pv = { target_id: "safe", kind: "hair", status: "succeeded", image_model: "x", after_url: "/sample/portrait-safe.svg",
      before_url: "/sample/portrait.svg", error: null, ai_label: "AI 试看" } as PassportResponse["partial"]["previews"][number];
    const { unmount } = renderStudio(response());
    expect(screen.queryByTestId("export-before-after")).toBeNull();
    unmount();
    renderStudio(response({}, [pv]));
    expect((screen.getByTestId("export-before-after") as HTMLButtonElement).disabled).toBe(true);
    // stylist card hides the face by default: no preview image on it
    expect(screen.getByTestId("export-stylist")).toBeTruthy();
    expect(document.querySelector('[data-card="stylist"] img')).toBeNull();
  });
});

describe("shared read-only view", () => {
  it("renders the fixture share without any photo", async () => {
    render(<SharedView token="fx-ap_sample_0001" />);
    await screen.findByText("也做一份我的形象护照");
    await waitFor(() => expect(document.querySelector("[data-card]")).not.toBeNull());
    const imgs = Array.from(document.querySelectorAll("img"));
    expect(imgs.filter((i) => (i.getAttribute("src") ?? "").includes("/api/media"))).toHaveLength(0);
    expect(imgs).toHaveLength(0);
    expect(screen.getByText("也做一份我的形象护照").closest("a")?.getAttribute("href")).toMatch(/^\/start/);
  });

  it("shows the expired message for a deleted or unknown token", async () => {
    render(<SharedView token="nope" load={() => Promise.reject(new Error("gone"))} />);
    expect(await screen.findByText(EXPIRED_TEXT)).toBeTruthy();
  });
});
