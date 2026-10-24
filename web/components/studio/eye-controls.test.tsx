import * as React from "react";
import { fireEvent,render,screen,within } from "@testing-library/react";
import { beforeEach,describe,expect,it } from "vitest";
import { EyeMakeupControls, MakeupPresets } from "./eye-makeup-controls";
import { EMPTY_LOOK,restoreLook,type LookSelection } from "./compose";
import { readChoices,useChoices } from "@/lib/state/choices";
const ready={lip:null,blush:null,brows:null,eyeshadow:null,eyeliner:null};
function Harness(){
  const [look,setLook]=React.useState<LookSelection>(EMPTY_LOOK);
  const {choices,saveLook}=useChoices("eye-test");
  const set=(patch:Partial<LookSelection>)=>setLook(l=>({...l,...patch}));
  return <><MakeupPresets look={look} set={set} availability={ready}/><EyeMakeupControls look={look} set={set} availability={ready}/>
    <button onClick={()=>saveLook({...look,name:"Saved eyes"})}>Save</button>
    <button onClick={()=>setLook(EMPTY_LOOK)}>Reset all</button>
    {choices.looks.map(s=><button key={s.id} onClick={()=>setLook(restoreLook({...s,hair:null}))}>Load</button>)}
    <output data-testid="look">{JSON.stringify(look)}</output></>;
}
beforeEach(()=>localStorage.clear());
describe("eye controls in saved Looks",()=>{
  it("applies presets, edits independently and round-trips complete eye settings",()=>{
    render(<Harness/>);
    fireEvent.click(screen.getByRole("button",{name:/玫瑰赴约/}));
    expect(screen.getByRole("radio",{name:"外眼角晕染"}).getAttribute("aria-checked")).toBe("true");
    fireEvent.change(screen.getByLabelText("眼影柔化"),{target:{value:"85"}});
    fireEvent.change(screen.getByLabelText("眼线粗细"),{target:{value:"35"}});
    fireEvent.click(within(screen.getByRole("region",{name:"眼线编辑器"})).getByRole("radio",{name:"暖棕"}));
    fireEvent.click(screen.getByText("Save"));
    const saved=readChoices("eye-test").looks[0];
    expect(saved).toMatchObject({eyeshadow:{style:"outer",blend:.85},eyeliner:{style:"wing",thickness:.35,hex:"#65463A"},lip:"#A74658",blush:true});
    fireEvent.click(screen.getByText("重置眼影"));
    expect((screen.getByLabelText("眼影强度") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("眼线强度") as HTMLInputElement).disabled).toBe(false);
    fireEvent.click(screen.getByText("Reset all"));fireEvent.click(screen.getByText("Load"));
    expect((screen.getByLabelText("眼影柔化") as HTMLInputElement).value).toBe("85");
    expect((screen.getByLabelText("眼线粗细") as HTMLInputElement).value).toBe("35");
    fireEvent.click(screen.getByRole("button",{name:/自然日常/}));
    expect(JSON.parse(screen.getByTestId("look").textContent!).eyeliner.style).toBe("tightline");
    fireEvent.click(screen.getByRole("button",{name:/不加妆/}));
    expect(JSON.parse(screen.getByTestId("look").textContent!).eyeliner).toBeNull();
  });
  it("disables affected eye tools with a reason while keeping reset and other tools available",()=>{
    render(<EyeMakeupControls look={EMPTY_LOOK} set={()=>{}} availability={{...ready,eyeshadow:"Eyelid obscured",eyeliner:"Contour unreliable"}}/>);
    expect((screen.getByRole("group",{name:"眼影选项"}) as HTMLFieldSetElement).disabled).toBe(true);
    expect(screen.getByText("Eyelid obscured")).toBeTruthy();expect(screen.getByText("Contour unreliable")).toBeTruthy();
    expect((screen.getByText("重置眼影") as HTMLButtonElement).disabled).toBe(false);
  });
  it("allows the photo owner to pause both eye layers for glasses or hair",()=>{
    render(<Harness/>);fireEvent.click(screen.getByRole("button",{name:/自然日常/}));
    fireEvent.click(screen.getByRole("checkbox",{name:/眼部有眼镜或头发遮挡/}));
    expect((screen.getByRole("group",{name:"眼线选项"}) as HTMLFieldSetElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button",{name:/精致通勤/}));
    expect(JSON.parse(screen.getByTestId("look").textContent!).eyesObscured).toBe(true);
  });
});
