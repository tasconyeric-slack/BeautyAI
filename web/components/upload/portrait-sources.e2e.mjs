// Synthetic functional journey against a local fake-provider API (QC_MODE=stub).
// RUNS_DIR must point to that disposable test API's directory. The only seeded geometry
// is the committed geometry matching the exact synthetic illustration we upload.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const base = process.env.BASE_URL ?? 'http://localhost:3000';
const api = process.env.API_BASE ?? 'http://localhost:8000';
const runs = process.env.RUNS_DIR;
assert.ok(runs, 'Use a disposable test API and set RUNS_DIR');
const root = new URL('../../', import.meta.url);
const art = readFileSync(new URL('public/sample/portrait.svg', root), 'utf8');
const geometry = readFileSync(new URL('lib/fixtures/sample_geometry.json', root), 'utf8');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
  const errors = [], mediaLoads = [], generations = [];
  page.setDefaultTimeout(15000);
  page.setDefaultNavigationTimeout(30000);
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => {
    if (r.url().includes('/api/media/')) mediaLoads.push(r.url());
    if (r.method() === 'POST' && r.url().endsWith('/previews')) generations.push(r.postDataJSON());
  });
  await page.goto(`${base}/start`);
  for (const cb of await page.getByRole('checkbox').all()) await cb.check();
  await page.getByRole('button', { name: /同意并选择照片/ }).click();
  const images = await page.evaluate(async svg => {
    const image = new Image(); image.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
    await image.decode();
    const c = document.createElement('canvas'); c.width = 600; c.height = 750;
    const ctx = c.getContext('2d'); ctx.drawImage(image, 0, 0);
    const front = c.toDataURL('image/png').split(',')[1];
    // Deliberately different pixels at the eyes distinguish the daily-eyewear base.
    ctx.strokeStyle = '#080808'; ctx.lineWidth = 9;
    ctx.strokeRect(192, 355, 90, 63); ctx.strokeRect(318, 355, 90, 63);
    ctx.beginPath(); ctx.moveTo(282, 377); ctx.lineTo(318, 377); ctx.stroke();
    return { front, glasses: c.toDataURL('image/png').split(',')[1] };
  }, art);
  for (const [role, label] of [['front', '正脸照'], ['glasses', '日常眼镜参考照']]) {
    await page.getByLabel(`选择照片 · ${label}`, { exact: true }).setInputFiles({ name: `${role}.png`, mimeType: 'image/png', buffer: Buffer.from(images[role], 'base64') });
    await page.getByTestId('framing-editor').waitFor();
    await page.getByRole('button', { name: '保留原图', exact: true }).click();
    await page.getByTestId('framing-confirm').click();
    await page.getByTestId('framing-editor').waitFor({ state: 'hidden' });
    await page.locator(`[data-slot="${role}"] [data-qc="ok"]`).waitFor();
  }
  await page.getByRole('button', { name: /女性化/ }).click();
  const created = page.waitForResponse(r => r.request().method() === 'POST' && r.url() === `${api}/api/passport`);
  await page.getByRole('button', { name: '开始分析', exact: true }).click();
  const id = (await (await created).json()).id;
  await page.waitForURL(`**/p/${id}`);
  let response;
  for (let attempt = 0; attempt < 100; attempt++) {
    response = await (await page.request.get(`${api}/api/passport/${id}`)).json();
    if (response.status === 'full_ready') break;
    assert.notEqual(response.status, 'failed');
    await new Promise(r => setTimeout(r, 100));
  }
  assert.equal(response.status, 'full_ready');
  assert.ok(response.media.photos.glasses);
  assert.deepEqual(response.partial.input_quality.photos.map(p => p.photo_id), ['front']);
  // QC stub does not invent geometry: seed only this synthetic illustration's own geometry.
  writeFileSync(join(runs, id, 'media', 'geometry.json'), geometry);
  await page.goto(`${base}/p/${id}/report`);
  await page.getByRole('heading', { name: '完整面部评估报告', exact: true }).waitFor();
  await page.goto(`${base}/p/${id}/studio`);
  await page.getByTestId('studio-canvas').waitFor();
  const fingerprint = () => page.getByTestId('studio-canvas').evaluate(c => c.toDataURL());
  const original = await fingerprint();
  await page.getByRole('radio', { name: '日常眼镜参考照', exact: true }).click();
  await page.getByText('当前使用日常戴镜照', { exact: false }).waitFor();
  await page.waitForFunction(before => document.querySelector('[data-testid="studio-canvas"]')?.toDataURL() !== before, original);
  assert.ok(mediaLoads.some(url => url.endsWith('/glasses.jpg')));
  await page.getByRole('radio', { name: '圆框', exact: true }).click();
  await page.getByText('试戴新镜框已切换', { exact: false }).waitFor();
  await page.waitForFunction(() => document.querySelector('[data-testid="studio-canvas"]')?.width === 600);
  await page.getByRole('button', { name: '重置眼镜', exact: true }).click();
  await page.getByText('当前使用日常戴镜照', { exact: false }).waitFor();
  assert.equal(generations.length, 0, 'local frame controls never request generation');
  // Fake checkout unlocks the existing paid path; no provider credentials or real payment used.
  assert.equal((await page.request.post(`${api}/api/checkout`, { data: { passport_id: id } })).status(), 200);
  await page.reload();
  await page.getByRole('radio', { name: '日常眼镜参考照', exact: true }).click();
  await page.getByRole('radiogroup', { name: '发型', exact: true }).getByRole('radio').nth(1).click();
  const generated = page.waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith('/previews'));
  await page.getByRole('button', { name: '生成这个造型', exact: true }).click();
  await generated;
  assert.ok(generations[0].target_ids[0].endsWith('_srcglasses'));
  await page.getByRole('radio', { name: '分析正脸照', exact: true }).click();
  await page.getByText('发型尚未生成', { exact: false }).waitFor();
  assert.equal((await page.request.delete(`${api}/api/passport/${id}`)).status(), 200);
  assert.equal((await page.request.get(`${api}${response.media.photos.glasses}`)).status(), 410);
  await page.reload();
  assert.deepEqual(errors, []);
  console.log('PASS: guest consent + framing + front/daily upload → report → Studio source toggle → frames use glasses-free base → paid hair request uses daily source → old base does not reuse crop → deletion. Synthetic functional check; no live image quality claim.');
} finally { await browser.close(); }
