'use client';
import type { LookSelection } from './compose';
import { DEFAULT_EYEWEAR, FRAME_SHAPES, FRAME_COLORS, type EyewearOptions } from '@/lib/tint/eyewear';
import { cn } from '@/lib/utils';

export function EyewearControls({look,set,reason,warning=null}:{
  look:LookSelection; set:(patch:Partial<LookSelection>,continuous?:string)=>void; reason:string|null; warning?:string|null;
}) {
  const selected=look.eyewear, o=selected ?? DEFAULT_EYEWEAR;
  const blocked=reason || (look.eyesObscured ? '眼部已有眼镜或头发遮挡，已暂停试戴。请使用无眼镜、无遮挡的正脸照片。':null);
  const change=(patch:Partial<EyewearOptions>,key?:string)=>set({eyewear:{...o,...patch}},key);
  return <section id="eyewear" aria-label="眼镜试戴" className="rounded-[14px] border border-rule bg-paper-raised p-4">
    <div className="mb-2 flex items-baseline justify-between gap-2">
      <h2 className="font-serif text-[17px] font-semibold">眼镜试戴</h2>
      <button type="button" disabled={!selected} onClick={()=>set({eyewear:null})} className="text-[12px] text-accent disabled:opacity-40">重置眼镜</button>
    </div>
    <p className="mb-3 text-[12px] leading-5 text-muted">即时比较镜框轮廓；先看鼻梁与双眼是否贴合，再微调大小和高低。仅作外观模拟，不用于验配或毫米测量。</p>
    {blocked && <p role="status" className="mb-3 text-[13px] leading-6 text-amber-800">{blocked}</p>}
    {!blocked && warning && <p role="status" className="mb-3 text-[13px] leading-6 text-amber-800">{warning}</p>}
    <div role="radiogroup" aria-label="镜框形状" className="flex flex-wrap gap-2">
      <Option on={!selected} click={()=>set({eyewear:null})}>不戴眼镜</Option>
      {FRAME_SHAPES.map(s=><Option key={s.id} on={selected?.shape===s.id} disabled={Boolean(blocked)} click={()=>change({shape:s.id})}>
        <FrameIcon shape={s.id}/>{s.name}
      </Option>)}
    </div>
    <fieldset disabled={!selected || Boolean(blocked)} className="mt-3 space-y-3 disabled:opacity-45">
      <legend className="sr-only">镜框颜色与贴合调整</legend>
      <div role="radiogroup" aria-label="镜框颜色" className="flex flex-wrap gap-2">
        {FRAME_COLORS.map(c=><Option key={c.id} on={o.color===c.id} click={()=>change({color:c.id})}>
          <span aria-hidden className="size-3.5 rounded-full border border-black/10" style={{background:c.hex}}/>{c.name}
        </Option>)}
      </div>
      <div role="radiogroup" aria-label="镜框宽度" className="flex flex-wrap gap-2">
        {(['narrow','regular','wide'] as const).map((v,i)=><Option key={v} on={o.width===v} click={()=>change({width:v})}>{['略窄','标准宽','略宽'][i]}</Option>)}
      </div>
      <label className="block text-[13px]">镜框大小 <span className="float-right tabular-nums">{Math.round(o.size*100)}%</span>
        <input aria-label="镜框大小" type="range" min="85" max="115" value={Math.round(o.size*100)} onChange={e=>change({size:Number(e.target.value)/100},'eyewear-size')} className="mt-2 block w-full accent-accent"/>
      </label>
      <label className="block text-[13px]">镜框高低 <span className="float-right text-[12px] text-muted">上移 ← → 下移</span>
        <input aria-label="镜框高低" type="range" min="-12" max="18" value={Math.round(o.vertical*100)} onChange={e=>change({vertical:Number(e.target.value)/100},'eyewear-vertical')} className="mt-2 block w-full accent-accent"/>
      </label>
      <p className="text-[12px] text-muted">上移会保留眉部空间；若位置仍不准，请换一张正脸照片。</p>
    </fieldset>
  </section>;
}
function Option({on,click,children,disabled}:{on:boolean;click:()=>void;children:React.ReactNode;disabled?:boolean}) {
  return <button type="button" role="radio" aria-checked={on} onClick={click} disabled={disabled}
    className={cn('inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-[13px] disabled:cursor-not-allowed disabled:opacity-45',on?'border-accent bg-accent-soft text-accent':'border-rule-strong bg-paper text-ink')}>{children}</button>;
}
function FrameIcon({shape}:{shape:EyewearOptions['shape']}) {
  return <svg aria-hidden width="38" height="18" viewBox="0 0 38 18" fill="none" stroke="currentColor" strokeWidth="1.5">
    {shape==='round'?<><ellipse cx="10" cy="10" rx="7" ry="6.5"/><ellipse cx="28" cy="10" rx="7" ry="6.5"/></>
      :shape==='rectangle'?<><rect x="3" y="5" width="14" height="10" rx="3"/><rect x="21" y="5" width="14" height="10" rx="3"/></>
      :<><path d="M2 3Q10 4 17 7Q18 16 9 16Q3 15 2 3Z"/><path d="M36 3Q28 4 21 7Q20 16 29 16Q35 15 36 3Z"/></>}
    <path d="M17 8Q19 6 21 8M0 6L3 7M35 7L38 6"/>
  </svg>;
}
