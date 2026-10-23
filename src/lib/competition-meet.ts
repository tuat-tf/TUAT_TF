import { withoutMeetPlacement, type MeetEventData, type MeetEventRule, type MeetPerformance } from "./meet-operations";
import { fieldOrderRows } from "./meet-field-order";

export type MeetParticipant = { id: string; competition_id: string; profile_id: string | null; name: string; grade: string; absent: boolean; deleted: boolean; revision: number };
export type MeetAppearance = { id: string; competition_id: string; participant_id: string; event_name: string; ordinal: number; operation_key: string; qualification_mark: string | null; state: "registered" | "cancelled" | "deleted"; performance: MeetPerformance; revision: number };
export type RelayTeamResult = {heat?:number;lane:number;name:string;time:string;members:[string,string,string,string]};
export type ManagedMeetEvent = { competition_id: string; name: string; family: string; division: "男子" | "女子" | "混合"; starts_at: string | null; sort_order: number; discipline: MeetEventRule["discipline"]; wind: boolean; capacity: number | null; confirmed: boolean; revision: number; relay_results?:RelayTeamResult[]|null };
export type MeetDuty = { id: string; participant_id: string; slot_time: string; event_name: string; assignment: string; role_ids: string[]; revision: number; source: string };
export type MeetDutyRole = { id: string; slot_time: string; event_name: string; name: string; required_count: number; revision: number; abbreviation?:string };
export type MeetParty = { id: string; participant_id: string | null; name: string; group_label: string; status: "参加" | "不参加" | "未回答"; needs_review: boolean; revision: number };
export type CompetitionMeet = { competitionId: string; name: string; meetKey: string; backend: "pc" | "cloud"; program?: {time:string;label:string;events:string[];note?:string}[]; partyInfo?: {time:string;venue:string;fee:number}|null; staffRoleId?:string|null; roleOptions?:{id:string;name:string}[]; participants: MeetParticipant[]; appearances: MeetAppearance[]; events: ManagedMeetEvent[]; duties: MeetDuty[]; roles: MeetDutyRole[]; party: MeetParty[]; permissions: { manage: boolean; groups: boolean; record: boolean; register?:boolean; configure: boolean; history?:boolean }; members: { id: string; display_name: string; grade: string | null }[] };
type ExistingMeetRow = { id: string; revision: number };
type NewMeetRow = { id?: never; revision?: never };
/** The request ledger receives this object unchanged, including the captured backend. */
export type MeetCommand = { backend?: CompetitionMeet["backend"] } & (
  | ({ action: "participant.save"; name: string; grade: string; profileId: string | null } & (ExistingMeetRow | NewMeetRow))
  | ({ action: "participant.attendance"; absent: boolean } & ExistingMeetRow)
  | ({ action: "participant.delete" | "participant.restore" } & ExistingMeetRow)
  | { action: "appearance.add"; participantId: string; event: string; mark?: string | null; confirmDuties?: boolean }
  | ({ action: "appearance.edit"; mark: string | null } & ExistingMeetRow)
  | ({ action: "appearance.moveDivision"; event: string; mark: string | null; confirmDuties?: boolean } & ExistingMeetRow)
  | ({ action: "appearance.cancel" | "appearance.delete" | "appearance.restore" } & ExistingMeetRow)
  | { action: "event.save"; event: string; revision: number; expectedConfirmed: boolean; changes: { id: string; revision: number; performance: MeetPerformance }[]; confirmed: boolean; confirmEvents?: { name: string; revision: number; confirmed: boolean }[] }
  | { action: "relay.save"; event: string; revision: number; relayResults: RelayTeamResult[]; confirmed: boolean }
  | { action: "event.configure"; config: Omit<ManagedMeetEvent, "competition_id" | "revision" | "confirmed" | "relay_results"> }
  | ({ action: "duty.save"; participantId: string; roleIds: string[]; assignment: string } & (ExistingMeetRow | (NewMeetRow & { event: string; time: string })))
  | ({ action: "role.save"; name: string; event: string; time: string; requiredCount: number } & (ExistingMeetRow | NewMeetRow))
  | ({ action: "role.delete" } & ExistingMeetRow)
  | ({ action: "party.save"; status: MeetParty["status"] } & ((ExistingMeetRow & { participantId?: string }) | (NewMeetRow & { participantId: string })))
  | { action: "meet.configure"; staffRoleId: string | null; expectedStaffRoleId: string | null }
);
export type MeetMutationResult = { ok: boolean; message?: string; uncertain?: boolean; notSaved?: boolean; stale?: boolean; requestId?: string; id?: string };

