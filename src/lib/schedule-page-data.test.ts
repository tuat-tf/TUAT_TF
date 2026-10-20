import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ profile: vi.fn(), schedules: vi.fn() }));
vi.mock("@/lib/supabase/auth", () => ({ getCurrentProfile: mocks.profile }));
vi.mock("@/lib/queries", () => ({ getUpcomingSchedulesWithAttendances: mocks.schedules }));
import { getSchedulePageData } from "./schedule-page-data";

it("serializes attendance once while preserving per-day and own first-day state", async () => {
  mocks.profile.mockResolvedValue({
    id: "me", display_name: "本人", avatar_url: null, grade: "B1", blocks: ["middle_long"],
    roles: [], email: "private@example.invalid", record_fields: [{ key: "private" }],
    attendance_default_block: "middle_long",
  });
  const attendances = [
    { schedule_id: "schedule", user_id: "me", attend_date: "2026-10-20", status: "attend", is_late: true, late_note: "連絡", absence_note: null },
    { schedule_id: "schedule", user_id: "me", attend_date: "2026-10-21", status: "absent", is_late: false, late_note: null, absence_note: "2日目" },
  ];
  mocks.schedules.mockResolvedValue([{ id: "schedule", schedule_date: "2026-10-20", attendances, menus: [] }]);
  const result = await getSchedulePageData();
  expect(result.schedules[0]).not.toHaveProperty("attendances");
  expect(result.attendeesBySchedule.schedule).toEqual(attendances);
  expect(result.myStatusBySchedule.schedule).toBe("attend");
  expect(result.myLateNoteBySchedule.schedule).toBe("連絡");
  expect(result.myProfile).toEqual({ id: "me", display_name: "本人", avatar_url: null, grade: "B1", blocks: ["middle_long"] });
  expect(JSON.stringify(result)).not.toContain("private");
});
