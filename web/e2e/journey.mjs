// Issue #2 critical path, desktop (no API needed: sample passports always run on fixtures):
//   landing first screen (free start, labeled synthetic deliverable, privacy cues, no scrolling needed)
//   → sample overview (model-reference score, strengths, ONE action in the first screen; step bar, no phone bottom bar)
//   → strength "看依据" → face atlas opens on that region → next step → report
//   → contents follow the reader · finding ↔ recommendation links both ways → report next → plan → studio
//   → phone width: no horizontal overflow, phone bottom bar kept, step bar hidden.
//
//   Web:  cd web && npm run build && npx next start -p 3100     (or NEXT_PUBLIC_USE_FIXTURE=1 npm run dev -- -p 3100)
//   Run:  node e2e/journey.mjs   (BASE=http://localhost:3100; CHROMIUM=<path> optional; SHOTS=<dir> to save screenshots)
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3100";
const SHOTS = process.env.SHOTS ?? null;
const fail = (msg) => { console.error("FAIL: " + msg); process.exit(1); };
const log = (msg) => console.log("ok  " + msg);

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: "zh-CN" });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const shot = async (name, full = false) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: full });
const inFold = async (loc, what) => {
  const b = await loc.boundingBox();
  if (!b) fail(`${what}: not rendered`);
  if (b.y < 0 || b.y + b.height > 900) fail(`${what}: not fully inside the first desktop screen (y=${Math.round(b.y)}, h=${Math.round(b.height)})`);
};
const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const current = () => page.locator('[data-testid="journey-bar"] a[aria-current="page"]').innerText();

// 1. landing: everything the first decision needs is on the first screen -------------------------------------------
await page.goto(BASE);
const primary = page.getByRole("link", { name: "上传一张正脸 · 免费" }).first();
await inFold(primary, "free-start CTA");
await inFold(page.getByTestId("landing-hero-sample"), "sample-report link");
await inFold(page.getByTestId("hero-privacy"), "privacy cues");
await inFold(page.getByTestId("hero-journey"), "understand → try → decide");
const card = page.getByTestId("hero-sample");
await inFold(card, "sample deliverable");
const cardText = await card.innerText();
if (!/合成人脸，非真人/.test(cardText) || !/不是实时分析结果/.test(cardText)) fail(`sample card is not labeled synthetic / not live: ${cardText.slice(0, 80)}`);
if (!/^\d+$/.test((await page.getByTestId("hero-score").innerText()).trim().split(/\s/)[0])) fail("sample card has no computed score");
await shot("landing");
log("landing: free start, sample link, privacy cues, 3 steps and the labeled synthetic deliverable are all in the first screen");

// 2. sample overview -----------------------------------------------------------------------------------------------
await page.getByTestId("hero-sample-open").click();
await page.waitForURL(/\/p\/ap_sample_0001$/);
await page.getByTestId("first-action").waitFor();
await inFold(page.getByTestId("score-glance"), "score summary");
await inFold(page.getByTestId("first-action"), "the one action");
const glance = await page.getByTestId("score-glance").innerText();
if (!/模型参考/.test(glance) || !/不是人群排名/.test(glance) || !/合成平均人脸/.test(glance)) fail(`score is not framed as a labeled model reference: ${glance}`);
if (await page.getByTestId("first-action").count() !== 1) fail("more than one primary action");
if ((await current()).replace(/\s+/g, "") !== "1概览") fail(`step bar: ${await current()}`);
if (await page.getByRole("navigation", { name: "护照导航" }).isVisible()) fail("the phone bottom bar is showing on desktop");
await shot("overview");
log("overview: score as a labeled model reference, strengths, and one action are in the first screen; step bar on, phone bar off");

