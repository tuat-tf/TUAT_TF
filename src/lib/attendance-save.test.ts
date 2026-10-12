import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { attendanceNote, nextAttendance, saveAttendance, type AttendanceChange, type AttendancePending } from "./attendance-save";

const key = { userId: "me", scheduleId: "schedule", attendDate: "2026-11-15" };
const present: AttendanceChange = { status: "present", isLate: false, lateNote: null, absenceNote: null };
const row = (value: AttendanceChange) => value.status === "none" ? null : { status: value.status, is_late: value.isLate, late_note: value.lateNote, absence_note: value.absenceNote };
function client(reads: unknown[], write: unknown, subject = "me") {
  const mutations: unknown[] = [], filters: unknown[] = [];
  const query = {
    action: "read", select: vi.fn(function (this: { action: string }) { return query; }),
    eq: vi.fn((name: string, value: unknown) => { filters.push([name, value]); return query; }),
    is: vi.fn((name: string, value: unknown) => { filters.push([name, value]); return query; }),
    insert: vi.fn((value: unknown) => { query.action = "write"; mutations.push(value); return query; }),
    update: vi.fn((value: unknown) => { query.action = "write"; mutations.push(value); return query; }),
    delete: vi.fn(() => { query.action = "write"; mutations.push("delete"); return query; }),
    maybeSingle: vi.fn(async () => {
      const result = query.action === "write" ? write : reads.shift();
      if (result instanceof Error) throw result;
      return result;
    }),
  };
  const api = { auth: { getClaims: vi.fn(async () => ({ data: { claims: { sub: subject } }, error: null })) }, from: vi.fn(() => { query.action = "read"; return query; }) };
  return { api: api as unknown as SupabaseClient<Database>, mutations, filters };
}
const ok = (value: AttendanceChange) => ({ data: row(value), error: null });
const pending = (after: AttendanceChange, before = present): AttendancePending => ({ before, after, uncertain: false });

describe("attendance and contact saving", () => {
  it("saves a general note without late status, scoped to a future schedule day and verified owner", async () => {
    const after = { ...present, lateNote: "途中で早退します" };
    const db = client([ok(present)], ok(after));
    expect(await saveAttendance(db.api, key, pending(after))).toEqual({ ok: true, value: after });
    expect(db.mutations).toEqual([expect.objectContaining({ status: "present", is_late: false, late_note: after.lateNote })]);
    expect(db.filters).toEqual(expect.arrayContaining([["user_id", "me"], ["schedule_id", "schedule"], ["attend_date", "2026-11-15"], ["late_note", null], ["absence_note", null]]));
  });
  it("keeps contact text when cancelling lateness or switching to absent", async () => {
    const before = { ...present, isLate: true, lateNote: "授業のため遅れます" };
    const after = { ...before, isLate: false };
    const db = client([ok(before)], ok(after));
    expect(await saveAttendance(db.api, key, pending(after, before))).toEqual({ ok: true, value: after });
    expect(nextAttendance(before)).toEqual({ status: "absent", isLate: false, lateNote: null, absenceNote: before.lateNote });
    expect(attendanceNote(nextAttendance(before))).toBe(before.lateNote);
  });
  it("does not save zero affected rows or overwrite a response that changed on another device", async () => {
    const after = { ...present, isLate: true };
    const zero = client([ok(present)], { data: null, error: null });
    expect(await saveAttendance(zero.api, key, pending(after))).toEqual({ ok: false, reason: "conflict" });
    const changed = client([ok({ ...present, lateNote: "別の連絡" })], ok(after));
    expect(await saveAttendance(changed.api, key, pending(after))).toEqual({ ok: false, reason: "conflict" });
    expect(changed.mutations).toHaveLength(0);
  });
  it("after a lost write response, confirms saved data without issuing another write", async () => {
    const after = { ...present, isLate: true, lateNote: "10分遅れます" };
    const attempt = pending(after);
    const lost = client([ok(present)], new Error("response lost"));
    expect(await saveAttendance(lost.api, key, attempt)).toEqual({ ok: false, reason: "unknown" });
    expect(attempt.uncertain).toBe(true);
    const confirmation = client([ok(after)], ok(after));
    expect(await saveAttendance(confirmation.api, key, attempt)).toEqual({ ok: true, value: after });
    expect(confirmation.mutations).toHaveLength(0);
    expect(attempt.uncertain).toBe(false);
  });
  it("keeps an uncertain attempt pending if its confirmation fails or shows another value", async () => {
    const attempt = { ...pending({ ...present, isLate: true }), uncertain: true };
    for (const result of [{ data: null, error: { code: "network" } }, ok(present)]) {
      const db = client([result], ok(present));
      expect(await saveAttendance(db.api, key, attempt)).toEqual({ ok: false, reason: "unknown" });
      expect(db.mutations).toHaveLength(0);
      expect(attempt.uncertain).toBe(true);
    }
  });
  it("rejects mismatched identities and failed initial reads without sending changes", async () => {
    const wrong = client([ok(present)], ok(present), "another-person");
    expect(await saveAttendance(wrong.api, key, pending(present))).toEqual({ ok: false, reason: "forbidden" });
    expect(wrong.mutations).toHaveLength(0);
    const failed = client([{ data: null, error: { code: "network" } }], ok(present));
    expect(await saveAttendance(failed.api, key, pending(present))).toEqual({ ok: false, reason: "failed" });
    expect(failed.mutations).toHaveLength(0);
  });
  it("inserts a first response, distinguishes SQL rejection, and confirms deletion after a lost response", async () => {
    const empty: AttendanceChange = { ...present, status: "none" };
    const inserted = client([ok(empty)], ok(present));
    expect(await saveAttendance(inserted.api, key, pending(present, empty))).toEqual({ ok: true, value: present });
    expect(inserted.mutations).toEqual([expect.objectContaining({ user_id: "me", attend_date: key.attendDate })]);
    const rejected = client([ok(present)], { data: null, error: { code: "42501" } });
    const deniedAttempt = pending({ ...present, isLate: true });
    expect(await saveAttendance(rejected.api, key, deniedAttempt)).toEqual({ ok: false, reason: "forbidden" });
    expect(deniedAttempt.uncertain).toBe(false);
    const deletion = { ...pending(empty), uncertain: true };
    const check = client([ok(empty)], ok(empty));
    expect(await saveAttendance(check.api, key, deletion)).toEqual({ ok: true, value: empty });
    expect(check.mutations).toHaveLength(0);
  });
});
