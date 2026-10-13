import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: { id: "administrator" } as { id: string } | null,
  authError: null as unknown,
  canManage: true,
  canManageSystem: false,
  preview: false,
  results: {} as Record<string, { data: unknown; error: unknown; count?: number | null }>,
  admin: vi.fn(),
  roles: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({
  auth: { getUser: async () => ({ data: { user: state.user }, error: state.authError }) },
}) }));
vi.mock("@/lib/supabase/auth", () => ({ fetchRolesByProfileIds: state.roles }));
vi.mock("@/lib/permissions", () => ({ permissionsOf: () => ({ manageMembers: state.canManage, manageSystem: state.canManageSystem }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: state.admin }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => state.preview ? { value: "1" } : undefined }) }));

import { GET } from "./route";

const finishedAt = "2026-10-06T15:00:05.123456+00:00";
const failure = { member: "synthetic-member", reason: "POST required" };
const resolvedFailure = {
  ...failure,
  resolved_at: "2026-10-07T06:00:00.000Z",
  resolution: "verified_writable_cells_match",
};

function setRun(failedMembers: unknown, status = "error", finished: string | null = finishedAt) {
  const run = {
    status,
    started_at: "2026-10-06T15:00:00.000Z",
    finished_at: finished,
    pulled_count: 12,
    pushed_count: 2,
    failed_members: failedMembers,
  };
  state.results.sheet_sync_runs = { data: [run], error: null };
  return run;
}

beforeEach(() => {
  state.user = { id: "administrator" };
  state.authError = null;
  state.canManage = true;
  state.canManageSystem = false;
  state.preview = false;
  state.roles.mockReset().mockResolvedValue(new Map());
  state.results = {
    sheet_sync_runs: { data: [], error: null },
    practice_records: { data: null, count: 1, error: null },
    profiles: { data: null, count: 3, error: null },
  };
  state.admin.mockReset().mockImplementation(() => ({
    from(table: string) {
      const query = {
        select: () => query,
        order: () => query,
        limit: () => query,
        eq: () => query,
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(state.results[table]).then(resolve),
      };
      return query;
    },
  }));
});

