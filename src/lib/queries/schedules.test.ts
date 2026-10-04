import { beforeEach, describe, expect, it, vi } from "vitest";

type Schedule = { id: string; schedule_date: string; end_date: string | null; target_blocks: string[] | null };
const state = vi.hoisted(() => ({ rows: [] as Schedule[], filters: [] as string[] }));
vi.mock("@/lib/date", () => ({ jstToday: () => "2026-10-04" }));
vi.mock("@/lib/query-normalize", () => ({ normalizeScheduleRow: (row: Schedule) => row }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from() {
    let limit = 1000;
    const filters: string[] = [];
    const query = new Proxy({}, { get: (_, key) => {
      if (key === "or") return (filter: string) => { filters.push(filter); state.filters.push(filter); return query; };
      if (key === "limit") return (value: number) => { limit = value; return query; };
      if (key === "then") return (resolve: (value: unknown) => void) => {
        const targetFilter = filters.find(filter => filter.includes("target_blocks"));
        const allowed = targetFilter?.match(/target_blocks\.ov\.\{([^}]*)\}/)?.[1].split(",") ?? [];
        const rows = state.rows.filter(row =>
          (row.schedule_date >= "2026-10-04" || (row.end_date ?? "") >= "2026-10-04") &&
          (!targetFilter || !row.target_blocks?.length || row.target_blocks.some(block => allowed.includes(block))),
        ).slice(0, limit);
        resolve({ data: rows, error: null });
      };
      return () => query;
    } });
    return query;
  } }),
}));
import { getAttendanceSchedules, getUpcomingSchedulesWithAttendances } from "./schedules";

describe("upcoming schedules for the viewer", () => {
  beforeEach(() => {
    state.filters = [];
    state.rows = [
      ...Array.from({ length: 200 }, (_, index) => ({ id: `other-${index}`, schedule_date: "2026-10-04", end_date: null, target_blocks: ["short"] })),
      { id: "mine", schedule_date: "2026-10-05", end_date: null, target_blocks: ["middle_long"] },
    ];
  });

  it.each(["home", "schedule"])("does not lose own-block schedules behind other blocks in %s", async view => {
    const rows = view === "home"
      ? await getAttendanceSchedules(["middle_long"], false)
      : await getUpcomingSchedulesWithAttendances(["middle_long"], false);
    expect(rows.map(row => row.id)).toEqual(["mine"]);
  });

  it("keeps public, continuing multiday, and matching schedules and excludes unrelated or finished ones", async () => {
    state.rows = [
      { id: "public-null", schedule_date: "2026-10-04", end_date: null, target_blocks: null },
      { id: "public-empty", schedule_date: "2026-10-04", end_date: null, target_blocks: [] },
      { id: "continuing", schedule_date: "2026-10-02", end_date: "2026-10-05", target_blocks: ["middle_long"] },
      { id: "finished", schedule_date: "2026-10-02", end_date: "2026-10-03", target_blocks: ["middle_long"] },
      { id: "other", schedule_date: "2026-10-04", end_date: null, target_blocks: ["short"] },
    ];
    expect((await getAttendanceSchedules(["middle_long"], false)).map(row => row.id)).toEqual(["public-null", "public-empty", "continuing"]);
    expect(state.filters).toHaveLength(1);
    expect(state.filters[0]).toContain("or(schedule_date.gte.2026-10-04,end_date.gte.2026-10-04)");
    expect(state.filters[0]).toContain("target_blocks.is.null,target_blocks.eq.{},target_blocks.ov.{middle_long}");
  });

  it("keeps all-block access and legacy short-distance membership", async () => {
    expect(await getAttendanceSchedules(["middle_long"], true, 3)).toHaveLength(3);
    state.rows = state.rows.slice(0, 1);
    expect((await getAttendanceSchedules(["jump"], false)).map(row => row.id)).toEqual(["other-0"]);
  });
});
