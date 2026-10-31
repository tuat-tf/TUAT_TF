// 大会・種目・目標・結果の取得。

import { createClient } from "@/lib/supabase/server";
import { fetchAllPages } from "@/lib/fetch-all-pages";
import { competitionDays, isTypedResultOf } from "@/lib/competition-days";
import { jstToday, shiftMonth } from "@/lib/date";
import { finishedHomeCompetitions, isCompetitionFinished, selectHomeCompetition } from "@/lib/competition-lifecycle";
import { readCompetitionProgramEntries } from "@/lib/competition-program-query";
import type {
  CompetitionRow,
  CompetitionGoalRow,
  PersonalBestRow,
  PbRecord,
} from "@/types";

export const COMPETITION_SELECT = "id,name,starts_on,ends_on,sort_order,is_countdown,program_source_url,program_closed_at,archive_at";
/** 部で統一している大会（対抗戦など）の一覧 */
export async function getCompetitions() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("competitions")
    .select(COMPETITION_SELECT)
    .order("sort_order")
    .order("starts_on", { ascending: false });
  if (error) throw error;
  return (data ?? []) as CompetitionRow[];
}

/** 種目マスタ（表示順） */
export async function getCompetitionEvents() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("competition_events")
    .select("name,sort_order,measure_type,time_format")
    .order("sort_order")
    .order("name");
  if (error) throw error;
  return data ?? [];
}

/** ホームのカウントダウンとみんなの目標。管理者が選んだ大会（無ければ非表示） */
export async function getHomeCompetition() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("competitions")
    .select(COMPETITION_SELECT);
  if (error) throw error;
  const rows = (data ?? []) as CompetitionRow[];
  const today = jstToday();
  // 終了した大会はカウントダウン・目標・進行中の表示をやめ、「終了・結果を見る」の1行にそろえる。
  const selected = selectHomeCompetition(rows);
  const competition = selected && !isCompetitionFinished(selected, today) ? selected : null;
  const finished = finishedHomeCompetitions(rows, today);
  if (!competition) return finished.length ? { competition: null, goalCount: 0, finished } : null;
  const { count, error: countError } = await supabase
    .from("competition_goals")
    .select("user_id", { count: "exact", head: true })
    .eq("competition_id", competition.id);
  if (countError) throw countError;
  return { competition, goalCount: count ?? 0, finished };
}

/** 目標一覧ページ（大会別）。目標の横に出す本人のPBも一緒に読む */
export async function getCompetitionGoals(competitionId: string) {
  const supabase = await createClient();
  const [goalResult, events] = await Promise.all([
    supabase
      .from("competition_goals")
      .select("id,user_id,event,target,author:profiles!user_id(display_name,blocks)")
      .eq("competition_id", competitionId),
    getCompetitionEvents(),
  ]);
  if (goalResult.error) throw goalResult.error;
  const rows = (goalResult.data ?? []) as unknown as CompetitionGoalRow[];
  const userIds = [...new Set(rows.map((g) => g.user_id))];
  const { data: bests, error: bestError } = userIds.length
    ? await supabase
        .from("pb_records")
        .select("user_id,event_name,record,value_cs,value_cm,value_points,result_status")
        .eq("is_pb", true)
        .in("user_id", userIds)
    : { data: [], error: null };
  if (bestError) throw bestError;
  return {
    goals: rows,
    events,
    personalBests: (bests ?? []) as PersonalBestRow[],
  };
}

/**
 * ある大会の結果（大会別の一覧ページ用）。大会を選んで登録した結果に加え、大会名を自由入力して
 * その名前と記録日が大会と一致する結果も含める（2026-09-26 オーナー確定。isTypedResultOf）。
 */
