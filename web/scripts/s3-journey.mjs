// Visual + positive-path acceptance on the existing fixture backend. No provider calls.
// NEXT_PUBLIC_USE_FIXTURE=1 npm run build; npm run start -- -p 3003
// BASE_URL=http://localhost:3003 EVIDENCE_DIR=... node scripts/s3-journey.mjs
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const base = process.env.BASE_URL ?? 'http://localhost:3003';
const evidence = process.env.EVIDENCE_DIR;
assert.ok(evidence, 'Set EVIDENCE_DIR outside Git');
mkdirSync(evidence, { recursive: true });
const art = readFileSync(new URL('../public/sample/portrait.svg', import.meta.url), 'utf8');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const results = [];
try {
  for (const [name, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ viewport, colorScheme: 'light' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.setDefaultTimeout(20000);
    const shot = async suffix => { await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: join(evidence, `${name}-${suffix}.png`), fullPage: true, animations: 'disabled' }); };
    await page.goto(`${base}/start`);
    await shot('consent');
    for (const check of await page.getByRole('checkbox').all()) await check.check();
    await page.getByRole('button', { name: /同意并选择照片/ }).click();
    await page.getByRole('button', { name: '角度', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: '角度', exact: true }).getAttribute('aria-pressed'), 'true');
    await page.getByRole('button', { name: '合格', exact: true }).click();
    await shot('upload');
    const png = await page.evaluate(async svg => {
      const im = new Image(); im.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`; await im.decode();
      const c = document.createElement('canvas'); c.width = 600; c.height = 750; c.getContext('2d').drawImage(im, 0, 0, 600, 750);
      return c.toDataURL('image/png').split(',')[1];
    }, art);
    await page.getByLabel('选择照片 · 正脸照', { exact: true }).setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
    await page.getByTestId('framing-editor').waitFor();
    await page.getByRole('button', { name: '保留原图', exact: true }).click();
    await page.getByTestId('framing-confirm').click();
    await page.locator('[data-slot="front"] [data-qc="ok"]').waitFor();
    await page.getByRole('button', { name: /女性化/ }).click();
    await page.getByRole('button', { name: '开始分析', exact: true }).click();
    await page.waitForURL(/\/p\/fx_[^/]+\/report$/);
    const id = new URL(page.url()).pathname.split('/')[2];
    await page.getByTestId('full-report').waitFor();
    await page.reload();
    await page.getByTestId('full-report').waitFor();
    await page.getByRole('radio', { name: /省心/ }).click();
    await page.getByRole('button', { name: '加入我的方案', exact: true }).first().click();
    await page.locator(`a[href="/p/${id}/studio?hair=easy"]`).first().click();
    await page.getByRole('tab', { name: '发型与发色' }).waitFor();
    await page.getByTestId('studio-canvas').waitFor();
    await shot('studio-hair');
    await page.getByRole('tab', { name: '妆容与配色' }).click();
    await shot('studio-colors');
    await page.getByRole('tab', { name: '眼镜', exact: true }).click();
    await page.getByRole('tab', { name: '发型与发色' }).click();
    await page.getByRole('button', { name: '保存这个造型', exact: true }).click();
    assert.equal(await page.getByRole('tab', { name: '我的造型' }).getAttribute('aria-selected'), 'true');
    const choices = await page.evaluate(id => JSON.parse(localStorage.getItem(`ap_choices:${id}`)), id);
    assert.equal(choices.hair.tier, 'easy'); assert.equal(choices.looks[0].hair, 'easy');
    await page.goto(`${base}/p/${id}/plan`);
    await page.getByTestId('intervention-hair-easy').waitFor();
    await page.getByTestId('intervention-hair-easy').getByRole('button', { name: '标记完成', exact: true }).click();
    await shot('plan');
    await page.reload();
    assert.equal(await page.getByTestId('intervention-hair-easy').getByRole('button', { name: '已完成', exact: true }).getAttribute('aria-pressed'), 'true');
    await page.getByRole('link', { name: '在实验室打开', exact: true }).first().click();
    await page.waitForURL(/\/studio\?.*look=/);
    assert.ok(new URL(page.url()).searchParams.get('look'));
    await page.getByRole('radio', { name: /省心/ }).waitFor();
    assert.equal(await page.getByRole('radio', { name: /省心/ }).getAttribute('aria-checked'), 'true');
    await page.goto(`${base}/p/${id}/unlock`);
    await page.getByText('当前为免费护照', { exact: true }).waitFor();
    await page.getByText(/模拟支付，不会扣款/).waitFor();
    await shot('unlock-free');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.getByRole('button', { name: /¥39/ }).click(); // existing fake checkout, no charge
    await page.getByRole('heading', { name: '完整护照已解锁', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: /¥39/ }).count(), 0);
    await shot('unlock-paid');
    await page.getByRole('link', { name: '去实验室生成发型试看', exact: true }).click();
    await page.getByRole('radio', { name: /省心/ }).click();
    await page.getByRole('button', { name: '生成这个造型', exact: true }).click();
    await page.getByText('AI 发型模拟已叠加', { exact: true }).waitFor();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const motion = await page.evaluate(() => {
      const elements = ['animate-spin', 'animate-pulse', 'transition-colors'].map(className => {
        const element = document.createElement('button');
        element.className = className;
        document.body.append(element);
        const style = getComputedStyle(element);
        const result = { className, animationDuration: style.animationDuration, transitionDuration: style.transitionDuration };
        element.remove();
        return result;
      });
      return { reduced: matchMedia('(prefers-reduced-motion: reduce)').matches, elements };
    });
    assert.ok(motion.reduced);
    for (const item of motion.elements) {
      for (const duration of [...item.animationDuration.split(','), ...item.transitionDuration.split(',')]) {
        assert.ok(parseFloat(duration) * (duration.trim().endsWith('ms') ? 1 : 1000) <= 0.01, `${item.className}: ${duration}`);
      }
    }
    const previewDetails = page.locator('details').filter({ has: page.getByText('关于预览与照片', { exact: true }) });
    await previewDetails.locator('summary').click();
    assert.ok(await previewDetails.locator('p').isVisible(), 'Reduced-motion disclosure remains visible');
    const settingsButton = page.getByRole('button', { name: /我的选择与数据.*删除数据/ });
    await settingsButton.click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    await page.waitForFunction(() => document.querySelector('[role="dialog"]')?.contains(document.activeElement));
    const inside = () => dialog.evaluate(el => el.contains(document.activeElement));
    assert.ok(await inside(), 'Settings receives focus');
    const tabbables = dialog.locator('a[href], button:not([disabled])');
    const tabCount = await tabbables.count();
    await tabbables.last().focus();
    await page.keyboard.press('Tab');
    assert.ok(await tabbables.first().evaluate(el => el === document.activeElement), 'Tab wraps to first settings control');
    await page.keyboard.press('Shift+Tab');
    assert.ok(await tabbables.last().evaluate(el => el === document.activeElement), 'Shift+Tab wraps to last settings control');
    for (let tab = 0; tab <= tabCount; tab++) { await page.keyboard.press('Tab'); assert.ok(await inside()); }
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    assert.ok(await settingsButton.evaluate(el => el === document.activeElement), 'Escape restores settings trigger focus');
    writeFileSync(join(evidence, `${name}-interaction.json`), JSON.stringify({ motion, settingsFocusLoop: true, escapeRestoresFocus: true, disclosureVisible: true }, null, 2));
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const routes = [];
    for (const suffix of ['', '/face', '/color', '/style', '/detail', '/advice', '/hair', '/makeup', '/outfit', '/glasses', '/more', '/share', '/compare', '/plan']) {
      const response = await page.goto(`${base}/p/${id}${suffix}`);
      await page.locator('main').waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.getByRole('button', { name: /我的选择与数据.*删除数据/ }).waitFor();
      const metrics = await page.evaluate(() => ({
        width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
        headings: [...document.querySelectorAll('h1')].map(h => h.textContent),
        background: getComputedStyle(document.body).backgroundColor,
      }));
      routes.push({ suffix, status: response.status(), ...metrics });
      assert.equal(response.status(), 200, `${name}: ${suffix} status`);
      assert.ok(metrics.scrollWidth <= metrics.width, `${name}: ${suffix} horizontal overflow ${metrics.scrollWidth}/${metrics.width}`);
      if (suffix === '/advice') {
        const adjust = page.getByRole('button', { name: '调整', exact: true });
        await adjust.click();
        const adjustment = page.getByRole('dialog');
        const minutes = adjustment.locator('fieldset').first();
        const initialMinute = await minutes.locator('[aria-pressed="true"]').innerText();
        await minutes.locator('[aria-pressed="false"]').first().click();
        assert.notEqual(await minutes.locator('[aria-pressed="true"]').innerText(), initialMinute);
        for (const control of await adjustment.getByRole('button').all()) {
          assert.ok((await control.boundingBox()).height >= 44, 'Adjustment controls have a 44px touch height');
        }
        await page.keyboard.press('Escape');
        await adjustment.waitFor({ state: 'hidden' });
        assert.ok(await adjust.evaluate(el => el === document.activeElement));
        await adjust.click();
        assert.equal(await minutes.locator('[aria-pressed="true"]').innerText(), initialMinute, 'Dismissed adjustments do not persist');
        await page.keyboard.press('Escape');
        routes.at(-1).adjustmentCancelRestores = true;
      }
      if (['/face', '/color', '/advice'].includes(suffix)) await shot(`route-${suffix.slice(1)}`);
    }
    writeFileSync(join(evidence, `${name}-routes.json`), JSON.stringify(routes, null, 2));
    await page.goto(`${base}/report/sample`);
    await page.getByTestId('full-report').waitFor();
    assert.equal(await page.locator('a[href^="/p/"]').count(), 0);
    assert.deepEqual(errors, []);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    results.push({ viewport, name, path: 'upload → crop/QC fixture → job → R2 → tabs → save → plan → complete → reload → restore → fake checkout → fixture generation → read-only sample', passed: true, realProvider: false, errors });
    await context.close();
  }
  const gallery = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await gallery.goto(new URL('../../docs/design/QC_TEACHING.html', import.meta.url).href);
  await gallery.screenshot({ path: join(evidence, 'qc-teaching.png'), fullPage: true });
  await gallery.close();
  writeFileSync(join(evidence, 'journey.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally { await browser.close(); }
