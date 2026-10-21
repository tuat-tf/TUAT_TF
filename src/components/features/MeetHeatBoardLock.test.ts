import {createElement,type ReactNode} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {expect,it,vi} from "vitest";
import {emptyPerformance,type MeetPerformance} from "@/lib/meet-operations";
type Slot={id:string;order:number;person?:MeetPerformance;locked:boolean};
const capture=vi.hoisted(()=>({props:null as null|{items:Slot[];enabled:boolean;isItemDisabled:(slot:Slot)=>boolean;onReorder:(slots:Slot[])=>void}}));
vi.mock("@/components/ui/reorder-list",()=>({ReorderList:(props:{items:Slot[];enabled:boolean;isItemDisabled:(slot:Slot)=>boolean;onReorder:(slots:Slot[])=>void;renderItem:(slot:Slot)=>ReactNode})=>{capture.props=props;return createElement("div",null,props.items.map(slot=>createElement("div",{key:slot.id},props.renderItem(slot))));}}));
vi.mock("@/components/ui/select",()=>({Select:()=>null}));
vi.mock("@/components/ui/form-modal",()=>({FormModalFooter:({children}:{children:ReactNode})=>children}));
import {MeetHeatBoard} from "./MeetHeatBoard";
it("pins confirmed male slots while allowing female lanes in the same heat to be reordered",()=>{
 const data={confirmed:false,participants:["male","female1","female2"].map((id,index)=>({...emptyPerformance(id),group:1,order:index+1}))};
 const change=vi.fn();const html=renderToStaticMarkup(createElement(MeetHeatBoard,{data,entrants:data.participants.map(p=>({id:p.entryId,name:p.entryId,grade:"B1",mark:"",alumni:false,eligible:true,placementLocked:p.entryId==="male"})),orderLabel:"レーン",capacity:3,disabled:false,onChange:change,statusActions:false}));
 expect(html).toContain("記録確定済み");expect(capture.props!.enabled).toBe(true);expect(capture.props!.items.map(slot=>capture.props!.isItemDisabled(slot))).toEqual([true,false,false]);
 const [male,one,two]=capture.props!.items;capture.props!.onReorder([male,two,one]);
 expect(change.mock.lastCall![0].participants.map((p:MeetPerformance)=>[p.entryId,p.order])).toEqual([["male",1],["female1",3],["female2",2]]);
 expect(data.participants.map(p=>p.order)).toEqual([1,2,3]);
});
