vi.mock("@/lib/queries/competition-meet", () => ({ getCompetitionMeet: vi.fn().mockResolvedValue(null) }));
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  profile: vi.fn(), notices: vi.fn(), competition: vi.fn(), schedules: vi.fn(),
  attendance: vi.fn(), summary: vi.fn(), notes: vi.fn(), feed: vi.fn(), program: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/supabase/auth", () => ({ getCurrentProfile: mocks.profile, getCurrentUserId: async () => "me" }));
vi.mock("@/lib/queries", () => ({
  getHomeNotices: mocks.notices, getHomeCompetition: mocks.competition,
  getAttendanceSchedules: mocks.schedules, getAttendancesForSchedules: mocks.attendance,
  getUserTrainingSummary: mocks.summary, getRecentSharedNotes: mocks.notes,
  getFeed: mocks.feed, getCompetitionProgramEntries: mocks.program,
}));
import HomePage from "./page";

describe("home content loading", () => {
  beforeEach(() => {
    mocks.profile.mockResolvedValue({ id: "me", blocks: ["middle_long"], roles: [], display_name: "テスト", sheet_name: null });
    mocks.competition.mockResolvedValue(null);
    mocks.schedules.mockResolvedValue([]);
    mocks.summary.mockResolvedValue({ distance: 0, count: 0 });
    mocks.notes.mockResolvedValue([]);
    mocks.feed.mockResolvedValue([]);
    mocks.notices.mockResolvedValue([]);
  });

  it("starts independent sections together, but reveals them only when the whole body is ready", async () => {
    let resolveNotices!: (value: unknown[]) => void;
    mocks.notices.mockReturnValue(new Promise(resolve => { resolveNotices = resolve; }));
    const page = HomePage();
    const body = page.props.children[1].props.children;
    let completed = false;
    const result = body.type(body.props).then((value: unknown) => { completed = true; return value; });
    await vi.waitFor(() => {
      expect(mocks.summary).toHaveBeenCalledTimes(1);
      expect(mocks.feed).toHaveBeenCalledWith("me", 3);
      expect(mocks.schedules).toHaveBeenCalledTimes(1);
      expect(mocks.notes).toHaveBeenCalledWith(3);
    });
    expect(completed).toBe(false);
    resolveNotices([]);
    await expect(result).resolves.toBeDefined();
    expect(completed).toBe(true);
  });

  it("skips distance aggregation for other blocks and attendance when there are no schedules", async () => {
    mocks.profile.mockResolvedValue({ id: "me", blocks: ["short"], roles: [], display_name: "テスト", sheet_name: null });
    const body = HomePage().props.children[1].props.children;
    await body.type(body.props);
    expect(mocks.summary).not.toHaveBeenCalled();
    expect(mocks.attendance).not.toHaveBeenCalled();
    expect(mocks.program).not.toHaveBeenCalled();
  });
});

describe("finished competitions on home", () => {
  it("shows a finished imported-results competition the same way as the OB meet", async () => {
    mocks.profile.mockResolvedValue({ id: "me", blocks: [], roles: [], display_name: "テスト" });
    mocks.competition.mockResolvedValue({ competition: null, goalCount: 0, finished: [
      { id: "riko", name: "理工系", starts_on: "2026-10-25", ends_on: null, program_source_url: "http://sairiku.net/result/x/", program_closed_at: "2026-10-26T06:22:38Z" },
      { id: "3e2a2b1e-21d1-49b0-a1e8-40bf595fb7e5", name: "OB戦", starts_on: "2026-10-11", ends_on: null, program_source_url: null },
    ] });
    const body = HomePage().props.children[1].props.children;
    const content = await body.type(body.props);
    const html = renderToStaticMarkup(content.props.children[1]);
    expect(html).toContain('href="/competitions/riko/program"');
    expect(html.match(/結果を見る/g)).toHaveLength(2);
    expect(html.match(/終了/g)).toHaveLength(2);
    expect(html).not.toContain("出場");
    expect(mocks.program).not.toHaveBeenCalled();
  });

  it.each([{ roles: [] }, { roles: [{ name: "OB戦2026", can_manage_system: true }] }])("keeps only a compact results link for roles $roles", async ({ roles }) => {
    mocks.profile.mockResolvedValue({ id: "me", blocks: [], roles, display_name: "テスト" });
    mocks.competition.mockResolvedValue({ competition: null, goalCount: 0, finished: [
      { id: "3e2a2b1e-21d1-49b0-a1e8-40bf595fb7e5", name: "OB戦", starts_on: "2026-10-11", ends_on: null, program_source_url: null },
    ] });
    const body = HomePage().props.children[1].props.children;
    const content = await body.type(body.props);
    const html = renderToStaticMarkup(content.props.children[1]);
    expect(html).toContain("OB戦");
    expect(html).toContain("終了");
    expect(html).toContain("結果を見る");
    expect(html).toContain('href="/competitions/3e2a2b1e-21d1-49b0-a1e8-40bf595fb7e5/program"');
    expect(html.match(/<a /g)).toHaveLength(1);
    for (const text of ["エントリーする", "登録を編集", "自分の出場", "自分の補助担当"]) expect(html).not.toContain(text);
  });
});
