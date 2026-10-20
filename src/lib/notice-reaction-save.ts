import type { SupabaseClient } from "@supabase/supabase-js";
import { atomicSave } from "@/lib/atomic-save";

export type PendingNoticeReaction = { checked: boolean; uncertain: boolean };

export function saveNoticeReaction(client: SupabaseClient, noticeId: string, userId: string, pending: PendingNoticeReaction) {
  return atomicSave(pending, async () => {
    const response = pending.checked
      ? await client.from("notice_reactions").upsert({ notice_id: noticeId, user_id: userId, reaction: "ack" }, { onConflict: "notice_id,user_id,reaction" }).select("notice_id").single()
      : await client.from("notice_reactions").delete().eq("notice_id", noticeId).eq("user_id", userId).eq("reaction", "ack").select("notice_id");
    const confirmed = pending.checked ? !!response.data : Array.isArray(response.data) && response.data.length === 1;
    return { data: confirmed ? true : null, error: response.error };
  }, async () => {
    const { data, error } = await client.from("notice_reactions").select("notice_id")
      .eq("notice_id", noticeId).eq("user_id", userId).eq("reaction", "ack").maybeSingle();
    return !error && !!data === pending.checked ? true : null;
  });
}
