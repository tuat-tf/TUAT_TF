import { describe, expect, it } from "vitest";
import { appearancePerformance, competitionEventData, competitionFamilyData, meetBoardGroup, meetEventFamilies, meetFamilyGroupLabel, storedMeetPerformance, meetDutyConflict, meetEventCounts, type MeetAppearance, type MeetParticipant, type ManagedMeetEvent } from "./competition-meet";
import {competitionMeetObExport} from "./competition-meet-export";
import { emptyPerformance } from "./meet-operations";
import { obFamilyRows } from "./ob-mixed-operations";
import { obPublishedResultSheets } from "./ob-results-sheet";
import { obSheetEditSource } from "./ob-sheet-edits";

const person: MeetParticipant={id:"person",competition_id:"meet",profile_id:null,name:"合成参加者",grade:"B1",absent:false,deleted:false,revision:0};
const event: ManagedMeetEvent={competition_id:"meet",name:"男子100m",family:"100m",division:"男子",starts_at:"10:00",sort_order:0,discipline:"track",wind:true,capacity:8,confirmed:false,revision:0};
const appearance=(id:string,ordinal:number,state:MeetAppearance["state"]="registered"):MeetAppearance=>({id,competition_id:"meet",participant_id:person.id,event_name:event.name,ordinal,operation_key:id,qualification_mark:null,state,performance:{...emptyPerformance(id),group:1,order:ordinal,trials:[{mark:"12.34",wind:"0",status:"valid"}]},revision:0});
describe("independent competition appearances",()=>{
 it("keeps a DNF in the heat slot it ran in",()=>{
  const dnf=appearance("dnf",1);dnf.performance={...dnf.performance,group:1,order:3,status:"DNF",trials:[{mark:"",status:"pending",wind:""}]};
  const value=appearancePerformance(person,dnf);
  expect([value.status,value.group,value.order]).toEqual(["DNF",1,3]);
  expect(value.trials).toEqual(dnf.performance.trials);
 });
 it("uses one 100m entrance and derives a heat's division from its actual occupants",()=>{
  const male=appearance("male",1),female={...appearance("female",2),event_name:"女子100m"};female.performance.heatScope="男子";
  const meet={participants:[person],appearances:[male,female],events:[event,{...event,name:"女子100m",division:"女子" as const}]};
  expect(meetEventFamilies(meet).map(f=>f.label)).toEqual(["100m"]);
  expect(meetFamilyGroupLabel(meet,event,1)).toBe("混合1組");
  meet.appearances=[female];expect(meetFamilyGroupLabel(meet,event,1)).toBe("女子1組");
  meet.appearances=[male];expect(meetFamilyGroupLabel(meet,event,1)).toBe("男子1組");
 });
 it("gives former male and female heats unique family numbers without changing their stored placements",()=>{
  const first={...appearance("first",1),event_name:"女子100m"},second={...appearance("second",1),event_name:"女子100m"};
  first.performance.heatScope="男子";second.performance.heatScope="女子";
  const mixedMale=appearance("mixed-male",1),mixedFemale={...appearance("mixed-female",2),event_name:"女子100m"};
  mixedMale.performance.heatScope="混合";mixedFemale.performance.heatScope="混合";
  const meet={participants:[person],appearances:[second,mixedFemale,first,mixedMale],events:[event,{...event,name:"女子100m",division:"女子" as const}]},before=structuredClone(meet);
  const data=competitionFamilyData(meet,event);
  expect([1,100,199].map(group=>meetFamilyGroupLabel(meet,event,group,data))).toEqual(["女子1組","女子2組","混合3組"]);
  expect(meetFamilyGroupLabel(meet,event,200,data)).toBe("4組");
  expect([200,201,202].map(group=>meetFamilyGroupLabel(meet,event,group,data,[1,100,199,200,201]))).toEqual(["4組","5組","6組"]);
  expect(data.participants.map(storedMeetPerformance)).toEqual(meet.appearances.map(a=>a.performance));
  expect(meet).toEqual(before);
 });
 it("exports the displayed family heat labels while keeping editable sheet positions and keys unchanged",()=>{
  const first={...appearance("first",1),event_name:"女子100m"},second={...appearance("second",1),event_name:"女子100m"};
  first.performance.heatScope="男子";second.performance.heatScope="女子";
  const meet={participants:[person],appearances:[first,second],events:[event,{...event,name:"女子100m",division:"女子" as const}],meetKey:"ob-2026"},before=structuredClone(meet);
  const exported=competitionMeetObExport(meet),sheet=obPublishedResultSheets(exported.entries,exported.operations,exported.heatLabels).find(sheet=>sheet.name==="100m")!;
  expect(sheet.rows.filter(row=>row.includes(person.name)).map(row=>row[0])).toEqual(["女子1組","女子2組"]);
  expect(exported.operations.find(op=>op.event_name==="女子100m")!.data.participants).toEqual([first.performance,second.performance]);
  const edits=obSheetEditSource(exported.entries,exported.operations,"synthetic");
  expect(edits.editSheet.rows.slice(1).map(row=>row[5])).toEqual(["男子1組","女子1組"]);
  expect(new Set(edits.editSheet.rows.slice(1).map(row=>row[0])).size).toBe(2);
  expect(meet).toEqual(before);
 });
 it("counts one participant separately from three appearances",()=>{expect(meetEventCounts({participants:[person],appearances:[appearance("one",1),appearance("two",2),appearance("three",3)]},event)).toMatchObject({people:1,appearances:3,dns:0});});
 it("cancels the first appearance without cancelling the second or its own saved trials",()=>{
  const first=appearance("one",1,"cancelled"),second=appearance("two",2);
  const result=competitionEventData({participants:[person],appearances:[first,second]},event);
  expect(result.participants[0]).toMatchObject({entryId:"one",status:"DNS",group:null,order:null,trials:first.performance.trials});
  expect(result.participants[1]).toEqual(second.performance);
 });
 it.each(["cancelled","deleted"] as const)("keeps %s trial history after clearing placement",state=>{const a=appearance("one",1,state);expect(appearancePerformance(person,a)).toMatchObject({status:"DNS",group:null,order:null,trials:a.performance.trials});});
 it.each([{...person,absent:true},{...person,deleted:true},undefined])("unavailable participants do not occupy a slot",p=>{const a=appearance("one",1);expect(appearancePerformance(p,a)).toMatchObject({status:"DNS",group:null,order:null,trials:a.performance.trials});});
 it("keeps DNF and DQ separate from DNS counts",()=>{const a=appearance("one",1),b=appearance("two",2);a.performance.status="DNF";b.performance.status="DQ";expect(meetEventCounts({participants:[person],appearances:[a,b]},event)).toMatchObject({dns:0,dnf:1,dq:1});});
 it("retains an explicit DNS after restoring attendance",()=>{const a=appearance("one",1);a.performance.status="DNS";expect(appearancePerformance(person,a)).toMatchObject({status:"DNS",group:null,order:null});});
 it("round-trips mixed and separate divisions without changing stored numbering",()=>{
  const male=appearance("one",1),female={...appearance("two",2),event_name:"女子100m"};female.performance.heatScope="混合";
  const meet={participants:[person],appearances:[male,female],events:[event,{...event,name:"女子100m",division:"女子" as const}]};
  const data=competitionFamilyData(meet,event);expect(data.participants.map(p=>p.group)).toEqual([1,meetBoardGroup(1,"混合")]);expect(storedMeetPerformance(data.participants[1])).toMatchObject({group:1,order:2,heatScope:"混合"});
 });
 it("keeps recorded duty commitments after cancellation and releases unrecorded cancellation",()=>{
  const a=appearance("one",1,"cancelled"),meet={participants:[person],appearances:[a],events:[event]};expect(meetDutyConflict(meet,person.id,"10:00")).toBe(true);a.performance.trials=[];expect(meetDutyConflict(meet,person.id,"10:00")).toBe(false);
 });
 it("exports all independent appearance IDs and saved withdrawals without account or qualification fields",()=>{
  const a=appearance("one",1,"cancelled"),b=appearance("two",2),c=appearance("three",3);c.qualification_mark="secret qualification";
  const exported=competitionMeetObExport({participants:[person],appearances:[a,b,c],events:[event],meetKey:"another-meet"});
  expect(exported.entries.map(e=>e.id)).toEqual(["one","two","three"]);expect(exported.entries.map(e=>e.submitted_name)).toEqual(Array(3).fill("合成参加者"));expect(exported.entries[2]).toMatchObject({profile_id:null,qualification_marks:{},canonical_appearance:true});expect(exported.operations[0].data.participants[0]).toMatchObject({entryId:"one",status:"DNS",group:null,trials:a.performance.trials});
 });
 it("exports same-name repeated starts and equal records as separate UUIDs, sheet keys and workbook rows",()=>{
  const ids=[1,2,3,4].map(n=>`10000000-0000-4000-8000-${String(n).padStart(12,"0")}`);
  const namesake={...person,id:"namesake"};
  const appearances=ids.map((id,index)=>({...appearance(id,index+1),participant_id:index===3?namesake.id:person.id}));
  const meet={participants:[person,namesake],appearances,events:[event],meetKey:"ob-2026"},before=structuredClone(meet);
  const exported=competitionMeetObExport(meet);
  expect(exported.entries.map(e=>e.id)).toEqual(ids);expect(exported.entries.map(e=>e.submitted_name)).toEqual(Array(4).fill(person.name));
  expect(exported.entries.every(e=>e.canonical_appearance)).toBe(true);
  expect(exported.operations[0].data.participants.map(p=>p.entryId)).toEqual(ids);
  const projected=obFamilyRows("100m",exported.entries,exported.operations);
  expect(projected.map(row=>row.id)).toEqual(ids.map(id=>`${event.name}:${id}`));
  expect(projected.map(row=>row.entryId)).toEqual(ids);
  const sheet=obPublishedResultSheets(exported.entries,exported.operations).find(sheet=>sheet.name==="100m")!;
  const lines=sheet.rows.filter(line=>line.includes(person.name));
  expect(lines).toHaveLength(4);expect(lines.map(line=>line[1])).toEqual([1,2,3,4]);
  expect(lines.map(line=>line.slice(2))).toEqual(Array(4).fill(["男子",person.name,"B1","出場","12.34","男子1位"]));
  expect(sheet.rows.flat().join(" ")).not.toContain("件目");expect(meet).toEqual(before);
 });
});
