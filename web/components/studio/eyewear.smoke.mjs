// npm run dev (HTTP backend); then node components/studio/eyewear.smoke.mjs
// Optional EYEWEAR_PHOTO + EYEWEAR_GEOMETRY: authorized local photo and its actual /geometry JSON.
// Never commit photographs, derived geometry, or screenshots. Default: synthetic fixture art.
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {chromium} from 'playwright';
const load=p=>JSON.parse(readFileSync(p,'utf8'));
const root=new URL('../../',import.meta.url);
const passport=load(new URL('lib/fixtures/sample_passport.json',root));
const geometry=load(process.env.EYEWEAR_GEOMETRY ?? new URL('lib/fixtures/sample_geometry.json',root));
const photo=process.env.EYEWEAR_PHOTO ? readFileSync(process.env.EYEWEAR_PHOTO) : readFileSync(new URL('public/sample/portrait.svg',root));
const id='ap_eyewear_smoke',base=process.env.BASE_URL ?? 'http://localhost:3000';
const output=process.env.EYEWEAR_SMOKE_OUTPUT;
if(output)mkdirSync(output,{recursive:true});
let supported=true,expired=false;
const response=()=>({id,status:'full_ready',stage:'done',passport,partial:{input_quality:passport.input_quality,anchors:passport.anchors,quick:null,analysis:'ready',previews:[]},entitlement:{paid:false,unlock_scope:'free',free_previews_left:0,locked:[],price_cny:39,share_token:null},media:{front:'/api/test-front',thumb:'/api/test-front',expires_at:new Date(Date.now()+3600000).toISOString(),expired},error:null,created_at:new Date().toISOString()});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',args:['--no-sandbox']});
try {
 const page=await browser.newPage({viewport:{width:1365,height:1000}}),errors=[],generation=[];
 page.setDefaultNavigationTimeout(90000);
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(r.method()==='POST' && /previews|generate/.test(r.url()))generation.push(r.url());});
 await page.route('**/api/**',async route=>{
  const url=new URL(route.request().url()),path=url.pathname;
  const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*'};
  if(path==='/api/test-front')return route.fulfill({headers,contentType:process.env.EYEWEAR_PHOTO?'image/png':'image/svg+xml',body:photo});
  if(path.endsWith('/geometry'))return route.fulfill({headers,json:supported?geometry:null});
  if(path.endsWith('/hair-mask'))return route.fulfill({headers,status:404,json:{}});
  if(path===`/api/passport/${id}`)return route.fulfill({headers,json:response()});
  return route.fulfill({headers,json:{}});
 });
 await page.goto(`${base}/p/${id}/studio`,{waitUntil:'networkidle'});
 const canvas=page.getByTestId('studio-canvas');
 const ready=()=>page.waitForFunction(()=>document.querySelector('[role="radio"]') && [...document.querySelectorAll('[role="radio"]')].some(b=>b.textContent==='圆框'&&!b.disabled));
 await ready();
 const pixels=()=>canvas.evaluate(c=>c.toDataURL());
 const original=await pixels(),shapes=[];
 for(const shape of ['圆框','长方框','猫眼框']){
  const start=Date.now();await page.getByRole('radio',{name:shape,exact:true}).click();
  shapes.push(await pixels());assert.notEqual(shapes.at(-1),original);
  console.log(`${shape}: canvas updated within ${Date.now()-start} ms (includes Playwright interaction)`);
  if(output)await canvas.screenshot({path:`${output}/${shape}.png`});
 }
 assert.equal(new Set(shapes).size,3,'three visually distinct pixel outputs');
 await page.getByRole('radio',{name:'香槟金',exact:true}).click();
 await page.getByRole('radio',{name:'略宽',exact:true}).click();
 await page.getByLabel('镜框大小',{exact:true}).fill('108');
 await page.getByLabel('镜框高低',{exact:true}).fill('8');
 const glasses=await pixels();assert.notEqual(glasses,shapes[2]);
 // Existing local lip layer composes with the frame and is saved with it.
 await page.getByRole('button',{name:'启用唇色',exact:true}).click();
 const combined=await pixels();assert.notEqual(combined,glasses);
 const compare=page.getByRole('button',{name:/按住看原图/});
 await compare.focus();await page.keyboard.down('Space');assert.equal(await pixels(),original);
 await page.keyboard.up('Space');assert.equal(await pixels(),combined);
 await page.getByRole('button',{name:'保存',exact:true}).click();
 const saved=await page.evaluate(id=>JSON.parse(localStorage.getItem(`ap_choices:${id}`)).looks[0],id);
 assert.deepEqual(saved.eyewear,{shape:'cat-eye',color:'gold',width:'wide',size:1.08,vertical:.08});assert.ok(saved.lip);
 assert.doesNotMatch(JSON.stringify(saved),/data:image|geometry|pixels|landmarks/);
 await page.getByRole('button',{name:'重置全部',exact:true}).click();assert.equal(await pixels(),original);
 await page.getByRole('button',{name:'撤销',exact:true}).click();assert.equal(await pixels(),combined);
 await page.reload({waitUntil:'networkidle'});await ready();
 await page.getByRole('button',{name:saved.name,exact:true}).click();assert.equal(await pixels(),combined,'saved combination reloads exactly');
 await page.getByRole('button',{name:'重置眼镜',exact:true}).click();
 const withoutFrame=await pixels();assert.notEqual(withoutFrame,combined);assert.notEqual(withoutFrame,original);
 await page.getByRole('button',{name:'撤销',exact:true}).click();assert.equal(await pixels(),combined);
 await page.getByRole('checkbox',{name:/眼部有眼镜或头发遮挡/}).check();
 assert.equal(await page.getByLabel('镜框大小',{exact:true}).isDisabled(),true);assert.equal(await pixels(),withoutFrame);
 await page.getByRole('checkbox',{name:/眼部有眼镜或头发遮挡/}).uncheck();assert.equal(await pixels(),combined);
 if(output)await page.screenshot({path:`${output}/desktop.png`,fullPage:true});
 await page.setViewportSize({width:390,height:844});
 await page.locator('#eyewear').scrollIntoViewIfNeeded();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'no mobile horizontal overflow');
 if(output)await page.screenshot({path:`${output}/mobile.png`});
 supported=false;await page.reload({waitUntil:'networkidle'});
 await page.getByRole('button',{name:saved.name,exact:true}).click();
 assert.equal(await page.getByRole('radio',{name:'圆框',exact:true}).isDisabled(),true);
 assert.ok(await page.getByText(/不会猜测镜框位置/).count());
 assert.equal(await page.getByRole('button',{name:'重置全部',exact:true}).isEnabled(),true);
 await page.getByRole('button',{name:'重置全部',exact:true}).click();
 expired=true;await page.reload({waitUntil:'networkidle'});
 assert.equal(await page.getByRole('radio',{name:'圆框',exact:true}).isDisabled(),true);
 assert.deepEqual(generation,[]);assert.deepEqual(errors,[]);
 console.log(`PASS: three frames, color/width/fit, makeup combination, original/reset/undo, saved reload, obstruction, unsupported/expired geometry, desktop/mobile, no generation calls. ${process.env.EYEWEAR_PHOTO?'Authorized real photo and measured geometry.':'Synthetic functional check only.'}`);
}finally{await browser.close();}
