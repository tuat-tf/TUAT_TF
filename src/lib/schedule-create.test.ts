import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Database } from "@/types/database";
import { saveNewSchedule, type PendingScheduleCreate, type ScheduleCreateRow } from "./schedule-create";

const OWNER = "00000000-0000-4000-8000-000000000001";
const SCHEDULE_ID = "00000000-0000-4000-8000-000000000002";
const OTHER_OWNER = "00000000-0000-4000-8000-000000000003";

function scheduleRow(): ScheduleCreateRow {
  return {
    id: SCHEDULE_ID, created_by: OWNER, schedule_date: "2026-10-20", schedule_type: "meet",
    meeting_time: "08:00", venue_name: "合成競技場", venue_access: "駅から徒歩10分",
    venue_fee: "100円", venue_url: "https://example.invalid/venue", title: "合成記録会",
    end_date: "2026-10-21", entry_start: "2026-10-16", entry_end: "2026-10-18",
    note: "集合場所を確認", target_blocks: ["middle_long", "short"],
  };
}

function fakeDatabase() {
  const rows = new Map<string, ScheduleCreateRow>();
  const calls = { inserts: 0, reads: 0, filters: [] as Record<string, string>[] };
  const behavior = {
    identity: OWNER as string | null,
    authError: false,
    authThrows: false,
    write: "success" as "success" | "lost-response" | "transport-error" | "empty-response" | "not-delivered",
    sqlError: null as string | null,
    committedError: null as string | null,
    readFailures: 0,
    readThrows: false,
    storedPatch: {} as Partial<ScheduleCreateRow>,
  };
  const client = {
    auth: {
      async getClaims() {
        if (behavior.authThrows) throw new Error("Authentication unavailable");
        return {
          data: behavior.identity ? { claims: { sub: behavior.identity } } : null,
          error: behavior.authError ? new Error("Authentication failed") : null,
        };
      },
    },
    from(table: string) {
      expect(table).toBe("practice_schedules");
      let inserted: ScheduleCreateRow | null = null;
      const filters: Record<string, string> = {};
      const query = {
        insert(row: ScheduleCreateRow) {
          calls.inserts++;
          inserted = structuredClone(row);
          return query;
        },
        select() { return query; },
        eq(field: string, value: string) { filters[field] = value; return query; },
        async maybeSingle() {
          if (inserted) {
            if (behavior.sqlError) return { data: null, error: { code: behavior.sqlError } };
            if (rows.has(inserted.id)) return { data: null, error: { code: "23505" } };
            if (behavior.write === "not-delivered") throw new Error("Request did not arrive");
            const saved = { ...inserted, ...structuredClone(behavior.storedPatch) };
            rows.set(saved.id, saved);
            if (behavior.committedError) return { data: null, error: { code: behavior.committedError } };
            if (behavior.write === "lost-response") throw new Error("Response was lost after commit");
            if (behavior.write === "transport-error") return { data: null, error: { code: "FETCH_ERROR" } };
            if (behavior.write === "empty-response") return { data: null, error: null };
            return { data: structuredClone(saved), error: null };
          }
          calls.reads++;
          calls.filters.push({ ...filters });
          if (behavior.readThrows) throw new Error("Read unavailable");
          if (behavior.readFailures > 0) {
            behavior.readFailures--;
            return { data: null, error: { code: "FETCH_ERROR" } };
          }
          const saved = rows.get(filters.id);
          return {
            data: saved && saved.created_by === filters.created_by ? structuredClone(saved) : null,
            error: null,
          };
        },
      };
      return query;
    },
  } as unknown as SupabaseClient<Database>;
  const pending: PendingScheduleCreate = { row: scheduleRow(), uncertain: false };
  return { client, pending, rows, calls, behavior };
}

