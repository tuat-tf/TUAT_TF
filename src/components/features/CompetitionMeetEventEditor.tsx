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
import { MeetEvent, MeetMark, emptyTrial, type MeetPerformance, type MeetTrial } from "@/lib/meet-operations";
import { fieldOrderRows } from "@/lib/meet-field-order";
import { formatObRecordInput } from "@/lib/ob-record-input";
import { obResultRanks } from "@/lib/ob-result-ranking";
import { obOperationHasChanges, operationFieldLabel, reviewObOperation, type OperationChoices } from "@/lib/ob-operation-draft";
import { availableAppearance, competitionFamilyData, meetBoardGroup, meetBoardPlacement, meetBoardGroupLabel, meetFamilyGroupLabel, meetRule, storedMeetPerformance, type CompetitionMeet, type ManagedMeetEvent } from "@/lib/competition-meet";
import { MeetHeatBoard } from "./MeetHeatBoard";
import { MeetFieldOrderBoard } from "./MeetFieldOrderBoard";
import type { MeetMutation } from "./CompetitionMeetWorkspace";

const limits = { maxGroups: 297, maxOrder: 600, maxParticipants: 1000, defaultGroup: 199, groupLabel: meetBoardGroupLabel };
export function CompetitionMeetEventEditor({event,meet,mutation,onClose,onAdd,initialAppearanceId,canDeleteAppearance,onDeleteAppearance}: {
  event:ManagedMeetEvent; meet:CompetitionMeet; mutation:MeetMutation; onClose:()=>void; onAdd:()=>void; initialAppearanceId?:string; canDeleteAppearance?:(id:string)=>boolean; onDeleteAppearance?:(id:string)=>Promise<boolean>;
}) {
  const familyEvents=meet.events.filter(value=>value.family===event.family);
  const latest=competitionFamilyData(meet,event);
  const appearances=meet.appearances.filter(a=>familyEvents.some(e=>e.name===a.event_name));
  const listedIds=new Set(appearances.filter(a=>a.state!=="deleted").map(a=>a.id));
  const [base,setBase]=useState({data:latest,appearances,event,events:familyEvents});
  const [data,setData]=useState(latest),[view,setView]=useState<"groups"|"records">("records");
  const [group,setGroup]=useState("all"),[focus,setFocus]=useState(initialAppearanceId);
  const [reviewing,setReviewing]=useState(false),[choices,setChoices]=useState<OperationChoices>({}),[error,setError]=useState("");
  // The field record being typed per entry, kept apart from the trial list so attempts can be added/removed around it.
  const [fieldEdits,setFieldEdits]=useState<Record<string,MeetTrial>>({});
  const people=new Map(meet.participants.map(p=>[p.id,p]));
  const dirty=obOperationHasChanges(base.data,data);
  const latestKey=JSON.stringify({data:latest,events:familyEvents.map(e=>[e.name,e.revision]),appearances:appearances.map(a=>[a.id,a.revision])});
  const [observedKey,setObservedKey]=useState(latestKey);
  if(!dirty&&!mutation.locked&&observedKey!==latestKey){setObservedKey(latestKey);setBase({data:latest,appearances,event,events:familyEvents});setData(latest);}
  const changedRemotely=appearances.some(a=>base.appearances.find(old=>old.id===a.id)?.revision!==a.revision)||familyEvents.some(e=>base.events.find(old=>old.name===e.name)?.revision!==e.revision);
  const rule=meetRule(event),model=new MeetEvent(rule,{...data,confirmed:false},limits);
  const entrants=appearances.map(a=>{
    const person=people.get(a.participant_id),source=familyEvents.find(e=>e.name===a.event_name)!;
    return {id:a.id,name:person?.name??"参加者確認中",grade:person?.grade??"",mark:a.qualification_mark??"",alumni:person?.grade==="OB・OG",eligible:availableAppearance(person,a),absent:person?.absent,division:source.division==="混合"?undefined:source.division,placementLocked:latest.confirmed};
  });
  const ordered=event.discipline==="track"?[...data.participants].sort((a,b)=>(a.group??999)-(b.group??999)||(a.order??999)-(b.order??999)):fieldOrderRows(data).map(row=>row.person);
  const own=ordered.filter(p=>listedIds.has(p.entryId));
  const boardData={...data,participants:data.participants.filter(p=>listedIds.has(p.entryId))};
  const groups=[...new Set(own.flatMap(p=>p.group===null?[]:[p.group]))];
  const visible=own.filter(p=>(!focus||p.entryId===focus)&&(event.discipline!=="track"||group==="all"||String(p.group)===group));
  const ranks=new Map(familyEvents.flatMap(source=>[...obResultRanks(meetRule(source),own.filter(p=>{
    const a=appearances.find(a=>a.id===p.entryId)!;return a.event_name===source.name&&availableAppearance(people.get(a.participant_id),a);
  }))]));
  const numbers=new Map(fieldOrderRows(data).map(row=>[row.person.entryId,row.number]));
  const groupLabel=(value:number,shownGroups?:readonly number[])=>meetFamilyGroupLabel(meet,event,value,data,shownGroups);
  function placementText(performance:MeetPerformance) {
    return event.discipline==="track"?(performance.group===null?"":`${groupLabel(performance.group)} ${performance.order??"未定"}${event.capacity?"レーン":"番"}`):(numbers.get(performance.entryId)==null?"":`試技順 ${numbers.get(performance.entryId)}番`);
  }
  const disabled=mutation.locked||!meet.permissions.record;
  const groupsDisabled=mutation.locked||!meet.permissions.groups||latest.confirmed;
  const nextRaw=Math.max(0,...data.participants.flatMap(p=>p.group!==null?[meetBoardPlacement(p.group).group]:[]))+1;
  const nextGroup=nextRaw<=99?meetBoardGroup(nextRaw,"混合"):null;
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
    setData({...next,confirmed:data.confirmed,participants:data.participants.map(p=>changed.get(p.entryId)??p)});
  }
  function bestTrial(person:MeetPerformance) {
    return model.bestTrial(person)??person.trials.find(t=>t.status==="valid"&&t.mark==="-")??emptyTrial();
  }
  /** The field mark being edited exactly as typed ("26." included); the saved best while untouched. */
  function fieldTrial(person:MeetPerformance) {
    const saved=base.data.participants.find(p=>p.entryId===person.entryId);
    const untouched=!!saved&&JSON.stringify(person.trials)===JSON.stringify(saved.trials);
    return untouched?bestTrial(person):fieldEdits[person.entryId]??bestTrial(person);
  }
  /** Edit the saved best attempt in place. Other attempts stay (wind-only fixes keep tie-breaks); valid ones that
   *  would beat the newly entered best are left out so the result equals what was typed; failed attempts stay. */
  function bestRecord(id:string,patch:Partial<MeetTrial>) {
    const person=data.participants.find(p=>p.entryId===id)!,saved=base.data.participants.find(p=>p.entryId===id);
    const original=saved?.trials??[],best=saved?bestTrial(saved):emptyTrial(),index=original.indexOf(best);
    const edited={...fieldTrial(person),...patch};
    setFieldEdits(current=>({...current,[id]:edited}));
    const value=edited.status==="valid"?MeetMark.parse(edited.mark,event.discipline):null;
    const beats=(t:MeetTrial)=>{const other=t.status==="valid"?MeetMark.parse(t.mark,event.discipline):null;
      return value!==null&&other!==null&&(event.discipline==="track"?other<value:other>value);};
    const trials=original.flatMap((t,i)=>i===index?[edited]:beats(t)?[]:[t]);
    if(index===-1)trials.push(edited);
    update(id,{trials:saved&&JSON.stringify(trials)===JSON.stringify(saved.trials)?saved.trials:trials});
  }
  function appearanceActions(id:string) {
    const appearance=appearances.find(a=>a.id===id),person=people.get(appearance?.participant_id??"");
    if(!appearance||!onDeleteAppearance||!canDeleteAppearance?.(id))return null;
    const confirmed=latest.confirmed;
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
  async function save(confirmation?:boolean) {
    if(!dirty&&confirmation===undefined){onClose();return;}
    if(confirmation===false&&dirty){setError("入力した変更を保存してから確定を解除してください");return;}
    const changes=data.participants.filter(p=>JSON.stringify(p)!==JSON.stringify(base.data.participants.find(old=>old.entryId===p.entryId))).map(p=>({id:p.entryId,revision:base.appearances.find(a=>a.id===p.entryId)!.revision,performance:storedMeetPerformance(p)}));
    const changedIds=new Set(changes.map(c=>c.id));
    const active=data.participants.filter(p=>{const a=appearances.find(a=>a.id===p.entryId)!;return availableAppearance(people.get(a.participant_id),a);});
    const problem=(changes.length?new MeetEvent(rule,{confirmed:false,participants:active.map(p=>changedIds.has(p.entryId)?p:{...p,trials:[]})},limits).validateDetailed():null)??(confirmation===true?new MeetEvent(rule,{confirmed:true,participants:active},limits).validateDetailed():null);
    if(problem){const who=problem.entryId?people.get(appearances.find(a=>a.id===problem.entryId)?.participant_id??"")?.name:undefined;setError(who?`${who}さん：${problem.message}`:problem.message);return;}
    const anchor=base.event;
    if(await mutation.run({action:"event.save",event:anchor.name,revision:anchor.revision,expectedConfirmed:anchor.confirmed,changes,confirmed:confirmation??anchor.confirmed,...(confirmation===undefined?{}:{confirmEvents:base.events.map(({name,revision,confirmed})=>({name,revision,confirmed}))})}))onClose();
  }
  return <FormModal open autoFocus={false} title={event.family} onOpenChange={open=>!open&&onClose()}>
    <FormDraftGuard dirty={dirty} busy={mutation.busy} onSave={save}/>
    <div className="space-y-4">
      <SegmentedControl items={[{key:"records",label:"記録"},{key:"groups",label:event.discipline==="track"?"組分け":"試技順"}]} value={view} onChange={setView}/>
      <Button variant="outline" disabled={dirty||mutation.locked||latest.confirmed||!(meet.permissions.register??meet.permissions.record)&&!meet.permissions.manage} onClick={onAdd}>この種目に出場を追加</Button>
      {focus&&<Button variant="ghost" onClick={()=>setFocus(undefined)}>この種目の全員を表示</Button>}
      {changedRemotely&&dirty&&<div className="space-y-2"><p className="text-caption">ほかの操作で更新されています。入力は残っています。</p><Button variant="outline" disabled={mutation.locked} onClick={()=>setReviewing(true)}>最新の情報と入力を確認</Button></div>}
      {view==="groups"?<>
        {latest.confirmed&&<p className="text-caption">確定を解除すると記録・組分けを編集できます。</p>}
        {event.discipline==="track"?<>
          <MeetHeatBoard data={boardData} entrants={entrants} orderLabel={event.capacity?"レーン":"番号"} capacity={event.capacity??undefined} disabled={groupsDisabled} onChange={changePlacements} statusActions={false} countUnit="件" renderActions={appearanceActions} groupLabel={groupLabel} nextGroup={nextGroup} groupLimit={297} modelLimits={{...limits,groupLabel}}/>
        </>:<MeetFieldOrderBoard data={boardData} entrants={entrants} disabled={groupsDisabled} onChange={changePlacements} statusActions={false} countUnit="件" renderActions={appearanceActions} modelLimits={limits}/>
        }
      </>:<>
        {event.discipline==="track"&&groups.length>0&&<Select ariaLabel="記録する組" value={group} onValueChange={setGroup} options={[{value:"all",label:"全員"},...groups.map(value=>({value:String(value),label:groupLabel(value)}))]}/ >}
        {event.discipline!=="track"&&<p className="text-caption">各出場の記録を入力してください。</p>}
        {visible.map(performance=>{
          const a=appearances.find(a=>a.id===performance.entryId)!,person=people.get(a.participant_id),sourceConfirmed=latest.confirmed,locked=disabled||sourceConfirmed||!availableAppearance(person,a)||performance.status==="DNS";
          const count=1;
          const placement=placementText(performance);
          return <Card key={a.id} className="space-y-3 p-3.5">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-body font-semibold">{person?.name}<span className="ml-2 text-caption font-normal">{person?.grade}・{familyEvents.find(e=>e.name===a.event_name)?.division}</span></h3><p className="text-caption">{[placement,model.best(performance)].filter(Boolean).join("・")}{ranks.has(a.id)?`・${familyEvents.find(e=>e.name===a.event_name)?.division??""}${ranks.get(a.id)}位`:""}</p></div>
              <Select ariaLabel={`${person?.name} ${a.event_name} ${placement}の出場状況`} className="w-40" disabled={disabled||sourceConfirmed||!availableAppearance(person,a)} value={performance.status} onValueChange={status=>update(a.id,status==="DNS"?{status:"DNS",group:null,order:null,heatScope:undefined}:{status:status as MeetPerformance["status"]})} options={[{value:"entered",label:"出場"},{value:"DNS",label:"DNS（欠場）"},{value:"DNF",label:"DNF（途中棄権）"},{value:"DQ",label:"DQ（失格）"}]}/>
              {appearanceActions(a.id)}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">{Array.from({length:count},(_,index)=>{
              const t=event.discipline==="track"?performance.trials[index]??emptyTrial():fieldTrial(performance);
              const edit=(patch:Partial<MeetTrial>)=>event.discipline==="track"?trial(a.id,index,patch):bestRecord(a.id,patch);
              return <fieldset key={index} disabled={locked} className="space-y-2">
                <label className="block text-caption">{event.discipline==="track"?"タイム（秒・分:秒・未計測は -）":"記録（m・未計測は -）"}
                  <Input aria-label={`${person?.name} ${placement}の${event.discipline==="track"?"タイム":"記録"}`} inputMode="text" value={t.mark} onChange={e=>edit({mark:e.target.value,status:e.target.value?"valid":"pending",...(!e.target.value||e.target.value==="-"?{wind:""}:{})})} onBlur={e=>{const saved=base.data.participants.find(p=>p.entryId===a.id);if(e.target.value===(saved?(event.discipline==="track"?saved.trials[index]?.mark:bestTrial(saved).mark)??"":""))return;const mark=formatObRecordInput(e.target.value,event.family);edit({mark,status:mark?"valid":"pending"});}}/>
                </label>
                {event.wind&&<label className="block text-caption">風速<Input inputMode="decimal" value={t.wind} onChange={e=>edit({wind:e.target.value})}/></label>}
              </fieldset>;
            })}</div>
            {performance.status==="DNS"&&performance.trials.length>0&&<p className="text-caption">保存記録 {model.best({...performance,status:"entered"})}。記録は保持しています。</p>}
          </Card>;
        })}
        {!visible.length&&<p className="text-caption">出場登録はありません</p>}
      </>}
      {meet.permissions.groups&&<Button variant="outline" disabled={mutation.locked||changedRemotely&&dirty||latest.confirmed&&dirty} onClick={()=>save(!latest.confirmed)}>{latest.confirmed?"確定を解除":"結果を確定"}</Button>}
      {error&&<p role="alert" className="text-body text-danger">{error}</p>}
      {mutation.message&&<p role="status" className="text-caption">{mutation.message}</p>}
      {mutation.uncertain&&<Button disabled={mutation.busy} onClick={()=>void mutation.check()}>保存結果を確認</Button>}
      {mutation.notSaved&&<Button disabled={mutation.busy} onClick={()=>void mutation.retry()}>同じ操作を再送</Button>}{mutation.outdated&&<Button onClick={()=>window.location.reload()}>再読み込み</Button>}
    </div>
    <FormModalFooter><Button className="w-full" disabled={mutation.locked||!dirty} onClick={()=>void save()}>{mutation.busy?"保存中…":"保存する"}</Button></FormModalFooter>
    <Sheet open={reviewing} onOpenChange={setReviewing}><SheetContent title="変更の確認"><div className="space-y-4">
      <p className="text-caption">配置・出場状況・記録を分けて確認します。重ならない変更は両方を保持します。</p>
      {blocked.map(a=><div key={a.id} className="space-y-2"><p className="text-body">{people.get(a.participant_id)?.name}（{a.event_name}・{placementText(data.participants.find(p=>p.entryId===a.id)!)}）はDNSです。入力を使うには、先に参加者の画面でDNSを解除してください。</p><p className="text-caption">入力: {operationFieldLabel(data.participants.find(p=>p.entryId===a.id)!,"trials")}</p><label className="flex min-h-11 items-center gap-2 text-body"><input type="checkbox" checked={choices[`${a.id}:unavailable`]==="current"} onChange={e=>setChoices({...choices,[`${a.id}:unavailable`]:e.target.checked?"current":"own"})}/>この出場の入力を破棄し、最新の情報を使う</label></div>)}
      {conflicts.map(conflict=>{const a=appearances.find(a=>a.id===conflict.entryId)!,person=people.get(a.participant_id);return <div key={conflict.key} className="space-y-2"><p className="text-body">{person?.name}・{a.event_name}・{placementText(conflict.current)}（{{position:"配置",status:"出場状況",trials:"記録"}[conflict.field]}）</p><Select ariaLabel={`${person?.name} ${a.event_name} ${placementText(conflict.current)}の${conflict.field}で使う情報`} value={choices[conflict.key]??""} onValueChange={value=>setChoices({...choices,[conflict.key]:value as "own"|"current"})} options={[{value:"current",label:`最新: ${operationFieldLabel(conflict.current,conflict.field)}`},{value:"own",label:`入力: ${operationFieldLabel(conflict.own,conflict.field)}`,disabled:!availableAppearance(person,a)}]}/></div>;})}
      <Button className="w-full" disabled={conflicts.some(p=>!choices[p.key])||blocked.some(a=>choices[`${a.id}:unavailable`]!=="current")} onClick={applyReview}>確認した内容を使う</Button>
    </div></SheetContent></Sheet>
  </FormModal>;
}
