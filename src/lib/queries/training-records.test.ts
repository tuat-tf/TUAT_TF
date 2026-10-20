import { beforeEach, expect, it, vi } from "vitest";
import { RECORD_NONEMPTY_OR } from "@/lib/record-content";
const state = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], calls: [] as [string, unknown[]][], rpc: vi.fn(), failFrom: -1 }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({
  rpc: state.rpc,
  from() {
    let from = 0, to = 999;
    const query = new Proxy({}, { get: (_, key) => {
      if (key === "then") return (resolve: (value: unknown) => void) => resolve({ data: state.rows.slice(from, to + 1), error: from === state.failFrom ? { message: "unavailable" } : null });
      return (...args: unknown[]) => {
        state.calls.push([String(key), args]);
        if (key === "range") [from, to] = args as number[];
        return query;
      };
    } });
    return query;
  },
}) }));
import { getUserTrainingRecords } from "./records";
beforeEach(() => { state.rows = []; state.calls = []; state.failFrom = -1; state.rpc.mockReset(); });
const record = (id: string) => ({
  id, recorded_date: "2026-10-01", dist_low: null, dist_mid: 2, dist_high: 0, dist_speed: 0, dist_actual: 3,
  strides: 0, condition: "normal", result_text: "結果", strength_text: "補強", memo: "感想", menu_text: "メニュー",
  focus_text: "目的", custom: { sleep: 8 }, record_fields_version: null,
});
it("retains full review values but omits unused metadata and legacy definition requests", async () => {
  state.rows = [record("one")];
  const result = await getUserTrainingRecords("me");
  expect(result[0]).toMatchObject({ dist_low: 0, result_text: "結果", memo: "感想", menu_text: "メニュー", focus_text: "目的", custom: { sleep: 8 } });
  expect(state.calls.find(([key]) => key === "select")![1][0]).not.toMatch(/likes_count|updated_at|synced_at|pending_sheet_push|user_id/);
  expect(state.calls).toContainEqual(["or", [RECORD_NONEMPTY_OR]]);
  expect(state.calls.some(([key]) => key === "lte")).toBe(true);
  expect(state.rpc).not.toHaveBeenCalled();
});
it("loads historical field names only for versioned records", async () => {
  state.rows = [record("legacy"), { ...record("historical"), record_fields_version: 2 }];
  state.rpc.mockResolvedValue({ data: [{ record_ids: ["historical"], record_fields_version: 2, fields: [{ key: "memo", label: "当時の名前", type: "text" }] }], error: null });
  const result = await getUserTrainingRecords("me");
  expect(state.rpc).toHaveBeenCalledExactlyOnceWith("get_record_field_groups", { requested_record_ids: ["historical"] });
  expect(result[1].record_fields_snapshot?.[0].label).toBe("当時の名前");
});
it("reads every page and fails instead of displaying a partial history", async () => {
  state.rows = Array.from({ length: 1001 }, (_, i) => record(String(i)));
  expect(await getUserTrainingRecords("me")).toHaveLength(1001);
  state.failFrom = 1000;
  await expect(getUserTrainingRecords("me")).rejects.toMatchObject({ message: "unavailable" });
});