describe("saveNewSchedule", () => {
  it("creates exactly one schedule with every submitted value", async () => {
    const database = fakeDatabase();
    expect(await saveNewSchedule(database.client, database.pending)).toEqual({ ok: true });
    expect(database.rows.size).toBe(1);
    expect(database.rows.get(SCHEDULE_ID)).toEqual(database.pending.row);
    expect(database.calls).toMatchObject({ inserts: 1, reads: 0 });
    expect(database.pending.uncertain).toBe(false);
  });

  it("confirms a committed insert after only its response is lost", async () => {
    const database = fakeDatabase();
    database.behavior.write = "lost-response";
    expect(await saveNewSchedule(database.client, database.pending)).toEqual({ ok: true });
    expect(database.rows.size).toBe(1);
    expect(database.calls).toMatchObject({ inserts: 1, reads: 1 });
    expect(database.calls.filters).toEqual([{ id: SCHEDULE_ID, created_by: OWNER }]);
    expect(database.pending.uncertain).toBe(false);
  });

  it("only reads on the next action when both the write response and confirmation fail", async () => {
    const database = fakeDatabase();
    database.behavior.write = "transport-error";
    database.behavior.readFailures = 1;
    const original = structuredClone(database.pending.row);
    expect(await saveNewSchedule(database.client, database.pending)).toEqual({ ok: false, reason: "unknown" });
    expect(database.pending).toEqual({ row: original, uncertain: true });
    expect(await saveNewSchedule(database.client, database.pending)).toEqual({ ok: true });
    expect(database.calls).toMatchObject({ inserts: 1, reads: 2 });
    expect(database.rows.size).toBe(1);
  });

  it("never resends after repeated confirmation reads find no schedule", async () => {
    const database = fakeDatabase();
    database.behavior.write = "not-delivered";
    expect(await saveNewSchedule(database.client, database.pending)).toEqual({ ok: false, reason: "unknown" });
    expect(await saveNewSchedule(database.client, database.pending)).toEqual({ ok: false, reason: "unknown" });
    expect(database.calls).toMatchObject({ inserts: 1, reads: 2 });
    expect(database.rows.size).toBe(0);
    expect(database.pending.uncertain).toBe(true);
  });

  it("preserves an uncertain operation across throwing confirmation reads", async () => {
    const database = fakeDatabase();
    database.behavior.write = "lost-response";
    database.behavior.readThrows = true;
    expect(await saveNewSchedule(database.client, database.pending)).toEqual({ ok: false, reason: "unknown" });
    expect(await saveNewSchedule(database.client, database.pending)).toEqual({ ok: false, reason: "unknown" });
    database.behavior.readThrows = false;
    expect(await saveNewSchedule(database.client, database.pending)).toEqual({ ok: true });
    expect(database.calls).toMatchObject({ inserts: 1, reads: 3 });
    expect(database.rows.size).toBe(1);
  });

  it("refuses an unverified or different owner before writing or reading", async () => {
    for (const identity of [OTHER_OWNER, null]) {
      const database = fakeDatabase();
      database.behavior.identity = identity;
      expect(await saveNewSchedule(database.client, database.pending)).toEqual({ ok: false, reason: "forbidden" });
      expect(database.pending.uncertain).toBe(false);
      expect(database.calls).toMatchObject({ inserts: 0, reads: 0 });
    }
  });

  it("keeps the original operation uncertain when the logged-in owner changes", async () => {
    const database = fakeDatabase();
    database.behavior.write = "lost-response";
    database.behavior.readFailures = 1;
    await saveNewSchedule(database.client, database.pending);
    database.behavior.identity = OTHER_OWNER;
    expect(await saveNewSchedule(database.client, database.pending)).toEqual({ ok: false, reason: "unknown" });
    expect(database.pending.row.created_by).toBe(OWNER);
    expect(database.pending.uncertain).toBe(true);
    expect(database.calls).toMatchObject({ inserts: 1, reads: 1 });
  });

  it("does not dispatch a write when authentication is unavailable", async () => {
    const database = fakeDatabase();
    database.behavior.authThrows = true;
    expect(await saveNewSchedule(database.client, database.pending)).toEqual({ ok: false, reason: "failed" });
    database.behavior.authThrows = false;
    database.behavior.authError = true;
    expect(await saveNewSchedule(database.client, database.pending)).toEqual({ ok: false, reason: "forbidden" });
    expect(database.pending.uncertain).toBe(false);
    expect(database.calls).toMatchObject({ inserts: 0, reads: 0 });
  });

  it("treats SQL permission and validation rejections as unsuccessful writes", async () => {
    for (const [code, reason] of [["42501", "forbidden"], ["23514", "failed"]]) {
      const database = fakeDatabase();
      database.behavior.sqlError = code;
      expect(await saveNewSchedule(database.client, database.pending)).toEqual({ ok: false, reason });
      expect(database.pending.uncertain).toBe(false);
      expect(database.rows.size).toBe(0);
      expect(database.calls).toMatchObject({ inserts: 1, reads: 0 });
    }
  });

  it.each(["08007", "40003"])("confirms a committed schedule when SQLSTATE %s cannot establish completion", async (code) => {
    const database = fakeDatabase();
    database.behavior.committedError = code;
    expect(await saveNewSchedule(database.client, database.pending)).toEqual({ ok: true });
    expect(database.calls).toMatchObject({ inserts: 1, reads: 1 });
    expect(database.rows.size).toBe(1);
    expect(database.rows.get(SCHEDULE_ID)).toEqual(database.pending.row);
    expect(database.pending.uncertain).toBe(false);
  });

  it.each(["08007", "40003"])("keeps an undelivered SQLSTATE %s operation uncertain without resending", async (code) => {
    const database = fakeDatabase();
    database.behavior.sqlError = code;
    expect(await saveNewSchedule(database.client, database.pending)).toEqual({ ok: false, reason: "unknown" });
    expect(await saveNewSchedule(database.client, database.pending)).toEqual({ ok: false, reason: "unknown" });
    expect(database.calls).toMatchObject({ inserts: 1, reads: 2 });
    expect(database.rows.size).toBe(0);
    expect(database.pending.uncertain).toBe(true);
  });

  it("resolves a primary-key conflict by reading the same schedule without duplicating it", async () => {
    const database = fakeDatabase();
    database.rows.set(SCHEDULE_ID, structuredClone(database.pending.row));
    expect(await saveNewSchedule(database.client, database.pending)).toEqual({ ok: true });
    expect(database.rows.size).toBe(1);
    expect(database.calls).toMatchObject({ inserts: 1, reads: 1 });
    expect(database.pending.uncertain).toBe(false);
  });

  it("does not accept a same-ID schedule owned by someone else", async () => {
    const database = fakeDatabase();
    database.rows.set(SCHEDULE_ID, { ...database.pending.row, created_by: OTHER_OWNER });
    expect(await saveNewSchedule(database.client, database.pending)).toEqual({ ok: false, reason: "unknown" });
    expect(await saveNewSchedule(database.client, database.pending)).toEqual({ ok: false, reason: "unknown" });
    expect(database.calls).toMatchObject({ inserts: 1, reads: 2 });
    expect(database.rows.get(SCHEDULE_ID)?.created_by).toBe(OTHER_OWNER);
  });

  it("confirms an empty insert response instead of assuming that zero returned rows is success", async () => {
    const database = fakeDatabase();
    database.behavior.write = "empty-response";
    database.behavior.readFailures = 1;
    expect(await saveNewSchedule(database.client, database.pending)).toEqual({ ok: false, reason: "unknown" });
    expect(await saveNewSchedule(database.client, database.pending)).toEqual({ ok: true });
    expect(database.rows.size).toBe(1);
    expect(database.calls).toMatchObject({ inserts: 1, reads: 2 });
  });

  it("rejects changes to any submitted value while confirming a saved schedule", async () => {
    const changedValues: Partial<ScheduleCreateRow>[] = [
      { schedule_date: "2026-10-22" }, { schedule_type: "practice" }, { venue_name: null },
      { venue_access: null }, { venue_fee: null }, { venue_url: null }, { title: "変更後" },
      { end_date: null }, { entry_start: null }, { entry_end: null }, { note: null },
      { meeting_time: null }, { target_blocks: ["middle_long"] },
    ];
    for (const changed of changedValues) {
      const database = fakeDatabase();
      database.pending.uncertain = true;
      database.rows.set(SCHEDULE_ID, { ...database.pending.row, ...changed });
      expect(await saveNewSchedule(database.client, database.pending), JSON.stringify(changed))
        .toEqual({ ok: false, reason: "conflict" });
      expect(database.pending.uncertain).toBe(true);
      expect(database.calls).toMatchObject({ inserts: 0, reads: 1 });
    }
  });

  it("accepts equivalent database time formatting and reordered target blocks", async () => {
    const database = fakeDatabase();
    database.behavior.storedPatch = { meeting_time: "08:00:00", target_blocks: ["short", "middle_long"] };
    expect(await saveNewSchedule(database.client, database.pending)).toEqual({ ok: true });
    expect(database.rows.size).toBe(1);
    expect(database.pending.row.meeting_time).toBe("08:00");
    expect(database.pending.row.target_blocks).toEqual(["middle_long", "short"]);
  });

  it("does not discard seconds or collapse multiple blocks when comparing a saved schedule", async () => {
    for (const changed of [{ meeting_time: "08:00:30" }, { target_blocks: ["middle_long"] }]) {
      const database = fakeDatabase();
      database.behavior.storedPatch = changed;
      expect(await saveNewSchedule(database.client, database.pending)).toEqual({ ok: false, reason: "conflict" });
      expect(await saveNewSchedule(database.client, database.pending)).toEqual({ ok: false, reason: "conflict" });
      expect(database.calls).toMatchObject({ inserts: 1, reads: 1 });
      expect(database.rows.size).toBe(1);
    }
  });
});
