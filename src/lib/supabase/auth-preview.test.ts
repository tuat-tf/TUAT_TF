import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppRole } from "@/types";
const mocks = vi.hoisted(() => ({ preview: false, role: {} as AppRole }));
vi.mock("@/lib/supabase/role-catalog", () => ({ getSharedRoleCatalog: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: mocks.preview ? "1" : "0" }) }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({
  auth: { getClaims: async () => ({ data: { claims: { sub: "me" } }, error: null }) },
  from: (table: string) => ({ select: () => {
    if (table === "roles") return Promise.resolve({ data: [mocks.role], error: null });
    if (table === "profile_roles") return { in: async () => ({ data: [{ profile_id: "me", role_id: mocks.role.id }], error: null }) };
    return { eq: () => ({ maybeSingle: async () => ({ data: { id: "me", display_name: "本人", blocks: [], status: "active", approved: true }, error: null }) }) };
  } }),
}) }));
import { getCurrentProfile } from "./auth";

beforeEach(() => {
  mocks.preview = false;
  mocks.role = {
    id: "operator", name: "改名した管理担当", can_manage_system: true, can_manage_members: true,
    can_moderate_comments: true, can_manage_ob_meet: true, can_create_schedule: true,
    can_create_menu: true, can_create_notice: true, can_decide_practice: true,
    editable_menu_blocks: ["short", "middle_long"], is_system: false, is_everyone: false,
    color: "blue", category: null, sort_order: 0, created_at: "2026-10-13",
  };
});

describe("member preview permissions", () => {
  it("clears every operation and menu scope while keeping role display and the real profile", async () => {
    mocks.preview = true;
    const displayed = await getCurrentProfile();
    expect(displayed.roles[0]).toMatchObject({
      name: mocks.role.name, permissions_suppressed: true,
      can_manage_system: false, can_manage_members: false, can_moderate_comments: false,
      can_manage_ob_meet: false, can_create_schedule: false, can_create_menu: false,
      can_create_notice: false, can_decide_practice: false, editable_menu_blocks: [],
    });
    expect(mocks.role.can_manage_system).toBe(true);
  });
  it("keeps the real permissions outside preview and ignores preview cookies without system permission", async () => {
    expect((await getCurrentProfile()).roles[0]).toEqual(mocks.role);
    mocks.preview = true;
    mocks.role = { ...mocks.role, can_manage_system: false };
    expect((await getCurrentProfile()).roles[0]).toEqual(mocks.role);
  });
});
