import { afterEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ useFixture: false }));
vi.mock("./flags", () => ({ flags: state }));
import { trackLandingView } from "./landing-event";
afterEach(() => { vi.unstubAllGlobals(); state.useFixture = false; });
describe("landing telemetry", () => {
  it("preserves the existing event payload without loading report fixtures", async () => {
    const fetcher = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    vi.stubGlobal("fetch", fetcher);
    await trackLandingView("hair", "xhs01");
    expect(fetcher).toHaveBeenCalledWith(expect.stringMatching(/\/api\/events$/), expect.objectContaining({
      method: "POST", body: JSON.stringify({ name: "landing_view", topic: "hair", ref: "xhs01" }),
    }));
  });
  it("makes no network call in fixture mode", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher); state.useFixture = true;
    await trackLandingView(null, null);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("keeps a tracking failure from affecting the homepage", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
    await expect(trackLandingView(null, null)).resolves.toBeUndefined();
  });
});
