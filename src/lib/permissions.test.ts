import { describe, expect, it } from "vitest";
import { hasPermission, permissionsOf } from "./permissions";
import type { AppRole } from "@/types";

function role(overrides: Partial<AppRole> = {}): AppRole {
  return {
    id: "role",
    name: "Role",
    can_manage_system: false,
    can_manage_members: false,
    can_moderate_comments: false,
    can_manage_ob_meet: false,
    can_create_schedule: false,
    can_create_menu: false,
    editable_menu_blocks: [],
    can_create_notice: false,
    can_decide_practice: false,
    is_system: false,
    is_everyone: false,
    color: "#000000",
    category: null,
    sort_order: 0,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("permissions", () => {
  it("denies every permission without roles", () => {
    expect(permissionsOf(undefined)).toEqual({
      manageSystem: false, manageMembers: false, createSchedule: false,
      moderateComments: false, manageObMeet: false,
      createMenu: false, createNotice: false, decidePractice: false,
    });
  });
  it("recognizes practice-decision permission independently", () => {
    expect(hasPermission([role({ can_decide_practice: true })], "decide_practice")).toBe(true);
    expect(hasPermission([role({ can_manage_system: true })], "decide_practice")).toBe(false);
  });
  it("combines permissions from multiple roles", () => {
    const value = permissionsOf([
      role({ can_create_schedule: true }),
      role({ id: "two", can_create_notice: true }),
    ]);
    expect(value.createSchedule).toBe(true);
    expect(value.createNotice).toBe(true);
    expect(value.manageMembers).toBe(false);
  });
  it("recognizes system management", () => {
    expect(hasPermission([role({ can_manage_system: true })], "manage_system")).toBe(true);
  });
  it("does not infer member management from system management", () => {
    expect(hasPermission([role({ can_manage_system: true })], "manage_members")).toBe(false);
  });
  it("recognizes menu creation independently", () => {
    expect(hasPermission([role({ can_create_menu: true })], "create_menu")).toBe(true);
  });
  it("keeps explicit moderation and OB permissions through renaming and combines roles", () => {
    const value = permissionsOf([
      role({ name: "新しい管理担当", can_moderate_comments: true }),
      role({ id: "ob", name: "大会担当", can_manage_ob_meet: true }),
    ]);
    expect(value.moderateComments).toBe(true);
    expect(value.manageObMeet).toBe(true);
    expect(value.manageSystem).toBe(false);
    expect(value.manageMembers).toBe(false);
    expect(permissionsOf([role({ name: "管理者" }), role({ name: "OB戦2026" })]))
      .toMatchObject({ moderateComments: false, manageObMeet: false });
  });
  it("suppresses every granted permission during member preview", () => {
    expect(permissionsOf([role({
      can_manage_system: true, can_manage_members: true, can_moderate_comments: true,
      can_manage_ob_meet: true, can_create_schedule: true, can_create_menu: true,
      can_create_notice: true, can_decide_practice: true, permissions_suppressed: true,
    })])).toEqual(permissionsOf([]));
  });
});
