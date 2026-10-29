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
