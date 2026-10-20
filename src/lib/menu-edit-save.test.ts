import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { saveMenuEdit, type PendingMenuEdit } from "./menu-edit-save";

it("checks a fixed menu and its targets after a lost response without resubmitting", async () => {
  const pending: PendingMenuEdit = { id: "menu", scheduleId: "schedule",
    values: { content: "1000m", status: "published", target_block: "middle_long", pace: null, remark: null, supplement: null },
    targetIds: ["member"], uncertain: false, confirmed: false };
  const rpc = vi.fn().mockRejectedValue(new Error("response lost"));
  const read = vi.fn().mockResolvedValueOnce({ data: null, error: { message: "offline" } })
    .mockResolvedValueOnce({ data: { ...pending.values, targets: [] }, error: null })
    .mockResolvedValueOnce({ data: { ...pending.values, targets: [{ user_id: "member" }] }, error: null });
  const query = { select: () => query, eq: () => query, maybeSingle: read };
  const client = { rpc, from: () => query } as unknown as SupabaseClient;
  expect(await saveMenuEdit(client, pending)).toEqual({ ok: false, reason: "unknown" });
  expect(await saveMenuEdit(client, pending)).toEqual({ ok: false, reason: "unknown" });
  expect(await saveMenuEdit(client, pending)).toEqual({ ok: true, value: "menu" });
  expect(rpc).toHaveBeenCalledOnce();
  // A completion callback may fail after confirmation; repeating completion must not save again.
  expect(await saveMenuEdit(client, pending)).toEqual({ ok: true, value: "menu" });
  expect(rpc).toHaveBeenCalledOnce();
  expect(read).toHaveBeenCalledTimes(3);
});

describe("definitive menu refusal", () => {
  it("leaves input editable after a transactional rejection", async () => {
    const pending: PendingMenuEdit = { id: "menu", scheduleId: "schedule",
      values: { content: "1000m", status: "published", target_block: "middle_long", pace: null, remark: null, supplement: null },
      targetIds: [], uncertain: false, confirmed: false };
    const client = { rpc: vi.fn().mockResolvedValue({ data: null, error: { code: "42501" } }) } as unknown as SupabaseClient;
    expect(await saveMenuEdit(client, pending)).toEqual({ ok: false, reason: "forbidden" });
    expect(pending.uncertain).toBe(false);
  });
});
