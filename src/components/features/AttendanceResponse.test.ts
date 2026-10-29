import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ScheduleAttendance } from "@/components/cards/schedule/ScheduleAttendance";
import { UpcomingScheduleCard } from "@/components/cards/UpcomingScheduleCard";

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
  it("keeps a compact contact entry without expanding lateness controls on an attended day", () => {
    const html = render("present");
    expect(html).not.toContain("遅刻を連絡");
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
  it("keeps lateness visible on the compact entry without hiding the general note", () => {
    const html = render("present", true, "10分ほど遅れます");
    expect(html).toContain("lucide-message-square");
    expect(html).not.toContain("lucide-clock-3");
    expect(html).toContain("遅刻 · ");
    expect(html).not.toContain("遅刻を取り消す");
    expect(html).toContain("10分ほど遅れます");
    expect(html).not.toContain("遅刻連絡済み");
    expect(html).not.toContain("遅刻中");
  });
  it("keeps the contact icon and a single readable late status without a note", () => {
    const html = render("present", true);
    expect(html).toContain("lucide-message-square");
    expect(html).not.toContain("lucide-clock-3");
    expect(html).toContain(">遅刻</span>");
    expect(html).not.toContain("自動で保存します");
  });
  it("keeps absence contact accessible without offering lateness for an absent day", () => {
    const html = render("absent", false, "授業があるため欠席します");
    expect(html).toContain("授業があるため欠席します");
    expect(html).toContain("連絡を編集");
    expect(html).not.toContain("遅刻を連絡");
  });
});

describe("multi-day attendance lists", () => {
  it("counts each person once per day instead of once per answered day", () => {
    const days = ["2099-11-13", "2099-11-14", "2099-11-15"];
    const people = ["a", "b"].map((id) => ({ ...profile, id, display_name: id }));
    // 2人が3日とも出席。日ごとの一覧で2人ずつ、同じ日に同じ人の行が重なっていても1人。
    const rows = days.flatMap((day) => people.map((person) => ({ user_id: person.id, attend_date: day, status: "present" as const, is_late: false, late_note: null, absence_note: null, profile: person })));
    const html = renderToStaticMarkup(createElement(ScheduleAttendance, {
      scheduleId: "schedule", userId: "me", attendanceDays: days, multiDayAttendance: true,
      attendanceDefaultBlock: "all", handleAttendanceChanged: vi.fn(), attendeesState: [...rows, rows[0]],
    }));
    expect(html.match(/出欠一覧（出席2人、欠席0人）/g)).toHaveLength(3);
    expect(html).not.toContain("出席6人");
  });
  it("shows the home upcoming card day by day", () => {
    const days = ["2099-11-13", "2099-11-14", "2099-11-15"];
    const people = ["a", "b"].map((id) => ({ ...profile, id, display_name: id }));
    const attendees = days.flatMap((day) => people.map((person) => ({ user_id: person.id, attend_date: day, status: "present" as const, is_late: false, late_note: null, absence_note: null, profile: person })));
    const html = renderToStaticMarkup(createElement(UpcomingScheduleCard, {
      schedule: { id: "s", schedule_date: days[0], end_date: days[2], schedule_type: "meet", title: "大会", meeting_time: null, venue_name: null, menus: [] } as never,
      attendees, attendanceDefaultBlock: "all", userId: "me", myProfile: profile,
    }));
    expect(html.match(/出欠一覧（出席2人、欠席0人）/g)).toHaveLength(3);
    for (const label of ["11/13", "11/14", "11/15"]) expect(html).toContain(label);
  });
});
