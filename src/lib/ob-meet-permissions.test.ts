import { describe, expect, it } from "vitest";
import { canManageObMeet, canRecordObMeet, canViewObHistory } from "./ob-meet";

type TestRole = NonNullable<Parameters<typeof canViewObHistory>[0]>[number];
const role = (overrides: Partial<TestRole> = {}) => ({
  name: "担当", can_manage_ob_meet: false, can_manage_system: false,
  can_manage_members: false, permissions_suppressed: false, ...overrides,
});

describe("OB meet permission boundaries", () => {
  it("retains management after renaming without granting it to a spoofed name", () => {
    expect(canManageObMeet([role({ name: "改名した担当", can_manage_ob_meet: true })])).toBe(true);
    expect(canManageObMeet([role({ name: "OB戦2026" })])).toBe(false);
    expect(canManageObMeet([role({ can_manage_system: true, can_manage_members: true })])).toBe(false);
  });
  it("combines roles while keeping history independent of management and suppressing preview", () => {
    const roles = [role({ name: "全員" }), role({ can_manage_ob_meet: true })];
    expect(canManageObMeet(roles)).toBe(true);
    expect(canViewObHistory(roles)).toBe(true);
    for (const management of [{ can_manage_system: true }, { can_manage_members: true }]) {
      expect(canViewObHistory([role(management)])).toBe(true);
      expect(canManageObMeet([role(management)])).toBe(false);
    }
    expect(canManageObMeet(roles.map(value => ({ ...value, permissions_suppressed: true })))).toBe(false);
    expect(canViewObHistory(roles.map(value => ({ ...value, permissions_suppressed: true })))).toBe(false);
  });
  it("keeps the legacy recording boundary for approved active members and explicit operators", () => {
    expect(canRecordObMeet({ approved: true, status: "active", roles: [] })).toBe(true);
    expect(canRecordObMeet({ approved: false, status: "active", roles: [] })).toBe(false);
    expect(canRecordObMeet({ approved: true, status: "graduated", roles: [] })).toBe(false);
    expect(canRecordObMeet({ approved: false, status: "graduated", roles: [role({ can_manage_ob_meet: true })] })).toBe(true);
    expect(canRecordObMeet({ approved: false, status: "graduated", roles: [role({ can_manage_system: true })] })).toBe(true);
  });
});
