// Visual + registration check for the dev-only homepage preview (/dev/home).
// BASE=http://localhost:3000 OUT=/tmp/home-preview node e2e/home-preview.mjs
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = process.env.OUT ?? "/tmp/home-preview";
mkdirSync(OUT, { recursive: true });

const HIDE_DEV = "nextjs-portal{display:none!important}";
const sizes = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];
const report = {};
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
try {
  for (const vp of sizes) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2 });
    await page.goto(`${BASE}/dev/home`, { waitUntil: "networkidle" });
    await page.addStyleTag({ content: HIDE_DEV });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(3600); // let the hero finish drawing
    await page.screenshot({ path: `${OUT}/hero-${vp.name}.png` });

    // Registration: a landmark drawn by the SVG must land on the same image pixel as the <img>.
    const drift = await page.evaluate(() => {
      const out = [];
      for (const [imgSel, svgSel] of [["section img", "section svg"], ["#reading img", "#reading svg[viewBox]"]]) {
        const img = document.querySelector(imgSel), svg = document.querySelector(svgSel);
        if (!img || !svg) continue;
        const vb = svg.viewBox.baseVal, r = img.getBoundingClientRect();
        const pt = svg.createSVGPoint(); pt.x = vb.width * 0.3; pt.y = vb.height * 0.6;
        const p = pt.matrixTransform(svg.getScreenCTM());
        const ix = r.left + (0.3 * r.width), iy = r.top + (0.6 * r.height);
        out.push({ imgSel, dx: +(p.x - ix).toFixed(3), dy: +(p.y - iy).toFixed(3) });
      }
      return out;
    });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

    await page.locator("#reading").scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollTo(0, document.querySelector("#reading").offsetTop + (window.innerWidth < 761 ? 300 : 96)));
    await page.waitForTimeout(2200);
    await page.screenshot({ path: `${OUT}/analysis-${vp.name}.png` });
    // Open the eye chapter: the camera should zoom in.
    const before = await page.locator("[class*=cam]").first().evaluate((e) => getComputedStyle(e).transform);
    await page.getByRole("button", { name: /眉眼|眼距/ }).first().click();
    await page.waitForTimeout(2200);
    const after = await page.locator("[class*=cam]").first().evaluate((e) => getComputedStyle(e).transform);
    await page.screenshot({ path: `${OUT}/analysis-eyes-${vp.name}.png` });
    report[vp.name] = { drift, overflow, cameraMoved: before !== after };
    await page.close();
  }
  // Reduced motion renders the final state immediately.
  const rm = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  await rm.goto(`${BASE}/dev/home`, { waitUntil: "networkidle" });
  await rm.addStyleTag({ content: HIDE_DEV });
  await rm.waitForTimeout(400);
  await rm.screenshot({ path: `${OUT}/hero-desktop-reduced-motion.png` });
  report.reducedMotion = await rm.evaluate(() => getComputedStyle(document.querySelector("h1").parentElement).animationName);
} finally {
  await browser.close();
}
console.log(JSON.stringify(report, null, 2));
