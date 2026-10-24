import * as React from "react";
import {fireEvent,render,screen,within} from "@testing-library/react";
import {beforeEach,describe,expect,it} from "vitest";
import {MakeupControls} from "./makeup-controls";
import {EMPTY_LOOK,restoreLook,type LookSelection} from "./compose";
import {readChoices,useChoices} from "@/lib/state/choices";

const ready={lip:null,blush:null,brows:null,eyeshadow:null,eyeliner:null};
function Harness({recommendedBlush}: {recommendedBlush?: {hex:string;placement:"diagonal"}}) {
  const [look,setLook]=React.useState<LookSelection>(EMPTY_LOOK);
  const {choices,saveLook}=useChoices("makeup-test");
  return <>
    <MakeupControls look={look} set={patch=>setLook(l=>({...l,...patch}))} availability={ready} recommendedBlush={recommendedBlush} recommendedLips={[]} />
    <button onClick={()=>saveLook({...look,name:"My makeup"})}>Save combination</button>
    <button onClick={()=>setLook(EMPTY_LOOK)}>Reset all</button>
    {choices.looks.map(s=><button key={s.id} onClick={()=>setLook(restoreLook({...s,hair:null}))}>Load combination</button>)}
  </>;
}
beforeEach(()=>localStorage.clear());
describe("makeup controls and device storage",()=>{
  it("saves and reloads all three modules, and resets each independently",()=>{
    render(<Harness />);
    fireEvent.click(screen.getByRole("radio",{name:"蜜桃"}));
    fireEvent.click(screen.getByRole("radio",{name:"提拉"}));
    fireEvent.change(screen.getByLabelText("腮红羽化"),{target:{value:"80"}});
    fireEvent.click(screen.getByRole("radio",{name:"梅紫 · 深"}));
    fireEvent.click(screen.getByRole("radio",{name:"水光"}));
    fireEvent.change(screen.getByLabelText("唇色强度"),{target:{value:"75"}});
    fireEvent.click(screen.getByRole("radio",{name:/上扬精致/}));
    fireEvent.change(screen.getByLabelText("眉毛密度"),{target:{value:"45"}});
    fireEvent.click(screen.getByText("Save combination"));
    const stored=readChoices("makeup-test").looks[0];
    expect(stored).toMatchObject({blush:true,blushHex:"#E6987F",blushPlacement:"diagonal",blushFeather:.8,lip:"#783953",lipFinish:"gloss",lipIntensity:.75,brows:{shape:"arched",density:.45}});
    expect(JSON.stringify(stored)).not.toMatch(/data:image|pixels|geometry/);
    fireEvent.click(screen.getByRole("button",{name:"重置唇色"}));
    expect(screen.getByRole("button",{name:"启用唇色"}).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button",{name:"启用腮红"}).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button",{name:"启用眉毛"}).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByText("Reset all"));
    fireEvent.click(screen.getByText("Load combination"));
    expect((screen.getByLabelText("腮红羽化") as HTMLInputElement).value).toBe("80");
    expect((screen.getByLabelText("唇色强度") as HTMLInputElement).value).toBe("75");
    expect((screen.getByLabelText("眉毛密度") as HTMLInputElement).value).toBe("45");
    expect(screen.getByRole("radio",{name:"水光"}).getAttribute("aria-checked")).toBe("true");
  });
  it("keeps the effective recommended placement when enabling or choosing a blush shade",()=>{
    render(<Harness recommendedBlush={{hex:"#D56870",placement:"diagonal"}} />);
    fireEvent.click(screen.getByRole("button",{name:"启用腮红"}));
    expect(screen.getByRole("radio",{name:"提拉"}).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("radio",{name:"蜜桃"}));
    expect(screen.getByRole("radio",{name:"提拉"}).getAttribute("aria-checked")).toBe("true");
  });
  it("disables only unavailable modules and explains why",()=>{
    render(<MakeupControls look={EMPTY_LOOK} set={()=>{}} availability={{...ready,brows:"Brows are obscured"}} recommendedLips={[]} />);
    expect(screen.getByText("Brows are obscured")).toBeTruthy();
    const brows=screen.getByRole("region",{name:"眉毛编辑器"});
    expect((within(brows).getByRole("group",{name:"眉毛选项"}) as HTMLFieldSetElement).disabled).toBe(true);
    expect((screen.getByRole("button",{name:"启用眉毛"}) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button",{name:"启用唇色"}) as HTMLButtonElement).disabled).toBe(false);
  });
});
