import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppRole } from "@/types";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), getCurrentProfile: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabase/auth", () => ({ getCurrentProfile: mocks.getCurrentProfile }));
import { getAdminDashboard } from "./admin-dashboard";

type Row = Record<string, string | boolean | number | null>;
type Result = { count: number | null; error: { message: string } | null };
type Filter = { operator: "eq" | "gte" | "lte" | "or"; column: string; value: string | boolean };
type Call = { table: string; selection?: string; options?: unknown; filters: Filter[] };
const tables = ["profiles", "practice_records", "tweets", "practice_schedules", "competitions", "notices"];
const checkedAt = "2026-10-12T15:00:00.000Z";

function role(manageSystem: boolean, suppressed = false): AppRole {
  return {
    id: "test-role", name: "合成ロール", can_manage_system: manageSystem,
    can_manage_members: false, can_create_schedule: false, can_create_menu: false,
    can_moderate_comments: false, can_manage_ob_meet: false, editable_menu_blocks: [],
    can_create_notice: false, can_decide_practice: false, is_system: false,
    is_everyone: false, color: "blue", category: null, sort_order: 0,
    created_at: checkedAt, permissions_suppressed: suppressed,
  };
}

function compare(value: Row[string], expected: string, column: string, operator: string) {
  if (value === null || value === undefined) return false;
  const actual = column.endsWith("_at") ? Date.parse(String(value)) : String(value);
  const target = column.endsWith("_at") ? Date.parse(expected) : expected;
  if (operator === "gte") return actual >= target;
  if (operator === "lte") return actual <= target;
  return actual > target;
}

function matches(row: Row, filter: Filter) {
  if (filter.operator === "eq") return row[filter.column] === filter.value;
  if (filter.operator !== "or") return compare(row[filter.column], String(filter.value), filter.column, filter.operator);
  return String(filter.value).split(",").some((predicate) => {
    const [column, operator, ...parts] = predicate.split(".");
    const value = parts.join(".");
    return operator === "is" ? row[column] === null : compare(row[column], value, column, operator);
  });
}

function setup(
  rows: Record<string, Row[]> = {},
  results: Record<string, Result | Error | Promise<Result>> = {},
) {
  const calls: Call[] = [];
  const started: string[] = [];
  const from = vi.fn((table: string) => {
    const call: Call = { table, filters: [] };
    calls.push(call);
    const query = {
      select(selection: string, options: unknown) { call.selection = selection; call.options = options; return query; },
      eq(column: string, value: string | boolean) { call.filters.push({ operator: "eq", column, value }); return query; },
      gte(column: string, value: string) { call.filters.push({ operator: "gte", column, value }); return query; },
      lte(column: string, value: string) { call.filters.push({ operator: "lte", column, value }); return query; },
      or(value: string) { call.filters.push({ operator: "or", column: "", value }); return query; },
      then(resolve: (value: Result) => unknown, reject: (reason: unknown) => unknown) {
        started.push(table);
        const result = results[table] ?? {
          count: (rows[table] ?? []).filter((row) => call.filters.every((filter) => matches(row, filter))).length,
          error: null,
        };
        return (result instanceof Error ? Promise.reject(result) : Promise.resolve(result)).then(resolve, reject);
      },
    };
    return query;
  });
  mocks.createClient.mockResolvedValue({ from });
  return { calls, from, started };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(checkedAt));
  mocks.createClient.mockReset();
  mocks.getCurrentProfile.mockReset();
  mocks.getCurrentProfile.mockResolvedValue({ role: "member", roles: [role(true)] });
});
afterEach(() => { vi.useRealTimers(); });

