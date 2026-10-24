"use client";
import type { ReactNode } from "react";
import type { MakeupAvailability } from "@/lib/tint/makeup";
import type { EyeshadowOptions } from "@/lib/tint/eyeshadow";
import type { EyelinerOptions } from "@/lib/tint/eyeliner";
import { EYESHADOW_SHADES, EYELINER_SHADES } from "@/lib/tint/eye-palette";
import { MAKEUP_PRESETS, presetSelection } from "@/lib/tint/makeup-presets";
import type { LookSelection } from "./compose";

type Setter=(patch:Partial<LookSelection>,continuous?:string)=>void;
const SHADOW:EyeshadowOptions={hex:"#8F807B",style:"wash",intensity:.6,blend:.65};
const LINER:EyelinerOptions={hex:"#382C28",style:"tightline",intensity:.7,thickness:.4};

export function MakeupPresets({look,set,availability}:{look:LookSelection;set:Setter;availability:MakeupAvailability}){
  const limited=Object.values(availability).some(Boolean) || look.eyesObscured;
  return <section aria-label="完整妆容预设" className="rounded-[14px] border border-rule bg-paper-raised p-4">
    <h2 className="font-serif text-[17px] font-semibold">一键完整妆容</h2>
    <p className="mb-3 mt-1 text-[12px] text-muted">统一搭配眼影、眼线、腮红、唇色与眉毛；每项仍可单独调整。</p>
    <div className="grid grid-cols-2 gap-2">
      {MAKEUP_PRESETS.map(p=>{
        const selection=presetSelection(p.id);
        const active=Object.entries(selection).every(([k,v])=>JSON.stringify(look[k as keyof LookSelection])===JSON.stringify(v));
        return <button key={p.id} type="button" aria-pressed={active} onClick={()=>set(selection)}
          className={`min-h-16 rounded-xl border p-3 text-left ${active?"border-accent bg-accent-soft text-accent":"border-rule bg-paper"}`}>
          <span className="block text-[13px] font-medium">{p.name}</span><span className="mt-1 block text-[11px] leading-5 text-muted">{p.note}</span>
        </button>;
      })}
    </div>
    {limited && <p role="status" className="mt-3 text-[12px] leading-5 text-ink-soft">不可可靠定位或已标记遮挡的部位会跳过预览，其余妆容仍可试用；原因见各编辑器。</p>}
  </section>;
}

