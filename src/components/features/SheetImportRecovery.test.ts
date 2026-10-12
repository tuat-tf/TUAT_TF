import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import type { MenuImportPreview, PracticeSchedule, ScheduleImportPreview } from "@/types";

// This file runs the real import actions without a DOM or a live backend.
const harness = vi.hoisted(() => ({
  states: [] as unknown[],
  index: 0,
  effects: [] as (() => void | (() => void))[],
  dependencies: [] as unknown[][],
  effectIndex: 0,
  refresh: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  getUser: vi.fn(),
}));
vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useState(initial: unknown) {
    const index = harness.index++;
    if (!(index in harness.states)) harness.states[index] = typeof initial === "function" ? (initial as () => unknown)() : initial;
    return [harness.states[index], (next: unknown) => {
      harness.states[index] = typeof next === "function"
        ? (next as (current: unknown) => unknown)(harness.states[index]) : next;
    }];
  },
  useRef(initial: unknown) {
    const index = harness.index++;
    if (!(index in harness.states)) harness.states[index] = { current: initial };
    return harness.states[index];
  },
  useCallback: (callback: unknown) => callback,
  useEffect(effect: () => void | (() => void), dependencies: unknown[]) {
    const index = harness.effectIndex++;
    if (!harness.dependencies[index] || dependencies.some((value, i) => value !== harness.dependencies[index][i])) {
      harness.dependencies[index] = dependencies;
      harness.effects.push(effect);
    }
  },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: harness.refresh }), useSearchParams: () => ({ get: () => null }) }));
vi.mock("@/components/ui/form-modal", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/components/ui/form-modal")>(), useFormDraft: vi.fn(),
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ from: harness.from, rpc: harness.rpc, auth: { getUser: harness.getUser } }),
}));
vi.mock("@/lib/supabase/client-auth", () => ({ getCurrentUserId: async () => "user-1" }));

import { MenuSheetImportManager } from "./MenuSheetImportManager";
import { useScheduleSheetImport } from "./schedule-sheets/useScheduleSheetImport";
import { useFormDraft } from "@/components/ui/form-modal";
import { MenuComposerForm } from "@/components/post/MenuForm";
import { ScheduleCreatePanel, ScheduleForm } from "@/components/post/ScheduleForm";

