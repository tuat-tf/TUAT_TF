import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { AttendanceStatusOrNone } from "@/types";

export type AttendanceChange = {
  status: AttendanceStatusOrNone;
  isLate: boolean;
  lateNote: string | null;
  absenceNote: string | null;
};
export type AttendancePending = { before: AttendanceChange; after: AttendanceChange; uncertain: boolean };
type Key = { scheduleId: string; attendDate: string; userId: string };
type Result = { ok: true; value: AttendanceChange } | { ok: false; reason: "failed" | "conflict" | "unknown" | "forbidden" };
const FIELDS = "status,is_late,late_note,absence_note";
const EMPTY: AttendanceChange = { status: "none", isLate: false, lateNote: null, absenceNote: null };

export function nextAttendance(value: AttendanceChange): AttendanceChange {
  if (value.status === "none") return { ...EMPTY, status: "present" };
  if (value.status === "present") return { ...EMPTY, status: "absent", absenceNote: value.lateNote };
  return { ...EMPTY };
}
export function attendanceNote(value: AttendanceChange) {
  return value.status === "absent" ? value.absenceNote : value.lateNote;
}
function same(a: AttendanceChange, b: AttendanceChange) {
  return a.status === b.status && a.isLate === b.isLate && a.lateNote === b.lateNote && a.absenceNote === b.absenceNote;
}
function snapshot(row: { status: string; is_late: boolean; late_note: string | null; absence_note: string | null } | null): AttendanceChange {
  if (!row) return { ...EMPTY };
  if (row.status !== "present" && row.status !== "absent") throw new Error("Invalid attendance status");
  return { status: row.status, isLate: row.is_late, lateNote: row.late_note, absenceNote: row.absence_note };
}

/** One response for one person/day. A lost response is only read back, never blindly resubmitted. */
export async function saveAttendance(
  client: SupabaseClient<Database>, key: Key, pending: AttendancePending,
): Promise<Result> {
  try {
    const { data: auth, error: authError } = await client.auth.getClaims();
    if (authError || auth?.claims.sub !== key.userId) return { ok: false, reason: pending.uncertain ? "unknown" : "forbidden" };
    const read = async () => {
      const { data, error } = await client.from("attendances").select(FIELDS)
        .eq("schedule_id", key.scheduleId).eq("attend_date", key.attendDate).eq("user_id", key.userId).maybeSingle();
      if (error) throw error;
      return snapshot(data);
    };
    if (pending.uncertain) {
      const current = await read();
      if (!same(current, pending.after)) return { ok: false, reason: "unknown" };
      pending.uncertain = false;
      return { ok: true, value: current };
    }
    const current = await read();
    if (!same(current, pending.before)) return { ok: false, reason: "conflict" };
    const payload = {
      status: pending.after.status as "present" | "absent", is_late: pending.after.isLate,
      late_note: pending.after.lateNote, absence_note: pending.after.absenceNote, updated_at: new Date().toISOString(),
    };
    // Mark the request uncertain before dispatch: exceptions can happen after the write committed.
    pending.uncertain = true;
    let result;
    if (current.status === "none") {
      result = await client.from("attendances").insert({ ...payload, schedule_id: key.scheduleId, attend_date: key.attendDate, user_id: key.userId }).select(FIELDS).maybeSingle();
    } else {
      let mutation = pending.after.status === "none"
        ? client.from("attendances").delete()
        : client.from("attendances").update(payload);
      mutation = mutation.eq("schedule_id", key.scheduleId).eq("attend_date", key.attendDate).eq("user_id", key.userId)
        .eq("status", current.status).eq("is_late", current.isLate);
      mutation = current.lateNote === null ? mutation.is("late_note", null) : mutation.eq("late_note", current.lateNote);
      mutation = current.absenceNote === null ? mutation.is("absence_note", null) : mutation.eq("absence_note", current.absenceNote);
      result = await mutation.select(FIELDS).maybeSingle();
    }
    if (!result.error) {
      pending.uncertain = false;
      if (!result.data) return { ok: false, reason: "conflict" };
      const value = pending.after.status === "none" ? { ...EMPTY } : snapshot(result.data);
      return same(value, pending.after) ? { ok: true, value } : { ok: false, reason: "conflict" };
    }
    if (/^[A-Z0-9]{5}$/.test(result.error.code ?? "")) {
      pending.uncertain = false;
      return { ok: false, reason: result.error.code === "23505" || result.error.code === "40001" ? "conflict" : result.error.code === "42501" ? "forbidden" : "failed" };
    }
    const confirmed = await read();
    if (!same(confirmed, pending.after)) return { ok: false, reason: "unknown" };
    pending.uncertain = false;
    return { ok: true, value: confirmed };
  } catch {
    return { ok: false, reason: pending.uncertain ? "unknown" : "failed" };
  }
}
