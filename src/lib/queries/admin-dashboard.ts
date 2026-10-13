import { jstToday } from "@/lib/date";
import { permissionsOf } from "@/lib/permissions";
import { getCurrentProfile } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { stillRunningOrUpcoming } from "./schedules";

export type AdminDashboardSnapshot = {
  checkedAt: string;
  today: string;
  since: string;
  metrics: {
    activeMembers: number | null;
    recentRecords: number | null;
    recentTweets: number | null;
    upcomingSchedules: number | null;
    upcomingCompetitions: number | null;
    recentNotices: number | null;
  };
  unavailable: string[];
};

/** 管理者の閲覧範囲で集計する。記録は記録日ではなく追加日（シート取込含む）を数える。 */
export async function getAdminDashboard(): Promise<AdminDashboardSnapshot> {
  const profile = await getCurrentProfile();
  if (!permissionsOf(profile.roles).manageSystem) {
    throw new Error("全体ダッシュボードを閲覧する権限がありません。");
  }

  // セッションの接続を使い、各テーブルのRLSによる閲覧範囲を保持する。
  const supabase = await createClient();
  const checkedAt = new Date().toISOString();
  const today = jstToday();
  const since = jstToday(-6);
  const sinceTimestamp = `${since}T00:00:00+09:00`;
  const countOptions = { count: "exact", head: true } as const;

  const results = await Promise.allSettled([
    supabase.from("profiles").select("id", countOptions)
      .eq("status", "active").eq("approved", true),
    supabase.from("practice_records").select("id", countOptions)
      .gte("created_at", sinceTimestamp).lte("created_at", checkedAt),
    supabase.from("tweets").select("id", countOptions)
      .gte("created_at", sinceTimestamp).lte("created_at", checkedAt)
      .or(`expires_at.is.null,expires_at.gt.${checkedAt}`),
    supabase.from("practice_schedules").select("id", countOptions)
      .or(stillRunningOrUpcoming(today)),
    supabase.from("competitions").select("id", countOptions)
      .or(`starts_on.gte.${today},ends_on.gte.${today}`),
    supabase.from("notices").select("id", countOptions)
      .gte("created_at", sinceTimestamp).lte("created_at", checkedAt),
  ]);

  const keys = [
    "activeMembers", "recentRecords", "recentTweets",
    "upcomingSchedules", "upcomingCompetitions", "recentNotices",
  ] as const;
  const metrics: AdminDashboardSnapshot["metrics"] = {
    activeMembers: null,
    recentRecords: null,
    recentTweets: null,
    upcomingSchedules: null,
    upcomingCompetitions: null,
    recentNotices: null,
  };
  const unavailable: string[] = [];
  results.forEach((result, index) => {
    const key = keys[index];
    if (result.status === "rejected" || result.value.error || typeof result.value.count !== "number") {
      unavailable.push(key);
    } else {
      metrics[key] = result.value.count;
    }
  });

  return { checkedAt, today, since, metrics, unavailable };
}
