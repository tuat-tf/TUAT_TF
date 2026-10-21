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
    expect(text).toContain("直近7日間（10/16〜10/22）10kmその前の7日間比 -2km走行3日");
    expect(text).toContain("低強度3km中強度2km高強度2km解糖系1kmその他2km");
    expect(html.match(/data-ui-chart-bar=/g)).toHaveLength(7);
    expect(html).toContain('aria-label="10月16日(金) 5km"');
    expect(html).not.toContain("99km");
    expect(render(true).replace(/<[^>]*>/g, "")).toBe(text);
  });

  it.each([
    ["2026-10-22", ["10/16", "17", "18", "19", "20", "21", "22"]],
    ["2026-11-03", ["10/28", "29", "30", "31", "11/1", "2", "3"]],
    ["2027-01-03", ["12/28", "29", "30", "31", "1/1", "2", "3"]],
  ])("shows the month only at the start and month boundary on %s", (today, labels) => {
    vi.mocked(jstToday).mockReturnValue(today);
    const html = render();
    const axis = html.split("data-training-axis")[1].split("data-training-detail")[0];
    expect([...axis.matchAll(/<span[^>]*>([^<]+)<\/span>/g)].map((match) => match[1])).toEqual(labels);
    expect(html).toContain('class="relative w-full"');
    expect([...html.matchAll(/<button[^>]*data-ui-chart-bar[^>]*>/g)]).toHaveLength(7);
    expect([...html.matchAll(/<button[^>]*data-ui-chart-bar[^>]*>/g)].every(([bar]) => bar.includes("min-w-0 flex-1"))).toBe(true);
    const [year, month, day] = today.split("-").map(Number);
    const weekday = ["日", "月", "火", "水", "木", "金", "土"][new Date(year, month - 1, day).getDay()];
    expect(html).toContain(`aria-label="${month}月${day}日(${weekday}) `);
  });
});
