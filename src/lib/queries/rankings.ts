// 走行距離ランキングの取得。

import { createClient } from "@/lib/supabase/server";
import { fetchAllPages } from "@/lib/fetch-all-pages";
import type { WeeklyRankingRow, Block } from "@/types";
export async function getMonthlyRanking(
  periodStart: string,
  periodEnd: string,
): Promise<WeeklyRankingRow[]> {
  const supabase = await createClient();
  const rows = await fetchAllPages((from, to) => supabase
    .rpc("get_monthly_distance_ranking", { period_start: periodStart, period_end: periodEnd })
    .order("id").range(from, to));
  return rows.map((profile) => {
    const blocks = (profile.blocks ?? []).filter((block): block is Block =>
      block === "middle_long" || block === "short" || block === "manager" || block === "jump" || block === "throw"
    );
    return {
      id: profile.id,
      display_name: profile.display_name,
      grade: profile.grade,
      blocks,
      avatar_url: profile.avatar_url,
      km_low: profile.km_low,
      km_mid: profile.km_mid,
      km_high: profile.km_high,
      km_speed: profile.km_speed,
      km_other: profile.km_other,
      total_km: profile.total_km,
      period_start: periodStart,
      period_end: periodEnd,
    };
  }).sort((a, b) => b.total_km - a.total_km);
}
