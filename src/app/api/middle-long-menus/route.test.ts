import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn(), protect: vi.fn() }));
vi.mock("next/server", async original => ({
  ...await original<typeof import("next/server")>(), connection: async () => {},
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "member" } }, error: null }) },
    from: () => {
      const query = { select: () => query, eq: () => query, maybeSingle: mocks.read };
      return query;
    },
  }),
}));
vi.mock("@/lib/supabase/auth", () => ({ getCurrentProfile: async () => ({ roles: [] }) }));
vi.mock("@/lib/permissions", () => ({ permissionsOf: () => ({ createMenu: true }) }));
vi.mock("@/lib/sheet-sync", () => ({ writeMiddleLongMenuToSheet: mocks.write }));
vi.mock("@/lib/middle-long-menu-sheet", () => ({ fetchMiddleLongMenuSnapshot: vi.fn() }));
vi.mock("@/lib/pc-backup-status", () => ({ pcAppWriteProtectionResponse: mocks.protect, pcBackupProtectionResponse: () => null }));
import { POST } from "./route";

const request = () => new Request("https://app.example.invalid/api/middle-long-menus", {
  method: "POST", body: JSON.stringify({ scheduleId: "schedule", content: "1000m" }),
});
beforeEach(() => {
  mocks.read.mockReset();
  mocks.write.mockReset().mockResolvedValue({ ok: true });
  mocks.protect.mockReset().mockResolvedValue(null);
});
it("returns 503 for a failed schedule read without claiming absence or writing a sheet", async () => {
  mocks.read.mockResolvedValue({ data: null, error: { message: "offline" } });
  expect((await POST(request())).status).toBe(503);
  expect(mocks.write).not.toHaveBeenCalled();
});
it("keeps 404 for confirmed absence", async () => {
  mocks.read.mockResolvedValue({ data: null, error: null });
  expect((await POST(request())).status).toBe(404);
  expect(mocks.write).not.toHaveBeenCalled();
});
it("retains protection and the selected practice date on successful writes", async () => {
  mocks.read.mockResolvedValue({ data: { schedule_date: "2026-10-20", schedule_type: "practice" }, error: null });
  expect((await POST(request())).status).toBe(200);
  expect(mocks.protect).toHaveBeenCalledOnce();
  expect(mocks.write).toHaveBeenCalledWith("2026-10-20", { content: "1000m", pace: "", remark: "", supplement: "" });
});
