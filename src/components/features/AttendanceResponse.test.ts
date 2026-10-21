import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ScheduleAttendance } from "@/components/cards/schedule/ScheduleAttendance";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/layout/glass/system-glass-state", () => ({ useSystemGlass: () => true }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => { throw new Error("Rendering must not mutate attendance"); } }));

const profile = { id: "me", display_name: "検証用部員", avatar_url: null, blocks: ["short" as const], grade: "B1" as const };
function render(status: "present" | "absent", late = false, note: string | null = null) {
  return renderToStaticMarkup(createElement(ScheduleAttendance, {
    scheduleId: "schedule", userId: "me", attendanceDays: ["2099-11-15", "2099-11-16"],
    multiDayAttendance: true, attendanceDefaultBlock: "all", handleAttendanceChanged: vi.fn(),
    attendeesState: [{ user_id: "me", attend_date: "2099-11-15", status, is_late: late, late_note: status === "present" ? note : null, absence_note: status === "absent" ? note : null, profile }],
  }));
}
describe("future attendance contact entry points", () => {
  it("shows direct lateness and general contact controls on a future attended day", () => {
    const html = render("present");
    expect(html).toContain("遅刻を連絡");
    expect(html).toContain("連絡する");
    expect(html).toContain("11/15");
    expect(html).toContain("11/16");
    expect(html).toContain("出欠一覧（出席1人、欠席0人）");
    expect(html).toContain("出欠一覧（出席0人、欠席0人）");
  });
  it("shows a saved general note when the person is not late", () => {
    const html = render("present", false, "練習の途中で早退します");
    expect(html).toContain("練習の途中で早退します");
    expect(html).toContain("連絡を編集");
    expect(html).not.toContain("遅刻を取り消す");
  });
  it("shows a lateness cancellation without hiding the general note", () => {
    const html = render("present", true, "10分ほど遅れます");
    expect(html).toContain("遅刻を取り消す");
    expect(html).toContain("10分ほど遅れます");
    expect(html).toContain("遅刻連絡済み");
    expect(html).not.toContain("遅刻中");
  });
  it("keeps absence contact accessible without offering lateness for an absent day", () => {
    const html = render("absent", false, "授業があるため欠席します");
    expect(html).toContain("授業があるため欠席します");
    expect(html).toContain("連絡を編集");
    expect(html).not.toContain("遅刻を連絡");
  });
});
