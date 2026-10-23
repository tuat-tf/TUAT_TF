"use client";

import {useState} from "react";
import {Button} from "@/components/ui/button";
import {Card} from "@/components/ui/card";
import {Input} from "@/components/ui/input";
import {Select} from "@/components/ui/select";
import {Sheet,SheetContent} from "@/components/ui/sheet";
import {FormModal,FormModalFooter,FormDraftGuard} from "@/components/ui/form-modal";
import {emptyRelayResults,formatRelayTime,relayHeats,relayTeamKey,reviewRelayResults,validateRelayResults} from "@/lib/competition-meet-relay";
import type {CompetitionMeet,ManagedMeetEvent,RelayTeamResult} from "@/lib/competition-meet";
import type {MeetMutation} from "./CompetitionMeetWorkspace";

export function CompetitionMeetRelayEditor({event,meet,mutation,onClose}:{event:ManagedMeetEvent;meet:CompetitionMeet;mutation:MeetMutation;onClose:()=>void}) {
  const latest=event.relay_results!;
  const [base,setBase]=useState({teams:latest,revision:event.revision,confirmed:event.confirmed});
  const [teams,setTeams]=useState(latest),[confirmed,setConfirmed]=useState(event.confirmed),[error,setError]=useState("");
  const [reviewing,setReviewing]=useState(false),[choices,setChoices]=useState<Record<string,"own"|"current">>({}),[discard,setDiscard]=useState(false);
  const dirty=JSON.stringify(teams)!==JSON.stringify(base.teams)||confirmed!==base.confirmed;
  if(!dirty&&!mutation.locked&&base.revision!==event.revision){setBase({teams:latest,revision:event.revision,confirmed:event.confirmed});setTeams(latest);setConfirmed(event.confirmed);}
  const changed=base.revision!==event.revision,review=reviewRelayResults(base.teams,teams,latest,choices);
  const heats=relayHeats(teams);
  const recordsChanged=JSON.stringify(teams)!==JSON.stringify(base.teams);
  const mustDiscard=event.confirmed&&recordsChanged;
  function update(key:string,field:"name"|"time",value:string){setError("");setTeams(before=>before.map(team=>relayTeamKey(team)===key?{...team,[field]:value}:team));}
  function updateMember(key:string,runner:number,value:string){setError("");setTeams(before=>before.map(team=>relayTeamKey(team)===key?{...team,members:team.members.map((name,index)=>index===runner?value:name) as RelayTeamResult["members"]}:team));}
  async function save(){
    if(!dirty){onClose();return;}
    const desired:RelayTeamResult[]=teams.map(team=>({...team,name:team.name.trim(),time:formatRelayTime(team.time),members:team.members.map(name=>name.trim()) as RelayTeamResult["members"]}));
    const problem=validateRelayResults(desired,confirmed);if(problem){setError(problem);return;}
    if(await mutation.run({action:"relay.save",event:event.name,revision:base.revision,relayResults:desired,confirmed}))onClose();
  }
  function applyReview(){
    if(mustDiscard&&!discard||!mustDiscard&&review.conflicts.some(conflict=>!choices[conflict.key]))return;
    setTeams(mustDiscard?latest:review.teams);setConfirmed(event.confirmed===base.confirmed?confirmed:event.confirmed);
    setBase({teams:latest,revision:event.revision,confirmed:event.confirmed});setReviewing(false);setChoices({});setDiscard(false);setError("");
  }
  return <FormModal open autoFocus={false} title={event.name} onOpenChange={open=>!open&&onClose()}>
    <FormDraftGuard dirty={dirty} busy={mutation.busy} onSave={save}/>
    <div className="space-y-4">
      <p className="text-caption">各組のチーム名、タイム、1走〜4走の氏名を入力してください。未計測のタイムは - を入力できます。</p>
      {changed&&dirty&&<div className="space-y-2"><p className="text-caption">ほかの操作で更新されています。入力は残っています。</p><Button variant="outline" disabled={mutation.locked} onClick={()=>setReviewing(true)}>最新の情報と入力を確認</Button></div>}
      <fieldset disabled={mutation.locked||!meet.permissions.record||event.confirmed} className="space-y-3">
        {heats.map(({heat,teams:heatTeams})=><section key={heat} className="space-y-3" aria-label={`${heat}組`}><h3 className="text-body font-semibold">{heat}組</h3>
          {heatTeams.map(team=>{const key=relayTeamKey(team),position=`${heat}組 ${team.lane}レーン`;return <Card key={key} className="space-y-3 p-3.5"><h4 className="text-body font-semibold">{team.lane}レーン</h4>
            <label className="block space-y-1 text-caption">チーム名<Input aria-label={`${position}のチーム名`} maxLength={100} value={team.name} onChange={e=>update(key,"name",e.target.value)}/></label>
            <label className="block space-y-1 text-caption">タイム（分:秒）<Input aria-label={`${position}のタイム`} placeholder="例: 2:45.67" inputMode="text" value={team.time} onChange={e=>update(key,"time",e.target.value)} onBlur={e=>{if(e.target.value!==base.teams.find(saved=>relayTeamKey(saved)===key)?.time)update(key,"time",formatRelayTime(e.target.value));}}/></label>
            <div className="grid grid-cols-2 gap-3">{team.members.map((name,runner)=><label key={runner} className="block space-y-1 text-caption">{runner+1}走<Input aria-label={`${position}の${runner+1}走`} maxLength={100} value={name} onChange={e=>updateMember(key,runner,e.target.value)}/></label>)}</div>
          </Card>;})}
        </section>)}
        <Button variant="outline" onClick={()=>{setError("");setTeams(before=>[...before,...emptyRelayResults(before.length/6+1)]);}}>{heats.length+1}組目を追加</Button>
      </fieldset>
      {meet.permissions.groups&&<label className="flex min-h-11 items-center gap-2 text-body"><input type="checkbox" disabled={mutation.locked} checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>結果を確定</label>}
      {event.confirmed&&<p className="text-caption">編集する場合は、先に結果の確定を解除して保存してください。</p>}
      {error&&<p role="alert" className="text-body text-danger">{error}</p>}
      {mutation.message&&<p role="status" className="text-caption">{mutation.message}</p>}
      {mutation.uncertain&&<Button disabled={mutation.busy} onClick={()=>void mutation.check()}>保存結果を確認</Button>}
      {mutation.notSaved&&<Button disabled={mutation.busy} onClick={()=>void mutation.retry()}>同じ操作を再送</Button>}{mutation.outdated&&<Button onClick={()=>window.location.reload()}>再読み込み</Button>}
    </div>
    <FormModalFooter><Button className="w-full" disabled={mutation.locked||!dirty||!meet.permissions.record} onClick={()=>void save()}>保存する</Button></FormModalFooter>
    <Sheet open={reviewing} onOpenChange={setReviewing}><SheetContent title="変更の確認"><div className="space-y-4">
      {mustDiscard?<><p className="text-caption">ほかの操作で結果が確定しました。入力を使うには、先に確定を解除してください。</p><label className="flex min-h-11 items-center gap-2 text-body"><input type="checkbox" checked={discard} onChange={e=>setDiscard(e.target.checked)}/>今回の入力を破棄し、確定済みの結果を使う</label></>:review.conflicts.length?review.conflicts.map(conflict=><div key={conflict.key} className="space-y-2"><p className="text-body">{conflict.heat}組 {conflict.lane}レーンの{conflict.label}</p><Select ariaLabel={`${conflict.heat}組 ${conflict.lane}レーンの${conflict.label}で使う情報`} value={choices[conflict.key]??""} onValueChange={value=>setChoices({...choices,[conflict.key]:value as "own"|"current"})} options={[{value:"current",label:`最新: ${conflict.current||"未入力"}`},{value:"own",label:`入力: ${conflict.own||"未入力"}`}]}/></div>):<p className="text-caption">変更箇所は重複していません。最新の情報と今回の入力を両方保持します。</p>}
      <Button className="w-full" disabled={mustDiscard?!discard:review.conflicts.some(conflict=>!choices[conflict.key])} onClick={applyReview}>確認した内容を使う</Button>
    </div></SheetContent></Sheet>
  </FormModal>;
}
