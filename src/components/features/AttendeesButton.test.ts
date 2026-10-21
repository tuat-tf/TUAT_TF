import React, { type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Attendee, Block } from "@/types";

vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ children }: { children: ReactNode }) => children,
  SheetContent: ({ children }: { children: ReactNode }) => React.createElement("section", null, children),
}));
vi.mock("@/components/ui/segmented", () => ({ SegmentedControl: () => null }));
vi.mock("@/components/common/Avatar", () => ({ Avatar: () => null }));
import { AttendeesButton, attendanceCounts } from "./AttendeesButton";

beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => vi.unstubAllGlobals());
function person(name: string, grade: string | null, blocks: Block[], extra: Partial<Attendee> = {}): Attendee {
  return { user_id: name, attend_date: "2026-10-22", status: "present", is_late: false, late_note: null, absence_note: null,
    profile: { id: name, display_name: name, avatar_url: null, blocks, grade }, ...extra };
}
const attendees = [
  person("Z中長", "1", ["middle_long"]),
  person("A短距離", "1", ["short"], { is_late: true, late_note: "授業後に参加" }),
  person("Mマネ", "1", ["manager"]),
  person("B所属未設定", "2", []),
  person("N学年未設定", null, ["middle_long"]),
  person("C欠席", "3", ["short"], { status: "absent", absence_note: "実習" }),
];

it("全体ではブロックをまたいで同じ学年にまとめ、未設定の人と出欠の補足も残す", () => {
  const html = renderToStaticMarkup(React.createElement(AttendeesButton, { attendees, defaultBlock: "all" }));
  const b1 = html.slice(html.indexOf(">B1</p>"), html.indexOf(">B2</p>"));
  expect(html.match(/>B1<\/p>/g)).toHaveLength(1);
  for (const name of ["A短距離", "Mマネ", "Z中長"]) expect(b1).toContain(name);
  expect(b1.indexOf("A短距離")).toBeLessThan(b1.indexOf("Mマネ"));
  expect(b1.indexOf("Mマネ")).toBeLessThan(b1.indexOf("Z中長"));
  for (const text of ["B所属未設定", "N学年未設定", "学年未設定", "遅刻", "授業後に参加", "C欠席", "実習"]) expect(html).toContain(text);
  expect(html).not.toContain(">中長距離</p>");
  expect(html).not.toContain(">短距離</p>");
  expect(attendanceCounts(attendees, "all")).toEqual({ present: 5, absent: 1 });
});

it("ブロック指定では対象だけを学年でまとめ、従来のマネージャーの対象範囲と人数を保つ", () => {
  const html = renderToStaticMarkup(React.createElement(AttendeesButton, { attendees, defaultBlock: "short" }));
  expect(html).toContain("A短距離"); expect(html).toContain("Mマネ"); expect(html).toContain("C欠席");
  expect(html).not.toContain("Z中長"); expect(html).not.toContain("B所属未設定");
  expect(html.match(/>B1<\/p>/g)).toHaveLength(1);
  expect(attendanceCounts(attendees, "short")).toEqual({ present: 2, absent: 1 });
});
