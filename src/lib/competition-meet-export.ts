import {relayResultSheet} from "./competition-meet-relay";
import type { CompetitionMeet } from "./competition-meet";
import type { ObEntry } from "./ob-entries";
import type { ObEventOperation } from "./ob-operations";
import { appearancePerformance, competitionFamilyData, meetFamilyGroupLabel } from "./competition-meet";
import type { ObHeatLabels } from "./ob-results-sheet";

/** Legacy workbook adapter only. Each export row represents one independent appearance. */
export function competitionMeetObExport(meet: Pick<CompetitionMeet,"participants"|"appearances"|"events"|"meetKey">) {
  const people=new Map(meet.participants.map(p=>[p.id,p]));
  const entries:ObEntry[]=meet.appearances.map(a=>{
    const p=people.get(a.participant_id);
    return {id:a.id,meet_key:meet.meetKey,submitted_name:p?.name??"登録解除済み",grade:p?.grade??"不明",profile_id:null,revision:a.revision,imported_at:"",qualification_marks:{},events:a.state==="registered"&&!p?.deleted?[a.event_name]:[],absent:!!p?.absent||!!p?.deleted,canonical_appearance:true};
  });
  const operations:ObEventOperation[]=meet.events.filter(event=>!event.relay_results).map(event=>({meet_key:meet.meetKey,event_name:event.name,revision:event.revision,updated_at:"",data:{confirmed:event.confirmed,participants:meet.appearances.filter(a=>a.event_name===event.name).map(a=>appearancePerformance(people.get(a.participant_id),a))}}));
  // Public labels are separate from the raw positions used by the editable sheet.
  const heatLabels:ObHeatLabels={};
  for(const event of meet.events.filter(event=>event.discipline==="track"&&!event.relay_results)) {
    if(heatLabels[event.family])continue;
    const data=competitionFamilyData(meet,event),groups=new Set(data.participants.flatMap(p=>p.group===null?[]:[p.group]));
    heatLabels[event.family]=Object.fromEntries([...groups].map(group=>[group,meetFamilyGroupLabel(meet,event,group,data)]));
  }
  return {entries,operations,heatLabels,relaySheets:meet.events.filter(event=>event.relay_results).map(relayResultSheet)};
}
