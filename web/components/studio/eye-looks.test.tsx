import { describe,expect,it } from "vitest";
import { MAKEUP_PRESETS, presetSelection } from "@/lib/tint/makeup-presets";
import { EYESHADOW_SHADES } from "@/lib/tint/eye-palette";
import { EMPTY_LOOK, describeLook, layersForLook, restoreLook } from "./compose";

describe("complete makeup Looks",()=>{
  it("has eight meaningful shades grouped by undertone",()=>{
    expect(EYESHADOW_SHADES).toHaveLength(8);
    expect(new Set(EYESHADOW_SHADES.map(s=>s.hex)).size).toBe(8);
    expect(new Set(EYESHADOW_SHADES.map(s=>s.group)).size).toBeGreaterThanOrEqual(3);
  });
  it("replaces all makeup with each preset while keeping hair and drape",()=>{
    const old={...EMPTY_LOOK,hair:"bold" as const,hairHex:"#777777",drape:"#FFEEDD",blushOpacity:.1,lipFinish:"gloss" as const};
    for(const preset of MAKEUP_PRESETS){
      const next={...old,...presetSelection(preset.id)};
      expect(next.hair).toBe("bold");expect(next.drape).toBe("#FFEEDD");expect(next.hairHex).toBe("#777777");
      if(preset.id==="none"){
        expect(next.eyeshadow).toBeNull();expect(next.eyeliner).toBeNull();expect(next.lip).toBeNull();expect(next.blush).toBe(false);expect(next.brows).toBeNull();
      }else{
        expect(next.eyeshadow?.intensity).toBeGreaterThan(0);expect(next.eyeliner?.intensity).toBeGreaterThan(0);
        expect(next.blush).toBe(true);expect(next.lip).toMatch(/^#[0-9A-F]{6}$/);expect(next.brows?.density).toBeGreaterThan(0);
        expect(next.blushOpacity).toBe(1);expect(next.lipFinish).toBe("satin");
      }
      expect(restoreLook(JSON.parse(JSON.stringify(next)))).toEqual(next);
    }
    expect(new Set(MAKEUP_PRESETS.filter(p=>p.id!=="none").map(p=>JSON.stringify(presetSelection(p.id)))).size).toBe(3);
  });
  it("restores eye settings and clears them when loading a legacy Look",()=>{
    const selected={...EMPTY_LOOK,...presetSelection("occasion")};
    expect(layersForLook(selected).eyeshadow).toEqual(selected.eyeshadow);
    expect(layersForLook(selected).eyeliner).toEqual(selected.eyeliner);
    const old=restoreLook({lip:"#AA4455",blush:true});
    expect({...selected,...old}.eyeshadow).toBeNull();expect({...selected,...old}.eyeliner).toBeNull();
    expect(layersForLook({...selected,eyesObscured:true}).eyeshadow).toBeNull();
    expect(layersForLook({...selected,eyesObscured:true}).eyeliner).toBeNull();
  });
  it("includes eye-only edits in comparison/reset/save summaries",()=>{
    expect(describeLook({eyeshadowName:"玫瑰棕"})).toBe("玫瑰棕眼影");
    expect(describeLook({eyelinerName:"微翘眼线"})).toBe("微翘眼线");
  });
});
