// 練習記録と自己ベストの取得。

import { createClient } from "@/lib/supabase/server";
import { jstToday } from "@/lib/date";
import { normalizePracticeRecord, recordValuesFromJson } from "@/lib/profile-normalize";
import { RECORD_NONEMPTY_OR } from "@/lib/record-content";
import { displayedDistance } from "@/lib/record-distance";
import { fetchAllPages } from "@/lib/fetch-all-pages";
import type { PbRecord, PracticeRecord, TrainingRecord } from "@/types";
import { RECORD_LIST_SELECT, attachRecordFieldGroups, fetchTargetSocialState } from "./internal";

/** 週間カード用。本文・プロフィール・項目定義を取得せず、同じ対象日の距離と件数を集計する。 */
export async function getUserTrainingSummary(userId: string, fromDate: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("practice_records")
    .select("dist_low,dist_mid,dist_high,dist_speed,dist_actual")
    .eq("user_id", userId)
    .gte("recorded_date", fromDate)
    .lte("recorded_date", jstToday())
    .or(RECORD_NONEMPTY_OR);
  if (error) throw error;
  const records = data ?? [];
  return {
    distance: records.reduce((sum, record) => sum + displayedDistance(record), 0),
    count: records.length,
  };
}

/** グラフと全項目の振り返り。同期・ソーシャル情報は取得しない。 */
export async function getUserTrainingRecords(userId: string): Promise<TrainingRecord[]> {
  const supabase = await createClient();
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - 400);
  const data = await fetchAllPages((from, to) => supabase.from("practice_records")
    .select("id,recorded_date,dist_low,dist_mid,dist_high,dist_speed,dist_actual,strides,result_text,strength_text,memo,menu_text,focus_text,condition,custom,record_fields_version")
    .eq("user_id", userId).gte("recorded_date", fromDate.toISOString().slice(0, 10))
    .lte("recorded_date", jstToday()).or(RECORD_NONEMPTY_OR)
    .order("recorded_date", { ascending: false }).order("id").range(from, to));
  const records: TrainingRecord[] = data.map(row => ({
    ...row,
    dist_low: row.dist_low ?? 0, dist_mid: row.dist_mid ?? 0, dist_high: row.dist_high ?? 0,
    dist_speed: row.dist_speed ?? 0, dist_actual: row.dist_actual ?? 0, strides: row.strides ?? 0,
    condition: row.condition === "great" || row.condition === "normal" || row.condition === "bad" ? row.condition : null,
    custom: recordValuesFromJson(row.custom),
  }));
  // Legacy records use the current fields already supplied by the profile.
  // Versioned records still require their historical names and display settings.
  const historical = await attachRecordFieldGroups(supabase, records.filter(record => record.record_fields_version != null));
  const byId = new Map(historical.map(record => [record.id, record]));
  return records.map(record => byId.get(record.id) ?? record);
}

/** ユーザーの期間内の練習記録（他部員の投稿一覧に使用） */
export async function getUserRecords(userId: string, fromDate?: string) {
  const supabase = await createClient();
  // fromDate省略時も無期限取得はしない（TrainingChartの最大表示期間は12ヶ月分）。
  const defaultFromDate = new Date();
  defaultFromDate.setDate(defaultFromDate.getDate() - 400);
  const q = supabase
    .from("practice_records")
    .select(RECORD_LIST_SELECT)
    .eq("user_id", userId)
    .lte("recorded_date", jstToday()) // 未来日は除外
    .or(RECORD_NONEMPTY_OR) // 空の記録は除外
    .gte("recorded_date", fromDate ?? defaultFromDate.toISOString().slice(0, 10))
    .order("recorded_date", { ascending: false });
  const { data, error } = await q;
  if (error) throw error;
  return attachRecordFieldGroups(supabase, (data ?? []).map((row) => normalizePracticeRecord({ ...row, record_fields_snapshot: null })));
}

/** 他部員ページ用。記録に閲覧者本人のいいね状態とコメント数を付与する。 */
export async function getUserRecordsWithSocialState(
  userId: string,
  currentUserId: string,
): Promise<PracticeRecord[]> {
  const today = jstToday();
  // 元の記録取得には件数上限がないため、全件から公開対象を絞ってからsocialを取得する。
  const records = ((await getUserRecords(userId)) as PracticeRecord[])
    .filter((record) => !record.from_sheet || record.recorded_date < today);
  const ids = records.map((record) => record.id);
  const supabase = await createClient();
  void currentUserId;
  const { liked, comments } = await fetchTargetSocialState(supabase, "record", ids);
  return records.map((record) => ({
    ...record,
    liked_by_me: liked.has(record.id),
    comments_count: comments.get(record.id) ?? 0,
  }));
}
/** あるユーザーの全大会結果（古いPBや大学以前の結果も含む） */
export async function getPbRecords(userId: string) {
  const supabase = await createClient();
  const data = await fetchAllPages((from, to) => supabase
    .from("pb_records")
    .select("*")
    .eq("user_id", userId)
    .order("recorded_on", { ascending: false, nullsFirst: false })
    .order("id")
    .range(from, to));
  return data as PbRecord[];
}

