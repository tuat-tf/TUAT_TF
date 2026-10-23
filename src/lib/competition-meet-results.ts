import {relayResultRow} from "./competition-meet-relay";
import {gradeShort} from "./constants";
import { appearancePerformance, competitionEventData, meetAppearancePositionLabel, meetEventFamilies, meetRule, type CompetitionMeet } from "./competition-meet";
import { MeetEvent } from "./meet-operations";
import { obResultRanks } from "./ob-result-ranking";
import type { ParsedProgramRow } from "./competition-program";

/** Results DTO: operational identities, qualification marks and party/duty data stay on the server. */
export function meetResultRows(meet: CompetitionMeet, date: string): ParsedProgramRow[] {
  const people = new Map(meet.participants.map(p => [p.id, p]));
  const rows:ParsedProgramRow[]=meet.events.map(event => {
    if(event.relay_results)return relayResultRow(event,date);
    const data = competitionEventData(meet, event), aggregate = new MeetEvent(meetRule(event), data);
    const ranks = obResultRanks(meetRule(event), data.participants);
    return {
      eventDate: date, block: event.discipline === "track" ? "track" : "field", sortOrder: event.sort_order,
      timeLabel: event.starts_at, roundKey: event.name, eventLabel: event.name, status: event.confirmed ? "確定" : "速報",
      tuatEntries: meet.appearances.filter(a => a.event_name === event.name && a.state !== "deleted" && !people.get(a.participant_id)?.deleted).map(a => {
        const person = people.get(a.participant_id), p = appearancePerformance(person, a);
        const best = aggregate.best(p), wind = aggregate.bestTrial(p)?.wind;
        // One mark per appearance; the record itself is the result, so attempts are not listed.
        const details: string[] = [];
        return {
          id: a.id, name: person?.name ?? "参加者確認中", grade: gradeShort(person?.grade ?? null) ?? "",
          heat: event.discipline === "track" ? p.group : null, lane: event.discipline === "track" ? p.order : null, bib: null,
          positionLabel: meetAppearancePositionLabel(meet,a),
          separateResult: true, details, resultDivision:event.division,
          ...(best !== "—" ? { result: { place: ranks.has(a.id) ? String(ranks.get(a.id)) : null, record: best, ...(wind && p.status === "entered" ? { wind } : {}) } } : {}),
        };
      }),
    };
  });
  return meetEventFamilies(meet).map(({label,events})=>{
    const children=events.map(e=>rows.find(row=>row.roundKey===e.name)!).filter(Boolean);
    const first=children[0];
    return {...first,roundKey:label,eventLabel:label,status:events.every(e=>e.confirmed)?"確定":events.some(e=>e.confirmed)?"一部確定":"速報",tuatEntries:children.flatMap(row=>row.tuatEntries)};
  });
}
