import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { VenueRow, PbRecord } from "@/types";
import type { CompetitionEvent } from "@/lib/competition-goals";
import type { MonthlyResult } from "@/lib/queries";

type ButtonProps = { children: ReactNode; disabled?: boolean; onClick?: () => void | Promise<void> };
type Draft = { dirty: boolean; busy: boolean; intent?: string; onSave: () => void | Promise<void> };
const hooks = vi.hoisted(() => ({ cursor: 0, values: [] as unknown[] }));
const mocks = vi.hoisted(() => ({
  refresh: vi.fn(), toast: vi.fn(), done: vi.fn(), from: vi.fn(), updates: vi.fn(), insert: vi.fn(), remove: vi.fn(), select: vi.fn(), count: vi.fn(), upsert: vi.fn(), eq: vi.fn(), is: vi.fn(),
  buttons: new Map<string, ButtonProps>(), actions: new Map<string, { onDelete: () => Promise<boolean>; onEdit: () => void }>(),
  input: {} as { value: string; onChange: (e: { target: { value: string } }) => void },
  inputs: new Map<string, { value: string; onChange: (e: { target: { value: string } }) => void }>(),
  selects: new Map<string, { onChange: (e: { target: { value: string } }) => void }>(),
  draft: null as Draft | null, modal: null as { children: ReactNode; onOpenChange: (open: boolean) => void; intent?: string } | null,
  reorder: null as { onReorder: (items: CompetitionEvent[]) => void } | null,
}));
vi.mock("react/jsx-runtime", async original => {
  const actual = await original<typeof import("react/jsx-runtime")>();
  const capture = (props: unknown) => { const select = props as { "aria-label": string; onChange: (e: { target: { value: string } }) => void }; mocks.selects.set(select["aria-label"], select); };
  return { ...actual, jsx: (...args: Parameters<typeof actual.jsx>) => { if (args[0] === "select") capture(args[1]); return actual.jsx(...args); }, jsxs: (...args: Parameters<typeof actual.jsxs>) => { if (args[0] === "select") capture(args[1]); return actual.jsxs(...args); } };
});
vi.mock("react/jsx-dev-runtime", async original => {
  const actual = await original<typeof import("react/jsx-dev-runtime")>();
  return { ...actual, jsxDEV: (...args: Parameters<typeof actual.jsxDEV>) => { if (args[0] === "select") { const select = args[1] as { "aria-label": string; onChange: (e: { target: { value: string } }) => void }; mocks.selects.set(select["aria-label"], select); } return actual.jsxDEV(...args); } };
});
vi.mock("react", async original => ({ ...await original<typeof import("react")>(), useState<T>(initial: T | (() => T)) {
  const slot = hooks.cursor++;
  if (!(slot in hooks.values)) hooks.values[slot] = typeof initial === "function" ? (initial as () => T)() : initial;
  return [hooks.values[slot], (value: T | ((previous: T) => T)) => { hooks.values[slot] = typeof value === "function" ? (value as (previous: T) => T)(hooks.values[slot] as T) : value; }];
} }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ showToast: mocks.toast }) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ from: mocks.from }) }));
vi.mock("@/components/ui/action-menu", () => ({ ActionMenu: (props: { triggerLabel: string; onDelete: () => Promise<boolean>; onEdit: () => void }) => { mocks.actions.set(props.triggerLabel, props); return null; } }));
vi.mock("@/components/ui/reorder-list", () => ({ ReorderList: (props: { items: CompetitionEvent[]; renderItem: (item: CompetitionEvent) => ReactNode; onReorder: (items: CompetitionEvent[]) => void }) => { mocks.reorder = props; return createElement("div", {}, props.items.map(props.renderItem)); } }));
vi.mock("@/components/ui/form-modal", () => ({ FormModal: (props: NonNullable<typeof mocks.modal>) => { mocks.modal = props; return createElement("div", {}, props.children); }, FormModalFooter: ({ children }: { children: ReactNode }) => createElement("footer", {}, children), useFormDraft: (draft: Draft) => { mocks.draft = draft; }, FormDraftGuard: (draft: Draft) => { mocks.draft = draft; return null; } }));
vi.mock("@/components/ui/button", () => ({ Button: (props: ButtonProps) => { mocks.buttons.set(label(props.children), props); return createElement("button", { disabled: props.disabled }, props.children); } }));
vi.mock("@/components/ui/input", () => ({ Input: (props: typeof mocks.input & { placeholder?: string }) => { mocks.input = props; if (props.placeholder) mocks.inputs.set(props.placeholder, props); return createElement("input", { value: props.value, readOnly: true }); } }));
vi.mock("@/components/ui/floating-action", () => ({ FloatingActionPosition: ({ children }: { children: ReactNode }) => createElement("div", {}, children), floatingActionButtonClass: "" }));
import { VenueManager } from "./VenueManager";
import { CompetitionEventManager } from "./CompetitionEventManager";
import { PbManager } from "./PbManager";
import { MonthlyResultsView } from "./MonthlyResultsView";
import { ResultForm } from "@/components/post/ResultForm";