function render<T>(view: () => T): T {
  harness.index = 0;
  harness.effectIndex = 0;
  return view();
}
function elements(tree: unknown): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  if (!tree || typeof tree !== "object" || !("props" in tree)) return [];
  const element = tree as ReactElement<Record<string, unknown>>;
  return [element, ...elements(element.props.children)];
}
function textOf(tree: unknown): string {
  if (typeof tree === "string" || typeof tree === "number") return String(tree);
  if (Array.isArray(tree)) return tree.map(textOf).join("");
  if (tree && typeof tree === "object" && "props" in tree) return textOf((tree as ReactElement<Record<string, unknown>>).props.children);
  return "";
}
function button(tree: unknown, text: string) {
  const result = elements(tree).find((element) => typeof element.props.onClick === "function" && textOf(element.props.children) === text);
  if (!result) throw new Error(`Missing action: ${text}`);
  const action = result.props.onClick as () => void | Promise<void>;
  return {
    disabled: result.props.disabled, onClick: async () => {
      await action();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  };
}
function query(result: unknown) {
  const chain = {
    select: vi.fn(() => chain), order: vi.fn(() => chain), eq: vi.fn(() => chain),
    gte: vi.fn(() => chain), lt: vi.fn(() => chain), insert: vi.fn((values: unknown) => { void values; return chain; }),
    delete: vi.fn(() => chain), in: vi.fn(() => chain), single: vi.fn(() => Promise.resolve(result)), maybeSingle: vi.fn(() => Promise.resolve(result)),
    then: (resolve: (value: unknown) => unknown, reject?: (error: unknown) => unknown) => Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}
const menuPreview: MenuImportPreview = {
  columns: ["メニュー"],
  rows: [{ rowNumber: 2, values: { メニュー: "編集した内容" }, status: "addition", message: null, normalized: null }],
  additions: [{ rowNumber: 2, scheduleId: "schedule-1", scheduleDate: "2026-10-13", targetBlock: "middle_long", content: "編集した内容", pace: null, remark: null, supplement: null, existingMenuId: null }],
  updates: [], errors: [], skips: [],
};
const schedulePreview: ScheduleImportPreview = { columns: ["日付"], rows: [], additions: [], updates: [], deletions: [], errors: [], skips: [] };
const scheduleRow = {
  rowNumber: 2, schedule_date: "2026-10-13", end_date: null, schedule_type: "practice" as const,
  meeting_time: "09:00", venue_name: "グラウンド", venue_access: null, venue_fee: null, venue_url: null,
  title: null, entry_start: null, entry_end: null, note: "編集した内容", target_blocks: [],
};
const validSchedulePreview: ScheduleImportPreview = {
  ...schedulePreview,
  rows: [{ rowNumber: 2, values: { 日付: "2026-10-13", 補足: "編集した内容" }, status: "addition", message: null, normalized: scheduleRow }],
  additions: [scheduleRow],
};
async function flushEffects() {
  for (const effect of harness.effects.splice(0)) effect();
  await new Promise((resolve) => setTimeout(resolve, 0));
}
async function readySchedule() {
  render(useScheduleSheetImport);
  await flushEffects();
  return render(useScheduleSheetImport);
}
async function loadMenuPreview(preview: MenuImportPreview) {
  let tree = render(MenuSheetImportManager);
  (elements(tree).find((element) => element.props.type === "url")!.props.onChange as (event: unknown) => void)({ target: { value: "https://docs.google.com/sheet" } });
  tree = render(MenuSheetImportManager);
  vi.mocked(fetch).mockResolvedValueOnce(Response.json(preview));
  await button(tree, "内容を確認").onClick();
  return render(MenuSheetImportManager);
}
function menuRows(tree: unknown) {
  return elements(tree).find((element) => Array.isArray(element.props.rows))!.props.rows as MenuImportPreview["rows"];
}

beforeEach(() => {
  harness.states = [];
  harness.index = 0;
  harness.effects = [];
  harness.dependencies = [];
  harness.effectIndex = 0;
  harness.rpc.mockReset().mockResolvedValue({ data: "saved-id", error: null });
  harness.from.mockReset().mockImplementation((table: string) => query(table === "schedule_sheets" ? { data: { id: "sheet-1" }, error: null } : { data: [], error: null }));
  harness.getUser.mockReset().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ connected: true, email: "" })));
  vi.stubGlobal("window", { open: vi.fn(() => ({ close: vi.fn(), location: { href: "" } })) });
  vi.stubGlobal("localStorage", { getItem: vi.fn(() => null), setItem: vi.fn() });
});

