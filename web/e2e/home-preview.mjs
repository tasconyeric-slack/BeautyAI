// Production homepage responsive visual/registration check. Run after build + start.
// BASE=http://localhost:3000 OUT=/tmp/beautyai-home CHROMIUM=/usr/bin/chromium node e2e/home-preview.mjs
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const OUT=process.env.OUT ?? '/tmp/beautyai-home';
const BASE=process.env.BASE ?? 'http://localhost:3000';
mkdirSync(OUT,{recursive:true});
const browser=await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const report=[];
try {
 for(const [width,height] of [[1440,900],[320,568],[375,667],[390,844],[430,932]].filter(([w])=>!process.env.WIDTHS||process.env.WIDTHS.split(",").includes(String(w)))) {
  const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1,hasTouch:width<761,isMobile:width<761});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${BASE}/`,{waitUntil:'networkidle'});
  await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(3000);
  assert.equal(await page.locator('[data-homepage]').count(),1);
  await page.screenshot({path:`${OUT}/hero-${width}x${height}.png`});
  await page.locator('section').first().screenshot({path:`${OUT}/hero-complete-${width}x${height}.png`});
  const hero=await page.evaluate(()=>{
   const section=document.querySelector('section'),image=section.querySelector('img'),title=section.querySelector('h1'),lead=section.querySelector('[class*=lead]'),cta=section.querySelector('[class*=ctaRow]');
   const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,bottom:r.bottom}};
   return {section:rect(section),image:rect(image),title:rect(title),lead:rect(lead),cta:rect(cta),overflow:document.documentElement.scrollWidth-innerWidth};
  });
  assert.ok(hero.overflow<=0);
  await page.locator('#reading').scrollIntoViewIfNeeded();
  await page.getByRole('button',{name:/额头较短/}).click();
  await page.waitForTimeout(1500);
  await page.screenshot({path:`${OUT}/analysis-${width}x${height}.png`});
  const sticky=await page.locator('#reading figure').evaluate(e=>({height:e.getBoundingClientRect().height,top:e.getBoundingClientRect().top}));
  if(width<761)assert.ok(sticky.height<height*0.55);
  const choices=page.locator('#choices');
  await choices.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  await choices.screenshot({path:`${OUT}/choices-complete-${width}x${height}.png`});
  for(const name of ['眉形','眼镜','发型']){
   const tab=page.getByRole('tab',{name:new RegExp(name)});
   if(width<761)await tab.tap();else await tab.click();
   assert.equal(await tab.getAttribute('aria-selected'),'true');
   await page.waitForTimeout(1200);
  }
  await choices.scrollIntoViewIfNeeded();
  await page.screenshot({path:`${OUT}/choices-${width}x${height}.png`});
  const drift=await page.evaluate(()=>[...document.querySelectorAll('section')].map(section=>{
   const img=section.querySelector('img'),svg=section.querySelector('svg[viewBox]');if(!img||!svg)return null;
   const vb=svg.viewBox.baseVal,r=img.getBoundingClientRect(),p=svg.createSVGPoint();p.x=vb.width*.3;p.y=vb.height*.6;
   const q=p.matrixTransform(svg.getScreenCTM());return {id:section.id||'hero',dx:+(q.x-r.x-.3*r.width).toFixed(3),dy:+(q.y-r.y-.6*r.height).toFixed(3)};
  }).filter(Boolean));
  assert.ok(drift.every(d=>Math.abs(d.dx)<.1&&Math.abs(d.dy)<.1));assert.deepEqual(errors,[]);
  report.push({width,height,hero,sticky,drift,errors,touch:width<761});
  writeFileSync(`${OUT}/visual-qa-${width}.json`,JSON.stringify(report.at(-1),null,2));
  await page.close();
 }
 const rm=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
 await rm.goto(`${BASE}/`,{waitUntil:'networkidle'});
 assert.equal(await rm.locator('h1').evaluate(e=>getComputedStyle(e.parentElement).animationName),'none');
 for(const url of ['/report/sample?v=p001','/report/sample?v=p002','/start','/t/hair']) {
  const r=await rm.goto(BASE+url,{waitUntil:'networkidle'});assert.equal(r.status(),200);
 }
 assert.equal((await rm.goto(`${BASE}/dev/home`)).status(),404);
 writeFileSync(`${OUT}/visual-qa.json`,JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
}finally{await browser.close()}
