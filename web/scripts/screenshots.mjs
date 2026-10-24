// Screenshots for docs/screenshots and an end-to-end smoke run of the upload flow.
//
//   BASE_URL=http://localhost:3000 node scripts/screenshots.mjs
//   FLOW_PHOTOS=/path/with/front.jpg+profile45.jpg  → also drives /analyze → /passport/[id]
//
// Uses the Chromium preinstalled at /opt/pw-browsers when present (CHROMIUM_PATH overrides).
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, "../../docs/screenshots");
mkdirSync(out, { recursive: true });
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const exe = process.env.CHROMIUM_PATH ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const only = (process.env.ONLY ?? "").split(",").filter(Boolean);
const want = (name) => !only.length || only.includes(name);

const browser = await chromium.launch({ executablePath: exe });
const MOBILE = { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const DESKTOP = { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 };

async function shot(ctxOpts, path, file, { full = true, scheme = "light", before } = {}) {
  const ctx = await browser.newContext({ ...ctxOpts, colorScheme: scheme, locale: "zh-CN" });
  const page = await ctx.newPage();
  await page.goto(BASE + path, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  if (before) await before(page);
  await page.screenshot({ path: join(out, file), fullPage: full });
  console.log("wrote", file);
  await ctx.close();
}

if (want("sample")) {
  await shot(MOBILE, "/sample", "sample-375.png");
  await shot(DESKTOP, "/sample", "sample-desktop.png");
  await shot(DESKTOP, "/sample", "sample-desktop-dark.png", { scheme: "dark", full: false });
}
if (want("sections")) {
  // README-sized shots of individual report sections (desktop) and the first mobile screen.
  const ctx = await browser.newContext({ ...DESKTOP, deviceScaleFactor: 2, colorScheme: "light", locale: "zh-CN" });
  const page = await ctx.newPage();
  await page.goto(BASE + "/sample", { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.locator("article").first().screenshot({ path: join(out, "section-header.png") });
  for (const id of ["look", "top5", "hair", "color", "how"]) {
    await page.locator(`#${id}`).screenshot({ path: join(out, `section-${id}.png`) });
    console.log("wrote", `section-${id}.png`);
  }
  await ctx.close();
  await shot(MOBILE, "/sample", "sample-375-top.png", { full: false });
}

if (want("home")) {
  await shot(MOBILE, "/", "home-375.png");
  await shot(DESKTOP, "/", "home-desktop.png", { full: false });
}

if (process.env.FLOW_PHOTOS && want("flow")) {
  const dir = process.env.FLOW_PHOTOS;
  const ctx = await browser.newContext({ ...MOBILE, locale: "zh-CN" });
  const page = await ctx.newPage();
  await page.goto(BASE + "/analyze", { waitUntil: "networkidle" });
  for (const role of ["front", "profile45", ...(process.env.FLOW_OPTIONAL ?? "").split(",").filter(Boolean)]) {
    await page.setInputFiles(`input[aria-label="上传${{ front: "正脸", profile45: "45° 侧脸", smile: "微笑", hair: "平时的发型" }[role]}"]`, join(dir, `${role}.jpg`));
  }
  await page.waitForFunction(() => !document.body.innerText.includes("正在检查"), null, { timeout: 30000 });
  await page.screenshot({ path: join(out, "flow-1-photos-375.png"), fullPage: true });
  await page.getByRole("button", { name: "下一步" }).click();
  await page.getByRole("button", { name: /男性化表达/ }).click();
  await page.getByRole("button", { name: "发型", exact: true }).click();
  await page.getByRole("button", { name: "整体风格" }).click();
  await page.getByRole("button", { name: "干净" }).click();
  await page.getByRole("button", { name: "精致" }).click();
  await page.screenshot({ path: join(out, "flow-2-goals-375.png"), fullPage: true });
  await page.getByRole("button", { name: "下一步" }).click();
  await page.getByRole("button", { name: /约束/ }).click();
  await page.getByRole("checkbox").check();
  await page.screenshot({ path: join(out, "flow-3-constraints-375.png"), fullPage: true });
  await page.getByRole("button", { name: "生成我的形象护照" }).click();
  await page.waitForURL(/\/passport\/ap_/, { timeout: 30000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: join(out, "flow-4-progress-375.png") });
  await page.waitForSelector("text=优先改进", { timeout: 180000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(out, "flow-5-report-375.png") });
  console.log("flow ok:", page.url());
  await ctx.close();
}

await browser.close();
