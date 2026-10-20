import { describe, expect, it } from "vitest";
import { trainingReviewFields, trainingReviewPreferenceKey } from "./training-review-display";
import type { PracticeRecord, RecordFieldDef } from "@/types";

const record: PracticeRecord = {
  id: "synthetic-record", user_id: "synthetic-author", recorded_date: "2026-10-01",
  dist_low: 5, dist_mid: 0, dist_high: 0, dist_speed: 0, dist_actual: 0,
  strides: 2, condition: "normal", menu_text: "tempo", focus_text: "rhythm",
  result_text: "3:30", strength_text: "core", memo: "reflection",
  custom: { sleep: 0, retired_column: "old saved value" }, likes_count: 0,
  created_at: "2026-10-01T00:00:00Z",
};
const current: RecordFieldDef[] = [
  { key: "result_text", label: "Current timing", type: "text", showInTimeline: true },
  { key: "sleep", label: "Current sleep", type: "number", showInTimeline: true },
];

describe("training review display", () => {
  it("uses the saved selection and labels without relabeling historical records", () => {
    const historical = { ...record, record_fields_version: 3, record_fields_snapshot: [
      { key: "result_text", label: "Timing at the time", type: "text" as const, showInTimeline: true },
      { key: "sleep", label: "Sleep at the time", type: "number" as const, showInTimeline: true },
      { key: "memo", label: "Own reflection", type: "text" as const, showInTimeline: false },
    ] };
    expect(trainingReviewFields(historical, current, false)).toEqual([
      { key: "result_text", label: "Timing at the time", value: "3:30" },
      { key: "sleep", label: "Sleep at the time", value: 0 },
    ]);
    expect(trainingReviewFields(historical, current, true)).toContainEqual({ key: "memo", label: "Own reflection", value: "reflection" });
  });

  it("applies the author's current selection only to an unversioned legacy record", () => {
    expect(trainingReviewFields(record, current, false)).toEqual([
      { key: "result_text", label: "Current timing", value: "3:30" },
      { key: "sleep", label: "Current sleep", value: 0 },
    ]);
    const emptySnapshot = { ...record, record_fields_version: 3, record_fields_snapshot: [] };
    expect(trainingReviewFields(emptySnapshot, current, false).map((field) => field.label)).not.toContain("Current timing");
    expect(trainingReviewFields(emptySnapshot, current, true)).toContainEqual({ key: "sleep", label: "sleep", value: 0 });
  });

  it("keeps legacy configured custom fields and hidden builtins consistent with cards", () => {
    const legacyFields: RecordFieldDef[] = [
      { key: "memo", label: "Removed reflection", type: "text", hidden: true },
      { key: "sleep", label: "Sleep count", type: "number" },
    ];
    const specified = trainingReviewFields(record, legacyFields, false);
    expect(specified.find((field) => field.key === "memo")).toBeUndefined();
    expect(specified).toContainEqual({ key: "sleep", label: "Sleep count", value: 0 });
    expect(trainingReviewFields(record, legacyFields, true)).toContainEqual({ key: "memo", label: "Removed reflection", value: "reflection" });
  });

  it("retains unknown custom values and numeric zero in all-fields mode", () => {
    const all = trainingReviewFields(record, current, true);
    expect(all).toContainEqual({ key: "retired_column", label: "retired_column", value: "old saved value" });
    expect(all).toContainEqual({ key: "dist_mid", label: "中強度", value: "0km" });
    expect(trainingReviewFields({ ...record, custom: { blank: "  ", missing: null } }, [], true).some((field) => ["blank", "missing"].includes(field.key))).toBe(false);
  });

  it("respects a selection covering menu, focus, distances, strides and condition", () => {
    const definitions: RecordFieldDef[] = [
      { key: "menu_text", label: "Workout", type: "text", showInTimeline: true },
      { key: "focus_text", label: "Intent", type: "text", showInTimeline: true },
      { key: "dist_low", label: "Own easy distance", type: "number", showInTimeline: true },
      { key: "strides", label: "Own strides", type: "number", showInTimeline: true },
      { key: "condition", label: "Own condition", type: "text", showInTimeline: true },
    ];
    const fields = trainingReviewFields(record, definitions, false);
    expect(fields.map((field) => field.label)).toEqual(["Workout", "Intent", "Own easy distance", "Own strides", "Own condition"]);
    expect(fields.find((field) => field.key === "dist_low")?.value).toBe("5km");
    expect(fields.find((field) => field.key === "strides")?.value).toBe("2本");
    expect(fields.find((field) => field.key === "condition")?.value).toContain("普通");
    expect(fields.some((field) => field.key === "result_text")).toBe(false);
  });

  it("separates the new selection preference from old reflection-only cookies and other viewers", () => {
    expect(trainingReviewPreferenceKey("viewer-a")).toBe("training-review-all-fields-viewer-a");
    expect(trainingReviewPreferenceKey("viewer-a")).not.toBe(trainingReviewPreferenceKey("viewer-b"));
  });
});
