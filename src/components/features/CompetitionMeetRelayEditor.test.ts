import {createElement,type ReactNode} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {beforeEach,expect,it,vi} from "vitest";
import {emptyRelayResults} from "@/lib/competition-meet-relay";
import {fixtureMeet} from "@/lib/__fixtures__/competition-meet";
import type {CompetitionMeet,MeetCommand} from "@/lib/competition-meet";
import type {MeetMutation} from "./CompetitionMeetWorkspace";

const state=vi.hoisted(()=>({values:[] as unknown[],cursor:0}));
const capture=vi.hoisted(()=>({buttons:new Map<string,{disabled?:boolean;onClick:()=>void}>(),inputs:new Map<string,{value:string;onChange:(event:{target:{value:string}})=>void}>(),guard:null as null|{dirty:boolean;onSave:()=>Promise<void>},run:vi.fn(),close:vi.fn(),check:vi.fn(),retry:vi.fn()}));
vi.mock("react",async original=>({...await original<typeof import("react")>(),useState(initial:unknown){const index=state.cursor++;if(!(index in state.values))state.values[index]=initial;return[state.values[index],(next:unknown)=>{state.values[index]=typeof next==="function"?next(state.values[index]):next;}];}}));
vi.mock("@/components/ui/form-modal",()=>({FormModal:({children}:{children:ReactNode})=>children,FormModalFooter:({children}:{children:ReactNode})=>children,FormDraftGuard:(props:{dirty:boolean;onSave:()=>Promise<void>})=>{capture.guard=props;return null;}}));
vi.mock("@/components/ui/sheet",()=>({Sheet:({open,children}:{open:boolean;children:ReactNode})=>open?children:null,SheetContent:({children}:{children:ReactNode})=>children}));
vi.mock("@/components/ui/button",()=>({Button:(props:{children:ReactNode;disabled?:boolean;onClick:()=>void})=>{const label=Array.isArray(props.children)?props.children.join(""):String(props.children);capture.buttons.set(label,props);return createElement("button",{disabled:props.disabled},props.children);}}));
vi.mock("@/components/ui/input",()=>({Input:(props:{"aria-label":string;value:string;onChange:(event:{target:{value:string}})=>void})=>{capture.inputs.set(props["aria-label"],props);return createElement("input",{value:props.value,readOnly:true});}}));
vi.mock("@/components/ui/select",()=>({Select:()=>null}));
import {CompetitionMeetRelayEditor} from "./CompetitionMeetRelayEditor";

function meet(){const data=fixtureMeet();data.events=[{...data.events[0],name:"4×300mリレー",confirmed:false,revision:0,relay_results:emptyRelayResults()}];return data;}
function render(data:CompetitionMeet,patch:Partial<MeetMutation>={}){state.cursor=0;capture.buttons.clear();capture.inputs.clear();return renderToStaticMarkup(createElement(CompetitionMeetRelayEditor,{event:data.events[0],meet:data,mutation:{locked:false,busy:false,message:"",run:capture.run,check:capture.check,retry:capture.retry,...patch} as MeetMutation,onClose:capture.close}));}
beforeEach(()=>{state.values=[];vi.clearAllMocks();capture.run.mockResolvedValue(true);});

it("adds the second and third heats in one event and saves the correct lane in each",async()=>{
 const data=meet();render(data);capture.buttons.get("2組目を追加")!.onClick();render(data);capture.buttons.get("3組目を追加")!.onClick();render(data);
 capture.inputs.get("1組 1レーンのチーム名")!.onChange({target:{value:"最初の組"}});capture.inputs.get("3組 1レーンのチーム名")!.onChange({target:{value:"第三の組"}});capture.inputs.get("3組 1レーンの1走")!.onChange({target:{value:"第三の走者"}});render(data);
 expect(capture.guard?.dirty).toBe(true);await capture.guard!.onSave();
 const command=capture.run.mock.lastCall![0] as Extract<MeetCommand,{action:"relay.save"}>;
 expect(command).toMatchObject({action:"relay.save",event:"4×300mリレー",revision:0,confirmed:false});expect(command.relayResults).toHaveLength(18);
 expect(command.relayResults[0].name).toBe("最初の組");expect(command.relayResults[6].name).toBe("");expect(command.relayResults[12]).toMatchObject({heat:3,lane:1,name:"第三の組",members:["第三の走者","","",""]});
 expect(data.events).toHaveLength(1);expect(data.events[0].relay_results).toHaveLength(6);expect(capture.close).toHaveBeenCalledOnce();
});
it("keeps a concurrent heat addition during explicit review before saving",async()=>{
 const data=meet();render(data);capture.inputs.get("1組 1レーンのチーム名")!.onChange({target:{value:"入力したチーム"}});render(data);
 const current=structuredClone(data);current.events[0].revision=1;current.events[0].relay_results!.push(...emptyRelayResults(2));current.events[0].relay_results![6].name="追加済みチーム";
 render(current);capture.buttons.get("最新の情報と入力を確認")!.onClick();render(current);capture.buttons.get("確認した内容を使う")!.onClick();render(current);await capture.guard!.onSave();
 const command=capture.run.mock.lastCall![0] as Extract<MeetCommand,{action:"relay.save"}>;expect(command.revision).toBe(1);expect(command.relayResults).toHaveLength(12);expect(command.relayResults[0].name).toBe("入力したチーム");expect(command.relayResults[6].name).toBe("追加済みチーム");
});
it("retains the draft and offers result checking when a multiheat save is uncertain",async()=>{
 const data=meet();capture.run.mockResolvedValue(false);render(data);capture.buttons.get("2組目を追加")!.onClick();render(data);capture.inputs.get("2組 1レーンのチーム名")!.onChange({target:{value:"応答待ちチーム"}});render(data);await capture.guard!.onSave();
 const html=render(data,{locked:true,uncertain:true});expect(html).toContain("fieldset disabled");expect(capture.inputs.get("2組 1レーンのチーム名")!.value).toBe("応答待ちチーム");expect(capture.close).not.toHaveBeenCalled();expect(capture.buttons.get("保存する")!.disabled).toBe(true);
 capture.buttons.get("保存結果を確認")!.onClick();expect(capture.check).toHaveBeenCalledOnce();expect(capture.run).toHaveBeenCalledOnce();expect(capture.buttons.has("同じ操作を再送")).toBe(false);
});
it("locks heat edits for viewers and confirmed events",()=>{
 const data=meet();data.permissions.record=false;expect(render(data)).toContain("fieldset disabled");expect(capture.buttons.get("保存する")!.disabled).toBe(true);
 state.values=[];data.permissions.record=true;data.events[0].confirmed=true;expect(render(data)).toContain("fieldset disabled");
});
