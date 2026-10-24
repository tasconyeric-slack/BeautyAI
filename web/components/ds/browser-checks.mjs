// Run against `next dev -p 3044`: node components/ds/browser-checks.mjs
// Production guard: BASE_URL=http://localhost:3045 node components/ds/browser-checks.mjs --production
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const base = process.env.BASE_URL ?? "http://localhost:3044";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 375, height: 812 }, colorScheme: "light", locale: "zh-CN", reducedMotion: "reduce" });
try {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const response = await page.goto(`${base}/dev/components`, { waitUntil: "networkidle" });
  if (process.argv.includes("--production")) {
    assert.equal(response.status(), 404, "Dev route must return an HTTP 404 in a production build");
    assert.equal(await page.locator(".ap-preview").count(), 0);
    console.log("PASS: production /dev/components returns 404 and contains no gallery");
  } else {
    assert.equal(response.status(), 200);
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.locator(".ap-preview").count(), 1);
    const compare = page.locator(".ap-compare");
    // D31: one control only — the preview by default, no segmented 原图 / 拖动对比 / 试看图 switch.
    for (const name of ["原图", "拖动对比", "试看图"]) assert.equal(await compare.getByRole("button", { name, exact: true }).count(), 0);
    assert.equal(await compare.locator(".ap-compare__original").count(), 0);
    const hold = compare.getByRole("button", { name: "按住看原图" });
    await hold.focus();
    await page.keyboard.down("Space");
    await compare.locator(".ap-compare__ai").waitFor({ state: "detached" });
    assert.equal(await hold.getAttribute("aria-pressed"), "true");
    assert.equal(await compare.locator(".ap-compare__ai").count(), 0);
    await page.keyboard.up("Space");
    await compare.locator(".ap-compare__ai").waitFor({ state: "visible" });
    assert.equal(await hold.getAttribute("aria-pressed"), "false");
    assert.equal(await compare.locator(".ap-compare__ai").count(), 1);
    assert.equal(await compare.getByRole("slider").count(), 0, "one comparison control only (D31)");
    await page.getByRole("button", { name: "不喜欢", exact: true }).click();
    const reason = page.getByRole("button", { name: "打理时间长", exact: true });
    await reason.click();
    assert.equal(await reason.getAttribute("aria-pressed"), "true");
    assert.match(await page.getByRole("status").innerText(), /打理时间长/);
    await reason.click();
    assert.equal(await reason.getAttribute("aria-pressed"), "false");
    await page.getByRole("button", { name: "喜欢", exact: true }).click();
    await reason.waitFor({ state: "detached" });
    assert.equal(await reason.count(), 0);
    await page.getByRole("button", { name: "像我", exact: true }).click();
    assert.equal(await page.getByRole("button", { name: "像我", exact: true }).getAttribute("aria-pressed"), "true");
    await page.getByRole("button", { name: "不太像", exact: true }).click();
    assert.equal(await page.getByRole("button", { name: "像我", exact: true }).getAttribute("aria-pressed"), "false");
    await page.getByRole("button", { name: "解锁完整护照" }).click();
    assert.match(await page.getByRole("status").innerText(), /解锁按钮已响应/);
    await page.getByRole("button", { name: "上线时告诉我" }).click();
    assert.match(await page.getByRole("status").innerText(), /通知意向/);
    assert.equal((await page.locator(".ap-score-teaser").innerText()).replace(/\s+/g, " "), "颜值评分 · 即将上线 上线时告诉我");
    assert.doesNotMatch(await page.locator(".ap-score-teaser").innerText(), /\d/);
    assert.equal(await page.locator(".ap-reveal__ready .ap-reveal__value").first().evaluate((element) => getComputedStyle(element).animationName), "none");
    for (const button of await page.locator(".ap-preview button").all()) {
      assert.ok((await button.innerText()).trim(), "Each button needs a visible name");
      const bounds = await button.boundingBox();
      assert.ok(bounds.height >= 44, `Touch target too short: ${await button.innerText()}`);
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "375px page must not overflow horizontally");
    await page.getByRole("button", { name: /深色阅读/ }).click();
    assert.equal(await page.locator(".ap-preview").getAttribute("data-ap-theme"), "dark");
    assert.equal(await page.locator(".ap-preview").evaluate((element) => getComputedStyle(element).backgroundColor), "rgb(25, 28, 30)");
    await page.getByRole("button", { name: /浅色阅读/ }).click();
    // Restore the neutral initial state for review screenshots.
    await page.getByRole("button", { name: "喜欢", exact: true }).click();
    await page.getByRole("button", { name: "不太像", exact: true }).click();
    await page.evaluate(() => { document.querySelector(".ap-preview__status").textContent = ""; });
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    const out = resolve(dirname(fileURLToPath(import.meta.url)), "screenshots");
    mkdirSync(out, { recursive: true });
    for (const width of [375, 1280]) {
      await page.setViewportSize({ width, height: width === 375 ? 812 : 900 });
      // Paint each region after changing viewport before a full-page capture.
      for (const section of await page.locator(".ap-preview__section").all()) await section.scrollIntoViewIfNeeded();
      await page.evaluate(() => scrollTo(0, 0));
      await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px page must not overflow`);
      await page.screenshot({ path: resolve(out, `components-${width}.png`), fullPage: true });
    }
    assert.deepEqual(errors, [], "Browser must not report runtime errors");
    console.log("PASS: keyboard/pointer compare, hold, reactions/reasons, resemblance, actions, dark mode, reduced motion, readable 44px buttons, no overflow at 375/1280, screenshots");
  }
} finally {
  await browser.close();
}
