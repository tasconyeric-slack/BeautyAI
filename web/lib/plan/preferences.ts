import { GOALS, type PlanPreferences } from "./catalog";

/** Only explicit choices, never observations or media. PassportProvider.remove already clears ap_plan. */
export const planKey = (id: string) => `ap_plan:${id}`;
export function readPreferences(id: string, fallback: PlanPreferences): PlanPreferences {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(planKey(id)) ?? "null");
    if (!v || typeof v !== "object") return fallback;
    const s = v as Record<string, unknown>;
    if (s.version !== 1 || typeof s.goal !== "string" || !Object.hasOwn(GOALS, s.goal)
      || !["low", "medium", "high"].includes(String(s.budget)) || typeof s.minutes !== "number"
      || !Number.isFinite(s.minutes) || s.minutes < 0) return fallback;
    const declined = Array.isArray(s.declined) ? s.declined.filter((x): x is string => typeof x === "string").slice(0, 20) : [];
    return { goal: s.goal as PlanPreferences["goal"], budget: s.budget as PlanPreferences["budget"], minutes: Math.min(s.minutes, fallback.minutes),
      declined, confirmedOther: typeof s.confirmedOther === "string" ? s.confirmedOther.slice(0, 500) : "" };
  } catch { return fallback; }
}
export function writePreferences(id: string, preferences: PlanPreferences): boolean {
  try {
    localStorage.setItem(planKey(id), JSON.stringify({ version: 1, ...preferences }));
    return true;
  } catch { return false; }
}
