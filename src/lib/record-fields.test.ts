import { describe, expect, it } from "vitest";
import { canSaveRecord, customRecordFields, editableBuiltinRecordFields, isBuiltinRecordField, recordFieldHidden, recordFieldLabel, stridesText } from "./record-fields";
import type { RecordFieldDef } from "@/types";

const builtin: RecordFieldDef = { key: "memo", label: "Memo", type: "text" };
const custom: RecordFieldDef = { key: "sleep_hours", label: "Sleep", type: "number" };

describe("record field helpers", () => {
  it("recognizes built-in fields", () => expect(isBuiltinRecordField(builtin)).toBe(true));
  it("does not classify custom fields as built-in", () => expect(isBuiltinRecordField(custom)).toBe(false));
  it("returns only custom fields", () => expect(customRecordFields([builtin, custom])).toEqual([custom]));
  it("handles missing field definitions", () => expect(customRecordFields(undefined)).toEqual([]));
  it("detects a hidden built-in field", () => expect(recordFieldHidden([{ ...builtin, hidden: true }], "memo")).toBe(true));
  it("uses a trimmed custom label", () => expect(recordFieldLabel([{ ...builtin, label: " Review " }], "memo", "Fallback")).toBe("Review"));
  it("uses the fallback for a blank label", () => expect(recordFieldLabel([{ ...builtin, label: " " }], "memo", "Fallback")).toBe("Fallback"));
  it("uses different built-ins for middle-long and sprint groups", () => {
    expect(editableBuiltinRecordFields(true).some((field) => field.key === "strides")).toBe(true);
    expect(editableBuiltinRecordFields(false).some((field) => field.key === "menu_text")).toBe(true);
  });
  it("allows an existing record to be updated after its last field is cleared", () => {
    expect(canSaveRecord(false, true)).toBe(true);
    expect(canSaveRecord(false, false)).toBe(false);
  });
});

describe("stridesText", () => {
  it("keeps the old count display for a plain number", () => expect(stridesText(" 3 ")).toBe("3本"));
  it("shows written strides as they were entered", () => expect(stridesText("100m×3")).toBe("100m×3"));
});
