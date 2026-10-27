import { describe, expect, it } from "vitest";
import geometry from "@/lib/fixtures/sample_geometry.json";
import type { FaceGeometry } from "@/lib/tint";
import {rgbToLab} from "@/lib/tint/color";
import { composeLayers, EMPTY_LOOK, layersForLook, restoreLook } from "./compose";
import { makeupAvailability } from "@/lib/tint/makeup";

if (typeof globalThis.ImageData === "undefined") {
  (globalThis as unknown as { ImageData: unknown }).ImageData = class {
    colorSpace = "srgb";
    constructor(public data: Uint8ClampedArray, public width: number, public height: number) {}
  };
}
const g = geometry as unknown as FaceGeometry;
function portrait() {
  const width = 400, height = 500, data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const d = (x * 7 + y * 3) % 9;
    data.set([185 + d, 140 + d, 120 + d, 255], (y * width + x) * 4);
  }
  // Sparse dark hairs within the measured brow regions, on real textured pixels.
  for (const p of [g.brow_l, g.brow_r]) {
    const minX = Math.ceil(Math.min(...p.map(v => v[0])) * width);
    const maxX = Math.floor(Math.max(...p.map(v => v[0])) * width);
    const cy = Math.round(p.reduce((s,v) => s + v[1], 0) / p.length * height);
    for (let x = minX + 2; x < maxX - 2; x++) for (let y = cy - 1; y <= cy + 1; y++)
      if (x % 3) data.set([55, 40, 32, 255], (y * width + x) * 4);
  }
  return new ImageData(data, width, height);
}
const diff = (a: ImageData, b: ImageData) => a.data.reduce((s,v,i) => s + Number(v !== b.data[i]), 0);
const baseLayers = { drape: null, lip: null, blush: null };

describe("Phase 1 local makeup", () => {
  it("changes blush placement, opacity and feather independently on source pixels", () => {
    const src = portrait();
    const render = (patch = {}) => composeLayers(src, g, { ...baseLayers, blush: { hex: "#D56870", placement: "apple", intensity: .9, opacity: .9, feather: .3, ...patch } });
    const apple = render();
    expect(diff(src, apple)).toBeGreaterThan(100);
    for (const patch of [{ placement: "diagonal" }, { placement: "horizontal" }, { opacity: .3 }, { feather: .9 }])
      expect(diff(apple, render(patch))).toBeGreaterThan(50);
    expect(diff(src, render({ opacity: 0 }))).toBe(0);
  });
  it("lip strength and finishes change the lips and preserve the inner mouth", () => {
    const src = portrait();
    const render = (intensity: number, finish: "matte" | "satin" | "gloss") => composeLayers(src, g, { ...baseLayers, lip: { hex: "#953F58", intensity, finish } });
    expect(diff(src, render(0, "gloss"))).toBe(0);
    expect(diff(render(.3,"satin"),render(.9,"satin"))).toBeGreaterThan(40);
    expect(diff(render(.9,"matte"),render(.9,"gloss"))).toBeGreaterThan(40);
    const x = 200, y = 350, i = (y * src.width + x) * 4;
    expect(render(1,"gloss").data.slice(i,i+4)).toEqual(src.data.slice(i,i+4));
  });
  it("deep lip shades have visibly different depth while preserving local lip contrast", () => {
    const src=portrait();
    const render=(hex:string)=>composeLayers(src,g,{...baseLayers,lip:{hex,intensity:1,finish:"satin"}});
    const light=render("#CD917E"),deep=render("#682C42"),i=(360*src.width+200)*4;
    const L=(out:ImageData)=>rgbToLab(out.data[i],out.data[i+1],out.data[i+2])[0];
    expect(L(light)-L(deep)).toBeGreaterThan(7);
  });
  it("brow templates change the footprint, including pixels beyond existing hairs", () => {
    const src = portrait();
    const render = (shape: "soft" | "straight" | "arched", density = .8) => composeLayers(src,g,{ ...baseLayers, brows: { shape, hex: "#533B30", density, intensity: .9 } });
    const variants = [render("soft"),render("straight"),render("arched")];
    for (const out of variants) expect(diff(src,out)).toBeGreaterThan(100);
    const changed = (out: ImageData) => Array.from({length:src.width*src.height},(_,i) => Number(out.data[i*4] !== src.data[i*4]));
    expect(changed(variants[0])).not.toEqual(changed(variants[1]));
    expect(changed(variants[1])).not.toEqual(changed(variants[2]));
    expect(diff(src,render("arched",0))).toBe(0);
    expect(src.data).toEqual(portrait().data);
  }, 20_000); // four full-portrait composites in jsdom: ~5 s alone, slower when the suite runs in parallel
  it("skips missing module landmarks and reports low-contrast brows", () => {
    const src = portrait();
    expect(makeupAvailability(src,g)).toMatchObject({ lip: null, blush: null, brows: null });
    const missing = { ...g, lip_inner: [], cheek_r: [], brow_l: [] };
    const status = makeupAvailability(src,missing);
    expect(status.lip).toBeTruthy(); expect(status.blush).toBeTruthy(); expect(status.brows).toBeTruthy();
    expect(diff(src,composeLayers(src,missing,{ ...baseLayers, lip: {hex:"#AA3355",intensity:1,finish:"satin"}, blush:{hex:"#DD4466",placement:"apple"}, brows:{hex:"#533B30",shape:"soft",density:1,intensity:1} }))).toBe(0);
    const flat = new ImageData(new Uint8ClampedArray(src.data.length).fill(128),src.width,src.height);
    expect(makeupAvailability(flat,g).brows).toBeTruthy();
  });
  it("loads old looks with defaults and round-trips all makeup settings", () => {
    const old = restoreLook({hair:null,hairColor:null,lip:"#AA4455",blush:true,drape:null});
    expect(old.lipIntensity).toBe(.6); expect(old.blushOpacity).toBe(1); expect(old.brows).toBeNull();
    const next = { ...EMPTY_LOOK, blush:true, blushHex:"#CD7777", blushPlacement:"horizontal" as const, blushIntensity:.7, blushOpacity:.4, blushFeather:.9, lip:"#884455",lipIntensity:.8,lipFinish:"gloss" as const,brows:{shape:"straight" as const,hex:"#533B30",density:.7,intensity:.6} };
    expect(restoreLook(JSON.parse(JSON.stringify(next)))).toEqual(next);
    const layers = layersForLook(next, {hex:"#FFAAAA",placement:"apple"});
    expect(layers.blush).toEqual({hex:"#CD7777",placement:"horizontal",intensity:.7,opacity:.4,feather:.9});
    expect(layers.lip).toEqual({hex:"#884455",intensity:.8,finish:"gloss"});
    expect(layers.brows).toEqual(next.brows);
  });
});

