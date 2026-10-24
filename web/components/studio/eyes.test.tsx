import { describe, expect, it } from "vitest";
import geometry from "@/lib/fixtures/sample_geometry.json";
import { boundaryDistance, contains, prepareGeometry, type FaceGeometry } from "@/lib/tint/geometry";
import { composeLayers, EMPTY_LOOK, layersForLook } from "./compose";
import { presetSelection } from "@/lib/tint/makeup-presets";
import { makeupAvailability } from "@/lib/tint/makeup";
import { prepareEyes } from "@/lib/tint/eye-geometry";
import { eyeshadow } from "@/lib/tint/eyeshadow";
import { eyeliner } from "@/lib/tint/eyeliner";

if (typeof globalThis.ImageData === "undefined") {
  (globalThis as unknown as { ImageData: unknown }).ImageData = class {
    colorSpace = "srgb";
    constructor(public data: Uint8ClampedArray, public width: number, public height: number) {}
  };
}
const g = geometry as unknown as FaceGeometry;
function portrait(w = 400, h = 500, skin = 170) {
  const p = prepareGeometry(g,w,h), d = new Uint8ClampedArray(w*h*4);
  for (let y=0;y<h;y++) for (let x=0;x<w;x++) {
    const noise=(x*3+y*7)%9, eye=[p.eye_l,p.eye_r].find(e=>contains(e,x+.5,y+.5));
    const iris=eye && Math.abs(x-(eye.minX+eye.maxX)/2)<(eye.maxX-eye.minX)*.18;
    const lum=eye ? iris ? 35+noise : 205+noise : skin+noise;
    d.set([lum,lum-(eye?0:25),lum-(eye?0:35),255],(y*w+x)*4);
  }
  return new ImageData(d,w,h);
}
const diff=(a:ImageData,b:ImageData)=>a.data.reduce((n,v,i)=>n+Number(v!==b.data[i]),0);
const shadow={hex:"#9D687D",style:"wash" as const,intensity:.8,blend:.5};
const liner={hex:"#382C28",style:"tightline" as const,intensity:.8,thickness:.5};

