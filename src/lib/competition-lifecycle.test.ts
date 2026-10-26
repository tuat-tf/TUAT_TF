import { describe, expect, it } from "vitest";
import { finishedHomeCompetitions, isCompetitionArchived, isCompetitionFinished, selectHomeCompetition } from "./competition-lifecycle";

const old = { id: "old", starts_on: "2026-09-21", ends_on: "2026-09-23", is_countdown: true, archive_at: "2026-09-25T08:00:00+09:00" };
const next = { id: "next", starts_on: "2026-09-25", ends_on: "2026-09-27", is_countdown: false, archive_at: null };
describe("competition archive", () => {
  it("switches at 08:00 JST exactly, including UTC input", () => {
    expect(isCompetitionArchived(old, Date.parse("2026-09-24T22:59:59Z"))).toBe(false);
    expect(isCompetitionArchived(old, Date.parse("2026-09-24T23:00:00Z"))).toBe(true);
  });
  it("retains the selected event until the archive deadline then chooses the next event", () => {
    expect(selectHomeCompetition([old, next], Date.parse("2026-09-25T07:59:59+09:00"))?.id).toBe("old");
    expect(selectHomeCompetition([old, next], Date.parse("2026-09-25T08:00:00+09:00"))?.id).toBe("next");
    expect(old.is_countdown).toBe(true);
  });
  it("does not resurrect old events or override an explicit selection", () => {
    const now = Date.parse("2026-09-25T08:00:00+09:00");
    expect(selectHomeCompetition([old], now)).toBeNull();
    expect(selectHomeCompetition([next], now)).toBeNull();
    expect(selectHomeCompetition([old, { ...next, is_countdown: true }], now)?.id).toBe("next");
    expect(isCompetitionArchived({ archive_at: null }, now)).toBe(false);
  });
});

describe("finished competitions on home", () => {
  const now = Date.parse("2026-10-26T06:00:00Z");
  const ob = { id: "ob", starts_on: "2026-10-11", ends_on: null, archive_at: null };
  const riko = { id: "riko", starts_on: "2026-10-25", ends_on: null, archive_at: null, program_closed_at: null };
  const old = { id: "old", starts_on: "2026-09-21", ends_on: "2026-09-23", archive_at: "2026-09-24T23:00:00Z" };
  const upcoming = { id: "next", starts_on: "2026-11-01", ends_on: null, archive_at: null, program_closed_at: null };

  it("treats a competition as finished after its last day or once its live results are closed", () => {
    expect(isCompetitionFinished(riko, "2026-10-25")).toBe(false);
    expect(isCompetitionFinished(riko, "2026-10-26")).toBe(true);
    expect(isCompetitionFinished({ ...upcoming, program_closed_at: "2026-10-26T00:00:00Z" }, "2026-10-26")).toBe(true);
  });

  it("lists finished, not archived competitions newest first", () => {
    expect(finishedHomeCompetitions([ob, old, upcoming, riko], "2026-10-26", now).map((c) => c.id)).toEqual(["riko", "ob"]);
  });
});
