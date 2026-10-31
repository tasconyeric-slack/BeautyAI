// Regression smoke: synthetic fixture only, no model/API calls or uploaded photographs.
// BASE_URL=http://localhost:3028 node scripts/report-studio.smoke.mjs
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
const base = process.env.BASE_URL ?? 'http://localhost:3028';
const out = resolve('../runs/report-studio-qa');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined });
try {
  for (const width of [1280, 375]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: 'dark', reducedMotion: 'reduce' });
    await ctx.addInitScript(() => sessionStorage.setItem('ap_fx:fx_unified_qa', JSON.stringify({
      id: 'fx_unified_qa', presentation: 'feminine', createdAt: Date.now() - 60000,
      context: {}, events: [], paid: true, previews: [], shareToken: null, deletedAt: null, derivedVersion: 1,
    })));
    const page = await ctx.newPage();
    page.on('pageerror', e => console.log('PAGE ERROR', e.message));
    const nav = page.getByRole('navigation', { name: width < 768 ? '护照导航' : '浏览路径' });
    for (const [suffix, parent] of [['', '报告'], ['/face', '报告'], ['/advice', '报告'], ['/plan', '报告'], ['/studio', 'Studio']]) {
      await page.goto(`${base}/p/fx_unified_qa${suffix}`);
      await nav.waitFor({ timeout: 15000 }).catch(async e => { console.log((await page.locator('body').innerText()).slice(0, 1800)); await page.screenshot({path: resolve(out, 'failure.png')}); throw e; });
      assert.deepEqual(await nav.getByRole('link').allTextContents(), ['报告', 'Studio']);
      assert.equal(await nav.locator('[aria-current=page]').textContent(), parent);
      assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
      assert.equal(await page.locator('body').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(241, 241, 238)');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}${suffix} overflows`);
      if (suffix === '') await page.locator('[data-chapter=overview]').waitFor();
      if (suffix === '/studio') {
        const controls = page.locator('[data-studio-controls]');
        await controls.waitFor();
        assert.equal(await controls.evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(250, 250, 247)');
        await page.getByRole('tab', { name: '妆容与配色' }).click();
        assert.equal(await page.getByRole('tab', { name: '妆容与配色' }).getAttribute('aria-selected'), 'true');
      }
      await page.screenshot({ path: resolve(out, `${width}-${suffix.slice(1) || 'report'}.png`), fullPage: false });
    }
    await ctx.close();
  }
  console.log('PASS: report completion, detail ownership, two-entry navigation, light theme under dark OS, Studio controls/tabs, no horizontal overflow at 375/1280.');
  console.log(`Synthetic screenshots: ${out}`);
} finally { await browser.close(); }