// 3. strength → evidence (atlas region) → report --------------------------------------------------------------------
const basis = page.getByTestId("overview-strengths").getByRole("link", { name: "看依据" }).first();
const href = await basis.getAttribute("href");
const region = /#atlas-(\w+)$/.exec(href)?.[1];
if (!region) fail(`strength link has no atlas region: ${href}`);
await basis.click();
await page.waitForURL(/\/face#atlas-/);
await page.locator(`[data-atlas-region="${region}"]`).waitFor();
if ((await current()).replace(/\s+/g, "") !== "2面部证据") fail(`step bar on /face: ${await current()}`);
await shot("evidence");
log(`strength → /face opened on its own atlas region (${region})`);
await page.getByTestId("journey-next").getByRole("link", { name: /完整报告/ }).click();
await page.waitForURL(/\/report$/);
await page.getByTestId("full-report").waitFor();
if ((await current()).replace(/\s+/g, "") !== "3完整报告") fail(`step bar on /report: ${await current()}`);
log("face → next step → report");

// 4. report: summary strip, contents follow the reader, evidence ↔ recommendation ------------------------------------
await page.getByTestId("report-glance").waitFor();
await page.locator('[data-toc="improvements"]').click();
await page.waitForFunction(() => document.querySelector('[data-toc][aria-current="location"]')?.getAttribute("data-toc") === "improvements", null, { timeout: 8000 });
await page.waitForFunction(() => Math.abs(document.getElementById("improvements").getBoundingClientRect().top - 104) < 3, null, { timeout: 8000 });
if ((await page.evaluate(() => document.activeElement?.id)) !== "improvements-title") fail("keyboard focus did not follow the contents link");
const tocTop = await page.locator("#report-toc > div").boundingBox();
if (tocTop.y < 92) fail(`sticky contents hides under the header / step bar (y=${Math.round(tocTop.y)})`);
await shot("report-improvements");
const evidenceChip = page.locator('[data-testid^="rec-evidence-"] a').first();
const area = (await evidenceChip.getAttribute("href")).slice(1);
await evidenceChip.click();
await page.waitForFunction((id) => location.hash === `#${id}` && Math.abs(document.getElementById(id).getBoundingClientRect().top - 104) < 3, area, { timeout: 8000 });
const back = page.locator(`#${area} [data-testid^="region-recs-"] a`).first();
if (!(await back.count())) fail(`region ${area} lists no recommendation it supports`);
const rec = (await back.getAttribute("href")).slice(1);
await back.click();
await page.waitForFunction((id) => location.hash === `#${id}`, rec, { timeout: 8000 });
log(`recommendation → ${area} (its evidence) → ${rec} (a recommendation it supports); contents follow the reader, focus moves, sticky offset is clear of the bars`);

// 5. report → plan → studio -------------------------------------------------------------------------------------------
await page.getByTestId("report-next").getByRole("link", { name: /行动方案/ }).click();
await page.waitForURL(/\/plan$/);
await page.getByTestId("journey-next").waitFor();
if ((await current()).replace(/\s+/g, "") !== "5行动方案") fail(`step bar on /plan: ${await current()}`);
await page.getByTestId("journey-next").getByRole("link", { name: /形象实验室/ }).click();
await page.waitForURL(/\/studio$/);
if ((await current()).replace(/\s+/g, "") !== "6形象实验室") fail(`step bar on /studio: ${await current()}`);
log("report → plan → studio, each step marked in the step bar");

// 6. phone width: no horizontal scroll, phone bar kept, step bar hidden ---------------------------------------------
await page.setViewportSize({ width: 375, height: 812 });
for (const path of ["/", "/p/ap_sample_0001", "/p/ap_sample_0001/report", "/report/sample"]) {
  await page.goto(BASE + path);
  await page.waitForTimeout(600);
  const o = await overflow();
  if (o > 1) fail(`${path} overflows horizontally at 375 px by ${o}px`);
}
await page.goto(`${BASE}/p/ap_sample_0001`);
await page.getByTestId("first-action").waitFor();
if (!(await page.getByRole("navigation", { name: "护照导航" }).isVisible())) fail("the phone bottom bar is missing at 375 px");
if (await page.getByRole("navigation", { name: "浏览路径" }).isVisible()) fail("the desktop step bar shows at 375 px");
await shot("overview-375");
log("375 px: no horizontal overflow on landing, overview, report and sample report; bottom bar kept, step bar hidden");

if (errors.length) fail(`page errors: ${errors.slice(0, 3).join(" | ")}`);
await browser.close();
console.log("journey e2e passed");
