import { afterEach, beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ competition: { id: "test-meet", starts_on: "2026-10-25", ends_on: null as string | null, archive_at: null, program_source_url: "https://sairiku.net/result/test/shtml/TimeTable.html" } }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/auth", () => ({ fetchRolesByProfileIds: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup: async () => ({ address: "192.0.2.1", family: 4 }) }));
vi.mock("@/lib/pc-cron-forward", () => ({ forwardPcCron: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({
  from: () => {
    const query = { select: () => query, not: () => query, eq: () => query,
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ data: [fixture.competition], error: null })) };
    return query;
  },
}) }));
import { POST } from "./route";

beforeEach(() => {
  vi.useFakeTimers(); vi.stubEnv("SHEET_SYNC_SECRET", "synthetic-cron-secret");
  fixture.competition.ends_on = null;
  // Observe whether the route attempts a fetch, without importing or writing any records.
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response(null, { status: 503 })));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it.each([
  ["2026-10-23T14:59:59Z", false],
  ["2026-10-23T15:00:00Z", true],
  ["2026-10-26T14:59:59Z", true],
  ["2026-10-26T15:00:00Z", false],
])("limits automatic fetching at the JST boundary %s", async (now, fetched) => {
  vi.setSystemTime(new Date(now));
  await POST(new Request("https://app.example/api/competition-program/sync", { method: "POST", headers: { authorization: "Bearer synthetic-cron-secret" }, body: "{}" }));
  expect(fetch).toHaveBeenCalledTimes(fetched ? 1 : 0);
});

it("uses the last day for a multi-day meet and preserves explicit manual fetching afterward", async () => {
  fixture.competition.ends_on = "2026-10-27";
  for (const [now, body, expected] of [
    ["2026-10-28T14:59:59Z", {}, 1],
    ["2026-10-28T15:00:00Z", {}, 0],
    ["2026-10-28T15:00:00Z", { competitionId: "test-meet", dryRun: true }, 1],
  ] as const) {
    vi.setSystemTime(new Date(now)); vi.mocked(fetch).mockClear();
    await POST(new Request("https://app.example/api/competition-program/sync", { method: "POST", headers: { authorization: "Bearer synthetic-cron-secret" }, body: JSON.stringify(body) }));
    expect(fetch).toHaveBeenCalledTimes(expected);
  }
});
