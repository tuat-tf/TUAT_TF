import { expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getObPublishedResults } from "./ob-results-publish";
import { fixtureMeet } from "@/lib/__fixtures__/competition-meet";
import { OB_MEET } from "@/lib/ob-meet";

function setup(data: unknown, error: unknown = null) {
  const rpc = vi.fn().mockResolvedValue({ data, error });
  const from = vi.fn(() => { throw new Error("Legacy tables must not be queried"); });
  return { client: { rpc, from } as unknown as SupabaseClient<Database>, rpc, from };
}
it("publishes every canonical appearance using only the public export RPC", async () => {
  const meet = fixtureMeet();
  meet.appearances = Array.from({ length: 1001 }, (_, index) => ({ ...meet.appearances[0], id: `appearance-${index}`, ordinal: index + 1 }));
  const state = setup(meet);
  const exported = await getObPublishedResults(state.client);
  expect(exported.entries).toHaveLength(1001);
  expect(exported.entries.every(entry => entry.profile_id === null && Object.keys(entry.qualification_marks).length === 0)).toBe(true);
  expect(state.rpc).toHaveBeenCalledExactlyOnceWith("get_competition_meet_export", { p_competition_id: OB_MEET.competitionId });
  expect(state.from).not.toHaveBeenCalled();
});
it("does not publish frozen results when the canonical meet is absent or unactivated", async () => {
  const state = setup(null);
  await expect(getObPublishedResults(state.client)).rejects.toThrow("移行状態");
  expect(state.from).not.toHaveBeenCalled();
});
it("propagates RPC failure without an older-source fallback", async () => {
  const state = setup(null, { message: "offline" });
  await expect(getObPublishedResults(state.client)).rejects.toThrow("取得できませんでした");
  expect(state.from).not.toHaveBeenCalled();
});
it.each([false, [], {}, { participants: [], appearances: [], events: null }])("rejects malformed exports instead of publishing empty results: %j", async snapshot => {
  const state = setup(snapshot);
  await expect(getObPublishedResults(state.client)).rejects.toThrow("照合できませんでした");
  expect(state.from).not.toHaveBeenCalled();
});
