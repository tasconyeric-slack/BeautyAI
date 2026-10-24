// Issue #33 critical path (no API needed: sample passports always run on fixtures):
//   landing → full sample report (7 chapters, real sample numbers, labeled illustrations)
//   → sample profile → report (free view: scope + locked parts) → paywall (accurate scope, sample link)
//   → unlock (fake payment) → report (full: plan columns, no locks).
//
//   Web:  cd web && npm run build && npx next start -p 3100
//   Run:  node e2e/report.mjs   (BASE=http://localhost:3100; CHROMIUM=<path> optional; SHOTS=<dir> to save screenshots)
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3100";
const SHOTS = process.env.SHOTS ?? null;
const fail = (msg) => { console.error("FAIL: " + msg); process.exit(1); };
const log = (msg) => console.log("ok  " + msg);

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const shot = async (name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });

// 1. landing → sample report
await page.goto(BASE);
await page.getByTestId("landing-report-preview").waitFor();
await shot("landing");
await page.getByTestId("landing-sample-report").click();
await page.waitForURL(/\/report\/sample$/);
await page.getByTestId("full-report").waitFor();
const chapters = await page.locator("[data-chapter]").evaluateAll((els) => els.map((e) => e.getAttribute("data-chapter")));
if (chapters.join() !== "overview,findings,interpretation,improvements,options,plan,methods") fail(`chapters: ${chapters}`);
const score = await page.getByTestId("score-value").innerText();
if (!/^\d+$/.test(score)) fail(`score: ${score}`);
await page.getByTestId("region-figure").first().waitFor({ timeout: 10000 });
const figures = await page.getByTestId("region-figure").count();
if (figures < 4) fail(`region figures: ${figures}`);
const previews = await page.locator("[data-hair]").evaluateAll((els) => els.map((e) => e.getAttribute("data-preview")));
if (previews.some((p) => p !== "illustration")) fail(`sample previews: ${previews}`);
await shot("sample-report");
log(`sample report: 7 chapters, score ${score}, ${figures} region crops, hair = ${previews.join("/")}`);

// 2. sample profile → report (free view)
await page.goto(`${BASE}/p/ap_sample_0001`);
await page.getByTestId("open-report").click();
await page.waitForURL(/\/p\/ap_sample_0001\/report$/);
await page.getByTestId("full-report").waitFor();
if ((await page.getByTestId("full-report").getAttribute("data-paid")) !== "0") fail("expected the free view");
await page.getByTestId("report-free-scope").waitFor();
const locked = await page.locator('[data-testid^="region-locked-"]').count();
if (!locked) fail("free view shows no withheld measurements");
const freePreviews = await page.locator("[data-hair]").evaluateAll((els) => els.map((e) => e.getAttribute("data-preview")));
if (freePreviews.some((p) => p !== "locked")) fail(`free previews: ${freePreviews}`);
if (await page.getByTestId("report-plan-full").count()) fail("free view shows the full plan");
await shot("free-report");
log(`free report: ${locked} regions with withheld details, hair try-on locked, plan locked`);

// 3. paywall: accurate free scope + link to the sample report, then the fake payment
await page.getByTestId("report-free-scope").getByRole("link", { name: /解锁完整护照/ }).click();
await page.waitForURL(/\/unlock$/);
const scope = await page.getByTestId("free-scope").innerText();
if (/稳妥发型试看/.test(scope) || !/没有免费次数/.test(scope)) fail(`paywall scope: ${scope}`);
await page.getByTestId("paywall-sample-report").waitFor();
await page.getByTestId("entitlement-table").waitFor();
await shot("paywall");
await page.getByRole("button", { name: /一次解锁/ }).click();
await page.getByRole("link", { name: "阅读完整评估报告" }).click();
await page.waitForURL(/\/report$/);
await page.waitForFunction(() => document.querySelector('[data-testid="full-report"]')?.getAttribute("data-paid") === "1");
await page.getByTestId("report-plan-full").waitFor();
if (await page.getByTestId("report-free-scope").count()) fail("paid report still shows the free scope");
await shot("paid-report");
log("unlock → full report with the time-based plan");

// 4. phone width: no horizontal scroll
await page.setViewportSize({ width: 375, height: 812 });
await page.goto(`${BASE}/report/sample`);
await page.getByTestId("full-report").waitFor();
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
if (overflow > 1) fail(`horizontal overflow at 375 px: ${overflow}px`);
await shot("sample-report-375");
log("375 px: no horizontal overflow");

if (errors.length) fail(`page errors: ${errors.join(" | ")}`);
await browser.close();
console.log("PASS report critical path");
