import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { ObEntry } from "@/lib/ob-entries";

const hooks = vi.hoisted(() => ({ cursor: 0, values: [] as unknown[] }));
const mocks = vi.hoisted(() => ({ choose: undefined as undefined | ((value: string) => void), options: [] as { value: string; label: string }[], editor: vi.fn() }));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(), useState<T>(initial: T | (() => T)) {
  const slot = hooks.cursor++;
  if (!(slot in hooks.values)) hooks.values[slot] = typeof initial === "function" ? (initial as () => T)() : initial;
  return [hooks.values[slot], (value: T) => { hooks.values[slot] = value; }];
} }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock("@/components/ui/select", () => ({ Select: (props: { ariaLabel: string; onValueChange: (value: string) => void; options: { value: string; label: string }[] }) => {
  if (props.ariaLabel === "エントリーを変更する人") { mocks.choose = props.onValueChange; mocks.options = props.options; }
  return null;
} }));
vi.mock("./ObEntryEditor", () => ({ ObEntryEditor: (props: unknown) => { mocks.editor(props); return null; } }));
vi.mock("./ObPartyView", () => ({ ObPartyView: () => null }));
vi.mock("@/app/(app)/ob-entries/actions", () => ({ confirmEntryMember: vi.fn(), deleteEntry: vi.fn() }));
vi.mock("@/app/(app)/ob-entries/operations-actions", () => ({ setObAttendance: vi.fn() }));
import { ObMeetParticipants } from "./ObMeetParticipants";

const entries: ObEntry[] = [
  { id: "linked", meet_key: "ob-2026", submitted_name: "登録修正名", grade: "B1", events: ["男子100m"], qualification_marks: { "男子100m": "12.34" }, profile_id: "profile", revision: 5, imported_at: "" },
  { id: "guest", meet_key: "ob-2026", submitted_name: "未照合の参加者", grade: "B2", events: [], qualification_marks: {}, profile_id: null, revision: 3, imported_at: "" },
  { id: "alumni", meet_key: "ob-2026", submitted_name: "卒業生", grade: "OB・OG", events: [], qualification_marks: {}, profile_id: null, revision: 2, imported_at: "", absent: true },
];
const members = [{ id: "profile", display_name: "プロフィール旧名", grade: "1" }, { id: "new", display_name: "未登録部員", grade: "2" }];
const party = { id: "party", meet_key: "ob-2026", submitted_name: "元回答名", group_label: "卒業年度", status: "参加" as const, entry_id: "linked", revision: 4, needs_review: false };
function render() { hooks.cursor = 0; renderToStaticMarkup(createElement(ObMeetParticipants, { entries, members, history: [], party: [party], duties: [], roles: [], operations: [] })); }
beforeEach(() => { hooks.values = []; vi.clearAllMocks(); mocks.choose = undefined; mocks.options = []; });

it.each(entries)("opens $submitted_name directly with the existing entry identity and revision", entry => {
  const before = structuredClone(entries);
  render();
  expect(mocks.options).toContainEqual({ value: `entry:${entry.id}`, label: `${entry.grade} ${entry.submitted_name}` });
  mocks.choose!(`entry:${entry.id}`); render();
  expect(mocks.editor).toHaveBeenLastCalledWith(expect.objectContaining({ entry, members, ...(entry.id === "linked" ? { party } : {}) }));
  expect(entries).toEqual(before);
});

it("selects an unregistered member for creation without duplicating registered profiles", () => {
  render();
  expect(mocks.options).toContainEqual({ value: "member:new", label: "B2 未登録部員（未登録）" });
  expect(mocks.options.some(option => option.value === "member:profile")).toBe(false);
  mocks.choose!("member:new"); render();
  expect(mocks.editor).toHaveBeenLastCalledWith(expect.objectContaining({ initialProfileId: "new", members: [members[1]] }));
  expect(mocks.editor.mock.lastCall![0].entry).toBeUndefined();
});
