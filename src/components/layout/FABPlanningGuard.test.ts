import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

const hooks = vi.hoisted(() => ({
  slots: [] as unknown[], index: 0, effects: [] as (() => unknown)[], dependencies: [] as unknown[][], effectIndex: 0,
  invalidate: vi.fn(), back: vi.fn(), saved: vi.fn(), closed: vi.fn(), dirty: vi.fn(),
  readSchedules: [] as unknown[], readMenus: [] as unknown[], readMembers: [] as unknown[], writes: [] as unknown[], insert: vi.fn(), update: vi.fn(), rpc: vi.fn(), getUser: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useState(initial: unknown) {
    const index = hooks.index++;
    if (!(index in hooks.slots)) hooks.slots[index] = typeof initial === "function" ? (initial as () => unknown)() : initial;
    return [hooks.slots[index], (next: unknown) => {
      hooks.slots[index] = typeof next === "function" ? (next as (value: unknown) => unknown)(hooks.slots[index]) : next;
    }];
  },
  useRef(initial: unknown) {
    const index = hooks.index++;
    if (!(index in hooks.slots)) hooks.slots[index] = { current: initial };
    return hooks.slots[index];
  },
  useMemo: (create: () => unknown) => create(), useCallback: (callback: unknown) => callback,
  useImperativeHandle: (ref: { current: unknown }, create: () => unknown) => { if (ref) ref.current = create(); },
  useEffect(effect: () => unknown, dependencies: unknown[]) {
    const index = hooks.effectIndex++;
    if (!hooks.dependencies[index] || dependencies.some((value, i) => value !== hooks.dependencies[index][i])) {
      hooks.dependencies[index] = dependencies;
      hooks.effects.push(effect);
    }
  },
}));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/components/ui/intent-form", () => ({ withIntentPreload: (component: object) => Object.assign(component, { preload: vi.fn() }) }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/schedule", useSearchParams: () => ({ get: (key: string) => key === "compose" ? "1" : null, toString: () => "compose=1" }),
  useRouter: () => ({ back: hooks.back, refresh: vi.fn() }),
}));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: hooks.invalidate }) }));
vi.mock("@/components/post/use-competition-catalog", () => ({ useCompetitionCatalog: () => ({ competitions: [], error: null, retry: vi.fn() }) }));
vi.mock("@/components/ui/form-modal", async (original) => ({
  ...await original<typeof import("@/components/ui/form-modal")>(), useFormDraft: vi.fn(),
}));
vi.mock("@/lib/supabase/client-auth", () => ({ getCurrentUserId: async () => "user-1" }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    rpc: hooks.rpc,
    auth: { getUser: hooks.getUser },
    from(table: string) {
      const chain = {
        select: () => chain, gte: () => chain, lt: () => chain, order: () => chain, eq: () => chain, in: () => chain,
        insert: (value: unknown) => { hooks.insert(value); return chain; },
        update: (value: unknown) => { hooks.update(value); return chain; },
        single: () => Promise.resolve(hooks.writes.shift() ?? { data: { id: "schedule-1", target_blocks: [] }, error: null }),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: table === "practice_schedules" ? hooks.readSchedules : table === "practice_menus" ? hooks.readMenus : table === "profiles" ? hooks.readMembers : [], error: null }).then(resolve),
      };
      return chain;
    },
  }),
}));

import { FAB } from "./FAB";
import { MonthlyPlanningEditorV2 } from "@/components/features/MonthlyPlanningEditorV2";
import { useFormDraft } from "@/components/ui/form-modal";

