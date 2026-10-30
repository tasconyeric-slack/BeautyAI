'use client';
import { HAIR_SHADES } from '@/lib/tint/hair-palette';
import type { LookSelection } from './compose';
export function HairColorControls({ hex, strength, ready, state, approximate, recommended, set }: {
  hex: string | null; strength: number; ready: boolean; state: string; approximate: boolean;
  recommended: { hex: string; name: string }[]; set: (patch: Partial<LookSelection>) => void;
}) {
  const swatch = (h: { hex: string; name: string }) => (
    <button key={h.hex} type="button" role="radio" aria-checked={hex === h.hex} disabled={!ready}
      onClick={() => set({ hairColor: null, hairHex: h.hex })}
      className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-3 py-1 text-[13px] disabled:opacity-45 ${hex === h.hex ? 'border-accent bg-accent-soft text-accent' : 'border-rule bg-paper-raised'}`}>
      <span aria-hidden className="size-4 rounded-full border border-black/10" style={{ background: h.hex }} />{h.name}
    </button>
  );
  return <section aria-label="发色">
    <div className="mb-2 flex items-baseline justify-between"><h2 className="font-serif text-[17px] font-semibold">发色</h2><p className="text-[12px] text-muted">切换颜色，即时比较</p></div>
    <div className="mb-2 flex flex-wrap gap-2" role="radiogroup" aria-label="推荐发色">
      <button type="button" role="radio" aria-checked={!hex} onClick={() => set({ hairColor: null, hairHex: null })} className="min-h-10 rounded-full border border-rule px-3 text-[13px]">现在的发色</button>
      {recommended.map(swatch)}
    </div>
    <details className="mt-4 border-t border-rule pt-2"><summary className="min-h-11 cursor-pointer py-2 text-[13px]">探索完整色库</summary>{['深色', '棕色', '红色', '浅色'].map(group => <div key={group} className="mb-2">
      <p className="mb-1 text-[12px] text-muted">{group}</p>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={`${group}发色`}>{HAIR_SHADES.filter(h => h.group === group).map(swatch)}</div>
    </div>)}</details>
    <div className="mt-3 flex flex-wrap items-center gap-4 text-[13px]">
      <label className="flex items-center gap-2">自选发色<input aria-label="自选发色" type="color" value={hex ?? '#684536'} disabled={!ready} onChange={e => set({ hairColor: null, hairHex: e.target.value.toUpperCase() })} /></label>
      <label className="flex items-center gap-2">发色强度<input aria-label="发色强度" type="range" min="0" max="100" value={Math.round(strength * 100)} disabled={!hex || !ready} onChange={e => set({ hairStrength: Number(e.target.value) / 100 })} /><span>{Math.round(strength * 100)}%</span></label>
    </div>
    <p className="mt-2 text-[12px] leading-6 text-muted" aria-live="polite">
      {state === 'loading' ? '正在识别当前发型边缘，完成后切换发色无需等待。'
        : state === 'error' ? '这张照片暂时无法准确识别头发边缘，发色试色不可用。'
        : approximate ? '浅发色预览仅作方向参考，染后效果取决于底色与发质。'
        : '保留当前照片的发丝纹理与明暗。'}
    </p>
  </section>;
}
