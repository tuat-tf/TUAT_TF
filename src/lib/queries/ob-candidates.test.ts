import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ tables: [] as string[], entries: [] as Record<string, unknown>[], members: [] as Record<string, unknown>[], history: [] as Record<string, unknown>[], error: null as { message: string } | null }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from(table: string) {
  state.tables.push(table);
  let historical = false;
  const query = new Proxy({}, { get: (_, key) => {
    if (key === "neq") return () => { historical = true; return query; };
    if (key === "then") return (resolve: (value: unknown) => void) => resolve({ data: historical ? state.history : table === "profiles" ? state.members : state.entries.filter(entry => !entry.profile_id), error: state.error });
    return () => query;
  } });
  return query;
} }) }));
import { getMyObEntryCandidates } from "./ob-entries";

beforeEach(() => {
  state.tables = []; state.error = null;
  state.members = [{ id: "me", display_name: "農工 太郎", grade: "B1" }];
  state.history = [{ submitted_name: "以前の名前", profile_id: "me" }];
  state.entries = [
    { id: "exact", revision: 2, submitted_name: "農工太郎", grade: "B1", profile_id: null, events: ["100m"] },
    { id: "previous", revision: 3, submitted_name: "以前の名前", grade: "B1", profile_id: null, events: ["200m"] },
    { id: "alumni", revision: 0, submitted_name: "農工太郎", grade: "OB・OG", profile_id: null, events: [] },
    { id: "already-linked", revision: 0, submitted_name: "農工太郎", grade: "B1", profile_id: "other", events: [] },
  ];
});
it("uses only identity inputs and keeps exact and historical candidates without automatic confirmation", async () => {
  expect(await getMyObEntryCandidates("me")).toEqual([
    { id: "exact", revision: 2, submitted_name: "農工太郎", grade: "B1", events: ["100m"], sure: true },
    { id: "previous", revision: 3, submitted_name: "以前の名前", grade: "B1", events: ["200m"], sure: true },
  ]);
  expect(state.tables).toEqual(["ob_meet_entries", "profiles", "ob_meet_entries"]);
});
it("reports failed identity input rather than no candidates", async () => {
  state.error = { message: "identity unavailable" };
  await expect(getMyObEntryCandidates("me")).rejects.toThrow("候補を取得できませんでした");
});
