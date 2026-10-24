import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** D24: the dev-only placeholder score must never be imported by product code (so it cannot reach a build). */
describe("score teaser guard", () => {
  it("no source file outside fixtures/tests imports dev_score_placeholder", () => {
    const root = join(__dirname, "..");
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (["node_modules", ".next", "fixtures"].includes(name)) continue;
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(tsx?|mjs|cjs)$/.test(name) && !/\.test\./.test(name) && readFileSync(p, "utf8").includes("dev_score_placeholder")) hits.push(p);
      }
    };
    for (const d of ["app", "components", "lib"]) walk(join(root, d));
    expect(hits).toEqual([]);
  });
});
