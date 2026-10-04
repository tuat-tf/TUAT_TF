import { describe, expect, it, vi } from "vitest";
import { savePlanningBatch } from "./monthly-planning-save";

describe("one monthly planning save", () => {
  it("never follows an uncertain schedule failure with another schedule or menu write", async () => {
    const saveSchedule = vi.fn(async () => null);
    const saveMenu = vi.fn(async () => true);
    const markMenuFailed = vi.fn();
    expect(await savePlanningBatch({ scheduleDates: ["2026-10-01"], menuDates: ["2026-10-01"], saveSchedule, saveMenu, markMenuFailed })).toBe(2);
    expect(saveSchedule).toHaveBeenCalledTimes(1);
    expect(saveMenu).not.toHaveBeenCalled();
    expect(markMenuFailed).toHaveBeenCalledWith("2026-10-01");
  });

  it("links the menu to the exact schedule just saved, without relying on a later React render", async () => {
    const schedule = { id: "new-id", meeting_time: "09:00", venue_name: "入力した場所" };
    const saveSchedule = vi.fn(async () => schedule);
    const saveMenu = vi.fn(async () => true);
    expect(await savePlanningBatch({ scheduleDates: ["2026-10-01"], menuDates: ["2026-10-01"], saveSchedule, saveMenu, markMenuFailed: vi.fn() })).toBe(0);
    expect(saveSchedule).toHaveBeenCalledTimes(1);
    expect(saveMenu).toHaveBeenCalledWith("2026-10-01", schedule);
  });

  it("stops on an unknown transport result without automatic replay", async () => {
    const saveSchedule = vi.fn(async () => { throw new Error("response lost"); });
    const saveMenu = vi.fn(async () => true);
    await expect(savePlanningBatch({ scheduleDates: ["2026-10-01"], menuDates: ["2026-10-01"], saveSchedule, saveMenu, markMenuFailed: vi.fn() })).rejects.toThrow("response lost");
    expect(saveSchedule).toHaveBeenCalledTimes(1);
    expect(saveMenu).not.toHaveBeenCalled();
  });
});
