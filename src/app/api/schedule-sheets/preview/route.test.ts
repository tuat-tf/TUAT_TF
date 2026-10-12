import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
import { POST } from "./route";

type Result = { data: unknown; error: { message: string } | null };
let results: Record<string, Result>;

function query(table: string) {
  const chain = {
    select: () => chain, eq: () => chain, order: () => chain,
    gte: () => chain, lt: () => chain, maybeSingle: () => chain,
    then: (resolve: (result: Result) => unknown) => Promise.resolve(results[table]).then(resolve),
  };
  return chain;
}
beforeEach(() => {
  results = {
    schedule_sheets: { data: { id: "sheet", kind: "practice", target_year: 2026, target_month: 10, target_block: "all" }, error: null },
    venues: { data: [], error: null },
    practice_schedules: { data: [], error: null },
  };
  mocks.createClient.mockResolvedValue({ from: query, auth: { getUser: async () => ({ data: { user: { id: "me" } } }) } });
});
function request() {
  return new Request("http://localhost/api/schedule-sheets/preview", {
    method: "POST", body: JSON.stringify({ sheetId: "sheet", csv: "日付,時間\n2026-10-13,07:00" }),
  });
}

it.each(["schedule_sheets", "venues", "practice_schedules"])("a failed %s lookup does not become a missing sheet or an additions preview", async (table) => {
  results[table] = { data: null, error: { message: "unavailable" } };
  const response = await POST(request());
  expect(response.status).toBe(500);
  const body = await response.json();
  expect(body.error).toContain("取得できませんでした");
  expect(body.additions).toBeUndefined();
});

it("keeps a genuinely inaccessible/missing sheet as 404", async () => {
  results.schedule_sheets = { data: null, error: null };
  expect((await POST(request())).status).toBe(404);
});

it("a successful empty existing-schedule lookup permits a new row preview", async () => {
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect((await response.json()).additions).toHaveLength(1);
});
