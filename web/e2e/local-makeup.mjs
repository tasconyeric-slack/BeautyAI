// Start web, then: BASE=http://localhost:3000 node e2e/local-makeup.mjs
// Default: synthetic diagnostic pixels + fixture landmarks; proves workflow, never photorealism.
// For an already analyzed, authorized real portrait: ID=ap_... BASE=... node e2e/local-makeup.mjs
// Optional CHROMIUM=/usr/bin/chromium, OUT=/path/to/private/screenshots (never commit personal photographs).
import assert from "node:assert/strict";
import {readFileSync,mkdirSync} from "node:fs";
import {join} from "node:path";
import {chromium} from "playwright";
const base=process.env.BASE ?? "http://localhost:3000", id=process.env.ID ?? "ap_sample_0001";
const synthetic=!process.env.ID;
const browser=await chromium.launch(process.env.CHROMIUM ? {executablePath:process.env.CHROMIUM} : {});
try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[],requests=[];
  page.on("pageerror",e=>errors.push(e.message));
  page.on("request",r=>{if(r.url().includes("/api/"))requests.push({url:r.url(),method:r.method()});});
  if(synthetic) {
    const geometry=JSON.parse(readFileSync(new URL("../lib/fixtures/sample_geometry.json",import.meta.url),"utf8"));
    const diagnostic=await page.evaluate(g=>{
      const c=document.createElement("canvas");c.width=400;c.height=500;
      const ctx=c.getContext("2d"), image=ctx.createImageData(c.width,c.height);
      const inside=(poly,x,y)=>{
        let odd=false;
        for(let i=0,j=poly.length-1;i<poly.length;j=i++)
          if((poly[i][1]>y)!==(poly[j][1]>y) && x<(poly[j][0]-poly[i][0])*(y-poly[i][1])/(poly[j][1]-poly[i][1])+poly[i][0])odd=!odd;
        return odd;
      };
      for(let y=0;y<c.height;y++) for(let x=0;x<c.width;x++) {
        const i=(y*c.width+x)*4,n=(x*7+y*3)%9;
        let color=[185+n,140+n,120+n,255];
        if(inside(g.lip_outer,x/c.width,y/c.height))color=[148+n,85+n,88+n,255];
        if([g.brow_l,g.brow_r].some(p=>inside(p,x/c.width,y/c.height)) && x%3 && y%4<2)color=[55,40,32,255];
        image.data.set(color,i);
      }
      ctx.putImageData(image,0,0);return c.toDataURL();
    },geometry);
    await page.route("**/sample/portrait.svg",route=>route.fulfill({contentType:"image/png",body:Buffer.from(diagnostic.split(",")[1],"base64")}));
    // The stock sample was created at epoch zero. Seed session TTL without changing production retention.
    await page.addInitScript(id=>sessionStorage.setItem(`ap_fx:${id}`,JSON.stringify({id,presentation:"feminine",createdAt:Date.now()-10000,context:{},events:[],paid:false,previews:[],shareToken:null,deletedAt:null,derivedVersion:1})),id);
  }
  await page.goto(`${base}/p/${id}/studio`);
  const canvas=page.getByTestId("studio-canvas");await canvas.waitFor();
  for(const name of ["启用腮红","启用唇色","启用眉毛"])await page.waitForFunction(name=>![...document.querySelectorAll("button")].find(b=>b.getAttribute("aria-label")===name)?.disabled,name);
  const pixels=()=>canvas.evaluate(c=>c.toDataURL());
  const original=await pixels(),warm=requests.length, variants=new Set(),timings=[];
  for(const name of ["蜜桃","苹果肌","提拉","梅紫 · 深","玫瑰裸 · 浅","哑光","水光",/柔和自然/,/平直丰盈/,/上扬精致/]) {
    const start=performance.now();await page.getByRole("radio",{name,exact:typeof name==="string"}).click();
    variants.add(await pixels());timings.push(Math.round(performance.now()-start));
  }
  assert.equal(variants.size,10,"every shade, placement, finish and shape must change actual canvas pixels");
  for(const [name,value] of [["腮红强度","80"],["腮红不透明度","65"],["腮红羽化","90"],["唇色强度","85"],["眉毛密度","90"],["眉毛粗细","140"],["眉毛强度","90"]]) {
    const before=await pixels();await page.getByRole("slider",{name,exact:true}).fill(value);
    assert.ok((await pixels())!==before,`${name} must update pixels`);
  }
  const combined=await pixels();
  // A new edit just after Undo must have its own history snapshot, even on the same slider.
  await page.getByRole("slider",{name:"唇色强度",exact:true}).fill("55");
  await page.getByRole("button",{name:"撤销",exact:true}).click();assert.ok((await pixels())===combined,"Combined pixels must be restored");
  await page.getByRole("slider",{name:"唇色强度",exact:true}).fill("65");
  await page.getByRole("button",{name:"撤销",exact:true}).click();assert.ok((await pixels())===combined,"Combined pixels must be restored");
  assert.equal(requests.length,warm,"warm makeup controls must make zero API requests");
  assert.equal(requests.filter(r=>r.method==="POST" && r.url.includes("/previews")).length,0);
  const hold=page.getByRole("button",{name:/按住看原图/});
  await hold.dispatchEvent("pointerdown",{pointerId:1});assert.ok((await pixels())===original,"Original pixels must be restored");
  await hold.dispatchEvent("pointerup",{pointerId:1});assert.ok((await pixels())===combined,"Combined pixels must be restored");
  await page.getByRole("button",{name:"保存",exact:true}).click();
  const stored=await page.evaluate(id=>JSON.parse(localStorage.getItem(`ap_choices:${id}`)),id);
  assert.equal(stored.looks[0].brows.shape,"arched");assert.equal(stored.looks[0].lipIntensity,.85);
  assert.ok(!JSON.stringify(stored).includes("data:image"));
  await page.getByRole("button",{name:"重置唇色",exact:true}).click();assert.ok((await pixels())!==combined,"Module reset must update pixels");
  await page.getByRole("button",{name:"撤销",exact:true}).click();assert.ok((await pixels())===combined,"Combined pixels must be restored");
  await page.getByRole("button",{name:"重置全部",exact:true}).click();assert.ok((await pixels())===original,"Original pixels must be restored");
  await page.getByRole("button",{name:stored.looks[0].name,exact:true}).click();assert.ok((await pixels())===combined,"Combined pixels must be restored");
  await page.reload();await canvas.waitFor();
  await page.getByRole("button",{name:stored.looks[0].name,exact:true}).click();assert.ok((await pixels())===combined,"Combined pixels must be restored");
  if(process.env.OUT) {mkdirSync(process.env.OUT,{recursive:true});await page.screenshot({path:join(process.env.OUT,"makeup-desktop.png"),fullPage:true});}
  await page.setViewportSize({width:375,height:812});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),"mobile must not overflow");
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({source:synthetic ? "synthetic diagnostic pixels; realism NOT verified":"authorized existing portrait",distinctVariants:variants.size,controlToReadMs:timings,saveLoadUndoResetCompare:"passed",warmApiRequests:0,generationRequests:0}));
} finally {await browser.close();}
