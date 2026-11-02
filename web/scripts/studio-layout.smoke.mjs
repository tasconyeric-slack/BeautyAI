// Fixture-only regression: Studio's sticky tools must leave comparison accessible.
// NEXT_PUBLIC_USE_FIXTURE=1 npm run build && npm run start
// BASE_URL=http://localhost:3000 EVIDENCE_DIR=<outside Git> node scripts/studio-layout.smoke.mjs
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
const out = process.env.EVIDENCE_DIR;
assert.ok(out, 'Set EVIDENCE_DIR outside Git');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'chrome' : undefined });
try {
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    await ctx.addInitScript(() => sessionStorage.setItem('ap_fx:fx_layout', JSON.stringify({
      id: 'fx_layout', presentation: 'feminine', createdAt: Date.now() - 60000,
      context: {}, events: [], paid: true, previews: [], shareToken: null, deletedAt: null, derivedVersion: 1,
    })));
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${process.env.BASE_URL ?? 'http://localhost:3000'}/p/fx_layout/studio`);
    await page.getByTestId('studio-canvas').waitFor();
    await page.getByRole('radio', { name: /省心/ }).click();
    await page.evaluate(() => scrollTo(0, 600));
    const compare = page.getByRole('button', { name: '按住看原图', exact: true });
    const box = await compare.boundingBox();
    assert.ok(box && box.height >= 44, '44px comparison target');
    if (width < 768) {
      const tabs = await page.getByRole('tablist', { name: '造型工具' }).boundingBox();
      assert.ok(tabs.y >= box.y + box.height, 'sticky tabs leave comparison visible');
    } else {
      assert.equal(await page.locator('[class*=studioSaveAction]').evaluate(el => getComputedStyle(el).position), 'static');
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: join(out, `${width}-studio-controls.png`) });
    await page.getByRole('button', { name: '保存这个造型', exact: true }).click();
    assert.equal(await page.getByRole('tab', { name: '我的造型' }).getAttribute('aria-selected'), 'true');
    await page.reload();
    assert.ok(await page.evaluate(() => JSON.parse(localStorage.getItem('ap_choices:fx_layout')).looks.length));
    assert.deepEqual(errors, []);
    await ctx.close();
  }
  console.log('PASS: desktop/mobile comparison clearance, 44px target, unobstructed desktop save, save persistence, no overflow/runtime errors.');
} finally { await browser.close(); }