export function EyeMakeupControls({look,set,availability}:{look:LookSelection;set:Setter;availability:MakeupAvailability}){
  const shadow=look.eyeshadow ?? SHADOW,liner=look.eyeliner ?? LINER;
  const setShadow=(patch:Partial<EyeshadowOptions>,continuous=false)=>set({eyeshadow:{...shadow,...patch}},continuous?`eyeshadow.${Object.keys(patch).join(",")}`:undefined);
  const setLiner=(patch:Partial<EyelinerOptions>,continuous=false)=>set({eyeliner:{...liner,...patch}},continuous?`eyeliner.${Object.keys(patch).join(",")}`:undefined);
  const obscured=look.eyesObscured?"已标记眼部遮挡，眼影与眼线预览已暂停。请换无遮挡照片再试。":null;
  return <div className="space-y-6">
    <label className="flex items-start gap-2 text-[12px] leading-5 text-ink-soft">
      <input type="checkbox" className="mt-1 accent-[var(--color-accent)]" checked={look.eyesObscured ?? false} onChange={e=>set({eyesObscured:e.target.checked})}/>
      <span>眼部有眼镜或头发遮挡，暂停眼妆。自动检查不能识别所有遮挡，请对照原图确认贴合。</span>
    </label>
    <EyeModule title="眼影" reason={obscured ?? availability.eyeshadow} active={Boolean(look.eyeshadow)}
      toggle={()=>set({eyeshadow:look.eyeshadow?null:SHADOW})} reset={()=>set({eyeshadow:null})}>
      {Array.from(new Set(EYESHADOW_SHADES.map(s=>s.group))).map(group=><div key={group} className="mb-3">
        <p className="mb-1 text-[12px] text-muted">{group}</p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={`眼影色系 · ${group}`}>
          {EYESHADOW_SHADES.filter(s=>s.group===group).map(s=><EyeOption key={s.hex} active={Boolean(look.eyeshadow) && shadow.hex===s.hex} hex={s.hex} choose={()=>setShadow({hex:s.hex})}>{s.name}</EyeOption>)}
        </div>
      </div>)}
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="眼影位置">
        <EyeOption active={Boolean(look.eyeshadow) && shadow.style==="wash"} choose={()=>setShadow({style:"wash"})}>柔和铺色</EyeOption>
        <EyeOption active={Boolean(look.eyeshadow) && shadow.style==="outer"} choose={()=>setShadow({style:"outer"})}>外眼角晕染</EyeOption>
      </div>
      <EyeSlider label="眼影强度" value={shadow.intensity} disabled={!look.eyeshadow} change={v=>setShadow({intensity:v},true)}/>
      <EyeSlider label="眼影柔化" value={shadow.blend} disabled={!look.eyeshadow} change={v=>setShadow({blend:v},true)}/>
      <p className="mt-2 text-[12px] leading-5 text-muted">沿上眼睑柔和晕染，保留皮肤纹理与原有光影；不涂眼白、睫毛或眉毛。</p>
    </EyeModule>
    <EyeModule title="眼线" reason={obscured ?? availability.eyeliner} active={Boolean(look.eyeliner)}
      toggle={()=>set({eyeliner:look.eyeliner?null:LINER})} reset={()=>set({eyeliner:null})}>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="眼线样式">
        <EyeOption active={Boolean(look.eyeliner) && liner.style==="tightline"} choose={()=>setLiner({style:"tightline"})}>自然贴根</EyeOption>
        <EyeOption active={Boolean(look.eyeliner) && liner.style==="wing"} choose={()=>setLiner({style:"wing"})}>微翘眼线</EyeOption>
      </div>
      <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="眼线颜色">
        {EYELINER_SHADES.map(s=><EyeOption key={s.hex} active={Boolean(look.eyeliner) && liner.hex===s.hex} hex={s.hex} choose={()=>setLiner({hex:s.hex})}>{s.name}</EyeOption>)}
      </div>
      <EyeSlider label="眼线粗细" value={liner.thickness} disabled={!look.eyeliner} change={v=>setLiner({thickness:v},true)}/>
      <EyeSlider label="眼线强度" value={liner.intensity} disabled={!look.eyeliner} change={v=>setLiner({intensity:v},true)}/>
      <p className="mt-2 text-[12px] leading-5 text-muted">贴合上眼睑外缘，内眼角自然收细；微翘样式从外眼角连续延伸。</p>
    </EyeModule>
  </div>;
}
function EyeModule({title,reason,active,toggle,reset,children}:{title:string;reason:string|null;active:boolean;toggle:()=>void;reset:()=>void;children:ReactNode}){
  return <section role="region" aria-label={`${title}编辑器`} className="rounded-[14px] border border-rule bg-paper-raised p-4">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-serif text-[17px] font-semibold">{title}</h2>
      <div className="flex gap-2">
        <button type="button" aria-label={`启用${title}`} aria-pressed={active} disabled={Boolean(reason)} onClick={toggle}
          className="min-h-9 rounded-full border border-rule px-3 text-[12px] disabled:opacity-45">{active?"已启用":"不加 · 点击启用"}</button>
        <button type="button" onClick={reset} className="min-h-9 px-2 text-[12px] text-accent">重置{title}</button>
      </div>
    </div>
    {reason && <p role="status" className="mb-3 text-[12px] leading-5 text-ink-soft">{reason}</p>}
    <fieldset disabled={Boolean(reason)} className="min-w-0 disabled:opacity-45"><legend className="sr-only">{title}选项</legend>{children}</fieldset>
  </section>;
}
function EyeOption({active,choose,hex,children}:{active:boolean;choose:()=>void;hex?:string;children:ReactNode}){
  return <button type="button" role="radio" aria-checked={active} onClick={choose}
    className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 py-2 text-left text-[12px] ${active?"border-accent bg-accent-soft text-accent":"border-rule bg-paper"}`}>
    {hex && <span aria-hidden className="size-4 shrink-0 rounded-full border border-black/10" style={{background:hex}}/>}{children}
  </button>;
}
function EyeSlider({label,value,disabled,change}:{label:string;value:number;disabled:boolean;change:(v:number)=>void}){
  return <label className="mt-3 grid grid-cols-[7rem_1fr_3rem] items-center gap-2 text-[12px]">
    <span>{label}</span><input type="range" aria-label={label} min="0" max="100" step="1" value={Math.round(value*100)} disabled={disabled}
      onChange={e=>change(Number(e.target.value)/100)} className="min-w-0 w-full accent-[var(--color-accent)]"/>
    <output className="text-right tabular-nums">{Math.round(value*100)}%</output>
  </label>;
}
