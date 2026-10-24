import type { MakeupSelection } from "./makeup";

export const MAKEUP_PRESETS = [
  {id:"none",name:"不加妆",note:"清除全部妆容，保留发型与近脸色"},
  {id:"natural",name:"自然日常",note:"燕麦浅棕 · 贴根棕线 · 蜜桃裸唇"},
  {id:"polished",name:"精致通勤",note:"柔雾灰棕 · 细致眼线 · 豆沙缎唇"},
  {id:"occasion",name:"玫瑰赴约",note:"玫瑰外眼角 · 微翘眼线 · 玫瑰红唇"},
] as const;
export type MakeupPresetId = typeof MAKEUP_PRESETS[number]["id"];
type PresetSelection = MakeupSelection & {lip:string|null;blush:boolean};

/** A preset replaces every cosmetic setting in one history entry. Hair, drape and the
 * person's obstruction switch are intentionally absent so applying a look preserves them. */
export function presetSelection(id:MakeupPresetId):PresetSelection {
  const base:PresetSelection={lip:null,blush:false,blushHex:null,blushPlacement:"apple",blushIntensity:.45,
    blushOpacity:1,blushFeather:.5,lipIntensity:.6,lipFinish:"satin",brows:null,eyeshadow:null,eyeliner:null};
  switch(id){
    case "none":return base;
    case "natural":return {...base,blush:true,blushHex:"#E6987F",blushIntensity:.3,blushFeather:.65,
      lip:"#BE7768",lipIntensity:.32,brows:{shape:"soft",hex:"#66564D",density:.35,intensity:.4,thickness:1},
      eyeshadow:{hex:"#B79B84",style:"wash",intensity:.4,blend:.7},eyeliner:{hex:"#65463A",style:"tightline",thickness:.2,intensity:.5}};
    case "polished":return {...base,blush:true,blushHex:"#C58B84",blushPlacement:"diagonal",blushIntensity:.4,blushFeather:.65,
      lip:"#AA6570",lipIntensity:.55,brows:{shape:"soft",hex:"#493F3E",density:.5,intensity:.55,thickness:1},
      eyeshadow:{hex:"#8F807B",style:"wash",intensity:.6,blend:.65},eyeliner:{hex:"#382C28",style:"tightline",thickness:.45,intensity:.7}};
    case "occasion":return {...base,blush:true,blushHex:"#D56870",blushPlacement:"diagonal",blushIntensity:.5,blushFeather:.65,
      lip:"#A74658",lipIntensity:.7,brows:{shape:"arched",hex:"#493F3E",density:.55,intensity:.6,thickness:1},
      eyeshadow:{hex:"#9D687D",style:"outer",intensity:.8,blend:.6},eyeliner:{hex:"#53404E",style:"wing",thickness:.6,intensity:.8}};
  }
}
