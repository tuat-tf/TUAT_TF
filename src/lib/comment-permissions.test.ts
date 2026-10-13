import { describe, expect, it } from "vitest";
import { canModerateComments } from "./permissions";
import type { AppRole } from "@/types";
const role = (name: string, allowed = false, suppressed = false) => ({
  name, can_manage_members: true, can_manage_system: true,
  can_moderate_comments: allowed, permissions_suppressed: suppressed,
}) as AppRole;

describe("comment moderation permission", () => {
  it("keeps moderation through role renaming without inferring it from names or management", () => {
    expect(canModerateComments([role("管理者", true)])).toBe(true);
    expect(canModerateComments([role("投稿管理担当", true)])).toBe(true);
    for (const name of ["管理者", "システム", "OB戦2026", "副管理者"]) {
      expect(canModerateComments([role(name)])).toBe(false);
    }
  });
  it("combines roles and rejects empty or suppressed permissions", () => {
    expect(canModerateComments([role("肩書き"), role("担当", true)])).toBe(true);
    expect(canModerateComments([role("担当", true, true)])).toBe(false);
    expect(canModerateComments([])).toBe(false);
    expect(canModerateComments(null)).toBe(false);
  });
});
