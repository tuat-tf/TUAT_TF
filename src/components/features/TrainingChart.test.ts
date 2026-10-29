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
    strides: null, condition: null, menu_text: null, focus_text: null,
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
  it.each([false, true])("opens the period's records from one button and keeps the field choice inside (all=%s)", (all) => {
    const html = render(all);
    expect(html).toMatch(/aria-expanded="false"[^>]*>この期間の記録/);
    // Field choice lives in the sheet opened from the expanded list, not as a second switch.
    expect(html).not.toContain("項目選択");
    expect(html).not.toContain("すべて表示");
    expect(html).not.toContain("項目を選ぶ");
  });

  it("shows the seven-day total, a short comparison and only the intensities that were run, in either display mode", () => {
    const html = render();
    const text = html.replace(/<[^>]*>/g, "");
    expect(text).toContain("10/16〜10/2210km先週比 −2km");
    expect(text).not.toContain("その前の7日間");
    expect(text).not.toContain("走行");
    expect(text).toContain("低強度 3km中強度 2km高強度 2km解糖系 1kmその他 2km");
    expect(html).toContain('aria-label="直近7日間の日別走行距離、合計10km（10/16 5km、10/17 0km、10/18 0km、10/19 0km、10/20 2km、10/21 0km、10/22 3km）"');
    // One bar per day, scaled to the busiest day (5km → full height).
    expect([...html.matchAll(/flex-col-reverse[^"]*" style="height:([\d.]+)px"/g)].map((match) => Math.round(Number(match[1]) * 10) / 10)).toEqual([76, 30.4, 45.6]);
    expect(text).toContain("今日");
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
    expect(html).toContain("data-training-week");
    expect(html.match(/<span class="mt-1 text-\[11px\]/g)).toHaveLength(7);
    expect(html).not.toContain("data-ui-chart-bar");
    expect(html).not.toContain("data-training-axis");
  });

  it("keeps seven empty days and no intensity list when there is no running distance", () => {
    const html = renderToStaticMarkup(createElement(TrainingChart, { records: [] }));
    expect(html).toContain('aria-label="直近7日間の走行距離は0kmです"');
    expect(html).not.toContain("flex-col-reverse");
    expect(html.match(/rounded-t-\[3px\] bg-separator/g)).toHaveLength(7);
    expect(html).not.toContain("NaN");
    const text = html.replace(/<[^>]*>/g, "");
    expect(text).toContain("0km先週と同じ");
    expect(text).not.toContain("低強度");
  });
});
