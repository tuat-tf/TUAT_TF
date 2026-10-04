import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ failFrom: -1, ranges: [] as number[] }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from(table: string) {
  let from = 0, to = 999;
  const query = new Proxy({}, { get: (_, key) => {
    if (key === "range") return (start: number, end: number) => { from = start; to = end; state.ranges.push(start); return query; };
    if (key === "then") return (resolve: (value: unknown) => void) => {
      const rows = table === "notices" ? Array.from({ length: 15 }, (_, index) => ({ id: `notice-${index}` })) : table === "competition_events" ? []
        : Array.from({ length: 1005 }, (_, index) => table === "notice_reactions"
          ? { notice_id: `notice-${Math.floor(index / 67)}`, user_id: `person-${index % 67}`, reaction: "ack" }
          : { id: `result-${index}`, recorded_on: "2026-10-04", stage: "university", event_name: "旧種目名" });
      resolve({ data: from === state.failFrom ? null : rows.slice(from, to + 1), error: from === state.failFrom ? { message: "later page unavailable" } : null });
    };
    return () => query;
  } });
  return query;
} }) }));
import { getNotices } from "./notices";
import { getMonthlyResults, getYearlyResults } from "./monthly-results";
import { getUnregisteredEventNames } from "./competitions";

beforeEach(() => { state.failFrom = -1; state.ranges = []; });
it("counts every notice acknowledgement and keeps the viewer's state beyond row 1000", async () => {
  const notices = await getNotices("person-66");
  expect(notices.every(notice => notice.reaction_counts.ack === 67)).toBe(true);
  expect(notices.at(-1)?.my_reactions).toContain("ack");
});
it.each(["month", "year"])("includes all results in the selected %s beyond row 1000", async period => {
  const rows = period === "month" ? await getMonthlyResults("2026-10") : await getYearlyResults("2026");
  expect(rows).toHaveLength(1005);
});
it("counts every occurrence when proposing unregistered event names", async () => {
  expect(await getUnregisteredEventNames()).toEqual([{ name: "旧種目名", count: 1005 }]);
});
it("does not display a partial acknowledgement count when later rows fail", async () => {
  state.failFrom = 1000;
  await expect(getNotices("viewer")).rejects.toMatchObject({ message: "later page unavailable" });
});