describe("admin dashboard authorization", () => {
  it.each([
    { name: "a member", roles: [role(false)] },
    { name: "a legacy admin without a system permission", roles: [] },
    { name: "an admin in member preview", roles: [role(true, true)] },
  ])("does not query counts for $name", async ({ roles }) => {
    const state = setup();
    mocks.getCurrentProfile.mockResolvedValue({ role: "admin", roles });
    await expect(getAdminDashboard()).rejects.toThrow("権限がありません");
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(state.from).not.toHaveBeenCalled();
  });

  it("propagates an authentication/profile failure before starting count queries", async () => {
    const state = setup();
    const failure = new Error("profile unavailable");
    mocks.getCurrentProfile.mockRejectedValue(failure);
    await expect(getAdminDashboard()).rejects.toBe(failure);
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(state.from).not.toHaveBeenCalled();
  });

  it("accepts system permission on any assigned role and preserves counts beyond 1000", async () => {
    const state = setup({}, {
      profiles: { count: 1501, error: null }, practice_records: { count: 2007, error: null },
    });
    mocks.getCurrentProfile.mockResolvedValue({ roles: [role(false), role(true)] });
    const result = await getAdminDashboard();
    expect(result.metrics.activeMembers).toBe(1501);
    expect(result.metrics.recentRecords).toBe(2007);
    expect(result.unavailable).toEqual([]);
    expect(state.calls.map((call) => call.table)).toEqual(tables);
    for (const call of state.calls) {
      expect(call.selection).toBe("id");
      expect(call.options).toEqual({ head: true, count: "exact" });
    }
  });
});

it("uses seven JST calendar days, includes imported additions, and keeps ongoing multi-day events", async () => {
  const start = "2026-10-06T15:00:00.000Z";
  const state = setup({
    profiles: [{ status: "active", approved: true }, { status: "active", approved: false }, { status: "graduated", approved: true }],
    practice_records: [
      { created_at: "2026-10-06T14:59:59.999Z" },
      { created_at: start },
      { created_at: checkedAt, from_sheet: true, recorded_date: "2025-01-01" },
      { created_at: "2026-10-12T15:00:00.001Z" },
    ],
    tweets: [
      { created_at: start, expires_at: null },
      { created_at: checkedAt, expires_at: "2026-10-12T15:00:00.001Z" },
      { created_at: start, expires_at: checkedAt },
      { created_at: start, expires_at: "2026-10-12T14:59:59.999Z" },
      { created_at: "2026-10-06T14:59:59.999Z", expires_at: null },
    ],
    practice_schedules: [
      { schedule_date: "2026-10-11", end_date: "2026-10-13" },
      { schedule_date: "2026-10-14", end_date: null },
      { schedule_date: "2026-10-11", end_date: "2026-10-12" },
      { schedule_date: "2026-10-12", end_date: null },
    ],
    competitions: [
      { starts_on: "2026-10-11", ends_on: "2026-10-13" },
      { starts_on: "2026-10-13", ends_on: null },
      { starts_on: "2026-10-11", ends_on: "2026-10-12" },
    ],
    notices: [{ created_at: start }, { created_at: checkedAt }, { created_at: "2026-10-06T14:59:59.999Z" }],
  });
  expect(await getAdminDashboard()).toEqual({
    checkedAt, today: "2026-10-13", since: "2026-10-07",
    metrics: { activeMembers: 1, recentRecords: 2, recentTweets: 2, upcomingSchedules: 2, upcomingCompetitions: 2, recentNotices: 2 },
    unavailable: [],
  });
  expect(state.calls.find((call) => call.table === "practice_records")?.filters.map((filter) => filter.column)).toEqual(["created_at", "created_at"]);
});

it("distinguishes a valid zero from individual transport, backend, and missing-count failures", async () => {
  setup({}, {
    profiles: { count: 12, error: { message: "backend unavailable" } },
    practice_records: { count: null, error: null },
    tweets: new Error("transport unavailable"),
    competitions: { count: 2, error: null },
  });
  const result = await getAdminDashboard();
  expect(result.metrics).toEqual({
    activeMembers: null, recentRecords: null, recentTweets: null,
    upcomingSchedules: 0, upcomingCompetitions: 2, recentNotices: 0,
  });
  expect(result.unavailable).toEqual(["activeMembers", "recentRecords", "recentTweets"]);
});

it("starts all six independent counts while the first request is still pending", async () => {
  let release!: (result: Result) => void;
  const pending = new Promise<Result>((resolve) => { release = resolve; });
  const state = setup({}, Object.fromEntries(tables.map((table) => [table, pending])));
  const dashboard = getAdminDashboard();
  await vi.waitFor(() => { expect(state.started).toEqual(tables); });
  release({ count: 0, error: null });
  expect((await dashboard).unavailable).toEqual([]);
});