function render<T>(view: () => T) {
  hooks.index = 0; hooks.effectIndex = 0;
  return view();
}
function elements(tree: unknown): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  if (!tree || typeof tree !== "object" || !("props" in tree)) return [];
  const node = tree as ReactElement<Record<string, unknown>>;
  return [node, ...elements(node.props.children)];
}
async function flush() {
  for (const effect of hooks.effects.splice(0)) effect();
  await new Promise((resolve) => setTimeout(resolve, 0));
}
const props = {
  userId: "user-1", currentUser: { id: "user-1", display_name: "部員", avatar_url: null, blocks: [], grade: "B1" },
  isMiddleLong: true, recordSource: "app", recordFields: [], systemRecordForm: true,
  can: { createSchedule: true, createMenu: true, createNotice: false, manageMembers: false },
} as Parameters<typeof FAB>[0];
function fabView() {
  const node = FAB(props);
  return (node.type as (props: typeof node.props) => ReactElement)(node.props);
}
function planning(tree: unknown) { return elements(tree).find((node) => node.props.title === "予定" && node.props.open === true)!; }
function types(tree: unknown) { return elements(planning(tree)).find((node) => Array.isArray(node.props.items))!; }
function child(tree: unknown) { return elements(planning(tree)).find((node) => typeof node.props.onDraftChange === "function")!; }
function switchDialog(tree: unknown) { return elements(tree).find((node) => typeof node.props.onDiscard === "function" && node.props.intent === "save")!; }
const handle = { current: null as { save: () => Promise<boolean> } | null };
function plannerView() {
  return (MonthlyPlanningEditorV2 as unknown as { render: (props: unknown, ref: unknown) => ReactElement }).render({
    onSaved: hooks.saved, onClose: hooks.closed, onDirtyChange: hooks.dirty,
  }, handle);
}
function currentDraft() { return vi.mocked(useFormDraft).mock.calls.at(-1)![0]; }
function textOf(tree: unknown): string {
  if (typeof tree === "string" || typeof tree === "number") return String(tree);
  if (Array.isArray(tree)) return tree.map(textOf).join("");
  if (tree && typeof tree === "object" && "props" in tree) return textOf((tree as ReactElement<Record<string, unknown>>).props.children);
  return "";
}
function daySections(tree: unknown) {
  return elements(tree).filter((node) => typeof node.props["data-planning-day"] === "string");
}
/** 1日1行の一覧で、その日の行を開く（予定とメニューの入力欄は開いた行にだけ出る）。 */
function openDay(day: ReactElement<Record<string, unknown>>) {
  const toggle = elements(day).find((node) => node.type === "button" && "aria-expanded" in node.props)!;
  (toggle.props.onClick as () => void)();
}
async function readyPlanner() {
  render(plannerView); await flush();
  const tree = render(plannerView);
  for (const day of daySections(tree).slice(0, 2)) openDay(day);
  return render(plannerView);
}
function editNote(tree: unknown, value: string, index = 0) {
  const notes = elements(tree).filter((node) => node.props.placeholder === "例: 集合方法、持ち物");
  (notes[index].props.onChange as (event: unknown) => void)({ target: { value } });
}

beforeEach(() => {
  hooks.slots = []; hooks.index = 0; hooks.effects = []; hooks.dependencies = []; hooks.effectIndex = 0;
  hooks.writes = []; hooks.readSchedules = []; hooks.readMenus = []; hooks.readMembers = [];
  for (const mock of [hooks.invalidate, hooks.back, hooks.saved, hooks.closed, hooks.dirty, hooks.insert, hooks.update, hooks.rpc, hooks.getUser]) mock.mockReset();
  hooks.getUser.mockResolvedValue({ data: { user: { id: "verified-user" } }, error: null });
  hooks.rpc.mockResolvedValue({ data: "menu-1", error: null });
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ rows: [] })));
  vi.stubGlobal("window", { setTimeout: vi.fn(() => 1), clearTimeout: vi.fn() });
  vi.stubGlobal("localStorage", { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() });
});

