import { describe, it, expect } from 'vitest';
import fixture from '@/lib/fixtures/sample_geometry.json';
import type { FaceGeometry, Pt } from '@/lib/tint/geometry';
import { eyewearFit, eyewear, DEFAULT_EYEWEAR, normalizeEyewear } from '@/lib/tint/eyewear';
import { EMPTY_LOOK, restoreLook, layersForLook, describeLook } from './compose';
const g = fixture as unknown as FaceGeometry;
if (typeof ImageData === 'undefined') Object.assign(globalThis, { ImageData: class {
  constructor(public data: Uint8ClampedArray, public width: number, public height: number) {}
}});
const same=(a:Uint8ClampedArray,b:Uint8ClampedArray)=>Buffer.compare(Buffer.from(a),Buffer.from(b))===0;
const photo = () => new ImageData(new Uint8ClampedArray(400*500*4).fill(190),400,500);

describe('eyewear anchored to the Studio geometry', () => {
  it('anchors lenses on measured eyes, keeps the top below brows and scales with pixels', () => {
    const fit = eyewearFit(g,400,500,DEFAULT_EYEWEAR)!;
    expect(fit).not.toBeNull();
    expect(fit.distance).toBeGreaterThan(50);
    for (let i=0;i<2;i++)
      expect(Math.abs(fit.centers[i][0]-fit.eyes[i][0])).toBeLessThan(fit.distance*.1);
    expect(fit.top).toBeGreaterThanOrEqual(fit.browBottom);
    const small=eyewearFit(g,200,250,DEFAULT_EYEWEAR)!;
    expect(small.distance).toBeCloseTo(fit.distance/2);
    expect(small.origin[0]).toBeCloseTo(fit.origin[0]/2);
  });
  it('follows in-plane roll instead of floating horizontally', () => {
    const angle=.16, c=Math.cos(angle),s=Math.sin(angle);
    const rotate=([x,y]:Pt):Pt=>[(c*(x*400-200)-s*(y*500-250)+200)/400,(s*(x*400-200)+c*(y*500-250)+250)/500];
    const rolled={...g,...Object.fromEntries(['eye_l','eye_r','brow_l','brow_r','jaw'].map(k=>[k,g[k as 'eye_l'].map(rotate)]))};
    expect(eyewearFit(rolled,400,500,DEFAULT_EYEWEAR)!.angle).toBeCloseTo(angle,1);
  });
  it('refuses missing, tiny, malformed and profile-like eye geometry', () => {
    expect(eyewearFit({...g,eye_l:[]},400,500,DEFAULT_EYEWEAR)).toBeNull();
    expect(eyewearFit({...g,brow_r:[]},400,500,DEFAULT_EYEWEAR)).toBeNull();
    expect(eyewearFit({...g,eye_l:[[NaN,.5],[.2,.5],[.3,.5]]},400,500,DEFAULT_EYEWEAR)).toBeNull();
    expect(eyewearFit(g,20,25,DEFAULT_EYEWEAR)).toBeNull();
    const center=g.eye_l.reduce((s,p)=>s+p[0],0)/g.eye_l.length;
    expect(eyewearFit({...g,eye_l:g.eye_l.map(([x,y])=>[center+(x-center)*.3,y])},400,500,DEFAULT_EYEWEAR)).toBeNull();
  });
  it('renders distinct shapes and manual/color/width changes without mutating the original', () => {
    const src=photo(), before=src.data.slice();
    const outputs=(['round','rectangle','cat-eye'] as const).map(shape=>eyewear(src,g,{...DEFAULT_EYEWEAR,shape}));
    expect(same(outputs[0].data,before)).toBe(false);
    expect(same(outputs[0].data,outputs[1].data)).toBe(false);
    expect(same(outputs[1].data,outputs[2].data)).toBe(false);
    for (const patch of [{color:'gold' as const}, {width:'wide' as const}, {size:1.1}, {vertical:.1}])
      expect(same(eyewear(src,g,{...DEFAULT_EYEWEAR,...patch}).data,outputs[0].data)).toBe(false);
    expect(same(src.data,before)).toBe(true);
    expect(eyewear(src,{...g,eye_l:[]},DEFAULT_EYEWEAR)).toBe(src);
  });
  it('validates stored options and restores eyewear alongside legacy layers', () => {
    expect(restoreLook({lip:'#AA6677'}).eyewear).toBeNull();
    expect(normalizeEyewear({shape:'unknown'})).toBeNull();
    expect(normalizeEyewear({...DEFAULT_EYEWEAR,size:Infinity})).toBeNull();
    const look=restoreLook({...EMPTY_LOOK,eyewear:DEFAULT_EYEWEAR,lip:'#AA6677'});
    expect(layersForLook(look).eyewear).toEqual(DEFAULT_EYEWEAR);
    expect(look.lip).toBe('#AA6677');
    expect(describeLook({eyewearName:'圆框'})).toBe('圆框眼镜');
  });
});
