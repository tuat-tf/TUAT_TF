import type { CompetitionMeet, RelayTeamResult } from "./competition-meet";
import { validateRelayResults } from "./competition-meet-relay";

type Row = Record<string, unknown>;
const row = (value: unknown): value is Row => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string";
const nullableText = (value: unknown) => value === null || text(value);
const integer = (value: unknown, minimum = 0): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= minimum;
const rows = (value: unknown, valid: (item: Row) => boolean): value is Row[] =>
  Array.isArray(value) && value.every(item => row(item) && valid(item));
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(text);
const division = (value: unknown) => value === "男子" || value === "女子" || value === "混合";
const oneOf = (value: unknown, choices: string[]) => text(value) && choices.includes(value);
const versioned = (value: Row) => text(value.id) && integer(value.revision);
const optional = (value: unknown, valid: (value: unknown) => boolean) => value === undefined || valid(value);

function performance(value: unknown, appearanceId: unknown): boolean {
  return row(value) && value.entryId === appearanceId
    && (value.group === null || integer(value.group, 1))
    && (value.order === null || integer(value.order, 1))
    && optional(value.heatScope, division)
    && oneOf(value.status, ["entered", "DNS", "DNF", "DQ"])
    && rows(value.trials, trial => text(trial.mark) && text(trial.wind)
      && oneOf(trial.status, ["pending", "valid", "foul", "pass"]));
}

/**
 * Validate the read contract before clients dereference nested JSON.
 * DB constraints and checked mutation RPCs retain responsibility for permissions,
 * sporting rules and concurrency; this never rewrites or repairs stored data.
 */
export function isCompetitionMeetSnapshot(value: unknown, competitionId: string): value is CompetitionMeet {
  if (!row(value) || value.competitionId !== competitionId || !text(value.name) || !text(value.meetKey)
    || !oneOf(value.backend, ["pc", "cloud"])) return false;
  const sameMeet = (item: Row) => item.competition_id === competitionId;
  if (!rows(value.participants, person => versioned(person) && sameMeet(person)
    && nullableText(person.profile_id) && text(person.name) && text(person.grade)
    && typeof person.absent === "boolean" && typeof person.deleted === "boolean")) return false;
  if (!rows(value.events, event => sameMeet(event) && text(event.name) && text(event.family)
    && division(event.division) && nullableText(event.starts_at) && Number.isSafeInteger(event.sort_order)
    && oneOf(event.discipline, ["track", "distance", "height"])
    && typeof event.wind === "boolean" && (event.capacity === null || integer(event.capacity, 1) && event.capacity <= 99)
    && typeof event.confirmed === "boolean" && integer(event.revision))) return false;
  const participantIds = new Set(value.participants.map(person => person.id));
  const eventNames = new Set(value.events.map(event => event.name));
  if (participantIds.size !== value.participants.length || eventNames.size !== value.events.length) return false;
  if (!rows(value.appearances, appearance => versioned(appearance) && sameMeet(appearance)
    && participantIds.has(appearance.participant_id) && eventNames.has(appearance.event_name)
    && integer(appearance.ordinal, 1) && text(appearance.operation_key) && nullableText(appearance.qualification_mark)
    && oneOf(appearance.state, ["registered", "cancelled", "deleted"])
    && performance(appearance.performance, appearance.id))) return false;
  if (!rows(value.duties, duty => versioned(duty) && participantIds.has(duty.participant_id)
    && text(duty.slot_time) && text(duty.event_name) && text(duty.assignment) && strings(duty.role_ids) && text(duty.source))) return false;
  if (!rows(value.roles, role => versioned(role) && text(role.slot_time) && text(role.event_name)
    && text(role.name) && integer(role.required_count) && optional(role.abbreviation, text))) return false;
  if (!rows(value.party, party => versioned(party) && (party.participant_id === null || participantIds.has(party.participant_id))
    && text(party.name) && text(party.group_label) && oneOf(party.status, ["参加", "不参加", "未回答"])
    && typeof party.needs_review === "boolean")) return false;
  const permissions = value.permissions;
  if (!row(permissions) || ["manage", "groups", "record", "configure"].some(key => typeof permissions[key] !== "boolean")
    || !optional(permissions.register, item => typeof item === "boolean")
    || !optional(permissions.history, item => typeof item === "boolean")) return false;
  if (!rows(value.members, member => text(member.id) && text(member.display_name) && nullableText(member.grade))
    || !optional(value.staffRoleId, nullableText)
    || !optional(value.roleOptions, options => rows(options, role => text(role.id) && text(role.name)))
    || !optional(value.program, program => rows(program, slot => text(slot.time) && text(slot.label) && strings(slot.events) && optional(slot.note, text)))
    || !optional(value.partyInfo, party => party === null || row(party) && text(party.time) && text(party.venue) && typeof party.fee === "number" && Number.isFinite(party.fee))) return false;
  // The existing relay validator checks unknown nested values before using them.
  return value.events.every(event => event.relay_results == null
    || validateRelayResults(event.relay_results as RelayTeamResult[], event.confirmed === true) === null);
}
