import { beforeEach, expect, it, vi } from "vitest";
import type { CompetitionMeet } from "@/lib/competition-meet";
import { emptyPerformance } from "@/lib/meet-operations";
import { emptyRelayResults } from "@/lib/competition-meet-relay";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc }) }));
import { getCompetitionMeet } from "./competition-meet";

function snapshot(): CompetitionMeet {
  return {
    competitionId: "meet", name: "大会", meetKey: "key", backend: "pc",
    participants: [{ id: "person", competition_id: "meet", profile_id: null, name: "参加者", grade: "B1", absent: false, deleted: false, revision: 0 }],
    events: [{ competition_id: "meet", name: "男子100m", family: "100m", division: "男子", starts_at: null, sort_order: 0, discipline: "track", wind: true, capacity: 8, confirmed: false, revision: 2 }],
    appearances: [{ id: "appearance", competition_id: "meet", participant_id: "person", event_name: "男子100m", ordinal: 1, operation_key: "appearance", qualification_mark: null, state: "registered", performance: emptyPerformance("appearance"), revision: 3 }],
    duties: [], roles: [], party: [], members: [],
    permissions: { manage: false, groups: false, record: true, configure: false },
  };
}
beforeEach(() => rpc.mockReset());
it("returns the same verified snapshot without changing revisions or saved records", async () => {
  const value = snapshot();
  value.events[0].relay_results = emptyRelayResults();
  rpc.mockResolvedValue({ data: value, error: null });
  expect(await getCompetitionMeet("meet")).toBe(value);
});
it.each([
  (value: CompetitionMeet) => { value.participants[0].revision = -1; },
  (value: CompetitionMeet) => { value.events[0].competition_id = "other"; },
  (value: CompetitionMeet) => { value.appearances[0].participant_id = "missing"; },
  (value: CompetitionMeet) => { value.appearances[0].performance.entryId = "other"; },
  (value: CompetitionMeet) => { value.events[0].relay_results = []; },
  (value: CompetitionMeet) => { Object.assign(value, { permissions: { manage: "false" } }); },
  (value: CompetitionMeet) => { Object.assign(value.appearances[0].performance, { trials: [null] }); },
])("rejects malformed nested data instead of treating it as an empty/legacy meet", async change => {
  const value = snapshot(); change(value);
  rpc.mockResolvedValue({ data: value, error: null });
  await expect(getCompetitionMeet("meet")).rejects.toThrow("照合");
});
it("reserves null for a genuinely unavailable generic meet and propagates retrieval failure", async () => {
  rpc.mockResolvedValueOnce({ data: null, error: null });
  expect(await getCompetitionMeet("meet")).toBeNull();
  rpc.mockResolvedValueOnce({ data: null, error: { message: "unavailable" } });
  await expect(getCompetitionMeet("meet")).rejects.toThrow("取得");
});