describe("menu import recovery", () => {
  it.each(["network", "non-json", "http"])("keeps the URL and releases preview loading after %s failure", async (failure) => {
    let tree = render(MenuSheetImportManager);
    const input = elements(tree).find((element) => element.props.type === "url")!;
    (input.props.onChange as (event: unknown) => void)({ target: { value: "https://docs.google.com/sheet" } });
    tree = render(MenuSheetImportManager);
    const fetchMock = vi.mocked(fetch);
    if (failure === "network") fetchMock.mockRejectedValueOnce(new TypeError("connection lost"));
    else if (failure === "non-json") fetchMock.mockResolvedValueOnce(new Response("html", { status: 502 }));
    else fetchMock.mockResolvedValueOnce(Response.json({ error: "CSVを確認できませんでした" }, { status: 400 }));
    await expect(button(tree, "内容を確認").onClick()).resolves.toBeUndefined();
    tree = render(MenuSheetImportManager);
    expect(button(tree, "内容を確認").disabled).toBe(false);
    expect(elements(tree).find((element) => element.props.type === "url")?.props.value).toBe("https://docs.google.com/sheet");
    expect(textOf(tree)).toContain("確認できませんでした");
  });

  it("keeps edited cells after validation fails and allows a read retry", async () => {
    let tree = await loadMenuPreview(menuPreview);
    const table = elements(tree).find((element) => Array.isArray(element.props.rows))!;
    (table.props.onChange as (row: number, column: string, value: string) => void)(2, "メニュー", "入力を保持する");
    tree = render(MenuSheetImportManager);
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("offline"));
    await button(tree, "もう一度確認して、問題のない行を登録").onClick();
    tree = render(MenuSheetImportManager);
    expect(menuRows(tree)[0].values.メニュー).toBe("入力を保持する");
    expect(button(tree, "編集内容を再確認").disabled).toBe(false);
    expect(harness.rpc).not.toHaveBeenCalled();
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(menuPreview));
    await button(tree, "編集内容を再確認").onClick();
    expect(menuRows(render(MenuSheetImportManager))[0].status).toBe("addition");
  });

  it("removes confirmed saved rows while retaining rejected and invalid rows", async () => {
    const next: MenuImportPreview = {
      ...menuPreview,
      rows: [menuPreview.rows[0], { ...menuPreview.rows[0], rowNumber: 3 }, { ...menuPreview.rows[0], rowNumber: 4, status: "error" }],
      additions: [menuPreview.additions[0], { ...menuPreview.additions[0], rowNumber: 3 }],
    };
    let tree = await loadMenuPreview(next);
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(next));
    harness.rpc.mockResolvedValueOnce({ data: "saved-id", error: null }).mockResolvedValueOnce({ data: null, error: { code: "42501" } });
    await button(tree, "2件をメニューに登録").onClick();
    tree = render(MenuSheetImportManager);
    expect(menuRows(tree).map((row) => row.rowNumber)).toEqual([3, 4]);
    expect(textOf(tree)).toContain("1件を登録できませんでした");
    expect(button(tree, "1件をメニューに登録").disabled).toBe(false);
  });

  it.each(["throw", "transport", "missing-id"])("retains unsent rows and blocks resend when a menu save has %s result", async (failure) => {
    const next: MenuImportPreview = {
      ...menuPreview,
      rows: [menuPreview.rows[0], { ...menuPreview.rows[0], rowNumber: 3 }, { ...menuPreview.rows[0], rowNumber: 4 }],
      additions: [menuPreview.additions[0], { ...menuPreview.additions[0], rowNumber: 3 }, { ...menuPreview.additions[0], rowNumber: 4 }],
    };
    let tree = await loadMenuPreview(next);
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(next));
    harness.rpc.mockResolvedValueOnce({ data: "saved-id", error: null });
    if (failure === "throw") harness.rpc.mockRejectedValueOnce(new TypeError("lost response"));
    else harness.rpc.mockResolvedValueOnce({ data: null, error: failure === "transport" ? { code: "" } : null });
    await button(tree, "3件をメニューに登録").onClick();
    tree = render(MenuSheetImportManager);
    expect(menuRows(tree).map((row) => row.rowNumber)).toEqual([3, 4]);
    expect(harness.rpc).toHaveBeenCalledTimes(2);
    expect(button(tree, "2件をメニューに登録").disabled).toBe(true);
    expect(textOf(tree)).toContain("登録結果を確認できませんでした");
    await button(tree, "2件をメニューに登録").onClick();
    expect(harness.rpc).toHaveBeenCalledTimes(2);
  });

  it("keeps the menu result pending after a failed read and ends the input only on explicit confirmation", async () => {
    let tree = await loadMenuPreview(menuPreview);
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(menuPreview));
    harness.rpc.mockRejectedValueOnce(new TypeError("lost response"));
    await button(tree, "1件をメニューに登録").onClick();
    tree = render(MenuSheetImportManager);
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ error: "読み込めませんでした" }, { status: 500 }));
    await button(tree, "編集内容を再確認").onClick();
    tree = render(MenuSheetImportManager);
    expect(button(tree, "1件をメニューに登録").disabled).toBe(true);
    expect(vi.mocked(useFormDraft).mock.calls.at(-1)![0].busy).toBe(true);
    expect(menuRows(tree)).toEqual(menuPreview.rows);
    await button(tree, "結果を確認して、今回の入力を終了").onClick();
    tree = render(MenuSheetImportManager);
    expect(vi.mocked(useFormDraft).mock.calls.at(-1)![0]).toMatchObject({ dirty: false, busy: false });
    expect(harness.rpc).toHaveBeenCalledOnce();
    expect(elements(tree).some((element) => Array.isArray(element.props.rows))).toBe(false);
  });
});

