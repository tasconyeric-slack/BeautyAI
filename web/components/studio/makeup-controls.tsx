"use client";
import type { ReactNode } from "react";
import type { BlushPlacement } from "@/lib/tint";
import type { BrowOptions } from "@/lib/tint/brow";
import type { MakeupAvailability } from "@/lib/tint/makeup";
import { BLUSH_SHADES, LIP_SHADES, BROW_SHAPES, BROW_SHADES } from "@/lib/tint/makeup-palette";
import { MAKEUP_DEFAULTS, type LookSelection } from "./compose";

const DEFAULT_BROW: BrowOptions = {shape:"soft",hex:"#533B30",density:.65,intensity:.7,thickness:1};
export function MakeupControls({look,set,availability,recommendedBlush,recommendedLips}: {
  look: LookSelection;
  set: (patch: Partial<LookSelection>, continuous?: string) => void;
  availability: MakeupAvailability;
  recommendedBlush?: {hex:string;placement:BlushPlacement};
  recommendedLips: {name:string;hex:string}[];
}) {
  const brow=look.brows ?? DEFAULT_BROW;
  const setBrow=(patch: Partial<BrowOptions>,continuous=false) => set({brows:{...brow,...patch}},continuous ? `brows.${Object.keys(patch).join(",")}` : undefined);
  const blushHex=look.blushHex ?? recommendedBlush?.hex ?? "#D56870";
  const placement=look.blushHex ? look.blushPlacement ?? "apple" : recommendedBlush?.placement ?? "apple";
  return <div className="space-y-6">
    <Module title="腮红" reason={availability.blush} active={look.blush}
      toggle={() => set({blush:!look.blush,blushHex,blushPlacement:placement})}
      reset={() => set({blush:false,blushHex:null,blushPlacement:MAKEUP_DEFAULTS.blushPlacement,blushIntensity:.45,blushOpacity:1,blushFeather:.5})}>
      <Palette title="腮红色系" shades={BLUSH_SHADES} value={look.blush ? blushHex:null}
        choose={hex=>set({blush:true,blushHex:hex,blushPlacement:placement})} />
      <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="腮红位置">
        {([{id:"apple",name:"苹果肌"},{id:"diagonal",name:"提拉"},{id:"horizontal",name:"横向"}] as const).map(p =>
          <Option key={p.id} on={placement===p.id} onClick={()=>set({blush:true,blushHex,blushPlacement:p.id})}>{p.name}</Option>)}
      </div>
      <Slider label="腮红强度" value={look.blushIntensity ?? .45} disabled={!look.blush} change={v=>set({blushIntensity:v},"blushIntensity")} />
      <Slider label="腮红不透明度" value={look.blushOpacity ?? 1} disabled={!look.blush} change={v=>set({blushOpacity:v},"blushOpacity")} />
      <Slider label="腮红羽化" value={look.blushFeather ?? .5} disabled={!look.blush} change={v=>set({blushFeather:v},"blushFeather")} />
    </Module>
    <Module title="唇色" reason={availability.lip} active={Boolean(look.lip)}
      toggle={()=>set({lip:look.lip ? null : recommendedLips[0]?.hex ?? "#AA6570"})}
      reset={()=>set({lip:null,lipIntensity:.6,lipFinish:"satin"})}>
      {recommendedLips.length>0 && <div className="mb-3"><p className="mb-1 text-[12px] text-muted">护照推荐</p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="推荐唇色">
          {recommendedLips.map(s=><Option key={s.hex} on={look.lip?.toUpperCase()===s.hex.toUpperCase()} onClick={()=>set({lip:s.hex})} hex={s.hex}>{s.name}</Option>)}
        </div></div>}
      <Palette title="唇色底调与深浅" shades={LIP_SHADES} value={look.lip} choose={hex=>set({lip:hex})} />
      <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="唇妆质地">
        {([{id:"matte",name:"哑光"},{id:"satin",name:"缎光"},{id:"gloss",name:"水光"}] as const).map(f=>
          <Option key={f.id} on={(look.lipFinish ?? "satin")===f.id} onClick={()=>set({lipFinish:f.id})}>{f.name}</Option>)}
      </div>
      <Slider label="唇色强度" value={look.lipIntensity ?? .6} disabled={!look.lip} change={v=>set({lipIntensity:v},"lipIntensity")} />
      <p className="mt-2 text-[12px] text-muted">保留原有唇纹与高光，质地为当前光线下的近似效果。</p>
    </Module>
    <Module title="眉毛" reason={availability.brows} active={Boolean(look.brows)}
      toggle={()=>set({brows:look.brows ? null:DEFAULT_BROW})} reset={()=>set({brows:null})}>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="眉形">
        {BROW_SHAPES.map(s=><Option key={s.id} on={Boolean(look.brows) && brow.shape===s.id} onClick={()=>setBrow({shape:s.id})}>
          <span className="block">{s.name}<span className="mt-0.5 block text-[11px] opacity-70">{s.note}</span></span>
        </Option>)}
      </div>
      <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="眉色">
        {BROW_SHADES.map(s=><Option key={s.hex} on={Boolean(look.brows) && brow.hex===s.hex} onClick={()=>setBrow({hex:s.hex})} hex={s.hex}>{s.name}</Option>)}
      </div>
      <Slider label="眉毛强度" value={brow.intensity} disabled={!look.brows} change={v=>setBrow({intensity:v},true)} />
      <Slider label="眉毛密度" value={brow.density} disabled={!look.brows} change={v=>setBrow({density:v},true)} />
      <Slider label="眉毛粗细" value={brow.thickness ?? 1} min={.6} max={1.6} disabled={!look.brows} change={v=>setBrow({thickness:v},true)} />
      <p className="mt-2 text-[12px] leading-5 text-muted">沿原眉添加细眉笔笔触，调整眉峰、粗细与眉尾；保留原有眉毛，不模拟剃眉或脱毛。</p>
    </Module>
  </div>;
}
function Module({title,reason,active,toggle,reset,children}: {title:string;reason:string|null;active:boolean;toggle:()=>void;reset:()=>void;children:ReactNode}) {
  return <section aria-label={`${title}编辑器`} className="rounded-[14px] border border-rule bg-paper-raised p-4">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-serif text-[17px] font-semibold">{title}</h2>
      <div className="flex gap-2">
        <button type="button" aria-label={`启用${title}`} aria-pressed={active} disabled={Boolean(reason)} onClick={toggle}
          className="min-h-9 rounded-full border border-rule px-3 text-[12px] disabled:opacity-45">{active ? "已启用":"不加 · 点击启用"}</button>
        <button type="button" onClick={reset} className="min-h-9 px-2 text-[12px] text-accent">重置{title}</button>
      </div>
    </div>
    {reason && <p role="status" className="mb-3 text-[12px] leading-5 text-ink-soft">{reason}</p>}
    <fieldset disabled={Boolean(reason)} className="min-w-0 disabled:opacity-45"><legend className="sr-only">{title}选项</legend>{children}</fieldset>
  </section>;
}
function Option({on,onClick,hex,children}: {on:boolean;onClick:()=>void;hex?:string;children:ReactNode}) {
  return <button type="button" role="radio" aria-checked={on} onClick={onClick}
    className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 py-2 text-left text-[12px] ${on ? "border-accent bg-accent-soft text-accent":"border-rule bg-paper"}`}>
    {hex && <span aria-hidden className="size-4 shrink-0 rounded-full border border-black/10" style={{background:hex}} />}{children}
  </button>;
}
function Palette({title,shades,value,choose}: {title:string;shades: {name:string;hex:string;group:string;depth?:string}[];value:string|null;choose:(hex:string)=>void}) {
  return <div aria-label={title} className="space-y-2">{Array.from(new Set(shades.map(s=>s.group))).map(group=><div key={group}>
    <p className="mb-1 text-[12px] text-muted">{group}</p>
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={`${title} · ${group}`}>
      {shades.filter(s=>s.group===group).map(s=><Option key={s.hex} on={value?.toUpperCase()===s.hex} onClick={()=>choose(s.hex)} hex={s.hex}>
        {s.name}{s.depth ? ` · ${s.depth}`:""}
      </Option>)}
    </div>
  </div>)}</div>;
}
function Slider({label,value,change,disabled,min=0,max=1}: {label:string;value:number;change:(v:number)=>void;disabled:boolean;min?:number;max?:number}) {
  return <label className="mt-3 grid grid-cols-[7rem_1fr_3rem] items-center gap-2 text-[12px]">
    <span>{label}</span><input type="range" aria-label={label} min={Math.round(min*100)} max={Math.round(max*100)} step="1" value={Math.round(value*100)} disabled={disabled}
      onChange={e=>change(Number(e.target.value)/100)} className="min-w-0 w-full accent-[var(--color-accent)]" />
    <output className="text-right tabular-nums">{Math.round(value*100)}%</output>
  </label>;
}
