import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

type QueryResult = { data: unknown; error: { message: string } | null; count?: number | null };
const state = vi.hoisted(() => ({ error: null as { message: string } | null, results: {} as Record<string, QueryResult> }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => {
  function queryFor(table: string) {
    let single = false;
    const query = new Proxy({}, { get: (_, key) => {
      if (key === "then") return (resolve: (value: unknown) => void) => resolve(state.results[table] ?? { data: state.error || single ? null : [], count: state.error ? null : 0, error: state.error });
      if (key === "maybeSingle") return () => { single = true; return query; };
      return () => query;
    } });
    return query;
  }
  return { from: queryFor, rpc: queryFor };
} }));
vi.mock("@/lib/supabase/auth", () => ({ fetchRolesByProfileIds: async () => new Map() }));
import { getNotesData, getNoteById, getThreads, getThreadById, getThreadPosts, getNoteArticles, getChildNotes, getNoteArticleById, getRecentSharedNotes, getNoteAncestors } from "./notes";
import { getCompetitions, getCompetitionEvents, getCompetitionById, getCompetitionProgramEntries, getGoalHub, getHomeCompetition, getCompetitionGoals } from "./competitions";
import { getMembersList, getAllRoles, getAllRoleCategories } from "./members";
import { getNotices, getHomeNotices, getPersonalNotifications, getUnreadNotificationCount } from "./notices";
import { getAllVenues } from "./venues";
import { getUserRecords, getPbRecords } from "./records";
import { createClient } from "@/lib/supabase/server";
import { fetchQuotedPosts } from "./internal";

const reads: [string, () => Promise<unknown>][] = [
  ["note list", getNotesData], ["note detail", () => getNoteById("note")],
  ["thread list", getThreads], ["thread detail", () => getThreadById("thread")],
  ["thread posts", () => getThreadPosts("thread")], ["note articles", () => getNoteArticles("note")],
  ["child notes", () => getChildNotes("note")], ["article detail", () => getNoteArticleById("note", "article")],
  ["home notes", () => getRecentSharedNotes(3)], ["note breadcrumb", () => getNoteAncestors({ parent_id: "parent" })],
  ["competitions", getCompetitions], ["event catalog", getCompetitionEvents],
  ["competition detail", () => getCompetitionById("competition")], ["program", () => getCompetitionProgramEntries("competition")],
  ["home competition", getHomeCompetition], ["competition goals", () => getCompetitionGoals("competition")],
  ["goal hub", () => getGoalHub("viewer")], ["members", getMembersList],
  ["roles", getAllRoles], ["role categories", getAllRoleCategories],
  ["notices", () => getNotices("viewer")], ["home notices", () => getHomeNotices("viewer")],
  ["notifications", () => getPersonalNotifications("viewer")], ["unread count", () => getUnreadNotificationCount("viewer")],
  ["venues", getAllVenues],
  ["practice records", () => getUserRecords("viewer")], ["personal bests", () => getPbRecords("viewer")],
  ["quoted record", async () => fetchQuotedPosts(await createClient(), [{ quoted_type: "record", quoted_id: "record" }])],
  ["quoted tweet", async () => fetchQuotedPosts(await createClient(), [{ quoted_type: "tweet", quoted_id: "tweet" }])],
];

describe("query failures are distinct from successful empty results", () => {
  beforeEach(() => { state.error = null; state.results = {}; });
  it.each(reads)("rejects failed %s rather than displaying empty, zero or missing", async (name, read) => {
    state.error = { message: "synthetic database unavailable" };
    if (name === "competition detail") await expect(read()).rejects.toThrow("大会を取得できませんでした");
    else await expect(read()).rejects.toMatchObject(state.error);
  });
  it("keeps successful empty lists and zero counts", async () => {
    expect(await getNotesData()).toEqual({ notes: [] });
    expect(await getCompetitions()).toEqual([]);
    expect(await getMembersList()).toEqual([]);
    expect(await getNotices("viewer")).toEqual([]);
    expect(await getUnreadNotificationCount("viewer")).toBe(0);
    expect(await getNoteById("missing-or-rls-hidden")).toBeNull();
    expect(await getCompetitionById("missing-or-rls-hidden")).toBeNull();
    expect(await getHomeCompetition()).toBeNull();
  });
  it("keeps the last successful note list in the existing React Query cache after a failed refresh", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const queryKey = ["notes", "viewer"];
    const previous = { notes: [{ id: "existing-note" }] };
    client.setQueryData(queryKey, previous);
    state.error = { message: "synthetic database unavailable" };
    await expect(client.fetchQuery({ queryKey, queryFn: getNotesData, staleTime: 0 })).rejects.toMatchObject(state.error);
    expect(client.getQueryData(queryKey)).toEqual(previous);
    expect(client.getQueryState(queryKey)?.status).toBe("error");
    client.clear();
  });
  it("does not show zero goals when only the home competition's count fails", async () => {
    state.results.competitions = { data: [{ id: "meet", is_countdown: true, starts_on: "2026-10-10", ends_on: null, archive_at: null }], error: null };
    state.results.competition_goals = { data: null, error: { message: "count unavailable" }, count: null };
    await expect(getHomeCompetition()).rejects.toMatchObject({ message: "count unavailable" });
  });
  it("does not show a false zero reaction count when notice loading succeeds but reactions fail", async () => {
    state.results.notices = { data: [{ id: "notice" }], error: null };
    state.results.notice_reactions = { data: null, error: { message: "reactions unavailable" } };
    await expect(getNotices("viewer")).rejects.toMatchObject({ message: "reactions unavailable" });
  });
  it.each(["notice_dismissals", "notice_reactions"])("does not redisplay acknowledged or dismissed notices when %s fails", async table => {
    state.results[table] = { data: null, error: { message: "personal notice state unavailable" } };
    await expect(getHomeNotices("viewer")).rejects.toMatchObject({ message: "personal notice state unavailable" });
  });
});
