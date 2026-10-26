import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import type { MenuImportPreview } from "@/types";

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
  getClaims: vi.fn(),
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
  useId: () => "synthetic-form",
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
  createClient: () => ({ from: harness.from, rpc: harness.rpc, auth: { getUser: harness.getUser, getClaims: harness.getClaims } }),
}));
vi.mock("@/lib/supabase/client-auth", () => ({ getCurrentUserId: async () => "user-1" }));

import { MenuSheetImportManager } from "./MenuSheetImportManager";
import { useFormDraft } from "@/components/ui/form-modal";
import { MenuEditModal } from "@/components/post/MenuEditModal";
import { ScheduleForm } from "@/components/post/ScheduleForm";

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
  harness.getClaims.mockReset().mockResolvedValue({ data: { claims: { sub: "user-1" } }, error: null });
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

describe("close guard", () => {
  it.each(["menu", "schedule"])("registers actual %s normal input and saving state with the close guard", async (kind) => {
    const menu = { id: "saved-id", schedule_id: "schedule-1", author_id: "user-1", group_name: null,
      content: "", status: "published", target_block: "middle_long", targets: [], pace: null, remark: null,
      supplement: null, created_at: "2026-10-20T00:00:00Z", updated_at: "2026-10-20T00:00:00Z",
    } as import("@/types").PracticeMenu;
    const panel = render(() => MenuEditModal({ menu, scheduleId: "schedule-1", open: true, onOpenChange: vi.fn() }));
    const editor = elements(panel).find((element) => typeof element.props.onDone === "function")!;
    harness.states = [];
    harness.effects = [];
    harness.dependencies = [];
    const view = kind === "menu"
      ? () => (editor.type as (props: Record<string, unknown>) => ReactElement)({ menu, scheduleId: "schedule-1", onDone: vi.fn() })
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
