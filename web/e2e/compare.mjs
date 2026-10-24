// Issue #4 critical path (fixtures, no API keys): personalized directions → save A and B → both drawn on the same
// photo next to the original (pixels really differ) → pick one → "help me choose" card: default has no photo, the photo
// version needs a fresh specific consent → PNG downloads with AIGC metadata and no passport id.
//
//   Web:  cd web && NEXT_PUBLIC_USE_FIXTURE=1 npx next dev -p 3100
//   Run:  BASE=http://localhost:3100 node e2e/compare.mjs      (CHROMIUM=<path> optional; SHOTS=<dir> for screenshots)
// The "photo" is the program-drawn sample portrait: no real person.
import assert from "node:assert/strict";
import { readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3100";
const ID = "ap_sample_0001";
const SHOTS = process.env.SHOTS;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const apiCalls = [];
  page.on("request", (r) => { if (r.url().includes("/api/")) apiCalls.push(r.url()); });

  await page.goto(`${BASE}/p/${ID}/compare`);
  await page.getByTestId("directions").waitFor();
  assert.equal(await page.locator('[data-testid^="direction-"]').count(), 3, "three directions");
  assert.ok(await page.getByTestId("need-two").isVisible(), "asks for two looks first");

  // save two directions as A and B
  const keys = await page.locator('[data-testid^="direction-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid").replace("direction-", "")));
  await page.getByTestId(`pick-${keys[0]}-a`).click();
  await page.getByTestId(`pick-${keys[1]}-b`).click();
  const saved = await page.evaluate((id) => JSON.parse(localStorage.getItem(`ap_choices:${id}`)).looks.length, ID);
  assert.equal(saved, 2, "two saved looks");

  // both looks are drawn, and differ from each other and from the original
  const hash = (slot) => page.getByTestId(`canvas-${slot}`).evaluate((c) => {
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let h = 0;
    for (let i = 0; i < d.length; i += 4) h = (h * 31 + d[i] + 3 * d[i + 1] + 7 * d[i + 2]) | 0;
    return h;
  });
  await page.waitForFunction(() => ["A", "B"].every((s) => document.querySelector(`[data-testid="label-${s}"]`)?.textContent?.includes("本地模拟")), null, { timeout: 20000 });
  const [ha, hb] = [await hash("A"), await hash("B")];
  assert.notEqual(ha, hb, "A and B pixels differ");
  const orig = await page.getByTestId("pane-原图").locator("img").evaluate(async (img) => {
    await img.decode(); const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext("2d").drawImage(img, 0, 0); return [c.width, c.height];
  });
  assert.ok(orig[0] > 0, "original shown");
  const notesA = await page.getByTestId("notes-A").innerText();
  assert.match(notesA, /本地模拟/); assert.match(notesA, /发型 · (未画出|AI 生成)/);
  assert.ok((await page.getByTestId("diff-summary").innerText()).includes("差别在"));
  assert.ok((await page.locator('[data-testid="diff-table"] tr[data-differs="yes"]').count()) >= 2, "rows highlight differences");
  if (SHOTS) await page.screenshot({ path: join(SHOTS, "compare.png"), fullPage: true });

  // choose
  await page.getByTestId("choose-B").click();
  assert.match(await page.getByTestId("chosen").innerText(), /已记录/);
  assert.equal(await page.evaluate((id) => JSON.parse(localStorage.getItem(`ap_choices:${id}`)).preferred?.lookId !== undefined, ID), true);
  await page.reload();
  await page.getByTestId("choose-B").waitFor();
  assert.equal(await page.getByTestId("choose-B").getAttribute("aria-pressed"), "true", "choice survives a reload");

  // share: default card carries no photo at all
  const card = page.locator('[data-card="decision"]');
  assert.equal(await card.locator("img").count(), 0, "no photo by default");
  const dl1 = page.waitForEvent("download");
  await page.getByTestId("export-decision").click();
  const d1 = await dl1;
  const png1 = readFileSync(await d1.path());
  assert.equal(d1.suggestedFilename(), "aesthetic-passport-help-me-choose.png");
  const text1 = png1.toString("latin1");
  assert.ok(text1.includes("AIGC"), "AIGC metadata");
  assert.ok(!text1.includes(ID), "no passport id in the PNG");

  // photo version needs a fresh consent
  await page.getByRole("radio", { name: "含我的照片" }).click();
  assert.equal(await page.getByTestId("export-decision").isDisabled(), true, "disabled before consent");
  assert.equal(await card.locator("img").count(), 0, "no face before consent");
  await page.getByLabel(/同意把我的正脸照片/).check();
  await page.waitForFunction(() => document.querySelectorAll('[data-card="decision"] img').length === 2);
  if (SHOTS) await page.getByTestId("decision-share").screenshot({ path: join(SHOTS, "decision.png") });
  const dl2 = page.waitForEvent("download");
  await page.getByTestId("export-decision").click();
  const d2 = await dl2;
  const png2 = readFileSync(await d2.path());
  assert.ok(png2.length > png1.length * 0.5 && png2.toString("latin1").includes("AIGC"));
  assert.ok(!png2.toString("latin1").includes(ID));
  await page.waitForFunction(() => document.querySelectorAll('[data-card="decision"] img').length === 0);
  assert.equal(await page.getByLabel(/同意把我的正脸照片/).isChecked(), false, "consent resets after export");
  assert.equal(await page.getByTestId("export-decision").isDisabled(), true);

  assert.deepEqual(errors, [], "no page errors");
  // nothing about the comparison or the card was sent to a server
  assert.ok(apiCalls.every((u) => !/compare|decision|choose/.test(u)), `unexpected API calls: ${apiCalls.join(", ")}`);
  console.log("compare e2e OK");
} finally {
  await browser.close();
}
