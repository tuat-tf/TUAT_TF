import { describe, it, expect } from "vitest";
import type { AppRole } from "@/types";
import { editableMenuBlocks, menuAccess } from "./menu-permissions";
import { canModerateComments } from "./permissions";
import { canManageObMeet } from "./ob-meet";

const role = (name: string, create = true, blocks: AppRole["editable_menu_blocks"] = [], suppressed = false) => ({
  name, can_create_menu: create, editable_menu_blocks: blocks, permissions_suppressed: suppressed,
  can_moderate_comments: false, can_manage_ob_meet: false, can_manage_system: false,
}) as AppRole;
describe("block menu editing", () => {
  it.each([
    ["改名した短距離担当", "short"], ["改名した中長距離担当", "middle_long"],
  ] as const)("uses the explicit scope for %s", (name, block) => {
    expect(editableMenuBlocks([role(name, true, [block])])).toEqual([block]);
    expect(editableMenuBlocks([role("別の肩書き", true, [block])])).toEqual([block]);
  });
  it("requires creation permission, supports combined roles and suppresses preview", () => {
    expect(editableMenuBlocks([role("担当", false, ["short"])])).toEqual([]);
    expect(editableMenuBlocks([role("担当", false, ["short"]), role("作成担当")])).toEqual(["short"]);
    expect(editableMenuBlocks([role("担当", true, ["short"], true), role("作成担当")])).toEqual([]);
    expect(editableMenuBlocks([role("作成担当", true, [], true), role("担当", false, ["short"])])).toEqual([]);
    expect(editableMenuBlocks([role("短距離ブロック長"), role("長距離ブロック長")])).toEqual([]);
    expect(editableMenuBlocks([role("担当", true, ["short", "middle_long"]), role("別担当", true, ["short"])])).toEqual(["short", "middle_long"]);
  });
  it("allows editing own block but not deleting another author's menu", () => {
    const access = { userId: "leader", authorId: "other", canCreate: true, canManageAll: false, editableBlocks: ["short" as const] };
    for (const targetBlock of ["short", "jump", "throw"] as const) expect(menuAccess({ ...access, targetBlock })).toEqual({ canEdit: true, canDelete: false });
    for (const targetBlock of ["middle_long", null] as const) expect(menuAccess({ ...access, targetBlock })).toEqual({ canEdit: false, canDelete: false });
  });
  it("requires current creation permission for owners and allows member managers", () => {
    const access = { userId: "owner", authorId: "owner", targetBlock: null, canCreate: false, canManageAll: false };
    expect(menuAccess(access)).toEqual({ canEdit: false, canDelete: false });
    expect(menuAccess({ ...access, canCreate: true })).toEqual({ canEdit: true, canDelete: true });
    expect(menuAccess({ ...access, authorId: "other", canManageAll: true })).toEqual({ canEdit: true, canDelete: true });
  });
  it("hides explicit moderation and OB permissions during preview", () => {
    const suppressed = { ...role("担当", true, [], true), can_moderate_comments: true, can_manage_ob_meet: true };
    expect(canModerateComments([suppressed])).toBe(false);
    expect(canManageObMeet([suppressed])).toBe(false);
  });
});