export function availableAppearance(person: MeetParticipant | undefined, appearance: MeetAppearance) {
  return !!person && !person.deleted && !person.absent && appearance.state === "registered";
}
export function appearancePerformance(person: MeetParticipant | undefined, appearance: MeetAppearance): MeetPerformance {
  const value = { ...appearance.performance, entryId: appearance.id };
  return availableAppearance(person, appearance) && value.status !== "DNS" ? value : withoutMeetPlacement({ ...value, status: "DNS" });
}
export function competitionEventData(meet: Pick<CompetitionMeet, "participants" | "appearances">, event: ManagedMeetEvent): MeetEventData {
  const people = new Map(meet.participants.map(person => [person.id, person]));
  return { confirmed: event.confirmed, participants: meet.appearances.filter(value => value.event_name === event.name).map(value => appearancePerformance(people.get(value.participant_id), value)) };
}
export function meetEventCounts(meet: Pick<CompetitionMeet, "participants" | "appearances">, event: ManagedMeetEvent) {
  const data = competitionEventData(meet, event);
  const active = data.participants.filter(value => value.status === "entered");
  const ids = new Set(active.map(value => meet.appearances.find(appearance => appearance.id === value.entryId)!.participant_id));
  return { people: ids.size, appearances: active.length, dns: data.participants.filter(value => value.status === "DNS").length, dnf: data.participants.filter(value => value.status === "DNF").length, dq: data.participants.filter(value => value.status === "DQ").length };
}
/** A discipline has one entrance; division remains attached to each appearance and result. */
export function meetEventFamilies(meet: Pick<CompetitionMeet,"events">) {
  const families = new Map<string, {label:string;event:ManagedMeetEvent;events:ManagedMeetEvent[]}>();
  for (const event of meet.events) {
    const key = event.relay_results ? `relay:${event.family}` : event.family;
    const family = families.get(key);
    if (family) family.events.push(event);
    else families.set(key,{label:event.family,event,events:[event]});
  }
  return [...families.values()];
}
export function meetFamilyCounts(meet: Pick<CompetitionMeet,"participants"|"appearances">, events:ManagedMeetEvent[]) {
  const names=new Set(events.map(e=>e.name));
  const people=new Map(meet.participants.map(p=>[p.id,p]));
  const appearances=meet.appearances.filter(a=>names.has(a.event_name)&&a.state!=="deleted"&&!people.get(a.participant_id)?.deleted);
  const status=(a:MeetAppearance)=>appearancePerformance(people.get(a.participant_id),a).status;
  const active=appearances.filter(a=>status(a)==="entered");
  return {people:new Set(active.map(a=>a.participant_id)).size,appearances:active.length,dns:appearances.filter(a=>status(a)==="DNS").length,dnf:appearances.filter(a=>status(a)==="DNF").length,dq:appearances.filter(a=>status(a)==="DQ").length};
}
export function meetRule(event: ManagedMeetEvent): MeetEventRule { return { name: event.name, discipline: event.discipline, wind: event.wind }; }
export function meetDutyText(duty: MeetDuty, roles: MeetDutyRole[]) { return duty.role_ids.length ? duty.role_ids.map(id => roles.find(role => role.id === id)?.name ?? "担当確認中").join("・") : duty.assignment; }

