import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import fixture from "@/lib/fixtures/sample_passport.json";
import type { Passport, PassportResponse } from "@/lib/passport";
import { StaticPassportProvider, type PassportStore } from "@/lib/state/passport-store";
import { EnrichPage } from "./enrich-page";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

const passport = fixture as unknown as Passport;
const data: PassportResponse = {
  id: "ap_sample_0001", status: "full_ready", stage: null,
  partial: { input_quality: passport.input_quality, anchors: passport.anchors, quick: null, analysis: "ready", previews: [] },
  passport,
  entitlement: { paid: false, unlock_scope: "free", share_token: null, free_previews_left: 1, price_cny: 39, locked: [] },
  media: { front: null, thumb: null, expires_at: null, expired: false },
  error: null, created_at: "2026-10-01T00:00:00Z",
};

function setup(over: Omit<Partial<PassportStore>, "data"> = {}) {
  const enrich = vi.fn<PassportStore["enrich"]>(async () => "rerank");
  render(
    <StaticPassportProvider value={{ data, enrich, changeNote: "发型建议已按新的发质重新排序", ...over }}>
      <EnrichPage />
    </StaticPassportProvider>,
  );
  return { enrich: (over.enrich as typeof enrich | undefined) ?? enrich };
}

const card = (id: string) => document.getElementById(id) as HTMLElement;
const save = (id: string) => fireEvent.click(within(card(id)).getByRole("button", { name: "保存" }));

