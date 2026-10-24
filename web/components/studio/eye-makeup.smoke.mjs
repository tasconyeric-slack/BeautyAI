// Run against the existing Studio: NEXT_PUBLIC_USE_FIXTURE=1 npm run dev
// CHROMIUM_PATH=/usr/bin/chromium node components/studio/eye-makeup.smoke.mjs
// Synthetic diagnostic art only. This does not validate photographic realism.
import assert from "node:assert/strict";
import { readFileSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";
const g=JSON.parse(readFileSync(new URL("../../lib/fixtures/sample_geometry.json",import.meta.url)));
const polygon=(key,fill,extra="")=>`<polygon points="${g[key].map(([x,y])=>`${x*400},${y*500}`).join(" ")}" fill="${fill}" ${extra}/>`;
const art=`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500" viewBox="0 0 400 500">
<defs><pattern id="texture" width="7" height="7" patternUnits="userSpaceOnUse"><rect width="3" height="2" fill="white" opacity=".07"/></pattern>
<pattern id="hairs" width="4" height="8" patternUnits="userSpaceOnUse"><path d="M0 8L3 0" stroke="#49382e" stroke-width="1.5"/></pattern>
<clipPath id="left">${polygon("eye_l","white")}</clipPath><clipPath id="right">${polygon("eye_r","white")}</clipPath></defs>
<rect width="400" height="500" fill="#d5d0c9"/>${polygon("jaw","#BB927B")}<rect width="400" height="500" fill="url(#texture)"/>
${polygon("eye_l","#e3dfd5",'stroke="#584134" stroke-width=".6"')}${polygon("eye_r","#e3dfd5",'stroke="#584134" stroke-width=".6"')}
<ellipse cx="158" cy="256" rx="5" ry="7" fill="#382c27" clip-path="url(#left)"/><ellipse cx="242" cy="256" rx="5" ry="7" fill="#382c27" clip-path="url(#right)"/>
${polygon("brow_l","url(#hairs)")}${polygon("brow_r","url(#hairs)")}${polygon("lip_outer","#b87e7e")}${polygon("lip_inner","#563f3b")}</svg>`;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || "/usr/bin/chromium",args:["--no-sandbox"]});
try{
  const page=await browser.newPage({viewport:{width:1365,height:1000}}),errors=[],posts=[];
  // Seed a fresh synthetic session: the historical sample state uses an epoch timestamp.
  await page.addInitScript(()=>{const key="ap_fx:ap_sample_0001";if(!sessionStorage.getItem(key))sessionStorage.setItem(key,JSON.stringify({id:"ap_sample_0001",presentation:"feminine",createdAt:Date.now()-15000,context:{},events:[],paid:false,previews:[],shareToken:null,deletedAt:null,derivedVersion:1}));});
  page.on("pageerror",e=>errors.push(e.message));
  page.on("request",r=>{if(r.method()==="POST")posts.push(new URL(r.url()).pathname);});
  await page.route(/\/sample\/portrait\.svg(?:\?.*)?$/,route=>route.fulfill({contentType:"image/svg+xml",body:art}));
  await page.goto(`${process.env.BASE_URL ?? "http://localhost:3000"}/p/ap_sample_0001/studio`,{waitUntil:"networkidle"});
  const canvas=page.getByTestId("studio-canvas");await canvas.waitFor();
  await page.waitForFunction(()=>document.querySelector('[aria-label="启用眼影"]')?.disabled===false);
  const pixels=()=>canvas.evaluate(c=>c.toDataURL()), original=await pixels();
  await page.getByRole("button",{name:/玫瑰赴约/}).click();
  assert.notEqual(await pixels(),original,"preset changes actual canvas");
  await page.getByLabel("眼影柔化",{exact:true}).fill("82");await page.getByLabel("眼线粗细",{exact:true}).fill("38");
  const edited=await pixels();
  await page.getByRole("button",{name:"重置眼影",exact:true}).click();
  assert.equal(await page.getByRole("button",{name:"启用眼线",exact:true}).getAttribute("aria-pressed"),"true");
  assert.notEqual(await pixels(),edited);
  await page.getByRole("button",{name:"撤销",exact:true}).click();assert.equal(await pixels(),edited);
  const compare=page.getByRole("button",{name:/按住看原图/});await compare.focus();await page.keyboard.down("Space");
  assert.equal(await pixels(),original,"comparison shows original pixels");await page.keyboard.up("Space");assert.equal(await pixels(),edited);
  await page.getByRole("button",{name:"保存",exact:true}).click();
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem("ap_choices:ap_sample_0001")).looks[0]);
  assert.equal(stored.eyeshadow.blend,.82);assert.equal(stored.eyeliner.thickness,.38);assert.equal(stored.blush,true);assert.ok(stored.brows);assert.ok(stored.lip);
  await page.getByRole("button",{name:"重置全部",exact:true}).click();assert.equal(await pixels(),original);
  await page.getByRole("button",{name:"撤销",exact:true}).click();assert.equal(await pixels(),edited);
  await page.reload({waitUntil:"networkidle"});
  await page.waitForFunction(()=>document.querySelector('[aria-label="启用眼影"]')?.disabled===false);
  await page.locator("li button").filter({hasText:"玫瑰棕眼影"}).click();assert.equal(await pixels(),edited,"saved full Look survives reload");
  await page.getByRole("checkbox",{name:/眼部有眼镜或头发遮挡/}).check();
  assert.equal(await page.getByLabel("眼影强度",{exact:true}).isDisabled(),true);
  assert.equal(await page.getByLabel("眼线粗细",{exact:true}).isDisabled(),true);assert.notEqual(await pixels(),edited);
  await page.getByRole("checkbox",{name:/眼部有眼镜或头发遮挡/}).uncheck();
  if(process.env.EYE_SMOKE_OUTPUT){mkdirSync(process.env.EYE_SMOKE_OUTPUT,{recursive:true});await page.screenshot({path:`${process.env.EYE_SMOKE_OUTPUT}/studio-desktop.png`,fullPage:true});await canvas.screenshot({path:`${process.env.EYE_SMOKE_OUTPUT}/synthetic-after.png`});}
  // An obstructed eye-only selection still needs a usable reset-all control.
  await page.getByRole("button",{name:"重置全部",exact:true}).click();
  await page.getByRole("radio",{name:"柔和铺色",exact:true}).click();
  await page.getByRole("checkbox",{name:/眼部有眼镜或头发遮挡/}).check();
  assert.equal(await page.getByRole("button",{name:"重置全部",exact:true}).isEnabled(),true,"paused eye-only settings can be reset");
  await page.getByRole("button",{name:"保存",exact:true}).click();
  const paused=await page.evaluate(()=>JSON.parse(localStorage.getItem("ap_choices:ap_sample_0001")).looks[0]);
  assert.equal(paused.eyesObscured,true);assert.ok(paused.eyeshadow);assert.match(paused.name,/未叠加预览/);
  await page.getByRole("button",{name:"重置全部",exact:true}).click();
  assert.equal(await page.getByRole("checkbox",{name:/眼部有眼镜或头发遮挡/}).isChecked(),false);
  assert.equal(await pixels(),original);
  assert.deepEqual(posts,[],"local makeup sends no POST or generation request");assert.deepEqual(errors,[]);
  console.log("PASS: Studio preset, eye sliders, individual reset/undo, original comparison, save, reset-all/undo, reload/load, obstruction. No POSTs or browser errors. Synthetic functional validation only.");
}finally{await browser.close();}