/** Board-only group namespaces; stored group numbers and heat scopes remain explicit. */
export function meetBoardGroup(group: number, scope: string) { return group + (scope === "混合" ? 198 : scope === "女子" ? 99 : 0); }
export function meetBoardPlacement(group: number) { return { group: (group - 1) % 99 + 1, heatScope: (group > 198 ? "混合" : group > 99 ? "女子" : "男子") as ManagedMeetEvent["division"] }; }
export function meetBoardGroupLabel(group: number) { const value=meetBoardPlacement(group);return `${value.heatScope}${value.group}組`; }
/** Stored scope identifies an existing heat; its visible division follows its current entrants. */
export function meetFamilyGroupLabel(meet:Pick<CompetitionMeet,"participants"|"appearances"|"events">,event:ManagedMeetEvent,group:number,data=competitionFamilyData(meet,event),shownGroups:readonly number[]=[]) {
  const ids=new Set(data.participants.filter(p=>p.group===group&&p.status!=="DNS").map(p=>p.entryId));
  const divisions=new Set(meet.appearances.filter(a=>ids.has(a.id)&&a.state!=="deleted").map(a=>meet.events.find(e=>e.name===a.event_name)?.division).filter(Boolean));
  const scope=divisions.size>1?"混合":divisions.values().next().value??"";
  const groups=new Set([...shownGroups,...data.participants.flatMap(p=>p.group!==null&&p.status!=="DNS"?[p.group]:[])]);
  const number=[...groups].filter(value=>value<group).length+1;
  return `${scope}${number}組`;
}
export function competitionFamilyData(meet: Pick<CompetitionMeet,"participants"|"appearances"|"events">, event: ManagedMeetEvent): MeetEventData {
  const events=meet.events.filter(e=>e.family===event.family), people=new Map(meet.participants.map(p=>[p.id,p]));
  return {confirmed:events.some(e=>e.confirmed),participants:meet.appearances.filter(a=>events.some(e=>e.name===a.event_name)).map(a=>{
    const value=appearancePerformance(people.get(a.participant_id),a),definition=events.find(e=>e.name===a.event_name)!;
    return value.group===null?value:{...value,group:meetBoardGroup(value.group,value.heatScope??definition.division)};
  })};
}
export function storedMeetPerformance(value: MeetPerformance): MeetPerformance { return value.group===null?value:{...value,...meetBoardPlacement(value.group)}; }

/** Identify an independent appearance by its actual placement, never its internal ordinal. */
export function meetAppearancePositionLabel(meet: Pick<CompetitionMeet,"participants"|"appearances"|"events">, appearance: MeetAppearance) {
  const event=meet.events.find(e=>e.name===appearance.event_name);
  if(!event)return "種目確認中";
  const person=meet.participants.find(p=>p.id===appearance.participant_id),performance=appearancePerformance(person,appearance);
  if(event.discipline==="track")return performance.group===null?"組未定":`${meetFamilyGroupLabel(meet,event,meetBoardGroup(performance.group,performance.heatScope??event.division))} ${performance.order??"未定"}${event.capacity?"レーン":"番"}`;
  const number=fieldOrderRows(competitionFamilyData(meet,event)).find(row=>row.person.entryId===appearance.id)?.number;
  return number==null?"試技順未定":`試技順 ${number}番`;
}
export function meetDutyConflict(meet:Pick<CompetitionMeet,"participants"|"appearances"|"events">, participantId:string,time:string) {
  const person=meet.participants.find(p=>p.id===participantId);
  return meet.appearances.some(a=>a.participant_id===participantId&&meet.events.find(e=>e.name===a.event_name)?.starts_at===time&&((availableAppearance(person,a)&&a.performance.status!=="DNS")||a.performance.status==="DNF"||a.performance.status==="DQ"||a.performance.trials.some(t=>t.status!=="pending"||!!t.mark||!!t.wind)));
}

export function meetDutyEvents(meet:Pick<CompetitionMeet,"events"|"roles"|"program">) { return [...new Set([...meet.events.map(e=>e.family),...meet.roles.map(r=>r.event_name),...(meet.program??[]).filter(s=>s.note).map(s=>s.label)])]; }