describe("schedule import recovery", () => {
  it.each(["network", "non-json", "http"])("keeps edited rows and releases validation state after %s failure", async (failure) => {
    let action = render(useScheduleSheetImport);
    action.setSheetId("sheet-1");
    action.setPreview(schedulePreview);
    action.setSheetUrl("https://docs.google.com/sheet");
    action = render(useScheduleSheetImport);
    if (failure === "network") vi.mocked(fetch).mockRejectedValueOnce(new TypeError("connection lost"));
    else if (failure === "non-json") vi.mocked(fetch).mockResolvedValueOnce(new Response("html", { status: 502 }));
    else vi.mocked(fetch).mockResolvedValueOnce(Response.json({ error: "入力内容を再確認できませんでした" }, { status: 400 }));
    await expect(action.validateEditedRows(schedulePreview.rows)).resolves.toBeNull();
    action = render(useScheduleSheetImport);
    expect(action.loading).toBe(false);
    expect(action.preview).toEqual(schedulePreview);
    expect(action.sheetUrl).toBe("https://docs.google.com/sheet");
    expect(action.error).toContain("確認できませんでした");
  });

  it("distinguishes failed initial reads from empty results and retries without losing input", async () => {
    harness.from.mockImplementation(() => query({ data: null, error: { code: "42501" } }));
    vi.mocked(fetch).mockResolvedValueOnce(new Response("bad gateway", { status: 502 }));
    let action = await readySchedule();
    expect(action.existingError).toContain("予定を読み込めませんでした");
    expect(action.venuesError).toContain("場所を読み込めませんでした");
    expect(action.googleError).toContain("連携状態を確認できませんでした");
    expect(action.googleConnected).toBeNull();
    expect(action.existingLoading || action.venuesLoading || action.googleLoading).toBe(false);
    action.setSheetUrl("https://docs.google.com/sheet");
    action.updateWeekdayDefault(1, "time", "09:00");
    harness.from.mockImplementation(() => query({ data: [], error: null }));
    action.retryReads();
    render(useScheduleSheetImport);
    await flushEffects();
    action = render(useScheduleSheetImport);
    expect(action.existingError || action.venuesError || action.googleError).toBeNull();
    expect(action.sheetUrl).toBe("https://docs.google.com/sheet");
    expect(action.weekdayDefaults.find((day) => day.weekday === 1)?.time).toBe("09:00");
  });

  it("keeps selected existing rows after a failed read and retry", async () => {
    harness.from.mockImplementation((table: string) => query({ data: table === "practice_schedules" ? [{ id: "one", target_blocks: [] }, { id: "two", target_blocks: [] }] : [], error: null }));
    let action = await readySchedule();
    action.setSelectedIds(["two"]);
    harness.from.mockImplementation((table: string) => query(table === "practice_schedules" ? { data: null, error: { code: "42501" } } : { data: [], error: null }));
    action.retryReads();
    render(useScheduleSheetImport);
    await flushEffects();
    action = render(useScheduleSheetImport);
    expect(action.existing).toHaveLength(2);
    expect(action.selectedIds).toEqual(["two"]);
    harness.from.mockImplementation((table: string) => query({ data: table === "practice_schedules" ? [{ id: "one", target_blocks: [] }, { id: "two", target_blocks: [] }] : [], error: null }));
    action.retryReads();
    render(useScheduleSheetImport);
    await flushEffects();
    expect(render(useScheduleSheetImport).selectedIds).toEqual(["two"]);
  });

  it.each(["network", "non-json", "server"])("closes the popup and blocks duplicate Google creation after %s response", async (failure) => {
    let action = await readySchedule();
    if (failure === "network") vi.mocked(fetch).mockRejectedValueOnce(new TypeError("offline"));
    else if (failure === "non-json") vi.mocked(fetch).mockResolvedValueOnce(new Response("html", { status: 200 }));
    else vi.mocked(fetch).mockResolvedValueOnce(Response.json({ error: "creation failed" }, { status: 500 }));
    await action.issueSpreadsheet();
    action = render(useScheduleSheetImport);
    expect(action.issuing).toBe(false);
    expect(action.uncertainOperation).toBe("create");
    const popup = vi.mocked(window.open).mock.results[0].value;
    expect(popup.close).toHaveBeenCalledOnce();
    const requestCount = vi.mocked(fetch).mock.calls.length;
    await action.issueSpreadsheet();
    expect(fetch).toHaveBeenCalledTimes(requestCount);
  });

  it("allows Google creation again after a confirmed HTTP rejection", async () => {
    let action = await readySchedule();
    vi.mocked(fetch).mockResolvedValueOnce(new Response("forbidden", { status: 403 }));
    await action.issueSpreadsheet();
    action = render(useScheduleSheetImport);
    expect(action.issuing).toBe(false);
    expect(action.uncertainOperation).toBeNull();
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ id: "sheet-1", url: "https://docs.google.com/new-sheet" }));
    await action.issueSpreadsheet();
    expect(render(useScheduleSheetImport).sheetUrl).toBe("https://docs.google.com/new-sheet");
  });

  it("reuses the known sheet ID for a read after an insert response is lost", async () => {
    let action = await readySchedule();
    const chain = query({ data: null, error: { code: "" } });
    harness.from.mockImplementation(() => chain);
    action.setSheetUrl("https://docs.google.com/sheet");
    action = render(useScheduleSheetImport);
    await action.previewImport();
    action = render(useScheduleSheetImport);
    expect(action.loading).toBe(false);
    expect(action.error).toContain("開始結果を確認できませんでした");
    expect(chain.insert).toHaveBeenCalledOnce();
    expect(chain.insert.mock.calls[0][0]).toMatchObject({ author_id: "user-1" });
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(validSchedulePreview));
    await action.previewImport();
    expect(chain.insert).toHaveBeenCalledOnce();
    expect(render(useScheduleSheetImport).preview).toEqual(validSchedulePreview);
    const body = JSON.parse(vi.mocked(fetch).mock.calls.at(-1)![1]!.body as string);
    expect(body.sheetId).toBe((chain.insert.mock.calls[0][0] as { id: string }).id);
  });

  it.each(["throw", "transport"])("keeps the preview and blocks duplicate schedule apply after %s result", async (failure) => {
    let action = await readySchedule();
    action.setSheetId("sheet-1");
    action.setPreview(validSchedulePreview);
    action.setSheetUrl("https://docs.google.com/sheet");
    action = render(useScheduleSheetImport);
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(validSchedulePreview));
    if (failure === "throw") harness.rpc.mockRejectedValueOnce(new TypeError("lost response"));
    else harness.rpc.mockResolvedValueOnce({ data: null, error: { code: "" } });
    await action.apply();
    action = render(useScheduleSheetImport);
    expect(action.applying || action.loading).toBe(false);
    expect(action.uncertainOperation).toBe("apply");
    expect(action.preview).toEqual(validSchedulePreview);
    expect(action.sheetUrl).toBe("https://docs.google.com/sheet");
    await action.apply();
    expect(harness.rpc).toHaveBeenCalledOnce();
  });

  it("does not present a confirmed save as a failure when undo lookup fails", async () => {
    let action = await readySchedule();
    action.setSheetId("sheet-1");
    action.setPreview(validSchedulePreview);
    action.setSheetUrl("https://docs.google.com/sheet");
    action = render(useScheduleSheetImport);
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(validSchedulePreview));
    harness.from.mockImplementation(() => query({ data: null, error: { code: "42501" } }));
    await action.apply();
    action = render(useScheduleSheetImport);
    expect(action.error).toContain("予定は登録しましたが");
    expect(action.applying).toBe(false);
    expect(action.preview).toBeNull();
    expect(action.sheetUrl).toBe("");
    expect(action.uncertainOperation).toBeNull();
    await action.apply();
    expect(harness.rpc).toHaveBeenCalledOnce();
  });

  it("keeps deletion candidates when RLS deletes no matching rows", async () => {
    let action = await readySchedule();
    const candidates = [{ id: "schedule-1" }] as PracticeSchedule[];
    action.setPreview({ ...schedulePreview, deletions: candidates });
    action.setDeletionIds(["schedule-1"]);
    action = render(useScheduleSheetImport);
    harness.from.mockImplementation(() => query({ data: [], error: null }));
    await action.deleteSelectedCandidates();
    action = render(useScheduleSheetImport);
    expect(action.deleting).toBe(false);
    expect(action.deletionIds).toEqual(["schedule-1"]);
    expect(action.preview?.deletions).toEqual(candidates);
    expect(action.error).toContain("一部の予定を削除できませんでした");
  });

  it("can restart preview after confirming that an unanswered insert did not create a row", async () => {
    let action = await readySchedule();
    const unanswered = query({ data: null, error: { code: "" } });
    const absent = query({ data: null, error: null });
    const created = query({ data: { id: "sheet-new" }, error: null });
    harness.from.mockReset().mockReturnValueOnce(unanswered).mockReturnValueOnce(absent).mockReturnValueOnce(created);
    action.setSheetUrl("https://docs.google.com/sheet");
    action = render(useScheduleSheetImport);
    await action.previewImport();
    action = render(useScheduleSheetImport);
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ error: "シートを参照できません" }, { status: 404 }));
    await action.previewImport();
    action = render(useScheduleSheetImport);
    expect(absent.maybeSingle).toHaveBeenCalledOnce();
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(validSchedulePreview));
    await action.previewImport();
    expect(unanswered.insert).toHaveBeenCalledOnce();
    expect(created.insert).toHaveBeenCalledOnce();
    expect((unanswered.insert.mock.calls[0][0] as { id: string }).id).not.toBe((created.insert.mock.calls[0][0] as { id: string }).id);
    expect(render(useScheduleSheetImport).preview).toEqual(validSchedulePreview);
  });

  it("does not recreate an unanswered sheet when the existence check fails", async () => {
    let action = await readySchedule();
    const unanswered = query({ data: null, error: { code: "" } });
    const failedRead = query({ data: null, error: { code: "42501" } });
    harness.from.mockReset().mockReturnValueOnce(unanswered).mockReturnValueOnce(failedRead);
    action.setSheetUrl("https://docs.google.com/sheet");
    action = render(useScheduleSheetImport);
    await action.previewImport();
    action = render(useScheduleSheetImport);
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ error: "シートを参照できません" }, { status: 404 }));
    await action.previewImport();
    action = render(useScheduleSheetImport);
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(validSchedulePreview));
    await action.previewImport();
    expect(unanswered.insert).toHaveBeenCalledOnce();
    expect(harness.from).toHaveBeenCalledTimes(2);
    const body = JSON.parse(vi.mocked(fetch).mock.calls.at(-1)![1]!.body as string);
    expect(body.sheetId).toBe((unanswered.insert.mock.calls[0][0] as { id: string }).id);
  });

  it("keeps a schedule result pending after a failed read and never resends when ending the input", async () => {
    let action = await readySchedule();
    action.setSheetId("sheet-1");
    action.setPreview(validSchedulePreview);
    action.setSheetUrl("https://docs.google.com/sheet");
    action = render(useScheduleSheetImport);
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(validSchedulePreview));
    harness.rpc.mockRejectedValueOnce(new TypeError("lost response"));
    await action.apply();
    action = render(useScheduleSheetImport);
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ error: "読み込めませんでした" }, { status: 500 }));
    await action.validateEditedRows(validSchedulePreview.rows);
    action = render(useScheduleSheetImport);
    expect(action.uncertainOperation).toBe("apply");
    expect(action.preview).toEqual(validSchedulePreview);
    await action.apply();
    expect(harness.rpc).toHaveBeenCalledOnce();
    action.finishUncertainOperation();
    action = render(useScheduleSheetImport);
    expect(action.uncertainOperation).toBeNull();
    expect(action.preview).toBeNull();
    expect(action.sheetUrl).toBe("");
    expect(harness.rpc).toHaveBeenCalledOnce();
  });

  it("retains deletion targets and blocks repeating a deletion with an unknown response", async () => {
    let action = await readySchedule();
    action.setDeletionIds(["schedule-1"]);
    action = render(useScheduleSheetImport);
    const unanswered = query({ data: null, error: { code: "" } });
    harness.from.mockImplementation(() => unanswered);
    await action.deleteSelectedCandidates();
    action = render(useScheduleSheetImport);
    expect(action.deleting).toBe(false);
    expect(action.uncertainOperation).toBe("delete");
    expect(action.deletionIds).toEqual(["schedule-1"]);
    await action.deleteSelectedCandidates();
    expect(unanswered.delete).toHaveBeenCalledOnce();
  });
});

