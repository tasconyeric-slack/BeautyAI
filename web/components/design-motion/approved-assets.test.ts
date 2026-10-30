import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

it("publishes the approved same-source P001 pair with intact provenance and permanent local assets", () => {
  const manifest = JSON.parse(readFileSync(resolve("public/demo/generated/p001/manifest.json"), "utf8"));
  expect(manifest.previews.map((p: { target: string }) => p.target)).toEqual(["safe", "easy"]);
  expect(manifest.previews[0].before.sha256).toBe(manifest.previews[1].before.sha256);
  for (const preview of manifest.previews) {
    expect(preview.source_report).toContain("demo-2026.10-1");
    expect(preview.status).toBe("succeeded");
    for (const asset of [preview.before, preview.after]) {
      expect(asset.url).toMatch(/^\/demo\/generated\/p001\//);
      expect(createHash("sha256").update(readFileSync(resolve(`public${asset.url}`))).digest("hex")).toBe(asset.sha256);
    }
  }
});
