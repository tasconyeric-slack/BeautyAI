import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const base = process.env.BASE || 'http://localhost:3200';
const out = process.env.HERO_OUTPUT || '/tmp/beautyai-hero-review';
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/usr/bin/chromium', args: ['--no-sandbox'] });
const results = [];
try {
 for (const [width, height, name] of [[1440,900,'desktop'], [390,844,'mobile']]) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1, colorScheme: 'light' });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const response = await page.goto(`${base}/dev/hero`, { waitUntil: 'networkidle' });
  assert.equal(response.status(), 200);
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.locator('h1').textContent(), '看懂自己，风格由你。');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
  const photo = page.locator('figure img');
  assert.equal(await photo.evaluate(i => i.complete && i.naturalWidth === 1122 && i.naturalHeight === 1402), true);
  assert.match(await photo.getAttribute('src'), /person-002\/front.jpg$/);
  const overlay = page.locator('svg[data-metric="M006"]');
  assert.equal(await overlay.count(), 1);
  const drift = await page.evaluate(() => {
   const image = document.querySelector('figure img'), svg = document.querySelector('svg[data-metric]');
   const r = image.getBoundingClientRect(), W = image.naturalWidth, H = image.naturalHeight;
   const scale = Math.max(r.width/W, r.height/H);
   const p = new DOMPoint(.3274 * W, .5963 * H).matrixTransform(svg.getScreenCTM());
   return Math.hypot(p.x - (r.left + (r.width-W*scale)/2 + .3274*W*scale), p.y - (r.top+(r.height-H*scale)/2+.5963*H*scale));
  });
  assert.ok(drift < .1, `Photo/SVG crop drift: ${drift}px`);
  const start = page.getByRole('link', { name: '开始分析', exact: true }).filter({ visible: true }).first();
  assert.equal(await start.getAttribute('href'), '/start');
  const box = await start.boundingBox();
  assert.ok(box.y >= 0 && box.y + box.height <= height, 'Primary CTA is visible in requested viewport');
  assert.equal(await page.getByRole('link', { name: '示例报告', exact: true }).getAttribute('href'), '/report/sample?v=p002');
  await page.screenshot({ path: `${out}/hero-${name}.png` });
  const hold = page.getByRole('button', { name: '按住看原图' });
  await hold.focus();
  await page.keyboard.down('Space');
  assert.equal(await overlay.getAttribute('data-hidden'), 'true');
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${out}/hero-${name}-clean.png` });
  await page.keyboard.up('Space');
  assert.equal(await overlay.getAttribute('data-hidden'), 'false');
  const hb = await hold.boundingBox();
  await page.mouse.move(hb.x + hb.width/2, hb.y + hb.height/2);
  await page.mouse.down();
  assert.equal(await overlay.getAttribute('data-hidden'), 'true');
  await page.mouse.up();
  assert.equal(await overlay.getAttribute('data-hidden'), 'false');
  assert.deepEqual(errors, []);
  results.push({ viewport: [width,height], dpr: 1, errors, cropDriftPixels: drift, ctaWithinViewport: true, holdKeyboardAndPointer: 'pass' });
  await page.close();
 }
 const reduced = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
 await reduced.goto(`${base}/dev/hero`, { waitUntil: 'networkidle' });
 assert.equal(await reduced.locator('svg[data-metric]').evaluate(e => getComputedStyle(e).transitionDuration), '0s');
 await reduced.close();
 const check = await browser.newPage();
 for (const width of [320, 700, 701, 1024]) {
  await check.setViewportSize({ width, height: 900 });
  await check.goto(`${base}/dev/hero`, { waitUntil: 'networkidle' });
  assert.equal(await check.evaluate(() => document.documentElement.scrollWidth), width);
 }
 await fs.writeFile(`${out}/browser-verification.json`, JSON.stringify({ results, reducedMotion: 'pass', extraOverflowWidths: [320,700,701,1024] }, null, 2));
 console.log('PASS: requested viewports, exact portrait, M006 crop alignment, visible CTA, routes, hold mouse/keyboard, reduced motion and overflow.');
} finally { await browser.close(); }
