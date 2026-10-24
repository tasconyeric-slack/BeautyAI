import { rgbToLab } from "./color";
import { boundaryDistance, contains, prepareGeometry } from "./geometry";
import type { FaceGeometry } from "./geometry";
import { render } from "./mask";

export type LipFinish = "matte" | "satin" | "gloss";

/** Outer lip minus inner lip and both eyes; only a small L* shift preserves texture. */
export function lipTint(
  src: ImageData,
  g: FaceGeometry,
  hex: string,
  intensity: number,
  finish: LipFinish = "satin",
): ImageData {
  if (!["matte","satin","gloss"].includes(finish)) throw new TypeError("Unknown lip finish.");
  const measured=prepareGeometry(g,src.width,src.height);
  const values: number[]=[];
  const outer=measured.lip_outer;
  if(outer) for(let y=Math.max(0,Math.floor(outer.minY));y<Math.min(src.height,outer.maxY);y++)
    for(let x=Math.max(0,Math.floor(outer.minX));x<Math.min(src.width,outer.maxX);x++) {
      const i=(y*src.width+x)*4;
      if(contains(outer,x+.5,y+.5) && !contains(measured.lip_inner,x+.5,y+.5) && src.data[i+3])
        values.push(rgbToLab(src.data[i],src.data[i+1],src.data[i+2])[0]);
    }
  const reference=values.length ? values.sort((a,b)=>a-b)[Math.floor(values.length/2)] : 50;
  return render(
    src,
    g,
    hex,
    intensity,
    (geometry) => ({
      regions: [
        {
          polygon: geometry.lip_outer,
          sigma: Math.max(0.5, Math.min(src.width, src.height) * 0.002),
          falloff: (x,y) => geometry.lip_inner ? Math.min(1,boundaryDistance(geometry.lip_inner,x,y)/Math.max(.75,src.width*.002)) : 1,
        },
      ],
    }),
    { chroma: 1, lightness: .55, lightnessReference: reference,
      // Finishes modulate the portrait's existing highlights, keeping every local crease.
      highlight: finish === "gloss" ? 7 : finish === "matte" ? -3 : 0,
      pixelWeight: (r,g,b) => {
        const max=Math.max(r,g,b), min=Math.min(r,g,b);
        // Extra protection for bright neutral teeth and nearly black facial hairs inside imperfect contours.
        if (min > 205 && max-min < 28) return 0;
        return Math.min(1,Math.max(0,(max-15)/25));
      },
    },
  );
}
