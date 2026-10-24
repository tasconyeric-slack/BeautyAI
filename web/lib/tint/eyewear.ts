import { contains, prepareGeometry, type FaceGeometry, type Pt } from './geometry';

export const FRAME_SHAPES = [{id:'round', name:'圆框'}, {id:'rectangle', name:'长方框'}, {id:'cat-eye', name:'猫眼框'}] as const;
export const FRAME_COLORS = [{id:'black', name:'墨黑', hex:'#28272B'}, {id:'brown', name:'茶棕', hex:'#684333'}, {id:'gold', name:'香槟金', hex:'#AC864B'}] as const;
export interface EyewearOptions {
  shape: typeof FRAME_SHAPES[number]['id'];
  color: typeof FRAME_COLORS[number]['id'];
  width: 'narrow' | 'regular' | 'wide';
  size: number;
  /** Vertical offset as a fraction of the measured eye-center distance. */
  vertical: number;
}
export const DEFAULT_EYEWEAR: EyewearOptions = {shape:'round',color:'black',width:'regular',size:1,vertical:0};
export const EYEWEAR_UNAVAILABLE = '这张照片无法准确定位镜框：需要双眼与眉毛清晰、无遮挡的正脸照片。请换一张照片；不会猜测镜框位置。';
const clamp = (n:number,a:number,b:number) => Math.max(a,Math.min(b,n));

/** Saved options are untrusted; never persist geometry or photo-derived fit coordinates. */
export function normalizeEyewear(value: unknown): EyewearOptions | null {
  if (!value || typeof value !== 'object') return null;
  const v=value as EyewearOptions;
  if (!FRAME_SHAPES.some(s=>s.id===v.shape) || !FRAME_COLORS.some(c=>c.id===v.color)
    || !['narrow','regular','wide'].includes(v.width) || !Number.isFinite(v.size) || !Number.isFinite(v.vertical)) return null;
  return {shape:v.shape,color:v.color,width:v.width,size:clamp(v.size,.85,1.15),vertical:clamp(v.vertical,-.12,.18)};
}

export interface EyewearFit {
  origin: Pt; angle: number; distance: number;
  /** Coordinates below are in pixels, relative to origin and aligned with the eye line. */
  eyes: Pt[]; centers: Pt[]; lensWidth: number; lensHeight: number;
  top: number; browBottom: number;
}

/** Use the existing bilateral eye rings, with a conservative frontal-photo gate.
 * No detector, guessed face box, or landmarks from a different measurement view. */
export function eyewearFit(g: FaceGeometry | null | undefined, w:number, h:number, options: EyewearOptions): EyewearFit | null {
  const o=normalizeEyewear(options);
  if (!g || !o || w<=0 || h<=0) return null;
  try {
    const p=prepareGeometry(g,w,h);
    if (!p.eye_l || !p.eye_r || !p.brow_l || !p.brow_r || !p.jaw) return null;
    const rings=[p.eye_l,p.eye_r].sort((a,b)=>a.minX-b.minX);
    if (rings.some(r=>r.points.length<6 || r.maxY-r.minY<2)) return null;
    const eyes=rings.map(r=>[(r.minX+r.maxX)/2,(r.minY+r.maxY)/2] as Pt);
    const dx=eyes[1][0]-eyes[0][0],dy=eyes[1][1]-eyes[0][1],distance=Math.hypot(dx,dy),angle=Math.atan2(dy,dx);
    if (distance<24 || Math.abs(angle)>.5 || eyes.some(([x,y])=>!contains(p.jaw,x,y))) return null;
    const origin:Pt=[(eyes[0][0]+eyes[1][0])/2,(eyes[0][1]+eyes[1][1])/2];
    const c=Math.cos(angle),s=Math.sin(angle);
    const local=([x,y]:Pt):Pt=>[(x-origin[0])*c+(y-origin[1])*s,-(x-origin[0])*s+(y-origin[1])*c];
    const widths=rings.map(r=>{const xs=r.points.map(v=>local(v)[0]);return Math.max(...xs)-Math.min(...xs);});
    if (Math.min(...widths)<10 || widths[0]/widths[1]<.65 || widths[0]/widths[1]>1.54
      || widths.some(v=>v/distance<.28 || v/distance>.7)) return null;
    const brows=[p.brow_l,p.brow_r].map(r=>r.points.map(local));
    const browBottom=Math.max(...brows.flat().map(v=>v[1]));
    if (brows.some(b=>b.length<3) || browBottom>-.06*distance || browBottom<-.65*distance) return null;
    const lensWidth=distance*.82*o.size*({narrow:.94,regular:1,wide:1.06}[o.width]);
    const lensHeight=lensWidth*({round:.82,rectangle:.57,'cat-eye':.68}[o.shape]);
    const top=Math.max(browBottom+distance*.035, distance*(.09+o.vertical)-lensHeight/2);
    const cy=top+lensHeight/2;
    if (cy>distance*.38) return null;
    const centers:Pt[]=[[-distance*o.size/2,cy],[distance*o.size/2,cy]];
    // Reject cropped frames instead of silently clipping a supposedly accurate fit.
    for (const [x,y] of centers) for (const a of [-1,1]) for (const b of [-1,1]) {
      const u=x+a*lensWidth*.68,v=y+b*(lensHeight/2+distance*.03);
      const px=origin[0]+u*c-v*s,py=origin[1]+u*s+v*c;
      if (px<1 || px>w-1 || py<1 || py>h-1) return null;
    }
    return {origin,angle,distance,eyes:eyes.map(local),centers,lensWidth,lensHeight,top,browBottom};
  } catch { return null; }
}

