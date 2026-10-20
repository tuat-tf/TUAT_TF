import { beforeEach, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import type { AuthorMini } from "@/types";

const hooks = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0 }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useState(initial: unknown) {
    const index = hooks.cursor++;
    if (!(index in hooks.slots)) hooks.slots[index] = initial;
    return [hooks.slots[index], (value: unknown) => {
      hooks.slots[index] = typeof value === "function" ? value(hooks.slots[index]) : value;
    }];
  },
  useRef(initial: unknown) {
    const index = hooks.cursor++;
    if (!(index in hooks.slots)) hooks.slots[index] = { current: initial };
    return hooks.slots[index];
  },
  useMemo: (create: () => unknown) => create(),
}));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ showToast: vi.fn() }) }));
import { PersonPicker } from "./PersonPicker";

function elements(tree: unknown): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  if (!tree || typeof tree !== "object" || !("props" in tree)) return [];
  const element = tree as ReactElement<Record<string, unknown>>;
  return [element, ...elements(element.props.children)];
}
const person = { id: "person", display_name: "部員", grade: null, blocks: [], avatar_url: null } as AuthorMini;
function render(onChange: (ids: string[]) => Promise<boolean>, pending = false) {
  hooks.cursor = 0;
  const tree = PersonPicker({ people: [person], value: [], onChange, pending });
  const all = elements(tree);
  return {
    launch: all.find(element => element.props["aria-haspopup"] === "dialog")!.props.onClick as () => void,
    choose: all.find(element => "aria-pressed" in element.props)!.props.onClick as () => void,
    guard: all.find(element => "dirty" in element.props)!.props,
    modal: all.find(element => element.props.title === "対象者を選択")!.props,
    fieldset: all.find(element => element.type === "fieldset")!.props,
  };
}
beforeEach(() => { hooks.slots = []; hooks.cursor = 0; });

it("keeps the picker open and blocks closing/editing while its asynchronous save is pending", async () => {
  let finish!: (result: boolean) => void;
  const save = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; }));
  render(save).launch();
  render(save).choose();
  const draft = render(save);
  expect(draft.guard.dirty).toBe(true);
  const complete = draft.guard.onSave as () => Promise<void>;
  const first = complete();
  const second = complete();
  const busy = render(save);
  expect(busy.modal.open).toBe(true);
  expect(busy.guard.busy).toBe(true);
  expect(busy.fieldset.disabled).toBe(true);
  expect(save).toHaveBeenCalledOnce();
  finish(false);
  await Promise.all([first, second]);
  const unknown = render(save, true);
  expect(unknown.modal.open).toBe(true);
  expect(unknown.guard).toMatchObject({ dirty: true, busy: false, intent: "check" });
  expect(unknown.fieldset.disabled).toBe(true);
});

it("closes only after its asynchronous save succeeds", async () => {
  const save = vi.fn(async () => true);
  render(save).launch();
  render(save).choose();
  await (render(save).guard.onSave as () => Promise<void>)();
  expect(save).toHaveBeenCalledWith(["person"]);
  expect(render(save).modal.open).toBe(false);
});
