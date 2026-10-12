import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

type Draft = { dirty: boolean; busy: boolean; onSave: () => void | Promise<void> };
const hooks = vi.hoisted(() => ({ slots: [] as unknown[], index: 0, guard: null as { current: Draft | null } | null }));
vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useRef(initial: unknown) {
    const index = hooks.index++;
    if (!(index in hooks.slots)) hooks.slots[index] = { current: initial };
    const ref = hooks.slots[index] as { current: Draft | null };
    if (index === 0) hooks.guard = ref;
    return ref;
  },
  useState(initial: unknown) {
    const index = hooks.index++;
    if (!(index in hooks.slots)) hooks.slots[index] = initial;
    return [hooks.slots[index], (next: unknown) => {
      hooks.slots[index] = typeof next === "function" ? (next as (value: unknown) => unknown)(hooks.slots[index]) : next;
    }];
  },
  useMemo: (create: () => unknown) => create(),
  useContext: () => hooks.guard,
  useEffect: (effect: () => unknown) => { effect(); },
}));
vi.mock("@/components/ui/fullscreen", () => ({ FullScreen: () => null, FullScreenContent: () => null }));
vi.mock("@/components/ui/unsaved-changes-dialog", () => ({ UnsavedChangesDialog: () => null }));

import { FormModal, useFormDraft } from "./form-modal";

function render(onOpenChange: (open: boolean) => void, intent: "post" | "update" = "post") {
  hooks.index = 0;
  const tree = FormModal({ open: true, onOpenChange, title: "入力", children: null, intent });
  return (tree.props.children as ReactElement<Record<string, unknown>>[]);
}
function close(elements: ReactElement<Record<string, unknown>>[]) {
  (elements[0].props.onOpenChange as (open: boolean) => void)(false);
}

beforeEach(() => { hooks.slots = []; hooks.index = 0; hooks.guard = null; });

describe("shared form closing", () => {
  it("closes a clean form without asking to save", () => {
    const onOpenChange = vi.fn();
    close(render(onOpenChange));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it.each(["post", "update"] as const)("keeps a dirty %s form open and offers the corresponding save action", (intent) => {
    const onOpenChange = vi.fn();
    const onSave = vi.fn();
    const elements = render(onOpenChange, intent);
    useFormDraft({ dirty: true, busy: false, onSave });
    close(elements);
    const confirm = render(onOpenChange, intent)[1];
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(confirm.props.open).toBe(true);
    expect(confirm.props.intent).toBe(intent);
    (confirm.props.onSave as () => void)();
    expect(onSave).toHaveBeenCalledOnce();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("allows discarding a dirty form only after an explicit choice", () => {
    const onOpenChange = vi.fn();
    const elements = render(onOpenChange);
    useFormDraft({ dirty: true, busy: false, onSave: vi.fn() });
    close(elements);
    expect(onOpenChange).not.toHaveBeenCalled();
    (render(onOpenChange)[1].props.onDiscard as () => void)();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("offers a read-only result check instead of another post when the outcome is unknown", () => {
    const onOpenChange = vi.fn();
    const checkResult = vi.fn();
    const elements = render(onOpenChange);
    useFormDraft({ dirty: true, busy: false, onSave: checkResult, intent: "check" });
    close(elements);
    const confirm = render(onOpenChange)[1];
    expect(confirm.props.intent).toBe("check");
    (confirm.props.onSave as () => void)();
    expect(checkResult).toHaveBeenCalledOnce();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("does not close or offer discard while a save is running", () => {
    const onOpenChange = vi.fn();
    const elements = render(onOpenChange);
    useFormDraft({ dirty: true, busy: true, onSave: vi.fn() });
    close(elements);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(render(onOpenChange)[1].props.open).toBe(false);
  });

  it("does not discard or send again if saving begins after the confirmation opened", () => {
    const onOpenChange = vi.fn();
    const onSave = vi.fn();
    const elements = render(onOpenChange);
    useFormDraft({ dirty: true, busy: false, onSave });
    close(elements);
    const confirm = render(onOpenChange)[1];
    useFormDraft({ dirty: true, busy: true, onSave });
    (confirm.props.onDiscard as () => void)();
    (confirm.props.onSave as () => void)();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });
});