describe("makeup safety and legacy loading", () => {
  it("legacy loads clear previous optional hair settings", () => {
    const previous = {...EMPTY_LOOK,hairHex:"#123456",hairStrength:.3};
    const restored = {...previous,...restoreLook({lip:null,blush:false,drape:null,hair:null,hairColor:null})};
    expect(restored.hairHex).toBeNull(); expect(restored.hairStrength).toBe(.8);
  });
  it("protects eyes, teeth, surrounding skin and alpha in combined makeup", async () => {
    const {contains,prepareGeometry} = await import("@/lib/tint/geometry");
    const src=portrait(), p=prepareGeometry(g,src.width,src.height);
    // A bright neutral tooth and dark facial hair inside an imperfect lip contour.
    const tooth=(358*src.width+200)*4, hair=(359*src.width+201)*4;
    src.data.set([240,240,235,255],tooth); src.data.set([8,8,8,255],hair);
    const out=composeLayers(src,g,{drape:null,blush:{hex:"#E6987F",placement:"diagonal",intensity:1},lip:{hex:"#783953",intensity:1,finish:"gloss"},brows:{hex:"#533B30",shape:"arched",density:1,intensity:1}});
    expect(out.data.slice(tooth,tooth+4)).toEqual(src.data.slice(tooth,tooth+4));
    expect(out.data.slice(hair,hair+4)).toEqual(src.data.slice(hair,hair+4));
    for(let y=0;y<src.height;y++) for(let x=0;x<src.width;x++) {
      const i=(y*src.width+x)*4;
      expect(out.data[i+3]).toBe(src.data[i+3]);
      if ([p.eye_l,p.eye_r,p.lip_inner].some(poly=>contains(poly,x+.5,y+.5)) || !contains(p.jaw,x+.5,y+.5))
        if(out.data[i]!==src.data[i] || out.data[i+1]!==src.data[i+1] || out.data[i+2]!==src.data[i+2]) throw new Error(`protected pixel ${x},${y} changed`);
    }
  }, 15_000);
});
