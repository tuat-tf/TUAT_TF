import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TrainingChart } from "./TrainingChart";
import { jstToday } from "@/lib/date";
import type { TrainingRecord } from "@/types";

vi.mock("@/lib/date", () => ({ jstToday: vi.fn() }));

beforeEach(() => { vi.mocked(jstToday).mockReturnValue("2026-10-22"); });

function record(recorded_date: string, overrides: Partial<TrainingRecord> = {}): TrainingRecord {
  return {
    id: recorded_date, recorded_date,
    dist_low: 0, dist_mid: 0, dist_high: 0, dist_speed: 0, dist_actual: 0,
    strides: 0, condition: null, menu_text: null, focus_text: null,
    result_text: null, strength_text: null, memo: null, custom: {},
    ...overrides,
  };
}

const records = [
  record("2026-10-08", { dist_low: 99 }),
  record("2026-10-09", { dist_actual: 8 }),
  record("2026-10-15", { dist_low: 4 }),
  record("2026-10-16", { dist_low: 3, dist_actual: 5 }),
  record("2026-10-20", { dist_mid: 2 }),
  record("2026-10-22", { dist_high: 2, dist_speed: 1 }),
  record("2026-10-23", { dist_low: 99 }),
];

function render(initialShowAllFields = false) {
  return renderToStaticMarkup(createElement(TrainingChart, { records, initialShowAllFields }));
}

describe("training chart display controls", () => {
  it.each([false, true])("offers one item picker and all-fields mode (all=%s)", (all) => {
    const html = render(all);
    expect(html).toMatch(new RegExp(`aria-pressed="${!all}"[^>]*>項目選択</button>`));
    expect(html).toMatch(new RegExp(`aria-pressed="${all}"[^>]*>すべて表示</button>`));
    expect(html).not.toContain("選んだ項目");
    expect(html).not.toContain("表示項目を選ぶ");
  });

  it("preserves the seven-day totals, previous-period comparison and intensity breakdown in either display mode", () => {
    const html = render();
    const text = html.replace(/<[^>]*>/g, "");
    expect(text).toContain("10/16〜10/22");
    expect(text).toContain("10kmその前の7日間比 -2km走行3日");
    expect(text).toContain("低強度3km中強度2km高強度2km解糖系1kmその他2km");
    expect(html).toContain('aria-label="直近7日間の強度別走行距離、合計10km"');
    expect([...html.matchAll(/stroke-dasharray="([^"]+)"/g)].map((match) => match[1])).toEqual(["30 70", "20 80", "20 80", "10 90", "20 80"]);
    expect(html).not.toContain("data-ui-chart-bar");
    expect(html).not.toContain("直近7日間の合計に戻る");
    expect(html).not.toContain("99km");
    expect(render(true).replace(/<[^>]*>/g, "")).toBe(text);
  });

  it.each([
    ["2026-10-22", "10/16〜10/22"],
    ["2026-11-03", "10/28〜11/3"],
    ["2027-01-03", "12/28〜1/3"],
  ])("shows the recent date range without individual date controls on %s", (today, label) => {
    vi.mocked(jstToday).mockReturnValue(today);
    const html = render();
    expect(html).toContain(label);
    expect(html).toContain("data-training-donut");
    expect(html).not.toContain("data-ui-chart-bar");
    expect(html).not.toContain("data-training-axis");
  });

  it("keeps a neutral donut and all five intensity amounts when there is no running distance", () => {
    const html = renderToStaticMarkup(createElement(TrainingChart, { records: [] }));
    expect(html).toContain('aria-label="直近7日間の走行距離は0kmです"');
    expect(html).not.toContain("stroke-dasharray");
    expect(html).not.toContain("NaN");
    expect(html.replace(/<[^>]*>/g, "")).toContain("低強度0km中強度0km高強度0km解糖系0kmその他0km");
  });
});
