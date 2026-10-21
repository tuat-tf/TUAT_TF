import {createElement,type ReactNode} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {beforeEach,expect,it,vi} from "vitest";
import {emptyPerformance} from "@/lib/meet-operations";
import type {CompetitionMeet,ManagedMeetEvent} from "@/lib/competition-meet";
import type {MeetMutation} from "./CompetitionMeetWorkspace";
const state=vi.hoisted(()=>({values:[] as unknown[],cursor:0}));
const capture=vi.hoisted(()=>({buttons:new Map<string,{disabled:boolean;onClick:()=>void}>(),inputs:[] as {value:string;onChange:(e:{target:{value:string}})=>void;onBlur:(e:{target:{value:string}})=>void}[],confirmation:null as null|((e:{target:{checked:boolean}})=>void),menus:[] as {disabled:boolean;onDelete:()=>Promise<boolean>}[],view:null as null|((value:"groups"|"records")=>void),guard:null as null|{dirty:boolean;onSave:()=>Promise<void>},selects:new Map<string,{onValueChange:(value:string)=>void;options:{value:string;label:string}[]}>(),run:vi.fn(),close:vi.fn(),add:vi.fn(),board:vi.fn()}));
vi.mock("react",async original=>({...await original<typeof import("react")>(),useState(initial:unknown){const i=state.cursor++;if(!(i in state.values))state.values[i]=initial;return[state.values[i],(next:unknown)=>{state.values[i]=typeof next==="function"?next(state.values[i]):next;}];}}));
vi.mock("@/components/ui/form-modal",()=>({FormModal:({children}:{children:ReactNode})=>{function visit(node:unknown){if(Array.isArray(node)){node.forEach(visit);return;}if(node&&typeof node==="object"&&"props"in node){const element=node as {type:unknown;props:{type?:string;onChange?:typeof capture.confirmation;children?:unknown}};if(element.type==="input"&&element.props.type==="checkbox")capture.confirmation=element.props.onChange??null;visit(element.props.children);}}visit(children);return children;},FormModalFooter:({children}:{children:ReactNode})=>children,FormDraftGuard:(props:{dirty:boolean;onSave:()=>Promise<void>})=>{capture.guard=props;return null;}}));
vi.mock("@/components/ui/sheet",()=>({Sheet:({open,children}:{open:boolean;children:ReactNode})=>open?children:null,SheetContent:({children}:{children:ReactNode})=>children}));
vi.mock("@/components/ui/button",()=>({Button:(props:{children:ReactNode;disabled:boolean;onClick:()=>void})=>{if(typeof props.children==="string")capture.buttons.set(props.children,props);return createElement("button",{disabled:props.disabled},props.children);}}));
vi.mock("@/components/ui/input",()=>({Input:(props:{value:string;onChange:(e:{target:{value:string}})=>void;onBlur:(e:{target:{value:string}})=>void})=>{capture.inputs.push(props);return createElement("input",{value:props.value,readOnly:true});}}));
vi.mock("@/components/ui/select",()=>({Select:(props:{ariaLabel:string;onValueChange:(value:string)=>void;options:{value:string;label:string}[]})=>{capture.selects.set(props.ariaLabel,props);return null;}}));
vi.mock("@/components/ui/action-menu",()=>({ActionMenu:(props:{disabled:boolean;onDelete:()=>Promise<boolean>})=>{capture.menus.push(props);return null;}}));
vi.mock("@/components/ui/segmented",()=>({SegmentedControl:(props:{onChange:(value:"groups"|"records")=>void})=>{capture.view=props.onChange;return null;}}));
vi.mock("./MeetHeatBoard",()=>({MeetHeatBoard:(props:{data:{participants:{entryId:string}[]};renderActions:(id:string)=>ReactNode})=>{capture.board(props);return createElement("div",null,props.data.participants.map(p=>createElement("div",{key:p.entryId},props.renderActions(p.entryId))));}}));
vi.mock("./MeetFieldOrderBoard",()=>({MeetFieldOrderBoard:(props:{data:{participants:{entryId:string}[]};renderActions:(id:string)=>ReactNode})=>{capture.board(props);return createElement("div",null,props.data.participants.map(p=>createElement("div",{key:p.entryId},props.renderActions(p.entryId))));}}));
import {CompetitionMeetEventEditor} from "./CompetitionMeetEventEditor";
const event:ManagedMeetEvent={competition_id:"test",name:"混合高跳び",family:"高跳び",division:"混合",starts_at:"10:00",sort_order:0,discipline:"height",wind:false,capacity:null,confirmed:false,revision:0};
const meet=():CompetitionMeet=>({competitionId:"test",meetKey:"test",name:"合成大会",backend:"pc",events:[event],participants:[{id:"person",competition_id:"test",profile_id:null,name:"合成",grade:"B1",absent:false,deleted:false,revision:0}],appearances:[{id:"appearance",competition_id:"test",participant_id:"person",event_name:event.name,ordinal:3,operation_key:"appearance",qualification_mark:null,state:"registered",performance:emptyPerformance("appearance"),revision:0}],duties:[],roles:[],party:[],members:[],permissions:{manage:true,groups:true,record:true,configure:true}});
const mutation=()=>({locked:false,busy:false,message:"",run:capture.run} as unknown as MeetMutation);
function render(data=meet(),actions:Pick<Parameters<typeof CompetitionMeetEventEditor>[0],"canDeleteAppearance"|"onDeleteAppearance">={}){state.cursor=0;capture.buttons.clear();capture.inputs=[];capture.menus=[];return renderToStaticMarkup(createElement(CompetitionMeetEventEditor,{event:data.events[0],meet:data,mutation:mutation(),onClose:capture.close,onAdd:capture.add,...actions}));}
beforeEach(()=>{state.values=[];capture.selects.clear();vi.clearAllMocks();capture.run.mockResolvedValue(true);});
it("keeps women's 100m placements editable after men's 100m results are confirmed",async()=>{
 const data=meet(),male:ManagedMeetEvent={...event,name:"男子100m",family:"100m",division:"男子",discipline:"track",capacity:8,confirmed:true},female={...male,name:"女子100m",division:"女子" as const,confirmed:false};
 data.events=[female,male];const first=data.appearances[0];first.event_name=male.name;first.performance={...first.performance,group:1,order:1,heatScope:"混合",trials:[{mark:"12.00",status:"valid",wind:""}]};
 data.appearances.push({...structuredClone(first),id:"female",event_name:female.name,operation_key:"female",performance:{...structuredClone(first.performance),entryId:"female",order:2}});
 render(data);capture.view!("groups");render(data);
 const board=capture.board.mock.lastCall![0] as {disabled:boolean;entrants:{id:string;placementLocked:boolean}[];data:import("@/lib/meet-operations").MeetEventData;onChange:(next:import("@/lib/meet-operations").MeetEventData)=>void};
 expect(board.disabled).toBe(false);expect(board.entrants.map(p=>[p.id,p.placementLocked])).toEqual([["appearance",true],["female",false]]);
 board.onChange({...board.data,participants:board.data.participants.map(p=>p.entryId==="female"?{...p,group:200,order:1}:p)});render(data);await capture.guard!.onSave();
 expect(capture.run).toHaveBeenCalledWith(expect.objectContaining({event:female.name,confirmed:false,changes:[expect.objectContaining({id:"female",performance:expect.objectContaining({group:2,order:1,heatScope:"混合"})})]}));expect(first.performance.group).toBe(1);
});
it("opens both divisions together and saves women's placement without unconfirming the men's entrance",async()=>{
 const data=meet(),male={...event,name:"男子1500m",family:"1500m",division:"男子" as const,discipline:"track" as const,confirmed:true},female={...male,name:"女子1500m",division:"女子" as const,confirmed:false};
 data.events=[male,female];data.appearances[0].event_name=male.name;data.appearances[0].performance={...data.appearances[0].performance,group:1,order:1,trials:[{mark:"4:30.00",status:"valid",wind:""}]};
 data.appearances.push({...structuredClone(data.appearances[0]),id:"female",event_name:female.name,performance:{...structuredClone(data.appearances[0].performance),entryId:"female",group:2,order:2,trials:[{mark:"5:00.00",status:"valid",wind:""}]}});
 render(data);expect(capture.inputs.map(p=>p.value)).toEqual(["4:30.00","5:00.00"]);
 expect(capture.buttons.has("男子の確定を解除")).toBe(true);expect(capture.buttons.has("女子の結果を確定")).toBe(true);
 capture.view!("groups");render(data);
 const board=capture.board.mock.lastCall![0];board.onChange({...board.data,confirmed:false,participants:board.data.participants.map((p:{entryId:string})=>p.entryId==="female"?{...p,group:201,order:1}:p)});render(data);await capture.guard!.onSave();
 expect(capture.run).toHaveBeenCalledWith(expect.objectContaining({event:female.name,expectedConfirmed:false,confirmed:false,changes:[expect.objectContaining({id:"female"})]}));
});
it("confirms one division from the unified record page and includes its edited record in one save",async()=>{
 const data=meet(),male={...event,name:"男子100m",family:"100m",division:"男子" as const,discipline:"track" as const},female={...male,name:"女子100m",division:"女子" as const};data.events=[male,female];
 data.appearances[0].event_name=male.name;data.appearances[0].performance={...data.appearances[0].performance,group:1,order:1,trials:[{mark:"12.00",status:"valid",wind:""}]};
 data.appearances.push({...structuredClone(data.appearances[0]),id:"female",event_name:female.name,performance:{...structuredClone(data.appearances[0].performance),entryId:"female",order:2,trials:[{mark:"15.00",status:"valid",wind:""}]}});
 render(data);capture.inputs[1].onChange({target:{value:"14.50"}});render(data);await capture.buttons.get("女子の結果を確定")!.onClick();
 expect(capture.run).toHaveBeenCalledWith(expect.objectContaining({event:female.name,confirmed:true,changes:[expect.objectContaining({id:"female",performance:expect.objectContaining({trials:[{mark:"14.50",status:"valid",wind:""}]})})]}));
});
it("can unconfirm results and close without validating or resaving unrelated stored trials",async()=>{
 const data=meet();data.events=[{...event,confirmed:true}];data.appearances[0].performance.trials=[{mark:"legacy invalid mark",status:"valid",wind:""}];
 render(data);capture.confirmation!({target:{checked:false}});render(data);await capture.guard!.onSave();
 expect(capture.run).toHaveBeenCalledWith(expect.objectContaining({event:event.name,confirmed:false,expectedConfirmed:true,changes:[]}));expect(capture.close).toHaveBeenCalledOnce();
});
it("does not reformat an untouched saved mark or request a save on leaving its field",()=>{
 const data=meet();data.appearances[0].performance.trials=[{mark:"120",status:"valid",wind:""}];
 render(data);capture.inputs[0].onBlur({target:{value:"120"}});render(data);
 expect(capture.inputs[0].value).toBe("120");expect(capture.guard?.dirty).toBe(false);
});
it("closes a clean save request without validating unrelated records or sending a mutation",async()=>{
 render();await capture.guard!.onSave();expect(capture.run).not.toHaveBeenCalled();expect(capture.close).toHaveBeenCalledOnce();
});
it("closes after a successful changed save",async()=>{
 render();capture.inputs[0].onChange({target:{value:"1.25"}});render();
 await capture.guard!.onSave();expect(capture.run).toHaveBeenCalledOnce();expect(capture.close).toHaveBeenCalledOnce();
});
it("clears the unsaved state when an edited mark is restored and retains actual changed input on failure",async()=>{
 render();capture.inputs[0].onChange({target:{value:"1.20"}});render();expect(capture.guard?.dirty).toBe(true);
 capture.inputs[0].onChange({target:{value:""}});render();expect(capture.guard?.dirty).toBe(false);
 capture.inputs[0].onChange({target:{value:"1.25"}});render();capture.run.mockResolvedValue(false);
 await capture.guard!.onSave();render();expect(capture.guard?.dirty).toBe(true);expect(capture.inputs[0].value).toBe("1.25");expect(capture.close).not.toHaveBeenCalled();
});
it("shows one best-record input and retains old trials until that record is edited",async()=>{
 const data=meet();data.appearances[0].performance.trials=[{mark:"1.20",status:"valid",wind:""},{mark:"1.40",status:"valid",wind:""},{mark:"1.50",status:"foul",wind:""}];
 const before=structuredClone(data);const html=render(data);expect(capture.inputs).toHaveLength(1);expect(capture.inputs[0].value).toBe("1.40");expect(html).not.toContain("回目");expect(capture.guard?.dirty).toBe(false);
 capture.inputs[0].onChange({target:{value:"1.10"}});render(data);await capture.guard!.onSave();
 expect(capture.run).toHaveBeenCalledWith(expect.objectContaining({action:"event.save",changes:[expect.objectContaining({performance:expect.objectContaining({trials:[{mark:"1.10",status:"valid",wind:""}]})})]}));expect(data).toEqual(before);
});
it("restores the original trial history when a best-record edit is undone",()=>{
 const data=meet();data.appearances[0].performance.trials=[{mark:"1.20",status:"valid",wind:""},{mark:"1.40",status:"valid",wind:""}];
 render(data);capture.inputs[0].onChange({target:{value:"1.10"}});render(data);expect(capture.guard?.dirty).toBe(true);
 capture.inputs[0].onChange({target:{value:"1.40"}});render(data);expect(capture.guard?.dirty).toBe(false);
});
it.each(["height","track"] as const)("offers the same permitted appearance deletion from %s records and placement rows",async discipline=>{
 const data=meet();data.events=[{...event,discipline}];const remove=vi.fn().mockResolvedValue(true),actions={canDeleteAppearance:(id:string)=>id==="appearance",onDeleteAppearance:remove};
 render(data,actions);expect(capture.menus).toHaveLength(1);expect(capture.menus[0].disabled).toBe(false);await capture.menus[0].onDelete();expect(remove).toHaveBeenCalledWith("appearance");
 capture.view!("groups");render(data,actions);expect(capture.menus).toHaveLength(1);await capture.menus[0].onDelete();expect(remove).toHaveBeenCalledTimes(2);
 capture.view!("records");render(data,actions);capture.inputs[0].onChange({target:{value:"1.20"}});render(data,actions);expect(capture.menus[0].disabled).toBe(true);expect(await capture.menus[0].onDelete()).toBe(false);expect(remove).toHaveBeenCalledTimes(2);
});
it("does not offer a row deletion when the caller has no permission for that appearance",()=>{
 const remove=vi.fn();render(meet(),{canDeleteAppearance:()=>false,onDeleteAppearance:remove});expect(capture.menus).toHaveLength(0);
 capture.view!("groups");render(meet(),{canDeleteAppearance:()=>false,onDeleteAppearance:remove});expect(capture.menus).toHaveLength(0);expect(remove).not.toHaveBeenCalled();
});
it("removes a deleted appearance from the record list and placement board after refresh",()=>{
 const data=meet();render(data);const current=structuredClone(data);current.appearances[0].state="deleted";current.appearances[0].revision++;
 render(current);render(current);expect(capture.inputs).toHaveLength(0);capture.view!("groups");render(current);
 expect(capture.board).toHaveBeenLastCalledWith(expect.objectContaining({data:expect.objectContaining({participants:[]})}));
 expect(data.appearances[0].state).toBe("registered");
});
it("retains edited input for explicit review if another operation deletes that appearance",()=>{
 const data=meet();render(data);capture.inputs[0].onChange({target:{value:"1.25"}});render(data);
 const current=structuredClone(data);current.appearances[0].state="deleted";current.appearances[0].revision++;
 render(current);expect(capture.buttons.has("最新の情報と入力を確認")).toBe(true);capture.buttons.get("最新の情報と入力を確認")!.onClick();
 const html=render(current);expect(html).toContain("1.25");expect(html).toContain("この出場の入力を破棄し、最新の情報を使う");expect(capture.run).not.toHaveBeenCalled();
});
it("keeps addition disabled with unsaved record inputs and enables it after clean refresh",()=>{
 render();expect(capture.buttons.get("この種目に出場を追加")!.disabled).toBe(false);capture.inputs[0].onChange({target:{value:"1.20"}});render();expect(capture.buttons.get("この種目に出場を追加")!.disabled).toBe(true);
});
it("requires explicit input discard when an appearance was cancelled during editing",()=>{
 const before=meet();render(before);capture.inputs[0].onChange({target:{value:"1.20"}});render(before);
 const current=structuredClone(before);current.appearances[0].state="cancelled";current.appearances[0].revision=1;render(current);capture.buttons.get("最新の情報と入力を確認")!.onClick();
 const html=render(current);expect(html).toContain("この出場の入力を破棄し、最新の情報を使う");expect(capture.buttons.get("確認した内容を使う")!.disabled).toBe(true);expect(capture.run).not.toHaveBeenCalled();
});
it("lists repeated appearances together and saves multiple best records in one request",async()=>{
 const data=meet(),first=data.appearances[0];
 first.performance={...first.performance,group:1,order:1,trials:[{mark:"1.10",status:"valid",wind:""}]};
 const second={...structuredClone(first),id:"second",operation_key:"second",ordinal:8,performance:{...structuredClone(first.performance),entryId:"second",order:2,trials:[{mark:"1.20",status:"valid" as const,wind:""}]}};
 data.appearances.push(second);
 const html=render(data);expect(html).not.toContain("件目");
 expect(capture.selects.has("記録する出場")).toBe(false);expect(capture.inputs.map(input=>input.value)).toEqual(["1.10","1.20"]);
 capture.inputs[0].onChange({target:{value:"1.15"}});render(data);capture.inputs[1].onChange({target:{value:"1.30"}});render(data);
 await capture.buttons.get("保存する")!.onClick();
 expect(capture.run).toHaveBeenCalledWith(expect.objectContaining({action:"event.save",changes:[expect.objectContaining({id:first.id,performance:expect.objectContaining({trials:[{mark:"1.15",status:"valid",wind:""}]})}),expect.objectContaining({id:second.id,performance:expect.objectContaining({trials:[{mark:"1.30",status:"valid",wind:""}]})})]}));
 expect(first.performance.trials[0].mark).toBe("1.10");
});