describe("sheet sync health after audited reconciliation", () => {
  it("keeps a fatal run with no member failures visible", async () => {
    setRun([]);
    const response = await GET();
    expect(response.status).toBe(200);
    expect((await response.json()).latest).toMatchObject({
      status: "error", failedCount: 0, rawFailedCount: 0, resolvedCount: 0, hasIssue: true,
    });
  });

  it("reports only unresolved member failures, while preserving the error run and pending writes", async () => {
    const run = setRun([resolvedFailure]);
    const original = structuredClone(run);
    const response = await GET();
    expect(await response.json()).toMatchObject({
      latest: { status: "error", failedCount: 0, rawFailedCount: 1, resolvedCount: 1, hasIssue: false },
      pendingPushCount: 1,
      sheetProfileCount: 3,
    });
    expect(run).toEqual(original);
  });

  it("keeps a partially reconciled run visible", async () => {
    setRun([resolvedFailure, { ...failure, member: "second-member" }]);
    expect((await (await GET()).json()).latest).toMatchObject({
      failedCount: 1, rawFailedCount: 2, resolvedCount: 1, hasIssue: true,
    });
  });

  it("counts unresolved member failures even when the run status is not error", async () => {
    setRun([failure], "partial");
    expect((await (await GET()).json()).latest).toMatchObject({ failedCount: 1, hasIssue: true });
  });

  it.each([
    ["missing metadata", failure],
    ["unrecognized resolution", { ...resolvedFailure, resolution: "assumed_success" }],
    ["missing resolution timestamp", { ...resolvedFailure, resolved_at: undefined }],
    ["non-string timestamp", { ...resolvedFailure, resolved_at: 1791331200000 }],
    ["invalid timestamp", { ...resolvedFailure, resolved_at: "invalid" }],
    ["timezone-free timestamp", { ...resolvedFailure, resolved_at: "2026-10-07T06:00:00" }],
    ["invalid calendar date", { ...resolvedFailure, resolved_at: "2026-11-31T06:00:00Z" }],
    ["resolution before completion", { ...resolvedFailure, resolved_at: "2026-10-06T15:00:00Z" }],
    ["resolution before completion within the same millisecond", { ...resolvedFailure, resolved_at: "2026-10-06T15:00:05.123455Z" }],
    ["missing member", { ...resolvedFailure, member: undefined }],
    ["missing failure reason", { ...resolvedFailure, reason: undefined }],
    ["non-object failure", null],
  ])("does not suppress %s", async (_label, invalidFailure) => {
    setRun([invalidFailure]);
    expect((await (await GET()).json()).latest).toMatchObject({
      failedCount: 1, resolvedCount: 0, hasIssue: true,
    });
  });

  it.each([null, "invalid", "2026-02-30T15:00:05Z"])("does not resolve a run with invalid completion time %s", async completion => {
    setRun([resolvedFailure], "error", completion);
    expect((await (await GET()).json()).latest).toMatchObject({ failedCount: 1, resolvedCount: 0, hasIssue: true });
  });

  it.each([
    "2026-10-06T15:00:05.123456Z",
    "2026-10-07T00:00:05.123456+09:00",
  ])("accepts a verified resolution exactly at completion: %s", async resolvedAt => {
    setRun([{ ...resolvedFailure, resolved_at: resolvedAt }]);
    expect((await (await GET()).json()).latest).toMatchObject({ failedCount: 0, resolvedCount: 1, hasIssue: false });
  });

  it("reports absent history separately from a successful run", async () => {
    expect((await (await GET()).json()).latest).toBeNull();
    setRun([], "success");
    expect((await (await GET()).json()).latest).toMatchObject({ failedCount: 0, hasIssue: false });
  });

  it.each(["sheet_sync_runs", "practice_records", "profiles"])("returns a server error when %s cannot be read", async table => {
    state.results[table].error = { message: "synthetic read failure" };
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "同期状態を取得できませんでした。時間をおいて再確認してください。" });
  });

  it("requires a verified user and management permission before reading administrator data", async () => {
    state.user = null;
    expect((await GET()).status).toBe(401);
    state.user = { id: "member" };
    state.canManage = false;
    expect((await GET()).status).toBe(403);
    expect(state.admin).not.toHaveBeenCalled();
  });

  it("rejects an authentication error even if a user object is present", async () => {
    state.authError = { message: "synthetic authentication failure" };
    expect((await GET()).status).toBe(401);
    expect(state.roles).not.toHaveBeenCalled();
    expect(state.admin).not.toHaveBeenCalled();
  });

  it.each(["members", "system"])("keeps %s management permission sufficient", async permission => {
    state.canManage = permission === "members";
    state.canManageSystem = permission === "system";
    expect((await GET()).status).toBe(200);
    expect(state.roles).toHaveBeenCalledWith(expect.anything(), ["administrator"]);
  });

  it("rejects a member preview before reading administrator data", async () => {
    state.preview = true;
    expect((await GET()).status).toBe(403);
    expect(state.admin).not.toHaveBeenCalled();
  });

  it("keeps exact zero counts", async () => {
    state.results.practice_records.count = 0;
    state.results.profiles.count = 0;
    setRun([], "success");
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ pendingPushCount: 0, sheetProfileCount: 0 });
  });

  it.each(["practice_records", "profiles"])("does not invent zero when %s count is unavailable", async table => {
    for (const count of [null, undefined]) {
      state.results[table].count = count;
      const response = await GET();
      expect(response.status).toBe(503);
      expect(await response.json()).not.toHaveProperty("pendingPushCount");
    }
  });

  it.each(["pulled_count", "pushed_count"])("does not invent zero when the last run's %s is unavailable", async key => {
    const run = setRun([], "success");
    state.results.sheet_sync_runs.data = [{ ...run, [key]: null }];
    expect((await GET()).status).toBe(503);
  });

  it("does not treat a missing run query result as absent history", async () => {
    state.results.sheet_sync_runs.data = null;
    expect((await GET()).status).toBe(503);
  });

  it("does not suppress unavailable failure metadata", async () => {
    setRun(null, "success");
    expect((await GET()).status).toBe(503);
  });

  it("preserves a running run without claiming completion", async () => {
    setRun([], "running", null);
    expect((await (await GET()).json()).latest).toMatchObject({ status: "running", finishedAt: null });
  });

  it("returns a safe response when permissions or administrator setup fail", async () => {
    state.roles.mockRejectedValueOnce(new Error("synthetic-secret-permission"));
    let response = await GET();
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("synthetic-secret");
    expect(state.admin).not.toHaveBeenCalled();
    state.admin.mockImplementationOnce(() => { throw new Error("synthetic-secret-administrator"); });
    response = await GET();
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("synthetic-secret");
  });

  it.each([200, 401, 403, 503])("keeps status %s private and uncached", async status => {
    if (status === 401) state.user = null;
    if (status === 403) state.preview = true;
    if (status === 503) state.results.profiles.error = { message: "synthetic read failure" };
    const response = await GET();
    expect(response.status).toBe(status);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Vary")).toBe("Cookie");
  });
});
