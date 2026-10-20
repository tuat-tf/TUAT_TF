import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import type { PracticeMenu } from "@/types";

const hooks = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0 }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useState(initial: unknown) {
    const index = hooks.cursor++;
    if (!(index in hooks.slots)) hooks.slots[index] = typeof initial === "function" ? initial() : initial;
    return [hooks.slots[index], (value: unknown) => {
      hooks.slots[index] = typeof value === "function" ? value(hooks.slots[index]) : value;
    }];
  },
  useRef(initial: unknown) {
    const index = hooks.cursor++;
    if (!(index in hooks.slots)) hooks.slots[index] = { current: initial };
    return hooks.slots[index];
  },
}));
import { SheetMenuEditModal } from "./SheetMenuEditModal";

const menu = { id: "sheet-middle-long:2026-10-20", content: "前の内容", pace: null, remark: null, supplement: null } as PracticeMenu;
function elements(tree: unknown): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  if (!tree || typeof tree !== "object" || !("props" in tree)) return [];
  const element = tree as ReactElement<Record<string, unknown>>;
  return [element, ...elements(element.props.children)];
}
function render(onSaved = vi.fn(), onOpenChange = vi.fn()) {
  hooks.cursor = 0;
  const all = elements(SheetMenuEditModal({ menu, scheduleId: "schedule", onSaved, onOpenChange }));
  return {
    change: all.find(element => element.props["aria-label"] === "メニュー")!.props.onChange as (event: unknown) => void,
    guard: all.find(element => "dirty" in element.props)!.props,
    fieldset: all.find(element => element.type === "fieldset")!.props,
  };
}
beforeEach(() => { hooks.slots = []; hooks.cursor = 0; });
afterEach(() => vi.unstubAllGlobals());

it("preserves draft, closes neither during save nor unknown results, and confirms without reposting", async () => {
  let loseResponse!: () => void;
  const fetcher = vi.fn().mockImplementationOnce(() => new Promise((_resolve, reject) => { loseResponse = () => reject(new Error("response lost")); }))
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce(Response.json({ loadedMonths: [10], rows: [{
      exactDate: "2026-10-20", monthDay: "10-20", sourceMonth: 10, content: "変更した内容", pace: "", remark: "", supplement: "",
    }] }));
  vi.stubGlobal("fetch", fetcher);
  const saved = vi.fn();
  const close = vi.fn();
  render(saved, close).change({ target: { value: "変更した内容" } });
  expect(render(saved, close).guard.dirty).toBe(true);
  const complete = render(saved, close).guard.onSave as () => Promise<void>;
  const first = complete();
  const second = complete();
  const busy = render(saved, close);
  expect(busy.guard.busy).toBe(true);
  expect(busy.fieldset.disabled).toBe(true);
  expect(close).not.toHaveBeenCalled();
  loseResponse();
  await Promise.all([first, second]);
  const pending = render(saved, close);
  expect(pending.guard).toMatchObject({ dirty: true, busy: false, intent: "check" });
  expect(pending.fieldset.disabled).toBe(true);
  await (pending.guard.onSave as () => Promise<void>)();
  expect(fetcher.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1);
  expect(saved).toHaveBeenCalledWith(expect.objectContaining({ content: "変更した内容" }));
  expect(close).toHaveBeenCalledWith(false);
});

it("does not repost after the save succeeded but the completion callback threw", async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ ok: true }));
  vi.stubGlobal("fetch", fetcher);
  const saved = vi.fn().mockImplementationOnce(() => { throw new Error("UI update failed"); });
  const close = vi.fn();
  await (render(saved, close).guard.onSave as () => Promise<void>)();
  expect(close).not.toHaveBeenCalled();
  await (render(saved, close).guard.onSave as () => Promise<void>)();
  expect(fetcher).toHaveBeenCalledOnce();
  expect(close).toHaveBeenCalledWith(false);
});
it("confirms clearing all fields only after the requested month was successfully loaded", async () => {
  const fetcher = vi.fn().mockRejectedValueOnce(new Error("response lost"))
    .mockResolvedValueOnce(Response.json({ loadedMonths: [], rows: [] }))
    .mockResolvedValueOnce(Response.json({ loadedMonths: [10], rows: [] }));
  vi.stubGlobal("fetch", fetcher);
  const saved = vi.fn();
  const close = vi.fn();
  render(saved, close).change({ target: { value: "" } });
  await (render(saved, close).guard.onSave as () => Promise<void>)();
  expect(saved).not.toHaveBeenCalled();
  await (render(saved, close).guard.onSave as () => Promise<void>)();
  expect(saved).toHaveBeenCalledWith(expect.objectContaining({ content: "", pace: null, remark: null, supplement: null }));
  expect(fetcher.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1);
});
