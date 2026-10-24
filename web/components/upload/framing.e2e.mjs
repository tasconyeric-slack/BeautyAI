// Run against NEXT_PUBLIC_USE_FIXTURE=0 npm run dev: node components/upload/framing.e2e.mjs
// Uses generated artwork only. Browser/QC artifacts stay in memory.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
  const qcImages = [];
  let submitted = null;
  await page.route('**/api/**', async route => {
    if (route.request().url().includes('/qc')) {
      const request = route.request();
      const form = await new Response(request.postDataBuffer(), { headers: { 'content-type': request.headers()['content-type'] } }).formData();
      qcImages.push(Buffer.from(await form.get('file').arrayBuffer()));
      return route.fulfill({ json: { photo_id: 'front', status: 'warn', issues: ['face_too_small'], messages: ['请调整构图后重新检查。'], face_count: 1, yaw: 0, mode: 'real' } });
    }
    if (route.request().url().endsWith('/api/passport')) {
      const request=route.request();
      const form=await new Response(request.postDataBuffer(),{headers:{'content-type':request.headers()['content-type']}}).formData();
      submitted=Buffer.from(await form.get('front').arrayBuffer());
      return route.fulfill({json:{id:'ap_0123456789ab'}});
    }
    return route.fulfill({ json: {} });
  });
  await page.goto((process.env.BASE_URL || 'http://localhost:3000') + '/start?topic=face');
  for (const checkbox of await page.getByRole('checkbox').all()) await checkbox.check();
  await page.getByRole('button', { name: /继续|同意/ }).click();
  const artwork = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 1200; c.height = 1600;
    const ctx = c.getContext('2d');
    for (let y=0;y<1600;y+=40) for(let x=0;x<1200;x+=40) {
      ctx.fillStyle = `rgb(${x/5},${y/7},${(x+y)/12})`;ctx.fillRect(x,y,40,40);
    }
    ctx.fillStyle='#e6b294';ctx.beginPath();ctx.ellipse(600,700,180,250,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#34251d';ctx.fillRect(460,450,280,65);
    ctx.fillRect(510,650,30,16);ctx.fillRect(660,650,30,16);ctx.fillRect(570,820,60,10);
    return c.toDataURL('image/png').split(',')[1];
  });
  await page.getByLabel('选择照片 · 正脸照', { exact: true }).setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: Buffer.from(artwork,'base64') });
  await page.getByTestId('framing-editor').waitFor({ timeout: 5000 });
  await page.locator('cropper-selection').waitFor();
  assert.equal(await page.locator('cropper-handle[action="se-resize"]').count(), 1);

  await page.waitForFunction(() => document.querySelector('[data-testid="framing-viewport"]')?.dataset.ready === 'true');
  const crop = () => page.locator('cropper-selection').evaluate(s => ({ x:s.x, y:s.y, width:s.width, height:s.height }));
  const initial = await crop();
  const handle = page.locator('cropper-handle[action="se-resize"]');
  const point = await handle.boundingBox();
  await page.mouse.move(point.x + point.width/2, point.y + point.height/2);
  await page.mouse.down(); await page.mouse.move(point.x-60,point.y-80,{steps:10});await page.mouse.up();
  const resized = await crop();
  assert.ok(resized.width < initial.width - 10, 'crop handle reduces area without forcing image zoom');
  const selection = await page.locator('cropper-selection').boundingBox();
  const imgMatrix = () => page.locator('cropper-image').evaluate(i => i.$getTransform());
  const beforeDrag = await imgMatrix();
  await page.mouse.move(selection.x+selection.width/2,selection.y+selection.height/2);
  await page.mouse.down();await page.mouse.move(selection.x+selection.width/2-16,selection.y+selection.height/2-10,{steps:8});await page.mouse.up();
  const afterDrag = await imgMatrix();
  assert.ok(Math.abs(beforeDrag[4]-afterDrag[4])>5, 'drag repositions actual image');
  await page.mouse.wheel(0,-220);
  await page.waitForFunction(a => Math.abs(document.querySelector('cropper-image').$getTransform()[0]-a)>0.01, afterDrag[0]);
  const sourceCentre=()=>page.locator('cropper-selection').evaluate(s=>{
    const [a,b,c,d,e,f]=s.parentElement.querySelector('cropper-image').$getTransform();
    const x=s.x+s.width/2-600-e,y=s.y+s.height/2-800-f,det=a*d-b*c;
    return [600+(d*x-c*y)/det,800+(a*y-b*x)/det];
  });
  const beforeCentre=await sourceCentre();
  const beforeRatio = await page.getByTestId('framing-output').textContent();
  await page.getByRole('radio',{name:'1:1 方形'}).click();
  const square = await crop(); assert.ok(Math.abs(square.width-square.height)<0.01);
  const afterRatio = await page.getByTestId('framing-output').textContent();
  const afterCentre=await sourceCentre();
  assert.ok(Math.hypot(beforeCentre[0]-afterCentre[0],beforeCentre[1]-afterCentre[1])<0.01,'ratio retains the selected face centre');
  assert.ok(Number(afterRatio.match(/×(\d+)/)[1])<=Number(beforeRatio.match(/×(\d+)/)[1]),'ratio preserves height or shrinks around centre near an edge');
  await page.getByText('旋转与精细调整', {exact:true}).click();
  await page.getByLabel('旋转', {exact:true}).fill('6');
  const confirmedMatrix = await imgMatrix();
  assert.ok(Math.abs(Math.atan2(confirmedMatrix[1],confirmedMatrix[0])*180/Math.PI-6)<0.01);
  const savedCrop = await crop();
  const expectedPixels = await page.evaluate(async () => {
    const s=document.querySelector('cropper-selection'), image=document.querySelector('cropper-image');
    const [a,b,c,d,e,f]=image.$getTransform();
    const source=document.querySelector('[data-testid="framing-result"] img');
    const m=new DOMMatrix(getComputedStyle(source).transform);
    const inverseStage=new DOMMatrix([a,b,c,d,(1-a)*1200/2-c*1600/2+e,(1-d)*1600/2-b*1200/2+f]).inverse();
    const inversePreview=m.inverse();
    for(const [u,v] of [[0.2,0.2],[0.5,0.5],[0.8,0.8]]) {
      const p=inverseStage.transformPoint({x:s.x+s.width*u,y:s.y+s.height*v});
      const q=inversePreview.transformPoint({x:112*u,y:112*v});
      if(Math.hypot(p.x-q.x,p.y-q.y)>0.02) throw Error('stage and live preview source transforms differ: '+JSON.stringify({p:{x:p.x,y:p.y},q:{x:q.x,y:q.y},matrix:[a,b,c,d,e,f],preview:source.style.transform}));
    }
    const dims=document.querySelector('[data-testid="framing-output"]').textContent.match(/(\d+)×(\d+)/);
    const out=document.createElement('canvas');out.width=Number(dims[1]);out.height=Number(dims[2]);
    const ctx=out.getContext('2d'), scale=out.width/s.width;
    ctx.fillStyle='#e6e3de';ctx.fillRect(0,0,out.width,out.height);
    ctx.setTransform(a*scale,b*scale,c*scale,d*scale,((1-a)*1200/2-c*1600/2+e-s.x)*scale,((1-d)*1600/2-b*1200/2+f-s.y)*scale);
    ctx.drawImage(source,0,0);
    const sample=document.createElement('canvas');sample.width=96;sample.height=96;sample.getContext('2d').drawImage(out,0,0,96,96);
    return {width:out.width,height:out.height,pixels:Array.from(sample.getContext('2d').getImageData(0,0,96,96).data)};
  });
  const qcBefore = qcImages.length;
  await page.getByTestId('framing-confirm').click();
  await page.getByTestId('framing-editor').waitFor({state:'hidden'});
  await page.waitForFunction(() => document.querySelector('[data-slot="front"] [data-qc="warn"]'));
  assert.equal(qcImages.length, qcBefore+1, 'one QC request after confirmation');
  const preview = await page.getByTestId('preview-front').evaluate(async i => Array.from(new Uint8Array(await (await fetch(i.src)).arrayBuffer())));
  assert.deepEqual(Buffer.from(preview),qcImages.at(-1),'confirmed preview and QC use identical bytes');
  const actualPixels=await page.getByTestId('preview-front').evaluate(i=>{
    const c=document.createElement('canvas');c.width=i.naturalWidth;c.height=i.naturalHeight;
    c.width=96;c.height=96;c.getContext('2d').drawImage(i,0,0,96,96);return {width:i.naturalWidth,height:i.naturalHeight,pixels:Array.from(c.getContext('2d').getImageData(0,0,96,96).data)};
  });
  assert.equal(actualPixels.width,expectedPixels.width);assert.equal(actualPixels.height,expectedPixels.height);
  const error=actualPixels.pixels.reduce((sum,p,i)=>sum+Math.abs(p-expectedPixels.pixels[i]),0)/actualPixels.pixels.length;
  assert.ok(error<5,'rendered source crop matches live result pixels within JPEG/rounding tolerance: '+error);
  await page.getByTestId('frame-front').click();
  await page.waitForFunction(() => document.querySelector('[data-testid="framing-viewport"]')?.dataset.ready === 'true');
  // Reopening may fit the workspace differently, but the exact crop output must remain unchanged.
  assert.equal(await page.getByTestId('framing-output').textContent(),afterRatio);
  assert.equal(await page.getByLabel('旋转',{exact:true}).inputValue(),'6');
  await page.getByRole('button',{name:'保留原图',exact:true}).click();
  assert.match(await page.getByTestId('framing-output').textContent(),/1200×1600/);
  const reset=await crop();assert.ok(reset.width>0&&reset.height>0);
  // Native touch pinch is handled by Cropper.js, not a separate app gesture implementation.
  const client = await page.context().newCDPSession(page);
  const bounds=await page.locator('cropper-selection').boundingBox();
  const cx=bounds.x+bounds.width/2,cy=bounds.y+bounds.height/2;
  const touch=(type,spread)=>client.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x:cx-spread,y:cy,id:0},{x:cx+spread,y:cy,id:1}]});
  const prePinch=await imgMatrix();await touch('touchStart',25);await touch('touchMove',50);await touch('touchEnd',50);
  await page.waitForFunction(a => document.querySelector('cropper-image').$getTransform()[0]>a*1.1,prePinch[0]);
  assert.ok(savedCrop.width>0);
  await page.getByRole('button',{name:'取消',exact:true}).click();
  assert.deepEqual(Buffer.from(await page.getByTestId('preview-front').evaluate(async i => Array.from(new Uint8Array(await (await fetch(i.src)).arrayBuffer())))),qcImages.at(-1),'cancel keeps the previously confirmed image');
  assert.equal(qcImages.length,qcBefore+1,'cancel and re-edit do not upload again');

  await page.getByRole('button',{name:/女性化/}).click();
  await page.getByRole('button',{name:/^开始/}).click();
  await page.waitForURL('**/p/ap_0123456789ab');
  assert.deepEqual(submitted,qcImages.at(-1),'measurement submission uses the exact QC/preview blob');
  // Known synthetic face geometry exercises suggestion/recenter integration without a remote detector.
  await page.addInitScript(() => { globalThis.FaceDetector=class {
    async detect(bitmap) {
      const close=bitmap.width===800;
      const x=close?220:420,y=close?250:450;
      return [{boundingBox:{x,y,width:360,height:500},landmarks:[
        {type:'eye',locations:[{x:x+90,y:y+180}]},{type:'eye',locations:[{x:x+270,y:y+180}]},{type:'mouth',locations:[{x:x+180,y:y+370}]}
      ]}];
    }
  }; });
  await page.goto((process.env.BASE_URL || 'http://localhost:3000')+'/start?topic=face');
  for(const checkbox of await page.getByRole('checkbox').all()) await checkbox.check();
  await page.getByRole('button',{name:/继续|同意/}).click();
  await page.getByLabel('选择照片 · 正脸照',{exact:true}).setInputFiles({name:'synthetic.png',mimeType:'image/png',buffer:Buffer.from(artwork,'base64')});
  await page.getByTestId('framing-editor').waitFor();
  await page.waitForFunction(()=>document.querySelector('[data-testid="framing-viewport"]')?.dataset.ready==='true');
  assert.equal(await page.getByRole('button',{name:'人脸居中',exact:true}).count(),1);
  assert.notEqual(await page.getByTestId('framing-output').textContent(),'将用于分析的画面 1200×1600px');
  await page.getByRole('button',{name:'保留原图',exact:true}).click();
  await page.getByRole('button',{name:'人脸居中',exact:true}).click();
  if(process.env.FRAMING_SCREENSHOT) await page.screenshot({path:process.env.FRAMING_SCREENSHOT});
  await page.getByRole('button',{name:'取消',exact:true}).click();
  const closeArt=await page.evaluate(async data=>{
    const img=new Image();img.src='data:image/png;base64,'+data;await img.decode();
    const c=document.createElement('canvas');c.width=800;c.height=1000;
    c.getContext('2d').drawImage(img,200,200,800,1000,0,0,800,1000);
    return c.toDataURL('image/png').split(',')[1];
  },artwork);
  await page.getByLabel('选择照片 · 正脸照',{exact:true}).setInputFiles({name:'synthetic-close.png',mimeType:'image/png',buffer:Buffer.from(closeArt,'base64')});
  await page.getByTestId('framing-editor').waitFor();
  await page.waitForFunction(()=>document.querySelector('[data-testid="framing-viewport"]')?.dataset.ready==='true');
  assert.match(await page.getByTestId('framing-output').textContent(),/800×1000/);
  assert.equal(await page.getByRole('button',{name:'人脸居中',exact:true}).count(),0,'close headshot does not force additional crop');
  await page.getByTestId('framing-confirm').click();
  await page.getByTestId('framing-editor').waitFor({state:'hidden'});
  const closeDimensions=await page.getByTestId('preview-front').evaluate(async i=>{await i.decode();return [i.naturalWidth,i.naturalHeight];});
  assert.deepEqual(closeDimensions,[800,1000],'native resolution preserved for close headshot');
  console.log('PASS: synthetic portrait and close headshot; handles, drag, wheel/pinch, ratios, rotation, live-result pixels, identical preview/QC/submit bytes, warning re-edit, local suggestion, recenter, reset and cancel');

} finally { await browser.close(); }
