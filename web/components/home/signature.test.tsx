import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { demoCaseByKey, type DemoCase } from "@/lib/fixtures/demo_cases";
import { display } from "@/components/face/measure-model";
import { heroView, profileView } from "./model";
import { Hero } from "./hero";
import { TIMING, profileVars } from "./signature";

const c = demoCaseByKey("p002") as DemoCase;
const side = c.geometry.views!.profile90!;

beforeAll(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("hero side view model", () => {
  it("uses the accepted profile90 photo with its own landmarks and the passport's own values", () => {
    const p = profileView(c)!;
    expect(p.plate).toEqual({ src: "/sample/demo/person-002/profile90.jpg", width: 1024, height: 1536 });
    expect(p.silhouette).toBe(side.silhouette);
    expect(p.marks.map((m) => m.id)).toEqual(["M131", "M117"]);
    for (const mk of p.marks) {
      const m = c.passport.measurement_profile!.metrics.find((x) => x.id === mk.id)!;
      expect(m.source_photo).toBe("profile90");
      expect(mk.value).toBe(display(m));
      expect([mk.overlay.width, mk.overlay.height]).toEqual([side.width, side.height]);
    }
    // the nose–lip angle is drawn at the side photo's measured subnasale, never a front or mirrored point
    expect(p.marks[1].overlay.arcs[0].vertex).toEqual(side.points.p_subnasale);
    expect(p.measured).toBe(13);
  });

  it("registers the two photos by measured nasion→subnasale height; the chins then agree", () => {
    const p = profileView(c)!;
    const H = c.geometry.height;
    const front = (k: string) => c.geometry.points![k][1] * H;
    const prof = (k: string) => side.points[k][1] * side.height * p.fit.scale;
    // independent check: nasion→chin in front vs nasion→gnathion in profile, within 3% of face length
    const fLen = front("chin") - front("nasion"), pLen = prof("p_gnathion") - prof("p_nasion");
    expect(Math.abs(fLen - pLen) / fLen).toBeLessThan(0.03);
    expect(profileVars(heroView(c)!)["--ph2" as never]).toMatch(/^calc\(var\(--ph\) \* 1\.2/);
  });

  it("fails closed: no side view when QC, size or a measured mark is missing", () => {
    const noQc = structuredClone(c);
    noQc.provenance.layers.cv.side_view.qc_accepted = false;
    expect(profileView(noQc)).toBeNull();
    const resized = structuredClone(c);
    resized.provenance.published_images.profile90.width = 1000;
    expect(profileView(resized)).toBeNull();
    const unmeasured = structuredClone(c);
    unmeasured.passport.measurement_profile!.metrics.find((m) => m.id === "M117")!.availability = "not_measured";
    expect(profileView(unmeasured)).toBeNull();
    const noPhoto = { ...c, photos: { front: c.photos.front } };
    expect(heroView(noPhoto)!.profile).toBeNull();
  });
});

describe("hero signature interaction", () => {
  it("switches views by click and arrow keys, announcing the measured values", () => {
    vi.useFakeTimers();
    render(<Hero v={heroView(c)!} />);
    const group = screen.getByRole("group", { name: "示例照片视角" });
    const [front, profile] = within(group).getAllByRole("button");
    expect(front.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(profile);
    expect(profile.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("鼻唇角 113°");
    expect(document.querySelector("[aria-live]")!.textContent).toContain("面部侧轮廓凸度 176°");
    expect(document.querySelector("section")!.dataset.view).toBe("profile");
    fireEvent.keyDown(profile, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(front);
    expect(front.getAttribute("aria-pressed")).toBe("true");
    // a manual choice ends the entrance: nothing moves on its own afterwards
    act(() => { vi.advanceTimersByTime(TIMING.firstTurn + TIMING.profileSettle + 1000); });
    expect(document.querySelector("section")!.dataset.view).toBe("front");
    expect(screen.getByRole("button", { name: "重播动画" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /上传正脸/ }).getAttribute("href")).toBe("/start");
  });

  it("plays the entrance once (pausable), then rests", () => {
    vi.useFakeTimers();
    render(<Hero v={heroView(c)!} />);
    // the side photo must be decoded before the wipe
    fireEvent.load(document.querySelector('[data-side="profile"] img')!);
    const pause = screen.getByRole("button", { name: "暂停动画" });
    act(() => { vi.advanceTimersByTime(1000); });
    fireEvent.click(pause);
    act(() => { vi.advanceTimersByTime(TIMING.firstTurn * 2); });
    expect(document.querySelector("section")!.dataset.view).toBe("front");
    fireEvent.click(screen.getByRole("button", { name: "继续播放" }));
    act(() => { vi.advanceTimersByTime(TIMING.firstTurn); });
    expect(document.querySelector("section")!.dataset.view).toBe("profile");
    act(() => { vi.advanceTimersByTime(TIMING.profileSettle + 100); });
    expect(screen.getByRole("button", { name: "重播动画" })).toBeTruthy();
  });

  it("does not autoplay under reduced motion and offers no replay", () => {
    vi.useFakeTimers();
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduce"), addEventListener() {}, removeEventListener() {} }));
    render(<Hero v={heroView(c)!} />);
    act(() => { vi.advanceTimersByTime(TIMING.firstTurn + TIMING.profileSettle + 1000); });
    expect(document.querySelector("section")!.dataset.view).toBe("front");
    expect(screen.queryByRole("button", { name: /动画|播放/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "侧脸" }));
    expect(document.querySelector("section")!.dataset.view).toBe("profile");
  });
});
