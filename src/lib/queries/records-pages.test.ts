import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ failFrom: -1, ranges: [] as number[], users: [] as string[], orders: [] as string[][] }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from(table: string) {
  let from = 0, to = 999, userId = "";
  const orders: { column: string; ascending: boolean; nullsFirst: boolean }[] = [];
  const query = {
    select: () => query,
    eq: (column: string, value: string) => { if (column === "user_id") { userId = value; state.users.push(value); } return query; },
    order: (column: string, options: { ascending?: boolean; nullsFirst?: boolean } = {}) => {
      orders.push({ column, ascending: options.ascending ?? true, nullsFirst: options.nullsFirst ?? false }); return query;
    },
    range: (start: number, end: number) => { from = start; to = end; state.ranges.push(start); return query; },
    then: (resolve: (value: unknown) => void) => {
      if (table !== "pb_records") throw Error("Unexpected source");
      state.orders.push(orders.map(order => order.column));
      const rows = Array.from({ length: 1008 }, (_, index) => ({
        id: `result-${String(index).padStart(4, "0")}`, user_id: index < 1005 ? "member" : "other",
        recorded_on: index < 1000 ? "2026-10-04" : null, is_pb: index === 1004,
      })).reverse().filter(row => row.user_id === userId).sort((a, b) => {
        for (const order of orders) {
          const av = a[order.column as "id" | "recorded_on"], bv = b[order.column as "id" | "recorded_on"];
          if (av === bv) continue;
          if (av === null) return order.nullsFirst ? -1 : 1;
          if (bv === null) return order.nullsFirst ? 1 : -1;
          return av.localeCompare(bv) * (order.ascending ? 1 : -1);
        }
        return 0;
      });
      resolve({ data: from === state.failFrom ? null : rows.slice(from, Math.min(to + 1, from + 1000)), error: from === state.failFrom ? { message: "later results unavailable" } : null });
    },
  };
  return query;
} }) }));
import { getPbRecords } from "./records";

beforeEach(() => { state.failFrom = -1; state.ranges = []; state.users = []; state.orders = []; });
it("keeps all 1005 personal results, including the older PB, with stable date/id order and the same owner filter on every page", async () => {
  const rows = await getPbRecords("member");
  expect(rows).toHaveLength(1005);
  expect(rows.at(-1)).toMatchObject({ id: "result-1004", recorded_on: null, is_pb: true });
  expect(rows.slice(0, 1000).every(row => row.recorded_on === "2026-10-04")).toBe(true);
  expect(new Set(rows.map(row => row.id)).size).toBe(1005);
  expect(state.ranges).toEqual([0, 1000]);
  expect(state.users).toEqual(["member", "member"]);
  expect(state.orders).toEqual([["recorded_on", "id"], ["recorded_on", "id"]]);
});
it("rejects a failed later results page rather than presenting a shortened history", async () => {
  state.failFrom = 1000;
  await expect(getPbRecords("member")).rejects.toMatchObject({ message: "later results unavailable" });
});
