import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ profile: vi.fn(), snapshot: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/supabase/auth", () => ({ getCurrentProfile: mocks.profile }));
vi.mock("@/lib/queries", () => ({ getAdminDashboard: mocks.snapshot }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/components/features/AdminDashboard", () => ({ AdminDashboard: () => null }));
vi.mock("@/components/layout/SubHeader", () => ({ SubHeader: () => null }));
import AdminPage from "./page";

const role = (system: boolean, members: boolean, suppressed = false) => ({
  can_manage_system: system, can_manage_members: members, permissions_suppressed: suppressed,
});
beforeEach(() => {
  vi.stubGlobal("React", React);
  mocks.redirect.mockImplementation((href: string) => { throw new Error(`redirect:${href}`); });
  mocks.snapshot.mockResolvedValue({ metrics: {}, unavailable: [] });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("admin dashboard entry", () => {
  it.each([
    { roles: [], href: "/home" },
    { roles: [role(false, true)], href: "/admin/members" },
    { roles: [role(true, true, true)], href: "/home" },
  ])("keeps the entry within the user's permissions ($href)", async ({ roles, href }) => {
    mocks.profile.mockResolvedValue({ roles });
    await expect(AdminPage()).rejects.toThrow(`redirect:${href}`);
    expect(mocks.snapshot).not.toHaveBeenCalled();
  });

  it("opens the dashboard with a system role and keeps member management separate", async () => {
    mocks.profile.mockResolvedValue({ roles: [role(false, false), role(true, false)] });
    const page = await AdminPage();
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.snapshot).toHaveBeenCalledOnce();
    expect(page.props.children[1].props.permissions).toMatchObject({ manageSystem: true, manageMembers: false });
  });

  it("does not turn a profile fetch failure into a permission redirect", async () => {
    mocks.profile.mockRejectedValue(new Error("profile unavailable"));
    await expect(AdminPage()).rejects.toThrow("profile unavailable");
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.snapshot).not.toHaveBeenCalled();
  });
});
