import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { OB_MEET } from "@/lib/ob-meet";
import { competitionMeetObExport } from "@/lib/competition-meet-export";
import type { CompetitionMeet } from "@/lib/competition-meet";

/** The published-sheet format is shared; its only source is the activated meet. */
export async function getObPublishedResults(admin: SupabaseClient<Database>) {
  const normalized=await admin.rpc("get_competition_meet_export",{p_competition_id:OB_MEET.competitionId});
  if(normalized.error)throw new Error("共有用の大会情報を取得できませんでした");
  const snapshot=normalized.data;
  if(snapshot===null)throw new Error("大会データの移行状態を確認できませんでした");
  if(typeof snapshot!=="object"||Array.isArray(snapshot))throw new Error("共有用の大会情報を照合できませんでした");
  if(["participants","appearances","events"].some(key=>!Array.isArray(snapshot[key])))throw new Error("共有用の大会情報を照合できませんでした");
  return competitionMeetObExport(snapshot as unknown as CompetitionMeet);
}
