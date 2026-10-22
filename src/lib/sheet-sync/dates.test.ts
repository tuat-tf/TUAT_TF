import { describe, expect, it } from "vitest";
import { sheetHistoricalBoundary, sheetRecordCreatedAt } from "./dates";

describe("sheetHistoricalBoundary", () => {
  it("初回の履歴補完では境界日を返す", () => {
    expect(sheetHistoricalBoundary("2026-10-22", null)).toBe("2026-10-22");
  });
  it("補完済みの通常取り込みは境界なし（同期時刻）", () => {
    expect(sheetHistoricalBoundary("2026-10-22", "2026-10-01T00:00:00Z")).toBeUndefined();
  });
  it("手動の一括取り込みは補完済みでも境界日を返す", () => {
    expect(sheetHistoricalBoundary("2026-10-22", "2026-10-01T00:00:00Z", true)).toBe("2026-10-22");
  });
});

describe("一括取り込みの投稿時刻", () => {
  const importedAt = new Date("2026-10-22T15:00:00Z"); // 10/23 00:00 JST
  it("境界より前の行は練習日の0時0分(JST)になる", () => {
    expect(sheetRecordCreatedAt("2026-10-05", importedAt, "2026-10-22")).toBe("2026-10-04T15:00:00.000Z");
  });
  it("境界日の行は同期時刻のまま", () => {
    expect(sheetRecordCreatedAt("2026-10-22", importedAt, "2026-10-22")).not.toBe("2026-10-21T15:00:00.000Z");
  });
  it("境界を渡さない通常取り込みは同期時刻付近（日付で飛ばない）", () => {
    const at = Date.parse(sheetRecordCreatedAt("2026-10-05", importedAt));
    expect(importedAt.getTime() - at).toBeLessThanOrEqual(1000);
  });
});