describe("FAB schedule type protection", () => {
  it("requires one explicit choice before discarding dirty practice input", () => {
    let tree = render(fabView);
    expect(planning(tree).props.intent).toBe("save");
    (child(tree).props.onDraftChange as (draft: unknown) => void)({ dirty: true, busy: false, onSave: vi.fn() });
    tree = render(fabView);
    (types(tree).props.onChange as (type: string) => void)("meet");
    tree = render(fabView);
    expect(types(tree).props.value).toBe("practice");
    expect(switchDialog(tree).props.open).toBe(true);
    (switchDialog(tree).props.onDiscard as () => void)();
    expect(types(render(fabView)).props.value).toBe("meet");
  });

  it.each(["practice", "meet", "time_trial"])("blocks type switching while %s is saving", (type) => {
    let tree = render(fabView);
    (types(tree).props.onChange as (type: string) => void)(type);
    tree = render(fabView);
    (child(tree).props.onDraftChange as (draft: unknown) => void)({ dirty: true, busy: true, onSave: vi.fn() });
    tree = render(fabView);
    (types(tree).props.onChange as (type: string) => void)(type === "practice" ? "meet" : "practice");
    tree = render(fabView);
    expect(types(tree).props.value).toBe(type);
    expect(elements(planning(tree)).find((node) => node.type === "fieldset")?.props.disabled).toBe(true);
    expect(switchDialog(tree).props.open).toBe(false);
  });

  it("uses the active form save and keeps both query invalidations on confirmed success", () => {
    let tree = render(fabView);
    const onSaved = child(tree).props.onSaved as () => void;
    const save = vi.fn(onSaved);
    (child(tree).props.onDraftChange as (draft: unknown) => void)({ dirty: true, busy: false, onSave: save });
    tree = render(fabView);
    (types(tree).props.onChange as (type: string) => void)("meet");
    tree = render(fabView);
    (switchDialog(tree).props.onSave as () => void)();
    expect(save).toHaveBeenCalledOnce();
    expect(hooks.invalidate).toHaveBeenCalledWith({ queryKey: ["schedule", "user-1"] });
    expect(hooks.invalidate).toHaveBeenCalledWith({ queryKey: ["middle-long-menu-csv", "user-1"] });
    expect(hooks.back).toHaveBeenCalledOnce();
  });
});

