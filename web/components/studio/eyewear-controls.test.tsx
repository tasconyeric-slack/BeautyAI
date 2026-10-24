import * as React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { EyewearControls } from './eyewear-controls';
import { EMPTY_LOOK, type LookSelection } from './compose';
import { DEFAULT_EYEWEAR } from '@/lib/tint/eyewear';
function Harness({reason=null,warning=null,initial=EMPTY_LOOK}:{reason?:string|null;warning?:string|null;initial?:LookSelection}) {
  const [look,setLook]=React.useState(initial);
  return <><EyewearControls look={look} set={p=>setLook(v=>({...v,...p}))} reason={reason} warning={warning}/><output data-testid="selection">{JSON.stringify(look)}</output></>;
}
describe('eyewear controls',()=>{
  it('offers three shapes, fit controls and an independent reset that keeps other layers',()=>{
    render(<Harness initial={{...EMPTY_LOOK,lip:'#AA6677'}}/>);
    fireEvent.click(screen.getByRole('radio',{name:'猫眼框'}));
    fireEvent.click(screen.getByRole('radio',{name:'香槟金'}));
    fireEvent.change(screen.getByLabelText('镜框大小'),{target:{value:'108'}});
    fireEvent.change(screen.getByLabelText('镜框高低'),{target:{value:'8'}});
    const selection=JSON.parse(screen.getByTestId('selection').textContent!);
    expect(selection.eyewear).toEqual({...DEFAULT_EYEWEAR,shape:'cat-eye',color:'gold',size:1.08,vertical:.08});
    fireEvent.click(screen.getByRole('button',{name:'重置眼镜'}));
    expect(JSON.parse(screen.getByTestId('selection').textContent!).eyewear).toBeNull();
    expect(JSON.parse(screen.getByTestId('selection').textContent!).lip).toBe('#AA6677');
  });
  it('explains unsupported geometry and lets a paused saved selection be removed',()=>{
    render(<Harness reason="无法准确定位" initial={{...EMPTY_LOOK,eyewear:DEFAULT_EYEWEAR}}/>);
    expect(screen.getByText('无法准确定位')).toBeTruthy();
    expect((screen.getByRole('radio',{name:'圆框'}) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button',{name:'重置眼镜'}));
    expect(JSON.parse(screen.getByTestId('selection').textContent!).eyewear).toBeNull();
  });
  it('keeps adjustments available when only the selected fit exceeds the photo',()=>{
    render(<Harness warning="当前调整超出照片范围" initial={{...EMPTY_LOOK,eyewear:{...DEFAULT_EYEWEAR,size:1.15}}}/>);
    expect(screen.getByText('当前调整超出照片范围')).toBeTruthy();
    expect((screen.getByLabelText('镜框大小') as HTMLInputElement).disabled).toBe(false);
    fireEvent.change(screen.getByLabelText('镜框大小'),{target:{value:'95'}});
    expect(JSON.parse(screen.getByTestId('selection').textContent!).eyewear.size).toBe(.95);
  });
});
