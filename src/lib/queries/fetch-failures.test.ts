import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabase/auth", () => ({ fetchRolesByProfileIds: vi.fn() }));
import * as notes from "./notes";
import * as notices from "./notices";
import * as competitions from "./competitions";
import * as members from "./members";
import { getPbRecords } from "./records";
import { getAllVenues } from "./venues";
import { fetchQuotedPosts, withNoticeReactions } from "./internal";
import type { Notice } from "@/types";

type Response = { data: unknown; error: { message: string } | null; count?: number | null };
const unavailable = { message: "unavailable" };
let results: Record<string, Response>;
let calls: string[];

function query(table: string) {
  let single = false;
  let range: [number, number] | null = null;
  const builder = {
    select: vi.fn(() => builder), order: vi.fn(() => builder),
    eq: vi.fn(() => builder), is: vi.fn(() => builder), or: vi.fn(() => builder),
    in: vi.fn(() => builder), not: vi.fn(() => builder),
    range: vi.fn((from: number, to: number) => { range = [from, to]; return builder; }),
    limit: vi.fn(() => builder),
    maybeSingle: vi.fn(() => { single = true; return builder; }),
    then: (resolve: (value: Response) => unknown, reject?: (reason: unknown) => unknown) => {
      const response = results[table] ?? { data: single ? null : [], error: null, count: 0 };
      const data = Array.isArray(response.data) && !single
        ? response.data.slice(range?.[0] ?? 0, range ? range[1] + 1 : 1000)
        : response.data;
      return Promise.resolve({ ...response, data }).then(resolve, reject);
    },
  };
  return builder;
}

const client = {
  from: vi.fn((table: string) => { calls.push(table); return query(table); }),
  rpc: vi.fn((name: string) => { calls.push(name); return query(name); }),
};
const typedClient = client as unknown as Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>;

beforeEach(() => {
  results = {};
  calls = [];
  mocks.createClient.mockResolvedValue(client);
});

const lists = [
  ["notes", () => notes.getNotesData(), { notes: [] }],
  ["notes", () => notes.getChildNotes("folder"), []],
  ["notes", () => notes.getRecentSharedNotes(), []],
  ["notes", () => notes.getPublishedPersonalNotes("me"), []],
  ["threads", () => notes.getThreads(), []],
  ["threads", () => notes.getThreadsByFolder("folder"), []],
  ["thread_posts", () => notes.getThreadPosts("thread"), []],
  ["note_articles", () => notes.getNoteArticles("folder"), []],
  ["notices", () => notices.getNotices("me"), []],
  ["notifications", () => notices.getPersonalNotifications("me"), []],
  ["venues", () => getAllVenues(), []],
  ["profiles", () => members.getMembersList(), []],
  ["roles", () => members.getAllRoles(), []],
  ["role_categories", () => members.getAllRoleCategories(), []],
  ["pb_records", () => getPbRecords("me"), []],
  ["competitions", () => competitions.getCompetitions(), []],
  ["competition_events", () => competitions.getCompetitionEvents(), []],
  ["competition_program_entries", () => competitions.getCompetitionProgramEntries("meet"), []],
] as const;

describe("list fetch failures and legitimate empty data", () => {
  it.each(lists)("%s propagates failures and can recover", async (table, read, empty) => {
    results[table] = { data: null, error: unavailable };
    await expect(read()).rejects.toEqual(unavailable);
    results[table] = { data: [], error: null };
    expect(await read()).toEqual(empty);
  });
});

const details = [
  ["notes", () => notes.getNoteById("missing")],
  ["threads", () => notes.getThreadById("missing")],
  ["note_articles", () => notes.getNoteArticleById("folder", "missing")],
  ["competitions", () => competitions.getCompetitionById("missing")],
] as const;

it.each(details)("%s keeps inaccessible/missing details distinct from a failure", async (table, read) => {
  results[table] = { data: null, error: unavailable };
  if (table === "competitions") await expect(read()).rejects.toThrow("大会を取得できませんでした");
  else await expect(read()).rejects.toEqual(unavailable);
  results[table] = { data: null, error: null };
  expect(await read()).toBeNull();
});

it("does not truncate a breadcrumb chain on a failed parent lookup", async () => {
  results.notes = { data: null, error: unavailable };
  await expect(notes.getNoteAncestors({ parent_id: "parent" })).rejects.toEqual(unavailable);
  results.notes = { data: null, error: null };
  expect(await notes.getNoteAncestors({ parent_id: "parent" })).toEqual([]);
});