describe("local eye makeup",()=>{
  it("creates distinct soft shadow placements and responds to shade, strength and blending",()=>{
    const src=portrait(),portraitBytes=new Uint8ClampedArray(src.data),out=eyeshadow(src,g,shadow);
    expect(prepareEyes(src,g)).not.toBeNull();
    expect(diff(src,out)).toBeGreaterThan(100);
    for (const patch of [{style:"outer" as const},{intensity:.3},{blend:.95},{hex:"#887147"}])
      expect(diff(out,eyeshadow(src,g,{...shadow,...patch}))).toBeGreaterThan(30);
    expect(diff(src,eyeshadow(src,g,{...shadow,intensity:0}))).toBe(0);
    expect(src.data.every((v,i)=>v===portraitBytes[i])).toBe(true);
  });
  it("has a tapered wing outside the eye and a separate attached tightline",()=>{
    const src=portrait(), tight=eyeliner(src,g,liner), wing=eyeliner(src,g,{...liner,style:"wing"});
    expect(diff(src,tight)).toBeGreaterThan(50);
    expect(diff(tight,wing)).toBeGreaterThan(40);
    const contours=prepareGeometry(g,src.width,src.height);
    for(let y=0;y<src.height;y++)for(let x=0;x<src.width;x++){
      const i=(y*src.width+x)*4;
      if(tight.data[i]!==src.data[i]){
        const eye=x<src.width/2?contours.eye_l!:contours.eye_r!;
        expect(boundaryDistance(eye,x+.5,y+.5)).toBeLessThan(2.5);
        const left=eye.points.reduce((a,b)=>a[0]<b[0]?a:b),right=eye.points.reduce((a,b)=>a[0]>b[0]?a:b);
        const cornerChord=left[1]+(right[1]-left[1])*(x+.5-left[0])/(right[0]-left[0]);
        expect(y+.5).toBeLessThan(cornerChord+.6);
      }
    }
    expect(diff(tight,eyeliner(src,g,{...liner,thickness:1}))).toBeGreaterThan(30);
    expect(diff(tight,eyeliner(src,g,{...liner,intensity:.2,hex:"#65463A"}))).toBeGreaterThan(30);
    const p=prepareGeometry(g,src.width,src.height);
    let outside=0;
    for(let y=0;y<src.height;y++)for(let x=0;x<src.width;x++){
      const i=(y*src.width+x)*4;
      if(wing.data[i]!==src.data[i] && (x<p.eye_l!.minX || x>p.eye_r!.maxX))outside++;
    }
    expect(outside).toBeGreaterThan(3);
    expect(diff(src,eyeliner(src,g,{...liner,intensity:0}))).toBe(0);
  });
  it("preserves eye interiors, brows, mouth, background, dark lashes and alpha",()=>{
    const src=portrait(), p=prepareGeometry(g,src.width,src.height);
    // Sparse native lashes above the lid, plus a transparent pixel.
    src.data.set([8,8,8,255],(249*src.width+156)*4);
    src.data[(247*src.width+157)*4+3]=0;
    const copy=new Uint8ClampedArray(src.data);
    const out=eyeliner(eyeshadow(src,g,shadow),g,{...liner,style:"wing"});
    expect(out.data.slice((249*src.width+156)*4,(249*src.width+156)*4+4)).toEqual(src.data.slice((249*src.width+156)*4,(249*src.width+156)*4+4));
    for(let y=0;y<src.height;y++)for(let x=0;x<src.width;x++){
      const i=(y*src.width+x)*4;
      if([p.eye_l,p.eye_r,p.brow_l,p.brow_r,p.lip_outer].some(poly=>contains(poly,x+.5,y+.5)) || !contains(p.jaw,x+.5,y+.5) || !src.data[i+3]){
        if(out.data[i]!==src.data[i] || out.data[i+1]!==src.data[i+1] || out.data[i+2]!==src.data[i+2])throw new Error(`protected pixel changed ${x},${y}`);
      }
      if(out.data[i+3]!==src.data[i+3])throw new Error("alpha changed");
    }
    expect(src.data.every((v,i)=>v===copy[i])).toBe(true);
  });
  it("disables both eye layers for missing, tiny, closed, asymmetric or obscured eyes",()=>{
    const src=portrait();
    for(const bad of [{...g,eye_r:[]},{...g,brow_l:[]},{...g,eye_r:g.eye_r.map(([x,y])=>[x,.512+(y-.512)*.03] as const)},{...g,eye_l:g.eye_l.map(([x,y])=>[.4+(x-.4)*.2,y] as const)}]){
      expect(prepareEyes(src,bad)).toBeNull();
      expect(diff(src,eyeshadow(src,bad,shadow))).toBe(0);
      expect(diff(src,eyeliner(src,bad,liner))).toBe(0);
    }
    expect(prepareEyes(portrait(80,100),g)).toBeNull();
    const obscured=portrait(), p=prepareGeometry(g,src.width,src.height);
    for(let y=245;y<264;y++)for(let x=134;x<181;x++)obscured.data.set([12,12,12,255],(y*src.width+x)*4);
    expect(prepareEyes(obscured,g)).toBeNull();
    expect(p.eye_l).toBeTruthy();
    const partial=portrait();
    // A dark fringe hides a substantial part of the lid while the eye remains visible.
    for(let y=242;y<250;y++)for(let x=138;x<160;x++)partial.data.set([12,12,12,255],(y*src.width+x)*4);
    expect(prepareEyes(partial,g)).toBeNull();
  });
  it("composes presets with Phase 1 layers and disables only eye effects when eye detail is unreliable",()=>{
    const src=portrait(), look={...EMPTY_LOOK,...presetSelection("occasion")};
    expect(makeupAvailability(src,g).eyeshadow).toBeNull();
    const full=composeLayers(src,g,layersForLook(look));
    const withoutEyes=composeLayers(src,g,layersForLook({...look,eyeshadow:null,eyeliner:null}));
    expect(diff(full,withoutEyes)).toBeGreaterThan(100);
    const withoutLiner=composeLayers(src,g,layersForLook({...look,eyeliner:null}));
    expect(diff(full,withoutLiner)).toBeGreaterThan(40);
    const blocked={...makeupAvailability(src,g),eyeshadow:"obscured",eyeliner:"obscured"};
    expect(diff(withoutEyes,composeLayers(src,g,layersForLook(look),blocked))).toBe(0);
  });
  it("follows a rolled portrait's upper contours without painting inside the eyes",()=>{
    const w=400,h=500,angle=.16,c=Math.cos(angle),s=Math.sin(angle);
    const rotate=([x,y]:readonly number[])=>[(200+(x*w-200)*c-(y*h-250)*s)/w,(250+(x*w-200)*s+(y*h-250)*c)/h] as const;
    const rolled={...g,...Object.fromEntries(["eye_l","eye_r","brow_l","brow_r","jaw"].map(k=>[k,(g[k as keyof FaceGeometry] as readonly (readonly number[])[]).map(rotate)]))} as FaceGeometry;
    const p=prepareGeometry(rolled,w,h),src=portrait();
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const eye=[p.eye_l,p.eye_r].find(poly=>contains(poly,x+.5,y+.5)),i=(y*w+x)*4;
      const iris=eye && Math.abs(x-(eye.minX+eye.maxX)/2)<6;
      const lum=eye?(iris?35:210):170+(x*3+y*7)%9;src.data.set([lum,lum,lum,255],i);
    }
    expect(prepareEyes(src,rolled)).not.toBeNull();
    const out=eyeliner(src,rolled,{...liner,style:"wing"});
    expect(diff(src,out)).toBeGreaterThan(50);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++)if([p.eye_l,p.eye_r].some(poly=>contains(poly,x+.5,y+.5))){
      const i=(y*w+x)*4;if(out.data[i]!==src.data[i])throw new Error("rolled eye painted");
    }
  });
  it("keeps visible previews on darker skin and scaled portraits",()=>{
    for(const src of [portrait(400,500,70),portrait(600,750)]){
      expect(prepareEyes(src,g)).not.toBeNull();
      expect(diff(src,eyeshadow(src,g,shadow))).toBeGreaterThan(100);
      expect(diff(src,eyeliner(src,g,liner))).toBeGreaterThan(40);
    }
  });
});
