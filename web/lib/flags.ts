/** Feature flags (build-time, NEXT_PUBLIC_*). */
const on = (v: string | undefined) => v === "1" || v === "true";

export const flags = {
  /** Whole product on fixtures, no API (dev, static demos). */
  useFixture: on(process.env.NEXT_PUBLIC_USE_FIXTURE),
} as const;

/** Sample passports are always served from fixtures (landing "看示例档案" works without an API). */
export const SAMPLE_IDS = { female: "ap_sample_0001", male: "ap_sample_0002" } as const;
/** Pipeline-backed sample reports (Issue #14) use `ap_demo_*` ids; see lib/fixtures/demo_cases. */
export const DEMO_ID_PREFIX = "ap_demo_";
export const isSampleId = (id: string) => id === SAMPLE_IDS.female || id === SAMPLE_IDS.male || id.startsWith(DEMO_ID_PREFIX);
