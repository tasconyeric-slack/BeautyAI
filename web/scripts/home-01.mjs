// Fixture production acceptance; screenshots/results stay outside Git.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
const base = process.env.BASE_URL ?? 'http://localhost:3003';
const evidence = process.env.EVIDENCE_DIR;
assert.ok(evidence, 'Set EVIDENCE_DIR outside Git');
mkdirSync(evidence, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const results = [];
try {
  for (const [width, height, reducedMotion] of [[1440, 1000, 'no-preference'], [1024, 768, 'no-preference'], [390, 844, 'no-preference'], [320, 568, 'reduce']]) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion, colorScheme: 'light' });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    assert.equal((await page.goto(base)).status(), 200);
    await page.evaluate(() => document.fonts.ready);
    await page.getByRole('heading', { level: 1, name: /读懂这张脸/ }).waitFor();
    for (const id of ['reading', 'choices', 'passport', 'studio', 'how-it-works', 'start-analysis']) {
      const section = page.locator(`#${id}`); await section.scrollIntoViewIfNeeded();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, `${width} / ${id} overflow`);
      const clipped = await section.locator('h2,button,a,dt').evaluateAll(els => els.filter(e => e.clientWidth && e.scrollWidth > e.clientWidth + 2).map(e => e.textContent));
      assert.deepEqual(clipped, [], `${width} / ${id} clipped text`);
    }
    const guide = page.getByRole('complementary', { name: '拍照指引' });
    const angle = guide.getByRole('button', { name: '角度', exact: true });
    await angle.focus(); await angle.press('Enter');
    assert.equal(await angle.getAttribute('aria-pressed'), 'true');
    await guide.getByRole('heading', { name: '正脸平视，侧脸选填' }).waitFor();
    await page.getByText('照片会保存多久？', { exact: true }).click();
    assert.ok(await page.locator('#start-analysis details[open]').getByText(/其余照片在任务结束后立即删除/).isVisible());
    if (reducedMotion === 'reduce') {
      assert.equal(await guide.locator('img').evaluate(el => getComputedStyle(el).animationName), 'none');
      assert.equal(await page.locator('section[data-view]').getAttribute('data-view'), 'front');
    }
    for (const id of ['passport', 'studio', 'how-it-works', 'start-analysis']) {
      await page.locator(`#${id}`).screenshot({ path: join(evidence, `${width}-${id}.png`), animations: 'disabled' });
    }
    await page.screenshot({ path: join(evidence, `${width}-home.png`), fullPage: true, animations: 'disabled' });
    const chapterLinks = await page.getByRole('list', { name: '示例报告七章目录' }).getByRole('link').evaluateAll(as => as.map(a => a.getAttribute('href')));
    assert.equal(chapterLinks.length, 7);
    await page.goto(`${base}/report/sample?v=p001`);
    await page.getByTestId('full-report').waitFor();
    for (const href of chapterLinks) assert.equal(await page.locator(href.slice(href.indexOf('#'))).count(), 1, href);
    assert.equal(await page.locator('a[href^="/p/"]').count(), 0, 'Sample must stay read-only');
    await page.goto(base);
    await page.getByRole('link', { name: '开始我的分析', exact: true }).click();
    await page.waitForURL('**/start');
    await page.getByRole('checkbox').first().waitFor();
    assert.deepEqual(errors, []);
    results.push({ width, height, reducedMotion, errors, passed: true });
    await page.close();
  }
  writeFileSync(join(evidence, 'home-01.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally { await browser.close(); }