type Edge = {a:Pt; b:Pt};
function edgeDistance(e:Edge,x:number,y:number) {
  const dx=e.b[0]-e.a[0],dy=e.b[1]-e.a[1];
  const t=clamp(((x-e.a[0])*dx+(y-e.a[1])*dy)/(dx*dx+dy*dy || 1),0,1);
  return Math.hypot(x-e.a[0]-t*dx,y-e.a[1]-t*dy);
}
/** Analytic lens distances keep switching/dragging responsive without per-pixel path scans.
 * Original round/rounded-rectangle/cat-eye art; cat-eye lifts the outside corner. */
function lensDistance(shape:EyewearOptions['shape'],x:number,y:number,w:number,h:number,side:number) {
  if (shape==='rectangle') {
    const r=h*.22,qx=Math.abs(x)-w/2+r,qy=Math.abs(y)-h/2+r;
    return Math.hypot(Math.max(qx,0),Math.max(qy,0))+Math.min(Math.max(qx,qy),0)-r;
  }
  let u=x/(w/2),v=y/(h/2);
  if(shape==='cat-eye') {
    v=v*1.14+.28*Math.max(0,u*side)**3-.14;
    u/=1+.13*Math.max(0,-v)*Math.max(0,u*side);
  }
  return (Math.hypot(u,v)-1)*Math.min(w,h)/2;
}

/** Pure, local ImageData compositor, like the other Studio layers. Only a small frame ROI is rasterized. */
export function eyewear(src:ImageData,g:FaceGeometry,options:EyewearOptions):ImageData {
  const o=normalizeEyewear(options),fit=o && eyewearFit(g,src.width,src.height,o);
  if (!o || !fit || src.data.length!==src.width*src.height*4) return src;
  const {origin,angle,distance:d,centers,lensWidth:w,lensHeight:h}=fit;
  const rim=d*(o.color==='gold'?.015:.023),c=Math.cos(angle),s=Math.sin(angle);
  const bridge:Pt[]=[];
  const inner=d*o.size/2-w/2, by=centers[0][1]-h*.12;
  for(let i=0;i<=16;i++) {const t=i/16;bridge.push([-inner+2*inner*t,by-Math.sin(Math.PI*t)*d*.065]);}
  const segments:Edge[]=bridge.slice(1).map((b,i)=>({a:bridge[i],b}));
  for (const side of [-1,1]) segments.push({a:[side*(d*o.size/2+w*.48),centers[0][1]-h*.21],b:[side*(d*o.size/2+w*.65),centers[0][1]-h*.34]});
  const color=FRAME_COLORS.find(v=>v.id===o.color)!.hex;
  const rgb=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16));
  const out=new ImageData(new Uint8ClampedArray(src.data),src.width,src.height);
  const extent=d*o.size/2+w*.68+rim*3;
  const radius=extent+Math.max(Math.abs(fit.top),Math.abs(fit.top+h));
  const paint=(i:number,col:number[],a:number)=>{for(let k=0;k<3;k++)out.data[i+k]=out.data[i+k]*(1-a)+col[k]*a;};
  for(let y=Math.max(0,Math.floor(origin[1]-radius));y<Math.min(src.height,origin[1]+radius);y++)
    for(let x=Math.max(0,Math.floor(origin[0]-radius));x<Math.min(src.width,origin[0]+radius);x++) {
      const i=(y*src.width+x)*4;if(!src.data[i+3])continue;
      const dx=x+.5-origin[0],dy=y+.5-origin[1],u=dx*c+dy*s,v=-dx*s+dy*c;
      if(Math.abs(u)>extent || v<fit.top-rim*2 || v>fit.top+h+rim*4)continue;
      const side=u<0?-1:1,center=centers[u<0?0:1];
      const lens=lensDistance(o.shape,u-center[0],v-center[1],w,h,side);
      let line=Math.abs(lens);
      if(Math.abs(u)<inner+rim*2) for(const e of segments.slice(0,16))line=Math.min(line,edgeDistance(e,u,v));
      for(const e of segments.slice(16))line=Math.min(line,edgeDistance(e,u,v));
      const shadow=Math.abs(lensDistance(o.shape,u-center[0]-rim*.2,v-center[1]-rim*1.2,w,h,side));
      paint(i,[20,16,14],clamp(1-shadow/(rim*2.4),0,1)*.18);
      if(lens<0) {
        paint(i,[170,195,202],.035);
        // A restrained curved reflection keeps clear lenses transparent over the real eyes.
        const reflection=clamp(1-Math.abs(v-(fit.top+h*.25+u*.12))/(d*.022),0,1)*.08;
        paint(i,[255,255,255],reflection);
      }
      const coverage=clamp(rim+.5-line,0,1);
      if(coverage) {
        paint(i,rgb,coverage*.98);
        const highlight=clamp(1-Math.abs(line-rim*.65)/(rim*.4),0,1)*.32*coverage;
        paint(i,[225,213,188],highlight);
      }
    }
  return out;
}
