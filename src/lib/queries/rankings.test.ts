import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  records: [] as Record<string, unknown>[],
  profiles: [] as Record<string, unknown>[],
  failFrom: -1,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from(table: string) {
      let from = 0, to = 999;
      let ids: string[] | undefined;
      const query = new Proxy({}, {
        get: (_, key) => {
          if (key === "then") return (resolve: (value: unknown) => void) => resolve(
            table === "practice_records"
              ? { data: from === state.failFrom ? null : state.records.slice(from, Math.min(to + 1, from + 1000)), error: from === state.failFrom ? { message: "second page unavailable" } : null }
              : { data: state.profiles.filter(profile => !ids || ids.includes(profile.id as string)), error: null },
          );
          if (key === "range") return (start: number, end: number) => { from = start; to = end; return query; };
          if (key === "in") return (_column: string, values: string[]) => { ids = values; return query; };
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
    state.profiles = Array.from({ length: 40 }, (_, index) => ({ id: `person-${index}`, display_name: `部員${index}`, grade: "B1", blocks: ["middle_long"], avatar_url: null }));
    state.records = state.profiles.flatMap(profile => Array.from({ length: 31 }, (_, day) => ({ id: `${profile.id}-${day}`, user_id: profile.id, dist_low: 10, dist_mid: 0, dist_high: 0, dist_speed: 0, dist_actual: 10 })));
  });

  it("includes every member and daily distance beyond the database's 1000-row cap", async () => {
    const rows = await getMonthlyRanking("2026-10-01", "2026-10-31");
    expect(rows).toHaveLength(40);
    expect(rows.every(row => row.total_km === 310)).toBe(true);
    expect(rows.reduce((total, row) => total + row.total_km, 0)).toBe(12_400);
  });

  it("does not display a partial ranking when a later page fails", async () => {
    state.failFrom = 1000;
    await expect(getMonthlyRanking("2026-10-01", "2026-10-31")).rejects.toBeDefined();
  });

  it("keeps an empty month empty", async () => {
    state.records = [];
    expect(await getMonthlyRanking("2026-10-01", "2026-10-31")).toEqual([]);
  });
});
