import { MeetMark } from "./meet-operations";
import type { ManagedMeetEvent, RelayTeamResult } from "./competition-meet";
import type { ParsedProgramRow } from "./competition-program";
import type { TableSheet } from "./export-table";

export function emptyRelayResults(heat=1): RelayTeamResult[] {
  return Array.from({length:6},(_,index)=>({...heat>1?{heat}:{},lane:index+1,name:"",time:"",members:["","","",""]}));
}

export function relayHeat(team:RelayTeamResult):number { return team.heat??1; }
export function relayTeamKey(team:RelayTeamResult):string { return `${relayHeat(team)}:${team.lane}`; }
export function relayHeats(teams:RelayTeamResult[]) {
  const heats=new Map<number,RelayTeamResult[]>();
  for(const team of teams){const heat=relayHeat(team);if(!heats.has(heat))heats.set(heat,[]);heats.get(heat)!.push(team);}
  return [...heats].map(([heat,teams])=>({heat,teams}));
}

export function validateRelayResults(teams: RelayTeamResult[], confirmed=false): string | null {
  if(!Array.isArray(teams)||!teams.length||teams.length%6!==0||teams.some((team,index)=>!team||typeof team!=="object"||Array.isArray(team)||team.lane!==index%6+1||relayHeat(team)!==Math.floor(index/6)+1||("heat" in team&&(!Number.isInteger(team.heat)||team.heat!<1))||typeof team.name!=="string"||typeof team.time!=="string"||Object.keys(team).some(key=>!["heat","lane","name","time","members"].includes(key))))return "各組の1〜6レーンのチーム情報を確認してください";
  for(const team of teams){
    const position=`${relayHeat(team)}組 ${team.lane}レーン`;
    if(team.name.length>100)return `${position}のチーム名は100文字以内で入力してください`;
    if(!Array.isArray(team.members)||team.members.length!==4||team.members.some(name=>typeof name!=="string"||name.length>100))return `${position}の1走〜4走の氏名を確認してください`;
    if(team.members.some(name=>name.trim())&&!team.name.trim())return `${position}のチーム名を入力してください`;
    if(team.time&&(!team.name.trim()||team.time!=="-"&&MeetMark.parse(team.time,"track")===null))return `${position}のチーム名とタイムを確認してください`;
    if(confirmed&&team.name.trim()&&!team.time)return `${position}のタイムを入力してから確定してください`;
  }
  if(confirmed&&!teams.some(team=>team.name.trim()))return "チームを入力してから確定してください";
  return null;
}

export function formatRelayTime(value:string) {
  const text=value.normalize("NFKC").trim();
  return /^\d{5,7}$/.test(text)?`${Number(text.slice(0,-4))}:${text.slice(-4,-2)}.${text.slice(-2)}`:text;
}

export type RelayConflict={key:string;heat:number;lane:number;field:string;label:string;own:string;current:string};
export function reviewRelayResults(base:RelayTeamResult[],draft:RelayTeamResult[],latest:RelayTeamResult[],choices:Record<string,"own"|"current">={}) {
  const conflicts:RelayConflict[]=[];
  const beforeByKey=new Map(base.map(team=>[relayTeamKey(team),team])),ownByKey=new Map(draft.map(team=>[relayTeamKey(team),team]));
  const currentByKey=new Map(latest.map(team=>[relayTeamKey(team),team]));
  // Heat additions from either editor stay present. Competing additions to the
  // same heat are reviewed field by field, like edits to an existing team.
  const allTeams=[...currentByKey.values(),...draft.filter(team=>!currentByKey.has(relayTeamKey(team)))].sort((a,b)=>relayHeat(a)-relayHeat(b)||a.lane-b.lane);
  const teams=allTeams.map(reference=>{
    const identity=relayTeamKey(reference),empty={...reference,name:"",time:"",members:["","","",""] as RelayTeamResult["members"]};
    const team=currentByKey.get(identity)??empty,before=beforeByKey.get(identity)??empty,own=ownByKey.get(identity)??before;
    const next={...team,members:[...team.members] as RelayTeamResult["members"]};
    const fields=[{field:"name",label:"チーム名",own:own.name,before:before.name,current:team.name},{field:"time",label:"タイム",own:own.time,before:before.time,current:team.time},...team.members.map((current,runner)=>({field:`member${runner}`,label:`${runner+1}走`,own:own.members[runner],before:before.members[runner],current}))];
    for(const {field,label,own,before,current} of fields){
      const key=`${identity}:${field}`;
      const assign=(value:string)=>{if(field==="name"||field==="time")next[field]=value;else next.members[Number(field.slice(6))]=value;};
      if(own===before)continue;
      if(current===before||current===own){assign(own);continue;}
      conflicts.push({key,heat:relayHeat(team),lane:team.lane,field,label,own,current});
      assign(choices[key]==="own"?own:current);
    }
    return next;
  });
  return {teams,conflicts};
}

export function relayRanks(teams:RelayTeamResult[]) {
  const finished=teams.flatMap(team=>{
    const value=team.name.trim()?MeetMark.parse(team.time,"track"):null;
    return value===null?[]:[{lane:team.lane,value}];
  }).sort((a,b)=>a.value-b.value);
  const ranks=new Map<number,number>();let rank=0;
  finished.forEach((team,index)=>{if(!index||finished[index-1].value!==team.value)rank=index+1;ranks.set(team.lane,rank);});
  return ranks;
}

export function relayResultRow(event:ManagedMeetEvent,date:string):ParsedProgramRow {
  const teams=event.relay_results??[],heats=relayHeats(teams),ranks=new Map(heats.map(({heat,teams})=>[heat,relayRanks(teams)])),multiple=heats.length>1;
  return {eventDate:date,block:"track",sortOrder:event.sort_order,timeLabel:event.starts_at,roundKey:event.name,
    eventLabel:event.name,status:event.confirmed?"確定":"速報",
    tuatEntries:teams.filter(team=>team.name.trim()).map(team=>({id:multiple?`${event.name}:${relayTeamKey(team)}`:`${event.name}:${team.lane}`,name:team.name,grade:"",heat:relayHeat(team),lane:team.lane,bib:null,positionLabel:`${multiple?`${relayHeat(team)}組 `:""}${team.lane}レーン`,separateResult:true,details:team.members.flatMap((name,index)=>name.trim()?[`${index+1}走 ${name}`]:[]),
      ...(team.time?{result:{place:ranks.get(relayHeat(team))!.has(team.lane)?String(ranks.get(relayHeat(team))!.get(team.lane)):null,record:team.time}}:{})}))};
}

export function relayResultSheet(event:ManagedMeetEvent):TableSheet {
  const teams=event.relay_results??[],heats=relayHeats(teams),ranks=new Map(heats.map(({heat,teams})=>[heat,relayRanks(teams)])),multiple=heats.length>1;
  return {name:event.name,widths:[...multiple?[8]:[],8,24,14,8,20,20,20,20],rows:[[...multiple?["組"]:[],"レーン","チーム名","タイム","順位","1走","2走","3走","4走"],...teams.map(team=>[...multiple?[relayHeat(team)]:[],team.lane,team.name,team.time,ranks.get(relayHeat(team))!.get(team.lane)??"",...team.members])]};
}
