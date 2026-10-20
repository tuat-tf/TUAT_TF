import type { SupabaseClient } from "@supabase/supabase-js";
import { atomicSave } from "@/lib/atomic-save";
import type { PracticeMenu } from "@/types";

export type PendingMenuEdit = {
  id: string;
  scheduleId: string;
  values: Pick<PracticeMenu, "content" | "target_block" | "status" | "pace" | "remark" | "supplement">;
  targetIds: string[];
  uncertain: boolean;
  confirmed: boolean;
};

export async function saveMenuEdit(client: SupabaseClient, attempt: PendingMenuEdit) {
  if (attempt.confirmed) return { ok: true as const, value: attempt.id };
  const value = attempt.values;
  const result = await atomicSave(attempt, async () => {
    const { data, error } = await client.rpc("save_practice_menu", {
      target_schedule_id: attempt.scheduleId, target_menu_id: attempt.id,
      menu_content: value.content, menu_status: value.status, menu_target_block: value.target_block,
      menu_pace: value.pace ?? undefined, menu_remark: value.remark ?? undefined,
      menu_supplement: value.supplement ?? undefined, target_user_ids: attempt.targetIds,
    });
    return { data: data === attempt.id ? attempt.id : null, error };
  }, async () => {
    const { data, error } = await client.from("practice_menus")
      .select("id,schedule_id,content,target_block,status,pace,remark,supplement,targets:practice_menu_targets(user_id)")
      .eq("id", attempt.id).eq("schedule_id", attempt.scheduleId).maybeSingle();
    if (error || !data || !Object.entries(value).every(([key, expected]) => data[key as keyof typeof data] === expected)) return null;
    const expectedIds = new Set(attempt.targetIds);
    if (!Array.isArray(data.targets) || data.targets.length !== expectedIds.size ||
      !data.targets.every(target => expectedIds.has(target.user_id))) return null;
    return attempt.id;
  });
  if (result.ok) attempt.confirmed = true;
  return result;
}
