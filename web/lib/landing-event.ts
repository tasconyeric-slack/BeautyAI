import { flags } from "./flags";

/** Same funnel endpoint as api.track; deliberately independent of the report/fixture backend. */
export async function trackLandingView(topic: string | null, ref: string | null): Promise<void> {
  if (flags.useFixture) return;
  const base = (process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000").replace(/\/$/, "");
  try {
    await fetch(`${base}/api/events`, {
      method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "landing_view", topic, ref }),
    });
  } catch { /* Analytics never break the page. */ }
}
