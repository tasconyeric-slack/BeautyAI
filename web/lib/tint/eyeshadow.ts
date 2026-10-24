import { contains, type FaceGeometry } from "./geometry";
import { eyeCoordinates, prepareEyes, upperLid } from "./eye-geometry";
import { intensityInRange, render } from "./mask";

export type EyeshadowStyle = "wash" | "outer";
export interface EyeshadowOptions { hex: string; style: EyeshadowStyle; intensity: number; blend: number }

/** A translucent lid wash or outer-corner gradient. Lab lightness offsets retain native skin contrast.
 * Hard eye/brow exclusions and inward feathering protect lashes, whites and measured brow hairs. */
export function eyeshadow(src: ImageData,g:FaceGeometry,options:EyeshadowOptions):ImageData {
  if(!["wash","outer"].includes(options.style))throw new TypeError("Unknown eyeshadow placement.");
  const blend=intensityInRange(options.blend), regions=prepareEyes(src,g);
  const skin=regions ? Math.min(...regions.map(r=>r.skin)):1;
  return render(src,g,options.hex,options.intensity,p=>({
    regions:(regions ?? []).map(r=>({polygon:r.lid,sigma:Math.max(.5,r.height*(.1+blend*.3)),falloff:(x,y)=>{
      if(!contains(p.jaw,x,y))return 0;
      const [u,v]=eyeCoordinates(r,x,y),t=u/r.length;
      const above=v-upperLid(r,u);
      if(t<=0 || t>=1 || above<r.length*.015)return 0;
      const outer=options.style==="outer" ? Math.max(0,(t-.35)/.65)**.65 : Math.sin(Math.PI*t)**.35;
      return outer*Math.exp(-1.5*(above/r.height)**2);
    }})),
    exclude:[p.brow_l,p.brow_r,p.lip_outer],
  }),{chroma:.8,lightness:.55,lightnessReference:58,
    pixelWeight:(r,g,b)=>Math.max(0,Math.min(1,(.2126*r+.7152*g+.0722*b-skin*.3)/(skin*.4)))});
}