describe("monthly planning draft recovery", () => {
  it("registers edited input and preserves the ref save contract", async () => {
    let tree = await readyPlanner();
    expect(currentDraft().dirty).toBe(false);
    editNote(tree, "入力を保持する");
    tree = render(plannerView);
    expect(currentDraft()).toMatchObject({ dirty: true, busy: false });
    expect(handle.current?.save).toBeTypeOf("function");
    await currentDraft().onSave();
    expect(hooks.saved).toHaveBeenCalledOnce();
    expect(hooks.insert).toHaveBeenCalledOnce();
    expect(hooks.insert.mock.calls[0][0]).toMatchObject({ created_by: "verified-user" });
  });

  it("retains rejected rows, does not finish as success, and allows a manual save again", async () => {
    let tree = await readyPlanner();
    editNote(tree, "保存できなかった入力"); render(plannerView);
    hooks.writes.push({ data: null, error: { code: "42501" } });
    await currentDraft().onSave();
    tree = render(plannerView);
    expect(currentDraft()).toMatchObject({ dirty: true, busy: false });
    expect(hooks.saved).not.toHaveBeenCalled();
    expect(localStorage.removeItem).not.toHaveBeenCalled();
    expect(elements(tree).find((node) => node.props.placeholder === "例: 集合方法、持ち物")?.props.value).toBe("保存できなかった入力");
    await currentDraft().onSave();
    expect(hooks.saved).toHaveBeenCalledOnce();
    expect(hooks.insert).toHaveBeenCalledTimes(2);
  });

  it.each(["throw", "transport", "missing-data"])("releases the spinner, preserves input, and blocks resend after %s result", async (failure) => {
    let tree = await readyPlanner();
    editNote(tree, "確認待ちの入力"); render(plannerView);
    let rejectWrite: (error: unknown) => void = () => {};
    if (failure === "throw") hooks.writes.push(new Promise((_resolve, reject) => { rejectWrite = reject; }));
    else hooks.writes.push({ data: null, error: failure === "transport" ? { code: "" } : null });
    const pending = currentDraft().onSave();
    if (failure === "throw") { await Promise.resolve(); rejectWrite(new TypeError("lost response")); }
    await pending;
    tree = render(plannerView);
    expect(textOf(tree)).not.toContain("保存中…");
    expect(textOf(tree)).toContain("保存結果を確認できませんでした");
    expect(currentDraft()).toMatchObject({ dirty: true, busy: true });
    expect(hooks.saved).not.toHaveBeenCalled();
    expect(localStorage.removeItem).not.toHaveBeenCalled();
    expect(elements(tree).find((node) => node.props.placeholder === "例: 集合方法、持ち物")?.props.value).toBe("確認待ちの入力");
    await currentDraft().onSave();
    expect(hooks.insert).toHaveBeenCalledOnce();
  });

  it("preserves the confirmed first row when the next row is rejected", async () => {
    const tree = await readyPlanner();
    editNote(tree, "先に保存する", 0); editNote(tree, "失敗した内容", 1); render(plannerView);
    hooks.writes.push({ data: { id: "saved-1", target_blocks: [] }, error: null }, { data: null, error: { code: "42501" } });
    await currentDraft().onSave(); render(plannerView);
    expect(hooks.insert).toHaveBeenCalledTimes(2);
    expect(hooks.saved).not.toHaveBeenCalled();
    await currentDraft().onSave();
    expect(hooks.insert).toHaveBeenCalledTimes(3);
    expect(hooks.saved).toHaveBeenCalledOnce();
  });

  it("ends an uncertain input only after explicit result review without claiming save success", async () => {
    let tree = await readyPlanner();
    editNote(tree, "確認待ち"); render(plannerView);
    hooks.writes.push({ data: null, error: { code: "" } });
    await currentDraft().onSave(); tree = render(plannerView);
    const finish = elements(tree).find((node) => textOf(node.props.children) === "結果を確認して、今回の入力を終了")!;
    (finish.props.onClick as () => void)();
    expect(hooks.closed).toHaveBeenCalledOnce();
    expect(hooks.saved).not.toHaveBeenCalled();
    expect(hooks.insert).toHaveBeenCalledOnce();
  });

  it("does not finish or remove local input when a dirty blank row is excluded from saving", async () => {
    let tree = await readyPlanner();
    editNote(tree, ""); render(plannerView);
    await currentDraft().onSave(); tree = render(plannerView);
    expect(currentDraft()).toMatchObject({ dirty: true, busy: false });
    expect(hooks.saved).not.toHaveBeenCalled();
    expect(hooks.insert).not.toHaveBeenCalled();
    expect(localStorage.removeItem).not.toHaveBeenCalled();
    await currentDraft().onSave();
    expect(hooks.saved).not.toHaveBeenCalled();
  });

  it("preserves an emptied existing personal menu instead of treating it as saved or deleting it", async () => {
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    hooks.readSchedules = [{ id: "schedule-1", schedule_date: date, target_blocks: [] }];
    hooks.readMembers = [{ id: "member-1", display_name: "部員", blocks: ["middle_long"] }];
    hooks.readMenus = [{ id: "menu-existing", schedule_id: "schedule-1", content: "元のメニュー", targets: [{ user_id: "member-1" }] }];
    let tree = await readyPlanner();
    // The mocked useEffect runs no cleanup, so let the block-wide menu load settle before switching targets.
    await flush(); tree = render(plannerView);
    const settings =elements(tree).find((node) => node.type === "button" && textOf(node.props.children).startsWith("メニューの設定"))!;
    (settings.props.onClick as () => void)(); tree = render(plannerView);
    openDay(daySections(tree).find((node) => node.props["data-planning-day"] === date)!); tree = render(plannerView);
    const people = elements(tree).find((node) => node.props.label === "個人指定（空ならブロック全体）")!;
    (people.props.onChange as (ids: string[]) => void)(["member-1"]); render(plannerView);
    await flush(); tree = render(plannerView); await flush(); tree = render(plannerView);
    const input = elements(tree).find((node) => node.props.placeholder === "例: 400m×10（つなぎ200m）")!;
    expect(input.props.value).toBe("元のメニュー");
    (input.props.onChange as (event: unknown) => void)({ target: { value: "" } }); render(plannerView);
    await currentDraft().onSave(); tree = render(plannerView);
    expect(hooks.saved).not.toHaveBeenCalled();
    expect(hooks.rpc).not.toHaveBeenCalled();
    expect(localStorage.removeItem).not.toHaveBeenCalled();
    expect(currentDraft()).toMatchObject({ dirty: true, busy: false });
    expect(elements(tree).find((node) => node.props.placeholder === "例: 400m×10（つなぎ200m）")?.props.value).toBe("");
  });

  it("lists one folded row per day and opens a scheduled day with its schedule and menu together", async () => {
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    hooks.readSchedules = [{ id: "schedule-1", schedule_date: date, meeting_time: "17:00:00", venue_name: "府中", target_blocks: [] }];
    render(plannerView); await flush();
    let tree = render(plannerView);
    expect(daySections(tree)).toHaveLength(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate());
    expect(elements(tree).some((node) => node.props.placeholder === "例: 集合方法、持ち物")).toBe(false);
    const day = daySections(tree).find((node) => node.props["data-planning-day"] === date)!;
    expect(textOf(day)).toContain("17:00・府中");
    openDay(day); tree = render(plannerView);
    const opened = daySections(tree).find((node) => node.props["data-planning-day"] === date)!;
    expect(elements(opened).some((node) => node.props.placeholder === "例: 集合方法、持ち物")).toBe(true);
    expect(elements(opened).some((node) => node.props.placeholder === "例: 400m×10（つなぎ200m）")).toBe(true);
    expect(textOf(opened)).toContain("メニュー（中長距離）");
    // A day without a schedule asks for the schedule first instead of creating one silently for a menu.
    const empty = daySections(tree).find((node) => node.props["data-planning-day"] !== date)!;
    openDay(empty); tree = render(plannerView);
    const openedEmpty = daySections(tree).find((node) => node.props["data-planning-day"] === empty.props["data-planning-day"])!;
    expect(elements(openedEmpty).some((node) => node.props.placeholder === "例: 400m×10（つなぎ200m）")).toBe(false);
    expect(textOf(openedEmpty)).toContain("集合時間か練習場所を入れると、メニューも書けます。");
  });

  it("folds the menu settings behind a summary that follows the list and the save state", async () => {
    let tree = await readyPlanner();
    const settings = () => elements(tree).find((node) => node.type === "button" && textOf(node.props.children).startsWith("メニューの設定"))!;
    expect(textOf(settings())).toContain("中長距離・ブロック全体・スプレッドシートへ保存");
    expect(elements(tree).some((node) => node.props.label === "個人指定（空ならブロック全体）")).toBe(false);
    const scope = elements(tree).find((node) => Array.isArray(node.props.items) && (node.props.items as { key: string }[]).some((item) => item.key === "short"))!;
    (scope.props.onChange as (value: string) => void)("short"); tree = render(plannerView);
    expect(textOf(settings())).toContain("短距離・ブロック全体・公開");
    (settings().props.onClick as () => void)(); tree = render(plannerView);
    expect(elements(tree).some((node) => node.props.label === "個人指定（空ならブロック全体）")).toBe(true);
    expect(elements(tree).some((node) => node.props.ariaLabel === "メニューのブロック")).toBe(false);
    const state = elements(tree).find((node) => Array.isArray(node.props.items) && (node.props.items as { key: string }[]).some((item) => item.key === "draft"))!;
    (state.props.onChange as (value: string) => void)("draft"); tree = render(plannerView);
    expect(textOf(settings())).toContain("短距離・ブロック全体・下書き");
  });

  it("treats failed authentication as a pre-write failure and keeps the draft editable", async () => {
    let tree = await readyPlanner();
    editNote(tree, "認証を待つ入力"); render(plannerView);
    hooks.getUser.mockResolvedValueOnce({ data: { user: null }, error: { message: "unavailable" } });
    await currentDraft().onSave(); tree = render(plannerView);
    expect(hooks.insert).not.toHaveBeenCalled();
    expect(hooks.saved).not.toHaveBeenCalled();
    expect(currentDraft()).toMatchObject({ dirty: true, busy: false });
    expect(textOf(tree)).not.toContain("保存結果を確認できませんでした");
  });
});
