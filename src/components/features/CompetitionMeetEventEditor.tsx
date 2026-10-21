"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ActionMenu } from "@/components/ui/action-menu";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SegmentedControl } from "@/components/ui/segmented";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { FormModal, FormModalFooter, FormDraftGuard } from "@/components/ui/form-modal";
import { MeetEvent, emptyTrial, type MeetPerformance, type MeetTrial } from "@/lib/meet-operations";
import { fieldOrderRows } from "@/lib/meet-field-order";
import { formatObRecordInput } from "@/lib/ob-record-input";
import { obResultRanks } from "@/lib/ob-result-ranking";
import { obOperationHasChanges, operationFieldLabel, reviewObOperation, type OperationChoices } from "@/lib/ob-operation-draft";
import { availableAppearance, competitionFamilyData, meetBoardGroup, meetBoardPlacement, meetBoardGroupLabel, meetRule, storedMeetPerformance, type CompetitionMeet, type ManagedMeetEvent } from "@/lib/competition-meet";
import { MeetHeatBoard } from "./MeetHeatBoard";
import { MeetFieldOrderBoard } from "./MeetFieldOrderBoard";
import type { MeetMutation } from "./CompetitionMeetWorkspace";

const limits = { maxGroups: 297, maxOrder: 600, maxParticipants: 1000, defaultGroup: 199, groupLabel: meetBoardGroupLabel };
export function CompetitionMeetEventEditor({event,meet,mutation,onClose,onAdd,initialAppearanceId,canDeleteAppearance,onDeleteAppearance}: {
  event:ManagedMeetEvent; meet:CompetitionMeet; mutation:MeetMutation; onClose:()=>void; onAdd:()=>void; initialAppearanceId?:string; canDeleteAppearance?:(id:string)=>boolean; onDeleteAppearance?:(id:string)=>Promise<boolean>;
}) {
  const familyEvents=meet.events.filter(value=>value.family===event.family);
  const latest={...competitionFamilyData(meet,event),confirmed:event.confirmed};
  const appearances=meet.appearances.filter(a=>familyEvents.some(e=>e.name===a.event_name));
  const listedIds=new Set(appearances.filter(a=>a.state!=="deleted").map(a=>a.id));
  const [base,setBase]=useState({data:latest,appearances,event,events:familyEvents});
  const [data,setData]=useState(latest),[view,setView]=useState<"groups"|"records">("records");
  const [group,setGroup]=useState("all"),[newScope,setNewScope]=useState<string>(event.division),[focus,setFocus]=useState(initialAppearanceId);
  const [reviewing,setReviewing]=useState(false),[choices,setChoices]=useState<OperationChoices>({}),[error,setError]=useState("");
  const people=new Map(meet.participants.map(p=>[p.id,p]));
  const dirty=obOperationHasChanges(base.data,data);
  const latestKey=JSON.stringify({data:latest,events:familyEvents.map(e=>[e.name,e.revision]),appearances:appearances.map(a=>[a.id,a.revision])});
  const [observedKey,setObservedKey]=useState(latestKey);
  if(!dirty&&!mutation.locked&&observedKey!==latestKey){setObservedKey(latestKey);setBase({data:latest,appearances,event,events:familyEvents});setData(latest);}
  const changedRemotely=appearances.some(a=>base.appearances.find(old=>old.id===a.id)?.revision!==a.revision)||familyEvents.some(e=>base.events.find(old=>old.name===e.name)?.revision!==e.revision);
  const rule=meetRule(event),model=new MeetEvent(rule,{...data,confirmed:false},limits);
  const entrants=appearances.map(a=>{
    const person=people.get(a.participant_id),source=familyEvents.find(e=>e.name===a.event_name)!;
    return {id:a.id,name:person?.name??"参加者確認中",grade:person?.grade??"",mark:a.qualification_mark??"",alumni:person?.grade==="OB・OG",eligible:availableAppearance(person,a),absent:person?.absent,division:source.division==="混合"?undefined:source.division,placementLocked:source.confirmed};
  });
  const currentIds=new Set(appearances.filter(a=>a.event_name===event.name).map(a=>a.id));
  const ordered=event.discipline==="track"?[...data.participants].sort((a,b)=>(a.group??999)-(b.group??999)||(a.order??999)-(b.order??999)):fieldOrderRows(data).map(row=>row.person);
  const own=ordered.filter(p=>currentIds.has(p.entryId)&&listedIds.has(p.entryId));
  const boardData={...data,participants:data.participants.filter(p=>listedIds.has(p.entryId))};
  const groups=[...new Set(own.flatMap(p=>p.group===null?[]:[p.group]))];
  const visible=own.filter(p=>(!focus||p.entryId===focus)&&(event.discipline!=="track"||group==="all"||String(p.group)===group));
  const ranks=obResultRanks(rule,own.filter(p=>{
    const a=appearances.find(a=>a.id===p.entryId)!;return availableAppearance(people.get(a.participant_id),a);
  }));
  const numbers=new Map(fieldOrderRows(data).map(row=>[row.person.entryId,row.number]));
  function placementText(performance:MeetPerformance) {
    return event.discipline==="track"?(performance.group===null?"組未定":`${meetBoardGroupLabel(performance.group)} ${performance.order??"未定"}${event.capacity?"レーン":"番"}`):(numbers.get(performance.entryId)==null?"試技順未定":`試技順 ${numbers.get(performance.entryId)}番`);
  }
  const disabled=mutation.locked||!meet.permissions.record;
  const groupsDisabled=mutation.locked||!meet.permissions.groups;
  const nextRaw=Math.max(0,...data.participants.flatMap(p=>p.group!==null&&Math.floor((p.group-1)/99)===Math.floor((meetBoardGroup(1,newScope)-1)/99)?[(p.group-1)%99+1]:[]))+1;
  const nextGroup=nextRaw<=99?meetBoardGroup(nextRaw,newScope):null;
  const review=reviewObOperation(base.data,data,latest,choices);
  const conflicts=review.conflicts;
  const blocked=appearances.filter(a=>!availableAppearance(people.get(a.participant_id),a)&&obOperationHasChanges({confirmed:false,participants:base.data.participants.filter(p=>p.entryId===a.id)},{confirmed:false,participants:data.participants.filter(p=>p.entryId===a.id)}));
  function update(id:string,patch:Partial<MeetPerformance>) {
    setError("");setData(before=>({...before,participants:before.participants.map(p=>p.entryId===id?{...p,...patch}:p)}));
  }
  function trial(id:string,index:number,patch:Partial<MeetTrial>) {
    const person=data.participants.find(p=>p.entryId===id)!;
    update(id,{trials:Array.from({length:Math.max(index+1,person.trials.length)},(_,i)=>i===index?{...(person.trials[i]??emptyTrial()),...patch}:person.trials[i]??emptyTrial())});
  }
  function changePlacements(next:typeof data) {
    const changed=new Map(next.participants.map(p=>[p.entryId,p]));
    setData({...next,participants:data.participants.map(p=>changed.get(p.entryId)??p)});
  }
  function bestTrial(person:MeetPerformance) {
    return model.bestTrial(person)??person.trials.find(t=>t.status==="valid"&&t.mark==="-")??emptyTrial();
  }
  function bestRecord(id:string,patch:Partial<MeetTrial>) {
    const person=data.participants.find(p=>p.entryId===id)!;
    const next={...bestTrial(person),...patch},saved=base.data.participants.find(p=>p.entryId===id);
    const original=saved&&bestTrial(saved);
    update(id,{trials:saved&&original&&next.mark===original.mark&&next.status===original.status&&next.wind===original.wind?saved.trials:[next]});
  }
  function appearanceActions(id:string) {
    const appearance=appearances.find(a=>a.id===id),person=people.get(appearance?.participant_id??"");
    if(!appearance||!onDeleteAppearance||!canDeleteAppearance?.(id))return null;
    const confirmed=familyEvents.find(e=>e.name===appearance.event_name)?.confirmed;
    return <ActionMenu className="h-11 w-11" triggerLabel={`${person?.name??"出場者"} ${appearance.event_name}の操作メニュー`} disabled={dirty||mutation.locked||confirmed} deleteStatus={mutation.message} deleteConfirmLabel={mutation.notSaved?"同じ操作を再送":mutation.uncertain?"保存結果を確認":undefined} onDelete={()=>dirty?Promise.resolve(false):onDeleteAppearance(id)} deleteTitle="この出場を削除しますか？" deleteDescription="この出場だけを削除扱いにします。配置は解除し、記録と履歴は保持します。ほかの出場は変更しません。"/>;
  }
  function applyReview() {
    if(conflicts.some(p=>!choices[p.key])||blocked.some(a=>choices[`${a.id}:unavailable`]!=="current"))return;
    const participants=review.data.participants.map(p=>{
      const a=appearances.find(a=>a.id===p.entryId);
      return a&&!availableAppearance(people.get(a.participant_id),a)?latest.participants.find(remote=>remote.entryId===p.entryId)!:p;
    });
    setBase({data:latest,appearances,event,events:familyEvents});setObservedKey(latestKey);setData({...review.data,participants});setReviewing(false);setChoices({});setError("");
  }
  async function save() {
    if(!dirty){onClose();return;}
    const changes=data.participants.filter(p=>JSON.stringify(p)!==JSON.stringify(base.data.participants.find(old=>old.entryId===p.entryId))).map(p=>({id:p.entryId,revision:base.appearances.find(a=>a.id===p.entryId)!.revision,performance:storedMeetPerformance(p)}));
    const invalid=(changes.length?model.validate():null)??(data.confirmed&&!base.data.confirmed?new MeetEvent(rule,{confirmed:true,participants:data.participants.filter(p=>currentIds.has(p.entryId)&&availableAppearance(people.get(appearances.find(a=>a.id===p.entryId)!.participant_id),appearances.find(a=>a.id===p.entryId)!))},limits).validate():null);
    if(invalid){setError(invalid);return;}
    const anchor=base.event.confirmed&&data.confirmed&&changes.length?base.events.find(e=>!e.confirmed):base.event;
    if(!anchor){setError("編集する種目の確定を解除してください");return;}
    if(await mutation.run({action:"event.save",event:anchor.name,revision:anchor.revision,expectedConfirmed:anchor.confirmed,changes,confirmed:anchor.name===base.event.name?data.confirmed:anchor.confirmed}))onClose();
  }
  return <FormModal open autoFocus={false} title={event.name} onOpenChange={open=>!open&&onClose()}>
    <FormDraftGuard dirty={dirty} busy={mutation.locked} onSave={save}/>
    <div className="space-y-4">
      <SegmentedControl items={[{key:"records",label:"記録"},{key:"groups",label:event.discipline==="track"?"組分け":"試技順"}]} value={view} onChange={setView}/>
      <Button variant="outline" disabled={dirty||mutation.locked||event.confirmed||!(meet.permissions.register??meet.permissions.record)&&!meet.permissions.manage} onClick={onAdd}>この種目に出場を追加</Button>
      {focus&&<Button variant="ghost" onClick={()=>setFocus(undefined)}>この種目の全員を表示</Button>}
      {changedRemotely&&dirty&&<div className="space-y-2"><p className="text-caption">ほかの操作で更新されています。入力は残っています。</p><Button variant="outline" disabled={mutation.locked} onClick={()=>setReviewing(true)}>最新の情報と入力を確認</Button></div>}
      {view==="groups"?<>
        {familyEvents.some(e=>e.confirmed)&&<p className="text-caption">記録確定済みの出場は固定しています。</p>}
        {event.discipline==="track"?<>
          <Select ariaLabel="新しい組の区分" value={newScope} onValueChange={setNewScope} options={[{value:"男子",label:"男子"},{value:"女子",label:"女子"},{value:"混合",label:"混合"}]}/>
          <MeetHeatBoard data={boardData} entrants={entrants} orderLabel={event.capacity?"レーン":"番号"} capacity={event.capacity??undefined} disabled={groupsDisabled} onChange={changePlacements} statusActions={false} countUnit="件" renderActions={appearanceActions} validateMove={(ids,group)=>{if(group===null)return null;const scope=meetBoardPlacement(group).heatScope;return scope!=="混合"&&ids.some(id=>familyEvents.find(e=>e.name===appearances.find(a=>a.id===id)?.event_name)?.division!==scope)?"区分が異なります。男子・女子を一緒に配置する場合は混合組を選んでください":null;}} groupLabel={meetBoardGroupLabel} nextGroup={nextGroup} groupLimit={297} modelLimits={limits}/>
        </>:<MeetFieldOrderBoard data={boardData} entrants={entrants} disabled={groupsDisabled} onChange={changePlacements} statusActions={false} countUnit="件" renderActions={appearanceActions} modelLimits={limits}/>
        }
      </>:<>
        {event.discipline==="track"&&groups.length>0&&<Select ariaLabel="記録する組" value={group} onValueChange={setGroup} options={[{value:"all",label:"全員"},...groups.map(value=>({value:String(value),label:meetBoardGroupLabel(value)}))]}/ >}
        {event.discipline!=="track"&&<p className="text-caption">各出場の最高記録を入力してください。</p>}
        {visible.map(performance=>{
          const a=appearances.find(a=>a.id===performance.entryId)!,person=people.get(a.participant_id),sourceConfirmed=familyEvents.find(e=>e.name===a.event_name)?.confirmed,locked=disabled||sourceConfirmed||!availableAppearance(person,a)||performance.status==="DNS";
          const count=1;
          const placement=placementText(performance);
          return <Card key={a.id} className="space-y-3 p-3.5">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-body font-semibold">{person?.name}<span className="ml-2 text-caption font-normal">{person?.grade}</span></h3><p className="text-caption">{placement}・{model.best(performance)}{ranks.has(a.id)?`・${ranks.get(a.id)}位`:""}</p></div>
              <Select ariaLabel={`${person?.name} ${event.name} ${placement}の出場状況`} className="w-40" disabled={disabled||sourceConfirmed||!availableAppearance(person,a)} value={performance.status} onValueChange={status=>update(a.id,status==="DNS"?{status:"DNS",group:null,order:null,heatScope:undefined}:{status:status as MeetPerformance["status"]})} options={[{value:"entered",label:"出場"},{value:"DNS",label:"DNS（欠場）"},{value:"DNF",label:"DNF（途中棄権）"},{value:"DQ",label:"DQ（失格）"}]}/>
              {appearanceActions(a.id)}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">{Array.from({length:count},(_,index)=>{
              const t=event.discipline==="track"?performance.trials[index]??emptyTrial():bestTrial(performance);
              const edit=(patch:Partial<MeetTrial>)=>event.discipline==="track"?trial(a.id,index,patch):bestRecord(a.id,patch);
              return <fieldset key={index} disabled={locked} className="space-y-2">
                <label className="block text-caption">{event.discipline==="track"?"タイム（秒・分:秒・未計測は -）":"最高記録（m・未計測は -）"}
                  <Input aria-label={`${person?.name} ${placement}の${event.discipline==="track"?"タイム":"最高記録"}`} inputMode="text" value={t.mark} onChange={e=>edit({mark:e.target.value,status:e.target.value?"valid":"pending",...(!e.target.value||e.target.value==="-"?{wind:""}:{})})} onBlur={e=>{const saved=base.data.participants.find(p=>p.entryId===a.id);if(e.target.value===(saved?(event.discipline==="track"?saved.trials[index]?.mark:bestTrial(saved).mark)??"":""))return;const mark=formatObRecordInput(e.target.value,event.family);edit({mark,status:mark?"valid":"pending"});}}/>
                </label>
                {event.wind&&<label className="block text-caption">風速<Input inputMode="decimal" value={t.wind} onChange={e=>edit({wind:e.target.value})}/></label>}
              </fieldset>;
            })}</div>
            {performance.status==="DNS"&&performance.trials.length>0&&<p className="text-caption">保存記録 {model.best({...performance,status:"entered"})}。試技は保持しています。</p>}
          </Card>;
        })}
        {!visible.length&&<p className="text-caption">出場登録はありません</p>}
      </>}
      {meet.permissions.groups&&<label className="flex min-h-11 items-center gap-2 text-body"><input type="checkbox" disabled={mutation.locked} checked={data.confirmed} onChange={e=>setData({...data,confirmed:e.target.checked})}/>結果を確定</label>}
      {error&&<p role="alert" className="text-body text-danger">{error}</p>}
      {mutation.message&&<p role="status" className="text-caption">{mutation.message}</p>}
      {mutation.uncertain&&<Button disabled={mutation.busy} onClick={()=>void mutation.check()}>保存結果を確認</Button>}
      {mutation.notSaved&&<Button disabled={mutation.busy} onClick={()=>void mutation.retry()}>同じ操作を再送</Button>}
    </div>
    <FormModalFooter><Button className="w-full" disabled={mutation.locked||!dirty} onClick={()=>void save()}>{mutation.busy?"保存中…":"保存する"}</Button></FormModalFooter>
    <Sheet open={reviewing} onOpenChange={setReviewing}><SheetContent title="変更の確認"><div className="space-y-4">
      <p className="text-caption">配置・出場状況・試技を分けて確認します。重ならない変更は両方を保持します。</p>
      {blocked.map(a=><div key={a.id} className="space-y-2"><p className="text-body">{people.get(a.participant_id)?.name}（{a.event_name}・{placementText(data.participants.find(p=>p.entryId===a.id)!)}）は取消・削除・欠席中です。入力を使うには先に参加者の画面で復帰してください。</p><p className="text-caption">入力: {operationFieldLabel(data.participants.find(p=>p.entryId===a.id)!,"trials")}</p><label className="flex min-h-11 items-center gap-2 text-body"><input type="checkbox" checked={choices[`${a.id}:unavailable`]==="current"} onChange={e=>setChoices({...choices,[`${a.id}:unavailable`]:e.target.checked?"current":"own"})}/>この出場の入力を破棄し、最新の情報を使う</label></div>)}
      {conflicts.map(conflict=>{const a=appearances.find(a=>a.id===conflict.entryId)!,person=people.get(a.participant_id);return <div key={conflict.key} className="space-y-2"><p className="text-body">{person?.name}・{a.event_name}・{placementText(conflict.current)}（{{position:"配置",status:"出場状況",trials:"試技"}[conflict.field]}）</p><Select ariaLabel={`${person?.name} ${a.event_name} ${placementText(conflict.current)}の${conflict.field}で使う情報`} value={choices[conflict.key]??""} onValueChange={value=>setChoices({...choices,[conflict.key]:value as "own"|"current"})} options={[{value:"current",label:`最新: ${operationFieldLabel(conflict.current,conflict.field)}`},{value:"own",label:`入力: ${operationFieldLabel(conflict.own,conflict.field)}`,disabled:!availableAppearance(person,a)}]}/></div>;})}
      <Button className="w-full" disabled={conflicts.some(p=>!choices[p.key])||blocked.some(a=>choices[`${a.id}:unavailable`]!=="current")} onClick={applyReview}>確認した内容を使う</Button>
    </div></SheetContent></Sheet>
  </FormModal>;
}
