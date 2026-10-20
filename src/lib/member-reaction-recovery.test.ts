import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { applyRoleMembers, saveRoleMembers, type PendingRoleMembers } from "./role-members-save";
import { saveNoticeReaction } from "./notice-reaction-save";
import type { AppRole, Profile } from "@/types";

function database() {
  const rpc = vi.fn();
  const write = vi.fn();
  const read = vi.fn();
  const from = vi.fn(() => {
    let writing = false;
    const query = {
      select: () => query, eq: () => query,
      delete: () => { writing = true; return query; },
      upsert: () => { writing = true; return query; },
      single: () => write(),
      maybeSingle: () => read(),
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
        (writing ? write() : read()).then(resolve, reject),
    };
    return query;
  });
  return { client: { rpc, from } as unknown as SupabaseClient, rpc, write, read };
}

describe("role membership confirmation", () => {
  it("never resends an unknown role write and confirms the same complete membership", async () => {
    const db = database();
    db.rpc.mockRejectedValue(new Error("response lost"));
    db.read.mockResolvedValueOnce({ data: null, error: { message: "offline" } })
      .mockResolvedValueOnce({ data: [{ profile_id: "other" }], error: null })
      .mockResolvedValueOnce({ data: [{ profile_id: "member" }], error: null });
    const pending: PendingRoleMembers = { roleId: "role", memberIds: ["member"], uncertain: false };
    expect(await saveRoleMembers(db.client, pending)).toEqual({ ok: false, reason: "unknown" });
    expect(await saveRoleMembers(db.client, pending)).toEqual({ ok: false, reason: "unknown" });
    expect(await saveRoleMembers(db.client, pending)).toEqual({ ok: true, value: true });
    expect(db.rpc).toHaveBeenCalledOnce();
  });

  it("preserves another role's successful change when a delayed role write fails", async () => {
    const db = database();
    let failFirst!: (result: unknown) => void;
    db.rpc.mockImplementationOnce(() => new Promise(resolve => { failFirst = resolve; }))
      .mockResolvedValueOnce({ data: null, error: null });
    const roleA = { id: "a" } as AppRole;
    const roleB = { id: "b" } as AppRole;
    let members = [{ id: "member", roles: [] }] as unknown as Profile[];
    const save = async (role: AppRole) => {
      const result = await saveRoleMembers(db.client, { roleId: role.id, memberIds: ["member"], uncertain: false });
      if (result.ok) members = applyRoleMembers(members, role, ["member"]);
    };
    const first = save(roleA);
    await save(roleB);
    failFirst({ data: null, error: { code: "42501" } });
    await first;
    expect(members[0].roles.map(role => role.id)).toEqual(["b"]);
  });
});

describe("notice acknowledgment confirmation", () => {
  it("recovers a committed cancellation after its response was lost without deleting again", async () => {
    const db = database();
    db.write.mockRejectedValue(new Error("response lost"));
    db.read.mockResolvedValueOnce({ data: null, error: { message: "offline" } })
      .mockResolvedValueOnce({ data: null, error: null });
    const pending = { checked: false, uncertain: false };
    expect(await saveNoticeReaction(db.client, "notice", "user", pending)).toEqual({ ok: false, reason: "unknown" });
    expect(await saveNoticeReaction(db.client, "notice", "user", pending)).toEqual({ ok: true, value: true });
    expect(db.write).toHaveBeenCalledOnce();
  });

  it("confirms an already absent acknowledgment after a zero-row cancellation", async () => {
    const db = database();
    db.write.mockResolvedValue({ data: [], error: null });
    db.read.mockResolvedValue({ data: null, error: null });
    expect(await saveNoticeReaction(db.client, "notice", "user", { checked: false, uncertain: false })).toEqual({ ok: true, value: true });
  });

  it("does not turn an unsuccessful read into a confirmed cancellation", async () => {
    const db = database();
    db.write.mockResolvedValue({ data: null, error: { message: "offline" } });
    db.read.mockResolvedValue({ data: null, error: { message: "offline" } });
    const pending = { checked: false, uncertain: false };
    expect(await saveNoticeReaction(db.client, "notice", "user", pending)).toEqual({ ok: false, reason: "unknown" });
    expect(await saveNoticeReaction(db.client, "notice", "user", pending)).toEqual({ ok: false, reason: "unknown" });
    expect(db.write).toHaveBeenCalledOnce();
  });
});
