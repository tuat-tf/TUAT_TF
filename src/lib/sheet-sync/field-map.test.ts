import { describe, expect, it } from "vitest";
import { normalizeBuiltinValue, resolveFieldMap, sheetToAppValues } from "./field-map";

const member = { header: ["低強度", "低強度", "睡眠", "睡眠"], columns: [
  { index: 2, label: "低強度" }, { index: 5, label: "低強度" },
  { index: 7, label: "睡眠" }, { index: 9, label: "睡眠" },
] };

describe("physical sheet column selection", () => {
  it("imports total distance but never writes it even when explicitly configured", () => {
    const sheet = { header: ["実際の距離"] };
    expect(resolveFieldMap(sheet, []).builtin.has("dist_actual")).toBe(true);
    expect(resolveFieldMap(sheet, [], "write").builtin.has("dist_actual")).toBe(false);
    expect(resolveFieldMap(sheet, [{ key: "dist_actual", label: "実際の距離", type: "number" }], "write").builtin.has("dist_actual")).toBe(false);
    expect(resolveFieldMap(sheet, [{ key: "dist_actual", label: "実際の距離", type: "number", hidden: true }], "write").builtin.has("dist_actual")).toBe(false);
  });
  it("prefers an explicitly matched physical column over the first equal header", () => {
    const map = resolveFieldMap(member, [
      { key: "dist_low", label: "低強度", type: "number", sourceHeader: "低強度", sourceColumn: 5 },
      { key: "sleep", label: "睡眠", type: "number", sourceHeader: "睡眠", sourceColumn: 9 },
    ]);
    expect(map.builtin.get("dist_low")?.column).toBe(5);
    expect(map.custom.get("sleep")?.column).toBe(9);
    expect(sheetToAppValues(map, { date: "2026-10-01", cells: { 低強度: "99", 睡眠: "99" },
      values: ["", "", "99", "", "", "4", "", "99", "", "8"] })).toEqual({ builtin: { dist_low: 4 }, custom: { sleep: 8 } });
  });
  it("refuses an ambiguous saved header or keyword fallback instead of choosing the first", () => {
    expect(() => resolveFieldMap(member, [])).toThrow("複数");
    expect(() => resolveFieldMap({ header: ["睡眠", "睡眠"] }, [{ key: "sleep", label: "睡眠", type: "number", sourceColumn: 99, sourceHeader: "睡眠" }])).toThrow("複数");
    expect(() => resolveFieldMap({ header: ["低強度 km", "低強度 m"] }, [])).toThrow("複数");
  });
  it("can follow a moved unique header and does not map hidden custom fields", () => {
    const map = resolveFieldMap({ header: ["睡眠"], columns: [{ index: 7, label: "睡眠" }] },
      [{ key: "sleep", label: "睡眠", type: "number", sourceHeader: "睡眠", sourceColumn: 9 }]);
    expect(map.custom.get("sleep")?.column).toBe(7);
    expect(resolveFieldMap({ header: ["睡眠"] }, [{ key: "sleep", label: "睡眠", type: "number", hidden: true }]).custom.size).toBe(0);
  });
  it("never moves a second explicit mapping to another equal header when its physical column is already claimed", () => {
    expect(() => resolveFieldMap(member, [
      { key: "dist_low", label: "低強度", type: "number", sourceHeader: "低強度", sourceColumn: 5 },
      { key: "duplicate", label: "低強度", type: "number", sourceHeader: "低強度", sourceColumn: 5 },
    ])).toThrow("同じシート列");
  });
});

describe("strides as free text", () => {
  const map = resolveFieldMap({ header: ["流し"] }, []);
  it("keeps what the sheet says instead of squashing it into a number", () => {
    expect(map.builtin.get("strides")?.numeric).toBe(false);
    expect(normalizeBuiltinValue("strides", { numeric: false }, "150m×2")).toBe("150m×2");
    expect(normalizeBuiltinValue("strides", { numeric: false }, 3)).toBe("3");
  });
  it.each(["0", "０", "0.0", "", " "])("treats the old blank placeholder %j as no entry", (value) => {
    expect(normalizeBuiltinValue("strides", { numeric: false }, value)).toBeNull();
  });
});
