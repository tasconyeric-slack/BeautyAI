import { parseHex } from "./color";
import { contains, prepareGeometry, type FaceGeometry } from "./geometry";
import { eyeCoordinates, prepareEyes, upperLid } from "./eye-geometry";
import { intensityInRange } from "./mask";

export type EyelinerStyle = "tightline" | "wing";
export interface EyelinerOptions { hex: string; style: EyelinerStyle; intensity: number; thickness: number }
const clamp=(v:number)=>Math.max(0,Math.min(1,v));

/** Upper-lid pencil on the skin side of the measured contour. The wing is a contiguous,
 * tapered extension from the outer corner; eye interiors are always hard exclusions. */
export function eyeliner(src:ImageData,g:FaceGeometry,options:EyelinerOptions):ImageData {
  if(!["tightline","wing"].includes(options.style))throw new TypeError("Unknown eyeliner style.");
  const rgb=parseHex(options.hex),strength=intensityInRange(options.intensity),thickness=intensityInRange(options.thickness);
  const out=new ImageData(new Uint8ClampedArray(src.data),src.width,src.height);
  const eyes=prepareEyes(src,g);
  if(!eyes || !strength)return out;
  const p=prepareGeometry(g,src.width,src.height);
  for(const r of eyes){
    const wing=options.style==="wing",width=r.length*(.009+thickness*.045)*(wing?1.3:1);
    const pad=r.length*.24;
    for(let y=Math.max(0,Math.floor(r.eye.minY-pad));y<Math.min(src.height,r.eye.maxY);y++)
      for(let x=Math.max(0,Math.floor(r.eye.minX-pad));x<Math.min(src.width,r.eye.maxX+pad);x++){
        const i=(y*src.width+x)*4,px=x+.5,py=y+.5;
        if(!src.data[i+3] || !contains(p.jaw,px,py) || [p.eye_l,p.eye_r,p.brow_l,p.brow_r,p.lip_outer].some(poly=>contains(poly,px,py)))continue;
        const [u,v]=eyeCoordinates(r,px,py),t=u/r.length;
        if(t<=0 || t>1+(wing ? .2 : 0))continue;
        let bottom:number,band:number,taper:number;
        if(t<=1){
          bottom=upperLid(r,u);
          taper=clamp(t/.18)*(wing ? .65+.35*Math.sin(Math.PI*t) : clamp((1-t)/.12));
          band=width*taper;
        }else{
          const q=(t-1)/.2;
          band=width*.65*(1-q);
          bottom=r.length*.12*q;
          taper=1-q;
        }
        const above=v-bottom;
        if(above<-.4 || above>band+.5)continue;
        const coverage=clamp(above+.5)*clamp(band-above+.5)*Math.min(1,taper*4);
        const lum=.2126*src.data[i]+.7152*src.data[i+1]+.0722*src.data[i+2];
        // Keep native dark lashes intact and modulate pigment with the photograph's light.
        const alpha=strength*coverage*clamp((lum-r.skin*.22)/(r.skin*.3));
        const light=Math.max(.6,Math.min(1.25,lum/r.skin));
        for(let c=0;c<3;c++)out.data[i+c]=src.data[i+c]+(Math.min(src.data[i+c],rgb[c]*light)-src.data[i+c])*alpha;
      }
  }
  return out;
}
