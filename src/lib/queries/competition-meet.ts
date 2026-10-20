import { createClient } from "@/lib/supabase/server";
import type { CompetitionMeet } from "@/lib/competition-meet";
import { isCompetitionMeetSnapshot } from "@/lib/competition-meet-snapshot";

export async function getCompetitionMeet(competitionId: string): Promise<CompetitionMeet | null> {
  const client = await createClient();
  const result = await client.rpc("get_competition_meet", { p_competition_id: competitionId });
  if (result.error) throw new Error("大会の運営情報を取得できませんでした");
  const snapshot=result.data;
  if(snapshot===null)return null;
  if(!isCompetitionMeetSnapshot(snapshot,competitionId))throw new Error("大会の運営情報を照合できませんでした");
  return snapshot;
}

export async function getCompetitionMeetBackend(): Promise<"pc" | "cloud"> {
  const client=await createClient();
  const result=await client.rpc("get_competition_meet_backend",{});
  if(result.error || !["pc","cloud"].includes(String(result.data)))throw new Error("保存先を確認できませんでした");
  return result.data as "pc"|"cloud";
}