it("does not turn an unread-count failure into zero", async () => {
  results.notifications = { data: null, count: null, error: unavailable };
  await expect(notices.getUnreadNotificationCount("me")).rejects.toEqual(unavailable);
  results.notifications = { data: null, count: 0, error: null };
  expect(await notices.getUnreadNotificationCount("me")).toBe(0);
});

it.each(["notices", "notice_dismissals", "notice_reactions"])("home notices reject a failed %s branch", async (table) => {
  results[table] = { data: null, error: unavailable };
  await expect(notices.getHomeNotices("me")).rejects.toEqual(unavailable);
  expect(calls).toEqual(expect.arrayContaining(["notices", "notice_dismissals", "notice_reactions"]));
  results[table] = { data: [], error: null };
  expect(await notices.getHomeNotices("me")).toEqual([]);
});

it("does not show zero reactions when reaction loading fails", async () => {
  const notice = { id: "notice" } as Notice;
  results.notice_reactions = { data: null, error: unavailable };
  await expect(withNoticeReactions(typedClient, [notice], "me")).rejects.toEqual(unavailable);
  results.notice_reactions = { data: [], error: null };
  expect(await withNoticeReactions(typedClient, [notice], "me")).toEqual([
    { ...notice, reaction_counts: { ack: 0, thanks: 0, question: 0 }, my_reactions: [] },
  ]);
});

it.each(["record", "tweet"] as const)("a failed quoted %s lookup is not a deleted quote", async (kind) => {
  const table = kind === "record" ? "practice_records" : "tweets";
  const quoted = [{ quoted_type: kind, quoted_id: "source" }];
  results[table] = { data: null, error: unavailable };
  await expect(fetchQuotedPosts(typedClient, quoted)).rejects.toEqual(unavailable);
  results[table] = { data: [], error: null };
  expect(await fetchQuotedPosts(typedClient, quoted)).toEqual(new Map());
});

it("rejects a failed poll lookup instead of dropping existing article polls", async () => {
  results.note_articles = { data: [{ id: "article", author: { id: "me", display_name: "Member", blocks: [] } }], error: null };
  results.get_note_poll_options = { data: null, error: unavailable };
  await expect(notes.getNoteArticles("folder")).rejects.toEqual(unavailable);
  results.get_note_poll_options = { data: [{ article_id: "article", options: [{ id: "option", votes: 2 }] }], error: null };
  const [article] = await notes.getNoteArticles("folder");
  expect(article.pollOptions).toEqual([{ id: "option", votes: 2 }]);
});

it("home competition failure is not an unconfigured countdown or zero goals", async () => {
  results.competitions = { data: null, error: unavailable };
  await expect(competitions.getHomeCompetition()).rejects.toEqual(unavailable);
  results.competitions = { data: [], error: null };
  expect(await competitions.getHomeCompetition()).toBeNull();
  results.competitions = { data: [{ id: "meet", is_countdown: true, starts_on: "2099-10-13", ends_on: null }], error: null };
  results.competition_goals = { data: null, count: null, error: unavailable };
  await expect(competitions.getHomeCompetition()).rejects.toEqual(unavailable);
  results.competition_goals = { data: null, count: 0, error: null };
  expect((await competitions.getHomeCompetition())?.goalCount).toBe(0);
});

it("competition goals do not report empty goals or missing PBs after a failed lookup", async () => {
  results.competition_goals = { data: null, error: unavailable };
  await expect(competitions.getCompetitionGoals("meet")).rejects.toEqual(unavailable);
  results.competition_goals = { data: [{ id: "goal", user_id: "me" }], error: null };
  results.pb_records = { data: null, error: unavailable };
  await expect(competitions.getCompetitionGoals("meet")).rejects.toEqual(unavailable);
  results.pb_records = { data: [], error: null };
  expect((await competitions.getCompetitionGoals("meet")).goals).toHaveLength(1);
});

it("unregistered-event and goal-hub failures do not produce empty aggregates", async () => {
  results.pb_records = { data: null, error: unavailable };
  await expect(competitions.getUnregisteredEventNames()).rejects.toEqual(unavailable);
  results.competition_goals = { data: null, error: unavailable };
  await expect(competitions.getGoalHub("me")).rejects.toEqual(unavailable);
});

it("counts unregistered event records beyond the first PostgREST page", async () => {
  results.pb_records = { data: Array.from({ length: 1002 }, () => ({ event_name: "未登録種目" })), error: null };
  expect(await competitions.getUnregisteredEventNames()).toEqual([{ name: "未登録種目", count: 1002 }]);
});