describe("input method switching", () => {
  it.each(["menu", "schedule"])("keeps the %s form mounted until unsaved input is explicitly discarded", (kind) => {
    const menu = MenuComposerForm({ onDone: vi.fn() });
    const view = kind === "menu" ? () => (menu.type as (props: typeof menu.props) => ReactElement)(menu.props) : () => ScheduleCreatePanel({ onDone: vi.fn() });
    let tree = render(view);
    const child = elements(tree).find((element) => typeof element.props.onDraftChange === "function")!;
    (child.props.onDraftChange as (state: unknown) => void)({ dirty: true, busy: false, onSave: vi.fn() });
    tree = render(view);
    const modes = elements(tree).find((element) => Array.isArray(element.props.items))!;
    (modes.props.onChange as (mode: string) => void)("sheets");
    tree = render(view);
    expect(elements(tree).find((element) => Array.isArray(element.props.items))?.props.value).toBe("normal");
    const dialog = elements(tree).find((element) => typeof element.props.onDiscard === "function")!;
    expect(dialog.props.open).toBe(true);
    (dialog.props.onDiscard as () => void)();
    expect(elements(render(view)).find((element) => Array.isArray(element.props.items))?.props.value).toBe("sheets");
  });

  it.each(["menu", "schedule"])("blocks switching the %s form while normal save or an import result is pending", (kind) => {
    const menu = MenuComposerForm({ onDone: vi.fn() });
    const view = kind === "menu" ? () => (menu.type as (props: typeof menu.props) => ReactElement)(menu.props) : () => ScheduleCreatePanel({ onDone: vi.fn() });
    let tree = render(view);
    const child = elements(tree).find((element) => typeof element.props.onDraftChange === "function")!;
    const notify = child.props.onDraftChange as (state: unknown) => void;
    notify({ dirty: true, busy: true, onSave: vi.fn() });
    tree = render(view);
    (elements(tree).find((element) => Array.isArray(element.props.items))!.props.onChange as (mode: string) => void)("sheets");
    tree = render(view);
    expect(elements(tree).find((element) => Array.isArray(element.props.items))?.props.value).toBe("normal");
    expect(elements(tree).find((element) => element.type === "fieldset")?.props.disabled).toBe(true);
    notify({ dirty: false, busy: false, onSave: vi.fn() });
    tree = render(view);
    (elements(tree).find((element) => Array.isArray(element.props.items))!.props.onChange as (mode: string) => void)("sheets");
    tree = render(view);
    const importChild = elements(tree).find((element) => typeof element.props.onDraftChange === "function")!;
    (importChild.props.onDraftChange as (state: unknown) => void)({ dirty: true, busy: true, onSave: vi.fn() });
    tree = render(view);
    (elements(tree).find((element) => Array.isArray(element.props.items))!.props.onChange as (mode: string) => void)("normal");
    expect(elements(render(view)).find((element) => Array.isArray(element.props.items))?.props.value).toBe("sheets");
  });

  it.each(["menu", "schedule"])("registers actual %s normal input and saving state with the close guard", async (kind) => {
    const menu = MenuComposerForm({ onDone: vi.fn() });
    const panel = render(() => (menu.type as (props: typeof menu.props) => ReactElement)(menu.props));
    const editor = elements(panel).find((element) => typeof element.props.onDraftChange === "function")!;
    harness.states = [];
    harness.effects = [];
    harness.dependencies = [];
    const view = kind === "menu"
      ? () => (editor.type as (props: Record<string, unknown>) => ReactElement)({ scheduleId: "schedule-1", onDone: vi.fn() })
      : () => ScheduleForm({ onDone: vi.fn() });
    let tree = render(view);
    expect(vi.mocked(useFormDraft).mock.calls.at(-1)![0].dirty).toBe(false);
    const input = elements(tree).find((element) => kind === "menu" ? element.props.rows === 8 : element.props.type === "date")!;
    (input.props.onChange as (event: unknown) => void)({ target: { value: kind === "menu" ? "内容を保持する" : "2026-10-13" } });
    tree = render(view);
    const draft = vi.mocked(useFormDraft).mock.calls.at(-1)![0];
    expect(draft.dirty).toBe(true);
    let resolveSave: (result: unknown) => void = () => {};
    const saved = new Promise((resolve) => { resolveSave = resolve; });
    if (kind === "menu") harness.rpc.mockReturnValueOnce(saved);
    else harness.from.mockImplementation(() => query(saved));
    const pending = draft.onSave();
    render(view);
    expect(vi.mocked(useFormDraft).mock.calls.at(-1)![0].busy).toBe(true);
    resolveSave({ data: "saved-id", error: null });
    await pending;
  });
});