function label(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(label).join("").trim();
  return typeof node === "string" ? node : "";
}
const venue = { id: "venue-1", name: "合成会場", short: null, access: null, fee: null, url: null, pinned: true, sort: 1 } as VenueRow;
const events: CompetitionEvent[] = [{ name: "100m", sort_order: 10, measure_type: "time", time_format: "seconds" }, { name: "走幅跳", sort_order: 20, measure_type: "distance", time_format: "minutes" }];
const result: PbRecord = { id: "00000000-0000-4000-8000-000000000001", user_id: "member", event_name: "100m", record: "12.34", meet_name: "合成大会", competition_id: null, recorded_on: "2026-10-13", date_precision: "day", stage: "university", result_status: "ok", wind: null, value_cs: 1234, value_cm: null, value_points: null, is_pb: false, is_ub: false, is_official: false, created_at: "2026-10-13T00:00:00Z" };
const monthly = { ...result, author: { display_name: "合成部員", grade: "B1", blocks: [] }, competition: null } as MonthlyResult;
function render(kind: "venue" | "event" = "event") {
  hooks.cursor = 0; mocks.buttons.clear(); mocks.actions.clear(); mocks.draft = null;
  return renderToStaticMarkup(kind === "venue" ? createElement(VenueManager, { initial: [venue] }) : createElement(CompetitionEventManager, { initial: events, unregistered: [{ name: "合成種目", count: 2 }] }));
}
function renderResults(kind: "pb" | "monthly") {
  hooks.cursor = 0; mocks.actions.clear();
  return renderToStaticMarkup(kind === "pb" ? createElement(PbManager, { userId: result.user_id, initial: [result], events, competitions: [] }) : createElement(MonthlyResultsView, { period: { kind: "latest" }, results: [monthly], events, competitions: [] }));
}
function renderResultForm(initial?: PbRecord) { hooks.cursor = 0; mocks.buttons.clear(); return renderToStaticMarkup(createElement(ResultForm, { userId: result.user_id, events, competitions: [], initial, onDone: mocks.done })); }
async function click(text: string) { await mocks.buttons.get(text)!.onClick!(); for (let i = 0; i < 12; i++) await Promise.resolve(); }
function selectTarget(value: string) {
  function findSelect(node: ReactNode): ReactElement | undefined {
    if (Array.isArray(node)) return node.map(findSelect).find(Boolean);
    if (!node || typeof node !== "object" || !("type" in node)) return;
    const element = node as ReactElement<{ children?: ReactNode }>;
    return element.type === "select" ? element : findSelect(element.props.children);
  }
  const select = findSelect(mocks.modal!.children) as ReactElement<{ onChange: (e: { target: { value: string } }) => void }>;
  select.props.onChange({ target: { value } });
}
function response(data: unknown, error: unknown = null, count: number | null = 2) { mocks.select.mockResolvedValue({ data, error, count }); }
beforeEach(() => {
  hooks.values = []; vi.resetAllMocks(); mocks.modal = null; mocks.selects.clear(); mocks.inputs.clear();
  const query = { delete: mocks.remove, update: mocks.updates, insert: mocks.insert, upsert: mocks.upsert, eq: mocks.eq, is: mocks.is, select: (columns: string, options?: { head: boolean }) => options?.head ? { eq: mocks.count } : mocks.select(columns) };
  query.eq.mockReturnValue(query); mocks.remove.mockReturnValue(query); mocks.updates.mockReturnValue(query);
  query.is.mockReturnValue(query);
  mocks.insert.mockReturnValue(query);
  mocks.from.mockReturnValue(query); mocks.upsert.mockResolvedValue({ error: null }); mocks.count.mockResolvedValue({ count: 2, error: null }); response([]);
});