describe("A8 enrichment cards", () => {
  it("renders six cards, each skippable", () => {
    const { enrich } = setup();
    const ids = ["enrich-profile", "enrich-hair", "enrich-impression", "enrich-body", "enrich-style", "enrich-conditions"];
    for (const id of ids) {
      expect(card(id)).toBeTruthy();
      fireEvent.click(within(card(id)).getByRole("button", { name: "暂时跳过" }));
      expect(card(id).dataset.status).toBe("skipped");
    }
    expect(enrich).not.toHaveBeenCalled();
  });

  it.each([
    ["enrich-hair", ["hair"]],
    ["enrich-impression", ["desired_impression"]],
    ["enrich-body", ["body"]],
    ["enrich-style", ["current_style_picks", "style_preferences", "target_style"]],
    ["enrich-conditions", ["constraints", "haircut_budget", "occasions"]],
  ])("%s submits only its own patch (no files)", async (id, keys) => {
    const { enrich } = setup();
    save(id);
    await waitFor(() => expect(enrich).toHaveBeenCalledTimes(1));
    const [patch, files] = enrich.mock.calls[0];
    expect(Object.keys(patch).sort()).toEqual(keys);
    expect(files).toBeUndefined();
    await waitFor(() => expect(card(id).dataset.status).toBe("done"));
  });

  it("hair card sends the picked texture / density / grow-out", async () => {
    const { enrich } = setup();
    const c = card("enrich-hair");
    fireEvent.click(within(c).getByRole("button", { name: "自然波浪" }));
    fireEvent.click(within(c).getByRole("button", { name: /发量较多/ }));
    fireEvent.click(within(c).getByRole("button", { name: /暂时不想留长/ }));
    save("enrich-hair");
    await waitFor(() => expect(enrich).toHaveBeenCalled());
    expect(enrich.mock.calls[0][0]).toEqual({ hair: { texture: "wavy", density: "thick", grow_out_ok: false } });
  });

  it("rerank shows the outcome and the change note", async () => {
    setup();
    save("enrich-conditions");
    const note = await within(card("enrich-conditions")).findByRole("status");
    expect(note.dataset.mode).toBe("rerank");
    expect(note.textContent).toContain("只调整了推荐顺序");
    expect(note.textContent).toContain("发型建议已按新的发质重新排序");
  });

  it("profile photo: file input only, sends profile45 with an empty patch, shows re-analysis", async () => {
    const enrich = vi.fn<PassportStore["enrich"]>(async () => "reanalyze");
    setup({ enrich });
    const c = card("enrich-profile");
    expect(c.textContent).toContain("重新分析");
    expect(c.textContent).toContain("分析完立即删除");
    const submit = within(c).getByRole("button", { name: "提交并重新分析" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    const input = within(c).getByTestId("profile-input") as HTMLInputElement;
    expect(input.type).toBe("file");
    expect(input.accept).toBe("image/*");
    const file = new File([new Uint8Array([1, 2, 3])], "side.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(submit.disabled).toBe(false));
    fireEvent.click(submit);
    await waitFor(() => expect(enrich).toHaveBeenCalledTimes(1));
    const [patch, files] = enrich.mock.calls[0];
    expect(patch).toEqual({});
    expect(Object.keys(files ?? {})).toEqual(["profile45"]);
    expect(files?.profile45).toBeInstanceOf(Blob);
    const note = await within(card("enrich-profile")).findByRole("status");
    expect(note.dataset.mode).toBe("reanalyze");
  });

  it("body card states it never analyzes body photos and validates height", async () => {
    const { enrich } = setup();
    const c = card("enrich-body");
    expect(within(c).getByTestId("body-notice").textContent).toContain("不会分析你的身材照片");
    expect(c.querySelector('input[type="file"]')).toBeNull();
    fireEvent.click(within(c).getByRole("button", { name: /曲线型/ }));
    const height = within(c).getByRole("spinbutton") as HTMLInputElement;
    fireEvent.change(height, { target: { value: "90" } });
    expect((within(c).getByRole("button", { name: "保存" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(height, { target: { value: "168" } });
    save("enrich-body");
    await waitFor(() => expect(enrich).toHaveBeenCalled());
    expect(enrich.mock.calls[0][0]).toEqual({ body: { frame: "wave", height_cm: 168 } });
    // The notice stays visible after submitting.
    await waitFor(() => expect(card("enrich-body").dataset.status).toBe("done"));
    expect(within(card("enrich-body")).getByTestId("body-notice")).toBeTruthy();
  });

  it("desired impression keeps at most three", async () => {
    const { enrich } = setup();
    const c = card("enrich-impression");
    // Fixture starts with gentle, refined, approachable (3): extra chips are disabled until one is removed.
    expect((within(c).getByRole("button", { name: "专业" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(c).getByRole("button", { name: "亲和" }));
    fireEvent.click(within(c).getByRole("button", { name: "专业" }));
    save("enrich-impression");
    await waitFor(() => expect(enrich).toHaveBeenCalled());
    const picked = enrich.mock.calls[0][0].desired_impression ?? [];
    expect(picked.length).toBeLessThanOrEqual(3);
    expect([...picked].sort()).toEqual(["gentle", "professional", "refined"]);
  });

  it("style card keeps liked / disliked / target apart", async () => {
    const { enrich } = setup();
    const c = card("enrich-style");
    fireEvent.click(within(c).getByRole("button", { name: /优雅型/ }));
    fireEvent.click(within(c).getByRole("tab", { name: "暂时不想尝试" }));
    fireEvent.click(within(c).getByRole("button", { name: /戏剧型/ }));
    fireEvent.click(within(c).getByRole("tab", { name: "想尝试的方向" }));
    fireEvent.click(within(c).getByRole("button", { name: /古典型/ }));
    save("enrich-style");
    await waitFor(() => expect(enrich).toHaveBeenCalled());
    expect(enrich.mock.calls[0][0]).toEqual({
      style_preferences: { liked: ["elegant"], disliked: ["dramatic"] }, target_style: "classic", current_style_picks: [],
    });
  });

  it("source never uses getUserMedia", () => {
    const roots = [path.resolve(__dirname), path.resolve(__dirname, "../../app/p/[id]/more")];
    const files: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = path.join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(tsx?|mjs|js)$/.test(f) && !f.endsWith(".test.tsx")) files.push(p);
      }
    };
    roots.forEach(walk);
    expect(files.length).toBeGreaterThanOrEqual(6);
    for (const f of files) expect(readFileSync(f, "utf8")).not.toMatch(/getUserMedia|mediaDevices/);
  });

  it("shows the expired-photo note instead of an upload when the front photo is gone", () => {
    render(
      <StaticPassportProvider value={{ data: { ...data, media: { ...data.media, expired: true } } }}>
        <EnrichPage />
      </StaticPassportProvider>,
    );
    const c = card("enrich-profile");
    expect(c.querySelector('input[type="file"]')).toBeNull();
    expect(c.textContent).toContain("正脸照片已按承诺删除");
  });
});
