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
const fullSite = process.env.FULL_SITE === '1';
const captures = [];
try {
  for (const [name, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ viewport, colorScheme: 'light' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.setDefaultTimeout(20000);
    const shot = async suffix => {
      await page.evaluate(() => document.fonts.ready);
      if (fullSite) {
        await page.locator('img').evaluateAll(async images => {
          for (const image of images) image.loading = 'eager';
          await Promise.all(images.map(image => image.decode().catch(() => {})));
        });
        for (const element of await page.locator('[data-reveal]').all()) await element.scrollIntoViewIfNeeded();
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      }
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({ path: join(evidence, `${name}-${suffix}.png`), fullPage: true, animations: 'disabled' });
      if (fullSite) {
        await page.screenshot({ path: join(evidence, `${name}-${suffix}-top.png`), animations: 'disabled' });
        const content = await page.evaluate(() => ({
          heading: document.querySelector('h1')?.textContent ?? document.title,
          images: document.images.length,
          brokenImages: [...document.images].filter(image => !image.complete || !image.naturalWidth).length,
          overflow: document.documentElement.scrollWidth > innerWidth,
        }));
        captures.push({ name, suffix, route: new URL(page.url()).pathname, ...content });
        writeFileSync(join(evidence, 'captures.json'), JSON.stringify(captures, null, 2));
        assert.equal(content.brokenImages, 0, `${name}/${suffix}: images must decode`);
        assert.equal(content.overflow, false, `${name}/${suffix}: no horizontal overflow`);
      }
    };
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
    if (fullSite) await shot('report');
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
    for (const suffix of ['', '/face', '/color', '/style', '/detail', '/advice', '/hair', '/makeup', '/outfit', '/glasses', '/more', '/share', '/compare', '/plan', ...(fullSite ? ['/studio', '/report', '/unlock'] : [])]) {
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
      if (fullSite && suffix === '/face') {
        const metric = page.getByTestId('workbench').locator('button[data-metric]').first();
        await metric.click();
        assert.equal(await metric.getAttribute('aria-pressed'), 'true');
        await page.getByTestId('workbench').locator('[data-testid="detail-value"]:visible').waitFor();
        routes.at(-1).measurementSelection = true;
      }
      if (fullSite && suffix === '/style') {
        const pickerMode = page.getByRole('radiogroup', { name: '选择方式' }).getByRole('radio').nth(1);
        await pickerMode.click();
        assert.equal(await pickerMode.getAttribute('aria-checked'), 'true');
        routes.at(-1).stylePickerSelection = true;
      }
      if (fullSite || ['/face', '/color', '/advice'].includes(suffix)) await shot(`route-${suffix.slice(1) || 'profile'}`);
      if (fullSite && suffix === '/color') {
        const color = page.getByRole('group', { name: /色卡$/ }).first().getByRole('button').nth(1);
        await color.click();
        assert.equal(await color.getAttribute('aria-pressed'), 'true');
        const toStudio = page.getByRole('link', { name: '把这个颜色带到实验室' });
        const target = await toStudio.getAttribute('href');
        const selectedHex = new URL(target, base).searchParams.get('drape');
        await toStudio.click();
        await page.getByTestId('studio-canvas').waitFor();
        assert.equal(await page.getByRole('tab', { name: '妆容与配色' }).getAttribute('aria-selected'), 'true');
        const picked = page.getByRole('radiogroup', { name: '近脸色' }).getByRole('radio', { checked: true });
        await picked.waitFor();
        const selectedBackground = await picked.locator('[style]').first().evaluate(el => el.style.backgroundColor);
        const expected = await page.evaluate(hex => { const e = document.createElement('span'); e.style.backgroundColor = '#' + hex; return e.style.backgroundColor; }, selectedHex);
        assert.equal(selectedBackground, expected, 'Color handoff preserves the selected swatch');
        await shot('color-to-studio');
        routes.at(-1).colorToStudio = { selectedHex, activeTab: 'makeup', selected: true };
      }
      if (fullSite && suffix === '/share') {
        await page.getByRole('button', { name: '生成只读链接', exact: true }).click();
        const publicUrl = await page.getByTestId('share-url').innerText();
        await page.goto(publicUrl);
        await page.getByRole('heading', { name: '一份形象档案', exact: true }).waitFor();
        await page.getByRole('radio', { name: '色卡艺术', exact: true }).click();
        await shot('public-share');
        routes.at(-1).publicSharing = true;
      }
    }
    writeFileSync(join(evidence, `${name}-routes.json`), JSON.stringify(routes, null, 2));
    await page.goto(`${base}/report/sample`);
    await page.getByTestId('full-report').waitFor();
    assert.equal(await page.locator('a[href^="/p/"]').count(), 0);
    if (fullSite) {
      await shot('public-sample');
      for (const [label, path] of [['home', '/'], ...['face','hair','style','color','outfit'].map(topic => [`topic-${topic}`, `/t/${topic}?ref=design-review`]), ['start','/start'], ['about','/about'], ['check','/check']]) {
        await page.goto(base + path);
        await page.locator('h1').first().waitFor();
        if (label.startsWith('topic-')) {
          const topic = label.slice('topic-'.length);
          await page.locator('section[aria-labelledby="home-title"]').waitFor();
          const starts = await page.locator('a[href^="/start"]:visible').evaluateAll(links => links.map(link => link.getAttribute('href')));
          assert.ok(starts.length > 0, `${topic}: shared photographic homepage has start actions`);
          for (const href of starts) {
            const target = new URL(href, base);
            assert.equal(target.searchParams.get('topic'), topic, `${topic}: start link preserves topic`);
            assert.equal(target.searchParams.get('ref'), 'design-review', `${topic}: start link preserves attribution`);
          }
        }
        await shot(label);
      }
      await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
      await page.goto(`${base}/p/${id}/advice`);
      await page.getByRole('button', { name: '调整', exact: true }).waitFor();
      await shot('dark-reduced-advice');
      await page.goto(`${base}/p/${id}/studio?drape=6F8790`);
      await page.getByTestId('studio-canvas').waitFor();
      await shot('dark-reduced-studio');
    }
    assert.deepEqual(errors, []);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    results.push({ viewport, name, path: 'upload → crop/QC fixture → job → R2 → tabs → save → plan → complete → reload → restore → fake checkout → fixture generation → read-only sample', passed: true, realProvider: false, errors });
    await context.close();
  }
  const gallery = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await gallery.goto(new URL('../../docs/design/QC_TEACHING.html', import.meta.url).href);
  await gallery.screenshot({ path: join(evidence, 'qc-teaching.png'), fullPage: true });
  await gallery.close();
  writeFileSync(join(evidence, 'captures.json'), JSON.stringify(captures, null, 2));
  if (fullSite) {
    const escape = text => String(text).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('\"','&quot;');
    writeFileSync(join(evidence, 'index.html'), `<!doctype html><html lang=zh-CN><meta charset=utf-8><title>BeautyAI — 全站设计验收</title><style>body{font:15px system-ui;background:#f3f1ec;color:#242a29;margin:32px}h1{font-weight:500}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:24px}figure{margin:0;padding:16px;background:#fff;border:1px solid #d4d8d3}img{width:100%;height:420px;object-fit:contain;object-position:top;background:#e5e8e5}figcaption{line-height:1.8;overflow-wrap:anywhere}a{color:#3f625e}</style><h1>BeautyAI · 全站设计与交互验收</h1><p>每张缩略图链接完整页面截图；${captures.length} 个页面与交互状态。</p><div class=grid>${captures.map(c=>`<figure><a href="${c.name}-${c.suffix}.png"><img loading=lazy src="${c.name}-${c.suffix}-top.png"></a><figcaption>${escape(c.name)} · ${escape(c.heading)}<br>${escape(c.route)}<br>${c.images} images · ${c.brokenImages} broken · overflow ${c.overflow}</figcaption></figure>`).join('')}</div></html>`);
  }
  writeFileSync(join(evidence, 'journey.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally { await browser.close(); }
