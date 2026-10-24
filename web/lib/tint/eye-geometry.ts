import { contains, prepareGeometry, type FaceGeometry, type Polygon, type Pt } from "./geometry";

export interface EyeRegion {
  readonly eye: Polygon;
  readonly lid: Polygon;
  readonly inner: Pt;
  readonly ux: number; readonly uy: number;
  readonly vx: number; readonly vy: number;
  readonly length: number;
  readonly height: number;
  readonly skin: number;
  readonly upper: readonly Pt[];
}
const luminance = (d: Uint8ClampedArray, i: number) => .2126*d[i]+.7152*d[i+1]+.0722*d[i+2];
const quantile = (a: number[], q: number) => a[Math.floor((a.length-1)*q)];

/** Interpolate the measured upper contour in a roll-aligned frame, inner to outer corner.
 * Cubic Hermite slopes avoid visible joins; clamping prevents overshoot between landmarks. */
export function upperLid(r: Pick<EyeRegion, "upper">, u: number): number {
  const a=r.upper;
  let i=0;
  while(i<a.length-2 && u>a[i+1][0])i++;
  const [x0,y0]=a[i], [x1,y1]=a[i+1], dx=x1-x0;
  const t=Math.max(0,Math.min(1,(u-x0)/dx));
  const prev=a[Math.max(0,i-1)], next=a[Math.min(a.length-1,i+2)];
  const m0=(y1-prev[1])/(x1-prev[0]), m1=(next[1]-y0)/(next[0]-x0);
  const y=(2*t**3-3*t*t+1)*y0+(t**3-2*t*t+t)*dx*m0+(-2*t**3+3*t*t)*y1+(t**3-t*t)*dx*m1;
  return Math.max(Math.min(y0,y1),Math.min(Math.max(y0,y1),y));
}
export function eyePosition(r: Pick<EyeRegion, "inner" | "ux" | "uy" | "vx" | "vy">, u: number, v: number): Pt {
  return [r.inner[0]+u*r.ux+v*r.vx,r.inner[1]+u*r.uy+v*r.vy];
}
export function eyeCoordinates(r: EyeRegion, x: number, y: number): Pt {
  const dx=x-r.inner[0],dy=y-r.inner[1];
  return [dx*r.ux+dy*r.uy,dx*r.vx+dy*r.vy];
}

/** Conservative geometry + local visibility gate, evaluated on the original pixels by Studio.
 * No invented landmarks or replacement of hidden eyes. Both eyes must be usable for a bilateral preview.
 * Pixel checks reject obvious flat/closed/dark obstruction, not every possible pair of glasses;
 * the editor also offers an explicit obstruction switch for the person viewing the photo. */
export function prepareEyes(src: ImageData, g: FaceGeometry): EyeRegion[] | null {
  try {
    if(!src || src.data.length!==src.width*src.height*4)return null;
    const p=prepareGeometry(g,src.width,src.height), result: EyeRegion[]=[];
    if(!p.jaw)return null;
    for(const side of ["l","r"] as const){
      const eye=p[`eye_${side}`], brow=p[`brow_${side}`];
      if(!eye || !brow || eye.points.length<8)return null;
      const left=eye.points.reduce((a,b)=>a[0]<b[0]?a:b), right=eye.points.reduce((a,b)=>a[0]>b[0]?a:b);
      const inner=side==="l"?right:left, outer=side==="l"?left:right;
      const length=Math.hypot(outer[0]-inner[0],outer[1]-inner[1]);
      if(length<18)return null;
      const ux=(outer[0]-inner[0])/length, uy=(outer[1]-inner[1])/length;
      if(Math.abs(uy)>.45)return null;
      const vx=Math.sign(ux)*uy,vy=-Math.abs(ux);
      const local=(point:Pt):Pt=>[(point[0]-inner[0])*ux+(point[1]-inner[1])*uy,(point[0]-inner[0])*vx+(point[1]-inner[1])*vy];
      const coords=eye.points.map(local), start=eye.points.indexOf(inner),end=eye.points.indexOf(outer);
      const path=(step:number)=>{
        const a:Pt[]=[];
        for(let i=start;a.length<=coords.length;i=(i+step+coords.length)%coords.length){a.push(coords[i]);if(i===end)break;}
        return a;
      };
      const a=path(1),b=path(-1),mean=(v:Pt[])=>v.reduce((s,p)=>s+p[1],0)/v.length;
      const upper=mean(a)>mean(b)?a:b;
      if(upper.length<4 || upper.some((v,i)=>i>0 && v[0]<=upper[i-1][0]))return null;
      const opening=Math.max(...coords.map(v=>v[1]))-Math.min(...coords.map(v=>v[1]));
      if(opening<3 || opening<length*.07 || opening>length*.6)return null;
      const gap=Math.min(...brow.points.map(v=>local(v)[1]))-Math.max(...upper.map(v=>v[1]));
      const height=Math.min(length*.28,gap*.65);
      if(height<2.5 || gap>length)return null;
      const proto={eye,inner,ux,uy,vx,vy,length,height,upper};
      const lower:Pt[]=[],top:Pt[]=[];
      for(let i=0;i<=24;i++){
        const u=length*i/24, v=upperLid(proto,u);
        lower.push(eyePosition(proto,u,v));
        top.push(eyePosition(proto,u,v+height*Math.sin(Math.PI*i/24)**.45));
      }
      const lidPoints=[...lower,...top.reverse()].map(([x,y])=>[x/src.width,y/src.height] as Pt);
      if(lidPoints.some(v=>v.some(n=>n<0||n>1)))return null;
      const lid=prepareGeometry({...g,cheek_l:lidPoints},src.width,src.height).cheek_l;
      if(!lid || lid.points.some(([x,y])=>!contains(p.jaw,x,y)))return null;
      const eyePixels:number[]=[],skinPixels:number[]=[];
      let eyeTotal=0,visible=0;
      for(let y=Math.max(0,Math.floor(lid.minY));y<=Math.min(src.height-1,Math.ceil(eye.maxY));y++)
        for(let x=Math.max(0,Math.floor(eye.minX));x<=Math.min(src.width-1,Math.ceil(eye.maxX));x++){
          const i=(y*src.width+x)*4,inside=contains(eye,x+.5,y+.5);
          if(inside)eyeTotal++;
          if(src.data[i+3]<250)continue;
          if(inside){eyePixels.push(luminance(src.data,i));visible++;}
          else if(contains(lid,x+.5,y+.5))skinPixels.push(luminance(src.data,i));
        }
      if(eyePixels.length<20 || skinPixels.length<15 || visible<eyeTotal*.95)return null;
      eyePixels.sort((a,b)=>a-b);skinPixels.sort((a,b)=>a-b);
      const skin=quantile(skinPixels,.6);
      if(skin<18 || quantile(eyePixels,.9)-quantile(eyePixels,.1)<Math.max(12,skin*.08))return null;
      if(skinPixels.filter(v=>v<skin*.5).length/skinPixels.length>.22)return null;
      result.push({...proto,lid,skin});
    }
    const [a,b]=result;
    if(a.length/b.length<.65 || a.length/b.length>1.54)return null;
    // Reject profile-like or misplaced pairs, allowing modest in-plane roll.
    const distance=Math.hypot(a.inner[0]-b.inner[0],a.inner[1]-b.inner[1]);
    if(distance<Math.min(a.length,b.length)*.35 || distance>Math.max(a.length,b.length)*2)return null;
    return result;
  } catch { return null; }
}
