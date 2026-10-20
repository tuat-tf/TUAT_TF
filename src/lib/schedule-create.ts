import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type ScheduleRow = Database["public"]["Tables"]["practice_schedules"]["Row"];
const VALUE_FIELDS = [
  "schedule_date", "schedule_type", "venue_name", "venue_access", "venue_fee", "venue_url",
  "title", "end_date", "entry_start", "entry_end", "note",
] as const;
export type ScheduleCreateRow = Pick<ScheduleRow,
  typeof VALUE_FIELDS[number] | "id" | "created_by" | "meeting_time" | "target_blocks"
>;
export type PendingScheduleCreate = { row: ScheduleCreateRow; uncertain: boolean };
export type ScheduleCreateResult = { ok: true } | { ok: false; reason: "failed" | "forbidden" | "unknown" | "conflict" };
const FIELDS = "id,created_by,meeting_time,target_blocks,schedule_date,schedule_type,venue_name,venue_access,venue_fee,venue_url,title,end_date,entry_start,entry_end,note";

function sameSchedule(actual: ScheduleCreateRow, expected: ScheduleCreateRow) {
  const time = (value: string | null) => value?.length === 5 ? `${value}:00` : value;
  return actual.id === expected.id && actual.created_by === expected.created_by &&
    VALUE_FIELDS.every((field) => actual[field] === expected[field]) &&
    time(actual.meeting_time) === time(expected.meeting_time) &&
    JSON.stringify([...actual.target_blocks].sort()) === JSON.stringify([...expected.target_blocks].sort());
}

export async function saveNewSchedule(
  client: SupabaseClient<Database>, pending: PendingScheduleCreate,
): Promise<ScheduleCreateResult> {
  try {
    const { data, error } = await client.auth.getClaims();
    if (error || data?.claims.sub !== pending.row.created_by) {
      return { ok: false, reason: pending.uncertain ? "unknown" : "forbidden" };
    }
    const confirm = async (): Promise<ScheduleCreateResult> => {
      const { data: row, error: readError } = await client.from("practice_schedules").select(FIELDS)
        .eq("id", pending.row.id).eq("created_by", pending.row.created_by).maybeSingle();
      if (readError || !row) return { ok: false, reason: "unknown" };
      if (!sameSchedule(row, pending.row)) return { ok: false, reason: "conflict" };
      pending.uncertain = false;
      return { ok: true };
    };
    if (pending.uncertain) return await confirm();
    pending.uncertain = true;
    try {
      const { data: row, error: writeError } = await client.from("practice_schedules")
        .insert(pending.row).select(FIELDS).maybeSingle();
      if (!writeError && row) {
        if (!sameSchedule(row, pending.row)) return { ok: false, reason: "conflict" };
        pending.uncertain = false;
        return { ok: true };
      }
      const rejectionCode = writeError?.code ?? "";
      const rejected = /^(22|23|42)[A-Z0-9]{3}$/.test(rejectionCode) ||
        rejectionCode === "40001" || rejectionCode === "40P01";
      if (rejectionCode !== "23505" && rejected) {
        pending.uncertain = false;
        return { ok: false, reason: rejectionCode === "42501" ? "forbidden" : "failed" };
      }
    } catch {
      pending.uncertain = true;
    }
    return await confirm();
  } catch {
    return { ok: false, reason: pending.uncertain ? "unknown" : "failed" };
  }
}

export function scheduleCreateMessage(reason: Exclude<ScheduleCreateResult, { ok: true }>["reason"]) {
  if (reason === "unknown") return "保存結果を確認できません。入力は残っています。「保存結果を確認する」を押してください";
  if (reason === "conflict") return "保存先の予定が変更されています。再送せず、予定一覧で内容を確認してください";
  if (reason === "forbidden") return "予定を作成する権限を確認できません。ログイン状態を確認してください";
  return "保存できませんでした。入力は残っています。内容を確認してもう一度お試しください";
}
