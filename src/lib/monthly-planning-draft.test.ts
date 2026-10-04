import { describe, expect, it } from "vitest";
import { monthlyPlanningDraftKey, pendingPlanningDrafts } from "./monthly-planning-draft";

describe("monthly planning draft ownership", () => {
  it("separates accounts and block menus from individual recipients", () => {
    const key = (user: string, people: string[]) => monthlyPlanningDraftKey(user, "2026-10", "short", people);
    expect(key("member-a", [])).not.toBe(key("member-b", []));
    expect(key("member-a", [])).not.toBe(key("member-a", ["member-c"]));
    expect(key("member-a", ["member-c", "member-d"])).toBe(key("member-a", ["member-d", "member-c"]));
  });

  it("restores only unfinished input without replacing a newly edited saved row", () => {
    const draft = { "2026-10-01": { venue: "old saved value" }, "2026-10-02": { venue: "unsaved input" }, "2026-10-03": { venue: "failed input" } };
    const kept = pendingPlanningDrafts(draft, { "schedule:2026-10-01": "saved", "schedule:2026-10-02": "dirty", "schedule:2026-10-03": "error" }, "schedule");
    expect({ "2026-10-01": { venue: "other editor's new value" }, ...kept }).toEqual({
      "2026-10-01": { venue: "other editor's new value" }, "2026-10-02": { venue: "unsaved input" }, "2026-10-03": { venue: "failed input" },
    });
  });
});