it.each(["venue", "event"] as const)("keeps a %s visible when a delete affects no rows", async kind => {
  render(kind); const title = kind === "venue" ? "合成会場のメニュー" : "100mのメニュー";
  expect(await mocks.actions.get(title)!.onDelete()).toBe(false);
  expect(render(kind)).toContain(kind === "venue" ? "合成会場" : "100m");
  expect(mocks.refresh).not.toHaveBeenCalled(); expect(mocks.remove).toHaveBeenCalledOnce();
});
it.each(["venue", "event"] as const)("removes a %s only after one deleted row is returned", async kind => {
  response(kind === "venue" ? [{ id: venue.id }] : [{ name: "100m" }]); render(kind);
  expect(await mocks.actions.get(kind === "venue" ? "合成会場のメニュー" : "100mのメニュー")!.onDelete()).toBe(true);
  expect(render(kind)).not.toContain(kind === "venue" ? "合成会場" : "100m"); expect(mocks.refresh).toHaveBeenCalledOnce();
});
it("does not resend a deletion after a transport exception", async () => {
  mocks.select.mockRejectedValue(new Error("synthetic transport")); render("venue");
  expect(await mocks.actions.get("合成会場のメニュー")!.onDelete()).toBe(false); expect(mocks.remove).toHaveBeenCalledOnce();
});
it("reorders only sort values and treats a missing target as incomplete", async () => {
  response([]); render(); mocks.reorder!.onReorder([...events].reverse()); for (let i = 0; i < 12; i++) await Promise.resolve();
  expect(mocks.updates.mock.calls.map(call => call[0])).toEqual([{ sort_order: 10 }, { sort_order: 20 }]);
  expect(render()).toContain("並び順をすべて保存できたか確認できませんでした"); expect(mocks.refresh).toHaveBeenCalledOnce();
});
it("keeps a partially saved order from being sent again until the screen is reopened", async () => {
  mocks.select.mockResolvedValueOnce({ data: [{ name: "走幅跳" }], error: null }).mockRejectedValueOnce(new Error("synthetic transport"));
  render(); mocks.reorder!.onReorder([...events].reverse()); for (let i = 0; i < 12; i++) await Promise.resolve(); render();
  mocks.reorder!.onReorder(events); for (let i = 0; i < 12; i++) await Promise.resolve();
  expect(mocks.updates).toHaveBeenCalledTimes(2); expect(mocks.buttons.get("画面を再読み込み")).toBeDefined();
});
it("accepts an order only after all target rows are confirmed", async () => {
  mocks.select.mockResolvedValueOnce({ data: [{ name: "走幅跳" }], error: null }).mockResolvedValueOnce({ data: [{ name: "100m" }], error: null });
  render(); mocks.reorder!.onReorder([...events].reverse()); for (let i = 0; i < 12; i++) await Promise.resolve();
  expect(render()).not.toContain("画面を再読み込み"); expect(mocks.refresh).toHaveBeenCalledOnce();
});
it.each([0, 1])("does not report merge success or hide the source for %i returned rows", async returned => {
  mocks.select.mockResolvedValue({ data: Array.from({ length: returned }, (_, id) => ({ id })), error: null });
  render(); await click("既存の種目にまとめる"); render(); selectTarget("100m"); render(); await click("この種目にまとめる");
  expect(render()).toContain("合成種目"); expect(mocks.toast.mock.calls.some(call => call[1] === "success")).toBe(false);
  await click("この種目にまとめる"); expect(mocks.updates).toHaveBeenCalledOnce();
});
it("does not resend an unknown merge result and retains the source for review", async () => {
  mocks.select.mockRejectedValue(new Error("synthetic transport")); render(); await click("既存の種目にまとめる"); render(); selectTarget("100m"); render(); await click("この種目にまとめる");
  expect(render()).toContain("種目名を変更できたか確認できませんでした"); await click("この種目にまとめる");
  expect(mocks.updates).toHaveBeenCalledOnce(); expect(mocks.buttons.get("画面を再読み込み")).toBeDefined();
});
it("keeps a merge editable when the record count could not be read", async () => {
  mocks.count.mockResolvedValue({ count: null, error: { code: "42501" } }); render(); await click("既存の種目にまとめる"); render(); selectTarget("100m"); render(); await click("この種目にまとめる");
  expect(render()).toContain("記録の件数を確認できませんでした"); expect(mocks.updates).not.toHaveBeenCalled();
  expect(mocks.buttons.get("この種目にまとめる")!.disabled).toBe(false); expect(mocks.draft).toMatchObject({ dirty: true, busy: false });
});
it("stops a merge before writing when the displayed count has changed", async () => {
  mocks.count.mockResolvedValue({ count: 3, error: null }); render(); await click("既存の種目にまとめる"); render(); selectTarget("100m"); render(); await click("この種目にまとめる");
  expect(mocks.updates).not.toHaveBeenCalled(); expect(render()).toContain("合成種目");
});
it("reports merge success only for the expected number of records", async () => {
  mocks.select.mockResolvedValue({ data: [{ id: 1 }, { id: 2 }], error: null });
  render(); await click("既存の種目にまとめる"); render(); selectTarget("100m"); render(); await click("この種目にまとめる");
  expect(render()).not.toContain("合成種目"); expect(mocks.toast).toHaveBeenCalledWith("2件の記録を「100m」に統一しました", "success");
});
it("registers event edits with the shared draft guard and keeps input after save failure", async () => {
  mocks.select.mockReturnValue({ single: vi.fn().mockResolvedValue({ error: { code: "23505" }, data: null }) });
  render(); mocks.actions.get("100mのメニュー")!.onEdit(); render();
  expect(mocks.draft).toMatchObject({ dirty: false, busy: false }); mocks.input.onChange({ target: { value: "修正した種目" } }); render();
  expect(mocks.draft).toMatchObject({ dirty: true, busy: false }); await mocks.draft!.onSave();
  const html = render(); expect(html).toContain("修正した種目"); expect(mocks.draft).toMatchObject({ dirty: true, busy: false }); expect(mocks.refresh).not.toHaveBeenCalled();
});
it("marks an in-flight event save busy and disables the entire form", async () => {
  let complete!: (value: unknown) => void;
  mocks.select.mockReturnValue({ single: () => new Promise(resolve => { complete = resolve; }) });
  render(); mocks.actions.get("100mのメニュー")!.onEdit(); render(); mocks.input.onChange({ target: { value: "修正した種目" } }); render();
  const save = mocks.draft!.onSave(); expect(render()).toContain("<fieldset disabled=\"\""); expect(mocks.draft!.busy).toBe(true);
  complete({ error: { code: "23505" }, data: null }); await save; expect(render()).not.toContain("<fieldset disabled=\"\"");
});
it("keeps the entered event name and releases busy state after a transport exception", async () => {
  mocks.select.mockReturnValue({ single: vi.fn().mockRejectedValue(new Error("synthetic transport")) });
  render(); mocks.actions.get("100mのメニュー")!.onEdit(); render(); mocks.input.onChange({ target: { value: "修正した種目" } }); render();
  await mocks.draft!.onSave(); expect(render()).toContain("修正した種目"); expect(mocks.draft).toMatchObject({ dirty: true, busy: false }); expect(mocks.refresh).not.toHaveBeenCalled();
});
it("saves a catalog rename on the existing target and refreshes the screen", async () => {
  const saved = { ...events[0], name: "修正した種目" };
  mocks.select.mockReturnValue({ single: vi.fn().mockResolvedValue({ data: saved, error: null }) });
  render(); mocks.actions.get("100mのメニュー")!.onEdit(); render(); mocks.input.onChange({ target: { value: saved.name } }); render();
  await mocks.draft!.onSave(); const html = render();
  expect(mocks.updates).toHaveBeenCalledWith(saved); expect(html).toContain(saved.name); expect(html).not.toContain("種目を編集"); expect(mocks.refresh).toHaveBeenCalledOnce();
});
it.each(["pb", "monthly"] as const)("keeps %s results until one deleted row is confirmed and does not resend a transport failure", async kind => {
  const menu = kind === "pb" ? "100mのメニュー" : "合成部員の100mの操作";
  renderResults(kind); expect(await mocks.actions.get(menu)!.onDelete()).toBe(false);
  expect(renderResults(kind)).toContain("12.34");
  mocks.select.mockRejectedValueOnce(new Error("synthetic transport"));
  expect(await mocks.actions.get(menu)!.onDelete()).toBe(false); expect(renderResults(kind)).toContain("12.34");
  expect(mocks.remove).toHaveBeenCalledTimes(2); expect(mocks.refresh).not.toHaveBeenCalled();
  response([{ id: result.id }]); expect(await mocks.actions.get(menu)!.onDelete()).toBe(true);
  expect(renderResults(kind)).not.toContain("12.34"); expect(mocks.refresh).toHaveBeenCalledOnce();
});
it("confirms an unknown catalog rename by reading the frozen values without sending it again", async () => {
  const saved = { ...events[0], name: "修正した種目" };
  mocks.select.mockReturnValue({ single: vi.fn().mockRejectedValue(new Error("synthetic transport")) });
  render(); mocks.actions.get("100mのメニュー")!.onEdit(); render(); mocks.input.onChange({ target: { value: saved.name } }); render();
  await mocks.draft!.onSave(); render(); expect(mocks.buttons.get("保存結果を確認")).toBeDefined();
  expect(mocks.draft!.intent).toBe("check");
  mocks.select.mockReturnValue({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) });
  await mocks.draft!.onSave(); expect(render()).toContain("保存結果を確認できませんでした"); expect(mocks.updates).toHaveBeenCalledOnce();
  mocks.select.mockReturnValue({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: saved, error: null }) }) });
  await mocks.draft!.onSave(); expect(render()).toContain(saved.name); expect(mocks.updates).toHaveBeenCalledOnce(); expect(mocks.refresh).toHaveBeenCalledOnce();
});
it("releases catalog-add busy after a definitive rejection and checks an unknown add without reinserting", async () => {
  mocks.select.mockReturnValue({ single: vi.fn().mockResolvedValue({ data: null, error: { code: "23505" } }) });
  render(); await click("種目に追加"); render(); expect(mocks.buttons.get("種目に追加")!.disabled).toBe(false);
  mocks.select.mockReturnValue({ single: vi.fn().mockRejectedValue(new Error("synthetic transport")) });
  await click("種目に追加"); render(); expect(mocks.buttons.get("保存結果を確認")).toBeDefined();
  const submitted = mocks.insert.mock.calls[1][0];
  mocks.select.mockReturnValue({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) });
  await click("保存結果を確認"); render(); expect(mocks.buttons.get("同じ内容で保存する")).toBeDefined(); expect(mocks.insert).toHaveBeenCalledTimes(2);
  mocks.select.mockReturnValue({ single: () => Promise.resolve({ data: submitted, error: null }) });
  await click("同じ内容で保存する"); expect(render()).not.toContain("未登録の種目"); expect(mocks.insert).toHaveBeenCalledTimes(3); expect(mocks.insert.mock.calls[2][0]).toEqual(submitted); expect(mocks.refresh).toHaveBeenCalledOnce();
});
it("keeps a generated venue ID for read-only confirmation of an unknown new save", async () => {
  mocks.select.mockReturnValue({ single: vi.fn().mockRejectedValue(new Error("synthetic transport")) });
  render("venue"); await click("会場を追加"); render("venue"); mocks.inputs.get("例: 府中市民陸上競技場")!.onChange({ target: { value: "新しい合成会場" } }); render("venue");
  await mocks.draft!.onSave(); render("venue"); const submitted = mocks.insert.mock.calls[0][0];
  expect(submitted.id).toMatch(/^[0-9a-f-]{36}$/); expect(mocks.draft).toMatchObject({ dirty: true, busy: false, intent: "check" });
  const eq = vi.fn(() => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }));
  mocks.select.mockReturnValue({ eq }); await mocks.draft!.onSave(); render("venue");
  expect(eq).toHaveBeenCalledWith("id", submitted.id); expect(mocks.insert).toHaveBeenCalledOnce(); expect(mocks.buttons.get("同じ内容で保存する")).toBeDefined();
  mocks.select.mockReturnValue({ single: () => Promise.resolve({ data: submitted, error: null }) });
  await click("同じ内容で保存する"); expect(render("venue")).toContain("新しい合成会場"); expect(mocks.insert).toHaveBeenCalledTimes(2); expect(mocks.insert.mock.calls[1][0]).toEqual(submitted);
});
it("creates a result once with a generated ID and confirms an unknown response by reading that ID", async () => {
  mocks.select.mockReturnValue({ single: vi.fn().mockRejectedValue(new Error("synthetic transport")) });
  renderResultForm(); mocks.selects.get("種目")!.onChange({ target: { value: "100m" } }); renderResultForm();
  mocks.inputs.get("61.85")!.onChange({ target: { value: "12.34" } }); renderResultForm();
  await mocks.draft!.onSave(); renderResultForm(); const submitted = mocks.insert.mock.calls[0][0];
  expect(submitted.id).toMatch(/^[0-9a-f-]{36}$/); expect(mocks.buttons.get("保存結果を確認")).toBeDefined(); expect(mocks.draft).toMatchObject({ dirty: true, busy: false, intent: "check" });
  const eq = vi.fn(() => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) })); mocks.select.mockReturnValue({ eq });
  await mocks.draft!.onSave(); renderResultForm(); expect(mocks.done).not.toHaveBeenCalled(); expect(mocks.insert).toHaveBeenCalledOnce();
  eq.mockReturnValue({ maybeSingle: () => Promise.resolve({ data: submitted, error: null }) });
  await mocks.draft!.onSave(); expect(eq).toHaveBeenCalledWith("id", submitted.id); expect(mocks.done).toHaveBeenCalledWith(submitted); expect(mocks.insert).toHaveBeenCalledOnce();
});
it("uses the shared busy guard during result editing and retains input after a definitive save rejection", async () => {
  let complete!: (value: unknown) => void;
  mocks.select.mockReturnValue({ single: () => new Promise(resolve => { complete = resolve; }) });
  renderResultForm(result); mocks.inputs.get("61.85")!.onChange({ target: { value: "12.50" } }); renderResultForm(result);
  const save = mocks.draft!.onSave(); expect(renderResultForm(result)).toContain("<fieldset disabled=\"\""); expect(mocks.draft!.busy).toBe(true);
  complete({ data: null, error: { code: "42501" } }); await save;
  expect(renderResultForm(result)).toContain("12.50"); expect(mocks.draft).toMatchObject({ dirty: true, busy: false }); expect(mocks.done).not.toHaveBeenCalled();
});
it("retries a new result manually with the same ID and frozen content only after a successful missing-result read", async () => {
  mocks.select.mockReturnValue({ single: vi.fn().mockRejectedValue(new Error("synthetic transport")) });
  renderResultForm(); mocks.selects.get("種目")!.onChange({ target: { value: "100m" } }); renderResultForm(); mocks.inputs.get("61.85")!.onChange({ target: { value: "12.34" } }); renderResultForm();
  await mocks.draft!.onSave(); renderResultForm(); const submitted = mocks.insert.mock.calls[0][0];
  mocks.select.mockReturnValue({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: { code: "42501" } }) }) });
  await mocks.draft!.onSave(); renderResultForm(); expect(mocks.buttons.get("同じ内容で保存する")).toBeUndefined();
  mocks.select.mockReturnValue({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) });
  await mocks.draft!.onSave(); renderResultForm(); expect(mocks.insert).toHaveBeenCalledOnce();
  mocks.select.mockReturnValue({ single: () => Promise.resolve({ data: submitted, error: null }) }); await click("同じ内容で保存する");
  expect(mocks.insert).toHaveBeenCalledTimes(2); expect(mocks.insert.mock.calls[1][0]).toEqual(submitted); expect(mocks.done).toHaveBeenCalledWith(submitted);
});
it("guards a manual rename retry with the original row values and does not report a concurrent change as saved", async () => {
  mocks.select.mockReturnValue({ single: vi.fn().mockRejectedValue(new Error("synthetic transport")) });
  render(); mocks.actions.get("100mのメニュー")!.onEdit(); render(); mocks.input.onChange({ target: { value: "修正した種目" } }); render(); await mocks.draft!.onSave(); render();
  mocks.select.mockReturnValue({ eq: (_column: string, name: string) => ({ maybeSingle: () => Promise.resolve({ data: name === "100m" ? events[0] : null, error: null }) }) });
  await mocks.draft!.onSave(); render(); expect(mocks.buttons.get("同じ内容で保存する")).toBeDefined();
  mocks.select.mockReturnValue({ single: () => Promise.resolve({ data: null, error: { code: "PGRST116" } }) });
  await click("同じ内容で保存する"); render(); expect(mocks.eq).toHaveBeenCalledWith("name", "100m"); expect(mocks.eq).toHaveBeenCalledWith("measure_type", "time"); expect(mocks.eq).toHaveBeenCalledWith("time_format", "seconds"); expect(mocks.eq).toHaveBeenCalledWith("sort_order", 10);
  expect(mocks.refresh).not.toHaveBeenCalled(); expect(mocks.buttons.get("同じ内容で保存する")).toBeUndefined();
});
it("does not retry result edits when the original row has changed", async () => {
  mocks.select.mockReturnValue({ single: vi.fn().mockRejectedValue(new Error("synthetic transport")) });
  renderResultForm(result); mocks.inputs.get("61.85")!.onChange({ target: { value: "12.50" } }); renderResultForm(result); await mocks.draft!.onSave(); renderResultForm(result);
  mocks.select.mockReturnValue({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { ...result, value_cs: 1300, record: "13.00" }, error: null }) }) });
  await mocks.draft!.onSave(); expect(renderResultForm(result)).toContain("12.50"); expect(mocks.buttons.get("同じ内容で保存する")).toBeUndefined(); expect(mocks.updates).toHaveBeenCalledOnce();
});