export async function getCompetitionResults(competition: Pick<CompetitionRow, "id" | "name" | "starts_on" | "ends_on">) {
  const supabase = await createClient();
  const select = "*,author:profiles!user_id(display_name)";
  // 自由入力の大会名は表記ゆれ（全角・空白）があるので、名前が入っている未選択の結果を読んで比べる。
  const [linked, typed] = await Promise.all([
    fetchAllPages((from, to) => supabase.from("pb_records").select(select).eq("competition_id", competition.id).order("id").range(from, to)),
    fetchAllPages((from, to) => supabase.from("pb_records").select(select).is("competition_id", null).not("meet_name", "is", null).in("recorded_on", competitionDays(competition.starts_on, competition.ends_on)).order("id").range(from, to)),
  ]);
  const rows = [
    ...(linked ?? []),
    ...((typed ?? []) as unknown as PbRecord[]).filter((r) => isTypedResultOf(r, competition)),
  ] as unknown as (PbRecord & { author: { display_name: string } | null })[];
  return rows.sort((a, b) => a.event_name.localeCompare(b.event_name, "ja"));
}

/** 結果に入力されているがマスタに無い種目名（表記統一の入口） */
export async function getUnregisteredEventNames() {
  const supabase = await createClient();
  const [records, events] = await Promise.all([
    fetchAllPages((from, to) => supabase.from("pb_records").select("event_name").order("id").range(from, to)),
    getCompetitionEvents(),
  ]);
  const known = new Set(events.map((e) => e.name));
  const counts = new Map<string, number>();
  for (const row of records) {
    if (known.has(row.event_name)) continue;
    counts.set(row.event_name, (counts.get(row.event_name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ja"));
}

/** 大会プログラム（速報サイトから取り込んだ、農工大の出場種目・出場選手）。プログラム順。 */
export async function getCompetitionProgramEntries(competitionId: string) {
  const supabase = await createClient();
  return readCompetitionProgramEntries(supabase, competitionId);
}

export async function getCompetitionById(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("competitions")
    .select(COMPETITION_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("大会を取得できませんでした");
  return (data as CompetitionRow | null) ?? null;
}

/**
 * 目標ページ（マイページ→目標）のハブ用。
 * 大会を「これから／終わった」に分け、自分が設定済みの目標件数を大会ごとに数える。
 * 終了日が無い大会は開催日そのものを終了日として扱う。
 */
export async function getGoalHub(userId: string) {
  const supabase = await createClient();
  const today = jstToday();
  const [competitions, goalResult] = await Promise.all([
    getCompetitions(),
    supabase
      .from("competition_goals")
      .select("competition_id")
      .eq("user_id", userId),
  ]);
  if (goalResult.error) throw goalResult.error;
  const myGoalCounts = new Map<string, number>();
  for (const row of goalResult.data ?? [])
    myGoalCounts.set(
      row.competition_id,
      (myGoalCounts.get(row.competition_id) ?? 0) + 1,
    );
  const isOver = (row: CompetitionRow) =>
    (row.ends_on ?? row.starts_on) < today;
  return {
    upcoming: competitions
      .filter((row) => !isOver(row))
      .sort((a, b) => a.starts_on.localeCompare(b.starts_on)),
    past: competitions
      .filter(isOver)
      .sort((a, b) => b.starts_on.localeCompare(a.starts_on)),
    myGoalCounts,
  };
}


export type MonthlyGoal = { month: string; goal: string | null; reflection: string | null };

/**
 * 月ごとの目標（本人だけ）。先月・今月・来月は書いていなくても並べ、それより前は書いた月だけ新しい順に返す。
 * month は YYYY-MM。
 */
export async function getMonthlyGoals(userId: string): Promise<MonthlyGoal[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("monthly_goals")
    .select("month,goal,reflection")
    .eq("user_id", userId)
    .order("month", { ascending: false })
    .limit(60);
  if (error) throw error;
  const thisMonth = jstToday().slice(0, 7);
  const saved = new Map((data ?? []).map((row) => [row.month.slice(0, 7), row]));
  const months = new Set([shiftMonth(thisMonth, 1), thisMonth, shiftMonth(thisMonth, -1), ...saved.keys()]);
  return [...months]
    .sort((a, b) => b.localeCompare(a))
    .map((month) => ({ month, goal: saved.get(month)?.goal ?? null, reflection: saved.get(month)?.reflection ?? null }));
}
