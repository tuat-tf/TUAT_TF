import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  profiles: [] as Record<string, unknown>[],
  failFrom: -1,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc(name: string, args: unknown) {
      expect(name).toBe("get_monthly_distance_ranking");
      expect(args).toEqual({ period_start: "2026-10-01", period_end: "2026-10-31" });
      let from = 0, to = 999;
      const query = new Proxy({}, {
        get: (_, key) => {
          if (key === "then") return (resolve: (value: unknown) => void) => resolve(
            { data: from === state.failFrom ? null : state.profiles.slice(from, Math.min(to + 1, from + 1000)), error: from === state.failFrom ? { message: "second page unavailable" } : null },
          );
          if (key === "range") return (start: number, end: number) => { from = start; to = end; return query; };
          return () => query;
        },
      });
      return query;
    },
  }),
}));
import { getMonthlyRanking } from "./rankings";

describe("monthly distance ranking", () => {
  beforeEach(() => {
    state.failFrom = -1;
    state.profiles = Array.from({ length: 1005 }, (_, index) => ({ id: `person-${index}`, display_name: `部員${index}`, grade: "B1", blocks: ["middle_long"], avatar_url: null, km_low: 310, km_mid: 0, km_high: 0, km_speed: 0, km_other: 0, total_km: 310 }));
  });

  it("includes every member and daily distance beyond the database's 1000-row cap", async () => {
    const rows = await getMonthlyRanking("2026-10-01", "2026-10-31");
    expect(rows).toHaveLength(1005);
    expect(rows.every(row => row.total_km === 310)).toBe(true);
    expect(rows.reduce((total, row) => total + row.total_km, 0)).toBe(311_550);
  });

  it("does not display a partial ranking when a later page fails", async () => {
    state.failFrom = 1000;
    await expect(getMonthlyRanking("2026-10-01", "2026-10-31")).rejects.toBeDefined();
  });

  it("keeps an empty month empty", async () => {
    state.profiles = [];
    expect(await getMonthlyRanking("2026-10-01", "2026-10-31")).toEqual([]);
  });
});
