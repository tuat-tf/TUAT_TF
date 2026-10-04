import { expect, it, vi } from "vitest";
import { safeDelete } from "./safe-update";
import type { createClient } from "./supabase/client";

function client(response: { data: { id: string }[] | null; error: unknown }, uncertain = false) {
  const select = uncertain ? vi.fn().mockRejectedValue(new Error("connection lost")) : vi.fn().mockResolvedValue(response);
  const match = vi.fn(() => ({ select }));
  const remove = vi.fn(() => ({ match }));
  const from = vi.fn(() => ({ delete: remove }));
  const refreshSession = vi.fn();
  return { supabase: { from, auth: { refreshSession } } as unknown as ReturnType<typeof createClient>, from, remove, match, select, refreshSession };
}

it("confirms the deleted row before the UI can remove it", async () => {
  const test = client({ data: [{ id: "row" }], error: null });
  expect(await safeDelete(test.supabase, "notes", { id: "row" })).toEqual({ ok: true });
  expect(test.match).toHaveBeenCalledWith({ id: "row" });
  expect(test.select).toHaveBeenCalledWith("id");
});

it("does not acknowledge a denied or missing deletion or retry after it", async () => {
  for (const data of [null, [], [{ id: "a" }, { id: "b" }]]) {
    const test = client({ data, error: null });
    expect(await safeDelete(test.supabase, "notes", { id: "row" })).toEqual({ ok: false, reason: "blocked" });
    expect(test.remove).toHaveBeenCalledTimes(1);
    expect(test.refreshSession).not.toHaveBeenCalled();
  }
});

it("keeps error and lost-response deletions failed without automatic replay", async () => {
  for (const uncertain of [false, true]) {
    const test = client({ data: null, error: { message: "denied" } }, uncertain);
    expect(await safeDelete(test.supabase, "notes", { id: "row" })).toEqual({ ok: false, reason: "error" });
    expect(test.remove).toHaveBeenCalledTimes(1);
    expect(test.refreshSession).not.toHaveBeenCalled();
  }
});
it("requires one identified row before issuing a deletion", async () => {
  const test = client({ data: [], error: null });
  expect(await safeDelete(test.supabase, "notes", { author_id: "owner" })).toEqual({ ok: false, reason: "blocked" });
  expect(test.from).not.toHaveBeenCalled();
});

it("confirms competition events using their name primary key", async () => {
  const test = client({ data: [{ id: "unused" }], error: null });
  expect(await safeDelete(test.supabase, "competition_events", { name: "男子100m" })).toEqual({ ok: true });
  expect(test.select).toHaveBeenCalledWith("name");
});
