// Requires html-to-image, esbuild and the existing playwright dev dependency.
// From web/: node components/cards/generate-previews.mjs
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32 } from "node:zlib";
import { build } from "esbuild";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const scratch = await mkdtemp(join(tmpdir(), "passport-card-preview-"));
const output = join(here, "previews");
await mkdir(output, { recursive: true });
await build({ entryPoints: [join(here, "preview-entry.tsx")], bundle: true, outfile: join(scratch, "preview.js"), platform: "browser", format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' } });
const server = createServer(async (req, res) => {
  if (req.url === "/preview.js") { res.setHeader("Content-Type", "text/javascript"); res.end(await readFile(join(scratch, "preview.js"))); }
  else { res.setHeader("Content-Type", "text/html;charset=utf-8"); res.end('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>Synthetic card preview</title><body style="margin:0"><div id="app"></div><script src="/preview.js"></script></body></html>'); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
let browser;
const checks = [];
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium", args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  const externalRequests = [];
  page.on("request", request => { if (!request.url().startsWith(`http://127.0.0.1:${port}`) && !request.url().startsWith("data:")) externalRequests.push(request.url()); });
  await page.goto(`http://127.0.0.1:${port}`);
  await page.waitForFunction(() => Boolean(window.exportCardPreview));
  for (const kind of ["avatar", "palette", "portrait", "stylist", "compare-3:4", "compare-9:16"]) {
    const base64 = await page.evaluate(kind => window.exportCardPreview(kind), kind);
    const png = Buffer.from(base64, "base64");
    assert.equal(png.readUInt32BE(16), 1080);
    assert.equal(png.readUInt32BE(20), kind === "compare-9:16" ? 1920 : 1440);
    let meta;
    for (let offset = 8; offset < png.length;) {
      const length = png.readUInt32BE(offset);
      const type = png.toString("ascii", offset + 4, offset + 8);
      assert.equal(png.readUInt32BE(offset + 8 + length), crc32(png.subarray(offset + 4, offset + 8 + length)), `invalid ${type} CRC`);
      if (type === "tEXt" && png.toString("ascii", offset + 8, offset + 13) === "AIGC\0") meta = JSON.parse(png.toString("latin1", offset + 13, offset + 8 + length));
      offset += length + 12;
    }
    assert.equal(meta.AIGC.Label, "1");
    assert.equal(meta.AIGC.ProduceID, `synthetic-${kind}-001`);
    const layout = await page.evaluate(() => {
      const card = document.querySelector("[data-card]");
      const footer = card.querySelector("footer").getBoundingClientRect();
      const childBounds = [...card.children].filter(el => el.tagName !== "FOOTER").map(el => el.getBoundingClientRect().bottom);
      return { count: card.querySelectorAll("img,image,foreignObject").length, footerTop: footer.top, contentBottom: Math.max(...childBounds), label: card.innerText.includes("AI 生成") && card.innerText.includes("形象护照") };
    });
    assert.ok(layout.label);
    assert.ok(layout.contentBottom < layout.footerTop, `${kind} overlaps footer`);
    if (["avatar", "palette", "stylist"].includes(kind)) assert.equal(layout.count, 0);
    if (["avatar", "palette", "portrait"].includes(kind)) await writeFile(join(output, `profile-${kind}.png`), png);
    checks.push({ kind, width: png.readUInt32BE(16), height: png.readUInt32BE(20), bytes: png.length, photoElements: layout.count, AIGC: meta.AIGC });
  }
  assert.deepEqual(externalRequests, []);
  await writeFile(join(output, "validation.json"), JSON.stringify({ syntheticOnly: true, externalRequests, checks }, null, 2) + "\n");
  console.log("Verified six browser exports, CRCs, metadata, image isolation and footer layout; wrote three synthetic ProfileCard PNG previews.");
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  await rm(scratch, { recursive: true, force: true });
}
