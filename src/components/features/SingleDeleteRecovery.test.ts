import { beforeEach, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import type { AuthorMini, CompetitionRow, NoteWithRelations, NoteArticleWithAuthor, PracticeSchedule, ThreadWithAuthor } from "@/types";

const harness = vi.hoisted(() => ({
  states: [] as unknown[], index: 0, refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), toast: vi.fn(), from: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useEffect: () => {},
  useRef(initial: unknown) {
    const index = harness.index++;
    if (!(index in harness.states)) harness.states[index] = { current: initial };
    return harness.states[index];
  },
  useState(initial: unknown) {
    const index = harness.index++;
    if (!(index in harness.states)) harness.states[index] = initial;
    return [harness.states[index], (value: unknown) => {
      harness.states[index] = typeof value === "function" ? (value as (current: unknown) => unknown)(harness.states[index]) : value;
    }];
  },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: harness.refresh, push: harness.push, replace: harness.replace }), useSearchParams: () => new URLSearchParams() }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ showToast: harness.toast }) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ from: harness.from }) }));

import { CompetitionManager } from "./CompetitionManager";
import { FolderRowActions } from "./FolderRowActions";
import { NoteDetailActions } from "./NoteDetailActions";
import { NoteArticleActions } from "./NoteArticleActions";
import { ThreadList } from "./ThreadList";
import { ScheduleManageActions } from "../post/ScheduleForm";

const competition = { id: "target", name: "Meet", starts_on: "2026-10-13", ends_on: null, is_countdown: false, archive_at: null } as CompetitionRow;
const note = { id: "target", title: "Folder", status: "published", scope: "shared" } as NoteWithRelations;
const article = { id: "target", title: "Article" } as NoteArticleWithAuthor;
const thread = { id: "target", title: "Thread", author_id: "me", author: { display_name: "Member" }, updated_at: "2026-10-13T00:00:00Z" } as ThreadWithAuthor;
const currentUser = { id: "me" } as AuthorMini;

function elements(tree: unknown): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  if (!tree || typeof tree !== "object" || !("props" in tree)) return [];
  const element = tree as ReactElement<Record<string, unknown>>;
  const rendered = typeof element.props.renderItem === "function" && Array.isArray(element.props.items)
    ? element.props.items.map((item: unknown) => (element.props.renderItem as (item: unknown) => unknown)(item)) : [];
  return [element, ...elements(element.props.children), ...elements(rendered)];
}
function deleteAction(render: () => unknown) {
  harness.index = 0;
  const menu = elements(render()).find((element) => typeof element.props.onDelete === "function");
  if (!menu) throw new Error("Missing delete action");
  return menu.props.onDelete as () => Promise<boolean>;
}
const cases = [
  ["competitions", () => CompetitionManager({ initial: [competition], canManage: true, initialNow: Date.parse("2026-10-13T00:00:00Z") })],
  ["notes", () => FolderRowActions({ note, currentUser, isAdmin: true })],
  ["notes", () => NoteDetailActions({ note, currentUser, members: [], isAdmin: true, canEdit: true, canDelete: true })],
  ["note_articles", () => NoteArticleActions({ noteId: "folder", article, currentUser })],
  ["threads", () => ThreadList({ threads: [thread], currentUserId: "me", isAdmin: true })],
  ["practice_schedules", () => ScheduleManageActions({ schedule: { id: "target" } as PracticeSchedule })],
] as const;

let response: { data: { id: string }[] | null; error: { message: string } | null };
let rejected: boolean;
const chain = {
  delete: vi.fn(() => chain), eq: vi.fn(() => chain), select: vi.fn(() => chain),
  then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
    (rejected ? Promise.reject(new TypeError("response lost")) : Promise.resolve(response)).then(resolve, reject),
};
beforeEach(() => {
  harness.states = []; harness.index = 0;
  response = { data: [], error: null }; rejected = false;
  harness.from.mockReturnValue(chain);
});

it.each(cases)("%s keeps the current view after a zero-row or unknown deletion, and permits manual retry", async (table, render) => {
  const remove = deleteAction(render);
  const before = [...harness.states];
  for (const data of [[], null, [{ id: "one" }, { id: "two" }]]) {
    response = { data, error: null };
    expect(await remove()).toBe(false);
    expect(harness.states).toEqual(before);
    expect(harness.refresh).not.toHaveBeenCalled();
    expect(harness.push).not.toHaveBeenCalled();
    expect(harness.replace).not.toHaveBeenCalled();
  }
  response = { data: null, error: { message: "permission denied" } };
  expect(await remove()).toBe(false);
  rejected = true;
  await expect(remove()).resolves.toBe(false);
  expect(harness.states).toEqual(before);
  expect(harness.refresh).not.toHaveBeenCalled();
  expect(harness.push).not.toHaveBeenCalled();
  expect(harness.replace).not.toHaveBeenCalled();
  expect(harness.toast).toHaveBeenCalled();
  expect(harness.from).toHaveBeenCalledTimes(5);
  expect(harness.from).toHaveBeenLastCalledWith(table);

  rejected = false; response = { data: [{ id: "target" }], error: null };
  expect(await remove()).toBe(true);
  expect(chain.eq).toHaveBeenCalledWith("id", "target");
  if (table === "note_articles") expect(chain.eq).toHaveBeenCalledWith("note_id", "folder");
  expect(chain.select).toHaveBeenCalledWith("id");
  expect(harness.refresh).toHaveBeenCalledOnce();
});

it.each([
  [() => NoteDetailActions({ note, currentUser, members: [], isAdmin: true, canEdit: true, canDelete: true }), "/notes"],
  [() => NoteArticleActions({ noteId: "folder", article, currentUser }), "/notes/folder"],
] as const)("does not leave the deleted detail as the previous screen", async (render, destination) => {
  response = { data: [{ id: "target" }], error: null };
  expect(await deleteAction(render)()).toBe(true);
  expect(harness.replace).toHaveBeenCalledWith(destination);
  expect(harness.push).not.toHaveBeenCalled();
});
