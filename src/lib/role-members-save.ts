import type { SupabaseClient } from "@supabase/supabase-js";
import { atomicSave } from "@/lib/atomic-save";
import type { AppRole, Profile } from "@/types";

export type PendingRoleMembers = { roleId: string; memberIds: string[]; uncertain: boolean };

export function applyRoleMembers(members: Profile[], role: AppRole, memberIds: string[]): Profile[] {
  const selected = new Set(memberIds);
  return members.map(member => ({
    ...member,
    roles: selected.has(member.id)
      ? [...member.roles.filter(item => item.id !== role.id), role]
      : member.roles.filter(item => item.id !== role.id),
  }));
}

export function saveRoleMembers(client: SupabaseClient, pending: PendingRoleMembers) {
  return atomicSave(pending, async () => {
    const { error } = await client.rpc("set_role_members", {
      target_role_id: pending.roleId, target_profile_ids: pending.memberIds,
    });
    return { data: error ? null : true, error };
  }, async () => {
    const { data, error } = await client.from("profile_roles").select("profile_id").eq("role_id", pending.roleId);
    if (error || !data) return null;
    const expected = new Set(pending.memberIds);
    return data.length === expected.size && data.every(row => expected.has(row.profile_id)) ? true : null;
  });
}
