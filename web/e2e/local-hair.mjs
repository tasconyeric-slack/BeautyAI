// Real browser + real mask route, no image generation. Start API/web first; pass a consented PHOTO or existing ID.
// PHOTO=/path/to/front.jpg BASE=http://localhost:3100 CHROMIUM=/usr/bin/chromium node e2e/local-hair.mjs
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
const BASE = process.env.BASE ?? 'http://localhost:3100', API = process.env.API ?? 'http://localhost:8000';
const output = process.env.OUT;
let id = process.env.ID;
if (!id) {
  assert.ok(process.env.PHOTO, 'Pass PHOTO (an approved portrait) or an existing ID.');
  const form = new FormData();
  form.set('consent', 'true'); form.set('context', JSON.stringify({ user_context: { presentation: 'feminine' } }));
  form.set('front', new Blob([readFileSync(process.env.PHOTO)]), 'front.jpg');
  const created = await fetch(`${API}/api/passport`, { method: 'POST', body: form });
  assert.equal(created.status, 202, await created.clone().text()); id = (await created.json()).id;
  for (let attempt = 0; attempt < 60; attempt++) {
    const response = await fetch(`${API}/api/passport/${id}`), body = await response.json();
    if (body.status === 'full_ready') break;
    assert.ok(!['analysis_failed', 'qc_failed'].includes(body.status), body.status);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
try {
  const page = await browser.newPage({ viewport: { width: 1360, height: 1000 } });
  const errors = [], requests = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('request', r => { if (r.url().startsWith(API)) requests.push({ url: r.url(), method: r.method() }); });
  await page.goto(`${BASE}/p/${id}/studio`);
  await page.getByRole('radio', { name: '自然黑', exact: true }).waitFor();
  await page.waitForFunction(() => ![...document.querySelectorAll('button')].find(b => b.textContent === '自然黑')?.disabled);
  const canvas = page.getByTestId('studio-canvas');
  const pixels = () => canvas.evaluate(c => [...c.getContext('2d').getImageData(0, 0, c.width, c.height).data]);
  const before = await pixels();
  if (output) { mkdirSync(output, { recursive: true }); writeFileSync(join(output, 'before.png'), Buffer.from((await canvas.evaluate(c => c.toDataURL())).split(',')[1], 'base64')); }
  const warm = requests.length, distinct = new Set(), timings = [];
  const names = ['自然黑', '柔黑', '蓝黑', '浓咖', '巧克力', '栗棕', '焦糖棕', '蘑菇灰棕', '赤褐', '酒红'];
  for (const name of names) {
    const start = performance.now();
    await page.getByRole('radio', { name, exact: true }).last().click();
    const after = await canvas.evaluate(c => c.toDataURL());
    timings.push(performance.now() - start); distinct.add(after);
  }
  assert.equal(distinct.size, 10, 'ten shades must give ten distinct images');
  assert.equal(requests.filter(r => r.method === 'POST' && r.url.includes('/previews')).length, 0);
  assert.equal(requests.length, warm, 'warm swatches must make zero API requests');
  const after = await pixels(); assert.notDeepEqual(after, before);
  const hold = page.getByRole('button', { name: /按住看原图/ });
  await hold.dispatchEvent('pointerdown', { pointerId: 1 });
  assert.deepEqual(await pixels(), before);
  await hold.dispatchEvent('pointerup', { pointerId: 1 });
  assert.deepEqual(await pixels(), after);
  if (output) {
    writeFileSync(join(output, 'burgundy.png'), Buffer.from((await canvas.evaluate(c => c.toDataURL())).split(',')[1], 'base64'));
    await page.screenshot({ path: join(output, 'studio-desktop.png'), fullPage: true });
  }
  await page.getByRole('radio', { name: '米金', exact: true }).click();
  await page.getByText(/approximate visualization/).waitFor();
  await page.getByRole('slider', { name: '发色强度' }).fill('45');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  const saved = await pixels();
  const stored = await page.evaluate(id => JSON.parse(localStorage.getItem(`ap_choices:${id}`)), id);
  assert.equal(stored.looks[0].hairHex, '#D6BF91'); assert.equal(stored.looks[0].hairStrength, 0.45);
  assert.ok(!JSON.stringify(stored).includes('data:image'));
  await page.getByRole('button', { name: '重置全部' }).click(); assert.deepEqual(await pixels(), before);
  await page.getByRole('button', { name: '撤销', exact: true }).click(); assert.deepEqual(await pixels(), saved);
  await page.getByRole('button', { name: '重置全部' }).click();
  await page.getByRole('button', { name: stored.looks[0].name, exact: true }).click();
  assert.deepEqual(await pixels(), saved);
  // Saved shade parameters survive navigation; image and mask pixels are fetched fresh after reload.
  await page.reload();
  await page.waitForFunction(() => ![...document.querySelectorAll('button')].find(b => b.textContent === '自然黑')?.disabled);
  await page.getByRole('button', { name: stored.looks[0].name, exact: true }).click();
  assert.deepEqual(await pixels(), saved);
  await page.setViewportSize({ width: 375, height: 812 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'mobile overflow');
  if (output) await page.screenshot({ path: join(output, 'studio-mobile.png'), fullPage: true });
  // The open tab must lose its pixel canvas at the photo TTL, without waiting for another server poll.
  await page.route(`${API}/api/passport/${id}`, async route => {
    const response = await route.fetch(); const body = await response.json();
    body.media.expires_at = new Date(Date.now() + 1500).toISOString();
    await route.fulfill({ response, json: body });
  });
  await page.reload();
  await page.getByText('照片已按隐私规则在 24 小时后删除。实验室需要你的正脸照片，可以重新上传一张再试。').waitFor();
  assert.equal(await canvas.count(), 0);
  assert.equal(await page.getByRole('radio', { name: '自然黑', exact: true }).isDisabled(), true);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ id, distinctShades: distinct.size, qwenRequests: 0, warmApiRequests: 0,
    clickToReadMs: timings.map(n => Math.round(n)), saveUndoResetReload: 'passed', mobile: 'passed', openTabExpiry: 'passed' }));
} finally { await browser.close(); }
