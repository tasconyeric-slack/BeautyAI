import { afterEach, describe, expect, it, vi } from "vitest";
import ReportR2Page from "./page";

vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));
afterEach(() => vi.unstubAllEnvs());

describe("isolated report environment boundary", () => {
  it.each([undefined, "production", "development"])("returns 404 for a production server with VERCEL_ENV=%s", async env => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("VERCEL_ENV", env);
    await expect(ReportR2Page({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_NOT_FOUND");
  });
  it.each([["development", undefined], ["production", "preview"]] as const)("allows the %s / %s preview environment", async (node, vercel) => {
    vi.stubEnv("NODE_ENV", node); vi.stubEnv("VERCEL_ENV", vercel);
    await expect(ReportR2Page({ searchParams: Promise.resolve({ v: "p002" }) })).resolves.toBeTruthy();
  });
});
