import { describe, expect, it, vi } from "vitest";
import { buildSheetRecordFields } from "@/lib/sheet-field-config";
import { pushRecordToSheet } from "./push";
import type { DbRecord } from "./field-map";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), write: vi.fn() }));
vi.mock("./gas-client", () => ({ fetchMemberRaw: mocks.fetch }));
vi.mock("./push-receipt", () => ({ writeCellsWithReceipt: mocks.write }));

describe("record push with a calculated distance column", () => {
  it.each([[0, false], [12, false], [12, true]] as const)("does not send total distance %s (configured=%s) or flag it missing", async (distance, configured) => {
    const columns = ["日付", "低強度", "実際の距離", "感想"].map((label, index) => ({ index, label }));
    const fields = buildSheetRecordFields({ columns, selectedColumns: [1, 3], types: {}, isMiddleLong: true, memoColumn: 3 });
    if (configured) fields.push({ key: "dist_actual", label: "実際の距離", type: "number", sourceColumn: 2 });
    mocks.fetch.mockResolvedValue({ header: columns.map(c => c.label), columns });
    mocks.write.mockResolvedValue({ receipt: { outcome: "completed", marker_status: "applied" } });
    await pushRecordToSheet({} as never, { sheetName: "test", fields, expectedProfile: {} as never }, fields,
      { id: "record", user_id: "user", recorded_date: "2026-10-21", updated_at: "2026-10-21T00:00:00Z",
        dist_low: 5, dist_actual: distance, memo: "", custom: {} } as DbRecord);
    expect(mocks.write.mock.lastCall?.[3]).toEqual({ 低強度: 5, 感想: "" });
    expect(mocks.write.mock.lastCall?.[4]).toEqual([]);
  });
});
