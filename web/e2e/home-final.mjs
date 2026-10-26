// Production-only Issue 36 evidence and critical-path checks.
// CHROMIUM=/usr/bin/chromium OUT=../docs/screenshots/home-production/final node e2e/home-final.mjs
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const OUT=process.env.OUT??'../work/issue-36/browser';
const BASE=process.env.BASE??'http://localhost:3000';
mkdirSync(OUT,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM??'/usr/bin/chromium',args:['--no-sandbox']});
const results=[];
const sizes=[[1440,900],[1024,768],[800,1000],[761,900],[760,900],[390,844],[320,568],[1100,900],[1101,900]];
const selected=process.env.WIDTHS?.split(',').map(Number);
const rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,b:r.bottom}};
try{
 for(const [width,height] of sizes.filter(([w])=>!selected||selected.includes(w))){
  const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1,isMobile:width<761,hasTouch:width<761});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const response=await page.goto(BASE,{waitUntil:'networkidle'});assert.equal(response.status(),200);
  await page.evaluate(()=>document.fonts.ready);
  await page.waitForTimeout(8500); // The approved entrance rests on the profile.
  assert.equal(await page.locator('section[data-view]').getAttribute('data-view'),'profile');
  const controls=page.getByRole('group',{name:'示例照片视角'});
  assert.doesNotMatch(await controls.locator('..').textContent(),/原始照片|实测|13|项/);
  const controlBox=await controls.boundingBox(),ctaBox=await page.getByRole('link',{name:/上传正脸/}).boundingBox();
  assert.ok(controlBox.x+controlBox.width<=ctaBox.x||ctaBox.x+ctaBox.width<=controlBox.x||controlBox.y+controlBox.height<=ctaBox.y||ctaBox.y+ctaBox.height<=controlBox.y,'Hero control overlaps CTA');
  await page.getByRole('button',{name:'正脸',exact:true}).click();
  await page.waitForTimeout(1300);
  assert.equal(await page.getByRole('button',{name:'正脸',exact:true}).getAttribute('aria-pressed'),'true');
  await page.getByRole('button',{name:'正脸',exact:true}).press('End');
  await page.waitForTimeout(1300);
  assert.equal(await page.getByRole('button',{name:'侧脸',exact:true}).getAttribute('aria-pressed'),'true');
  const hero=page.locator('section').first();
  const reading=page.locator('#reading'),choices=page.locator('#choices');
  await reading.scrollIntoViewIfNeeded();
  for(const name of [/额头较短/,/近脸配色/,/脸型偏短宽/]){
   const button=reading.getByRole('button',{name});
   if(width<761)await button.tap();else await button.click();
   await page.waitForTimeout(1000);
   assert.equal(await button.getAttribute('aria-expanded'),'true');
   const caption=reading.locator('figcaption');
   if(name.source==='近脸配色')assert.match(await caption.textContent(),/03 \/ 03/);
  }
  const sticky=await reading.locator('figure').evaluate(rect);
  if(width<761)assert.ok(sticky.h<height*.55,'Sticky portrait crowds mobile reading');
  await reading.getByRole('button',{name:'只看照片'}).click();
  assert.equal(await reading.locator('svg[data-marks]').count(),0);
  await reading.getByRole('button',{name:'显示标注'}).click();
  for(const name of ['眉形','眼镜','发型']){
   const tab=choices.getByRole('tab',{name:new RegExp(name)});
   if(width<761)await tab.tap();else await tab.click();
   await page.waitForTimeout(1000);
   assert.equal(await tab.getAttribute('aria-selected'),'true');
   const txt=await choices.getByRole('tabpanel').textContent();
   assert.match(txt,name==='眉形'?/1.35/:name==='眼镜'?/1.21/:/29%/);
  }
  const hair=choices.getByRole('tab',{name:/发型/});
  await hair.press('ArrowRight');
  assert.equal(await choices.getByRole('tab',{name:/眉形/}).getAttribute('aria-selected'),'true');
  await choices.getByRole('tab',{name:/眉形/}).press('Home');
  await page.waitForTimeout(1000);
  await choices.locator('img').evaluate(img=>img.decode());
  const drift=await page.evaluate(()=>[...document.querySelectorAll('[data-homepage] section')].flatMap(section=>{
   const pairs=section.querySelectorAll('[data-side]').length?[...section.querySelectorAll('[data-side]')]:[section];
   return pairs.flatMap(node=>{
    const img=node.querySelector('img'),svg=node.querySelector('svg[viewBox]');if(!img||!svg)return [];
    const vb=svg.viewBox.baseVal,r=img.getBoundingClientRect(),pt=svg.createSVGPoint();pt.x=vb.width*.3;pt.y=vb.height*.6;
    const q=pt.matrixTransform(svg.getScreenCTM());return [{section:section.id||'hero',view:node.dataset.side,dx:+(q.x-r.x-r.width*.3).toFixed(3),dy:+(q.y-r.y-r.height*.6).toFixed(3)}];
   });
  }));
  assert.ok(drift.every(d=>Math.abs(d.dx)<.1&&Math.abs(d.dy)<.1));
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);assert.equal(overflow,0);
  const clippedText=await page.locator('#reading h2,#choices h2,#reading button,#choices button').evaluateAll(els=>els.filter(e=>e.scrollWidth>e.clientWidth+2).map(e=>e.textContent));
  assert.deepEqual(clippedText,[],'Clipped section heading/control text');
  const images=await page.locator('[data-homepage] img').evaluateAll(imgs=>imgs.map(img=>({src:new URL(img.src).pathname,loading:img.loading,priority:img.fetchPriority,loaded:img.complete&&img.naturalWidth>0})));
  assert.ok(images.every(i=>i.loaded));
  assert.equal(images.filter(i=>i.priority==='high').length,1);
  assert.ok(images.every(i=>!i.src.includes('/demo/portraits/')));
  if([1440,390,320,800,1024].includes(width)){
   await page.evaluate(()=>{document.activeElement?.blur();scrollTo(0,0)});await page.waitForTimeout(300);
   await page.screenshot({path:`${OUT}/homepage-${width}x${height}.png`,fullPage:true,animations:'disabled'});
   if([1440,390].includes(width)){
    await hero.screenshot({path:`${OUT}/hero-${width}.png`,animations:'disabled'});
    await reading.screenshot({path:`${OUT}/analysis-${width}.png`,animations:'disabled'});
    await choices.screenshot({path:`${OUT}/decisions-${width}.png`,animations:'disabled'});
    await page.evaluate(h=>scrollTo(0,h-innerHeight*.4),await hero.evaluate(el=>el.offsetHeight));
    await page.screenshot({path:`${OUT}/hero-analysis-${width}.png`,animations:'disabled'});
    await page.evaluate(()=>scrollTo(0,document.querySelector('#choices').offsetTop-innerHeight*.4));
    await page.screenshot({path:`${OUT}/analysis-decisions-${width}.png`,animations:'disabled'});
   }
  }
  assert.deepEqual(errors,[]);
  const item={width,height,overflow,clippedText,sticky,drift,images,errors};results.push(item);
  writeFileSync(`${OUT}/qa.json`,JSON.stringify(results,null,2));
  console.log(`${width}x${height}: no overflow, aligned photos/SVGs, view/chapter/tab/touch controls pass`);
  await page.close();
 }
 const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
 await page.goto(BASE,{waitUntil:'networkidle'});
 assert.equal(await page.locator('section[data-view]').getAttribute('data-view'),'front');
 assert.equal(await page.getByRole('button',{name:/动画|播放/}).count(),0);
 await page.getByRole('button',{name:'侧脸',exact:true}).click();
 assert.equal(await page.locator('section[data-view]').getAttribute('data-view'),'profile');
 assert.equal(await page.locator('#reading [class*=cam]').first().evaluate(e=>getComputedStyle(e).transitionDuration),'0s');
 for(const path of ['/report/sample?v=p001','/report/sample?v=p002','/start','/about','/t/hair'])assert.equal((await page.goto(BASE+path,{waitUntil:'networkidle'})).status(),200,path);
 assert.equal((await page.goto(BASE+'/dev/home')).status(),404);
 console.log('Reduced motion + both reports + upload + methodology/privacy + topic route pass; production preview 404');
}finally{await browser.close()}
